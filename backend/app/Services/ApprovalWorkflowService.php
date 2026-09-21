<?php

namespace App\Services;

use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ApprovalWorkflowService
{
    /**
     * Require approvals for high-value invoices and unusually large discounts.
     *
     * Approval thresholds are workspace preferences with conservative defaults:
     * invoice value 10,000; effective discount 15%.
     */
    public function assertDocumentApproved(
        FinancialDocument $document,
        int $actorId,
    ): void {
        $preferences = app(TenantContext::class)
            ->organization()
            ->preferences ?? [];

        $invoiceThreshold = (float) (
            $preferences['approval_invoice_threshold']
            ?? 10000
        );
        $discountThreshold = (float) (
            $preferences['approval_discount_percent']
            ?? 15
        );

        $document->loadMissing('lines');

        if (
            $invoiceThreshold > 0
            && (float) $document->total >= $invoiceThreshold
        ) {
            $this->assertApproved(
                'financial_document',
                $document->id,
                'high_value_invoice',
                sprintf(
                    'Invoice %s total %s exceeds the approval threshold %s.',
                    $document->number,
                    $document->total,
                    number_format($invoiceThreshold, 2, '.', ''),
                ),
                [
                    'number' => $document->number,
                    'kind' => $document->kind,
                    'total' => $document->total,
                    'threshold' => $invoiceThreshold,
                ],
                $actorId,
            );
        }

        if ($document->isSale()) {
            $maxDiscount = 0.0;

            foreach ($document->lines as $line) {
                $subtotal = (float) $line->line_subtotal;
                $discount = (float) $line->line_discount;

                if ($subtotal <= 0) {
                    continue;
                }

                $maxDiscount = max(
                    $maxDiscount,
                    ($discount / $subtotal) * 100,
                );
            }

            if (
                $discountThreshold > 0
                && $maxDiscount > $discountThreshold
            ) {
                $this->assertApproved(
                    'financial_document',
                    $document->id,
                    'high_discount',
                    sprintf(
                        'Sales invoice %s contains an effective discount of %.2f%%, above the %.2f%% approval threshold.',
                        $document->number,
                        $maxDiscount,
                        $discountThreshold,
                    ),
                    [
                        'number' => $document->number,
                        'max_discount_percent' => round($maxDiscount, 2),
                        'threshold' => $discountThreshold,
                    ],
                    $actorId,
                );
            }
        }
    }

    /**
     * Require approval before posting a large outgoing payment or any outgoing
     * bank transfer. Incoming receipts are intentionally not blocked.
     */
    public function assertPaymentApproved(
        CashMovement $movement,
        int $actorId,
    ): void {
        if ($movement->direction !== 'outgoing') {
            return;
        }

        $preferences = app(TenantContext::class)
            ->organization()
            ->preferences ?? [];

        $threshold = (float) (
            $preferences['approval_payment_threshold']
            ?? 5000
        );

        $needsApproval =
            $movement->method === 'bank_transfer'
            || (
                $threshold > 0
                && (float) $movement->amount >= $threshold
            );

        if (! $needsApproval) {
            return;
        }

        $this->assertApproved(
            'cash_movement',
            $movement->id,
            'payment',
            sprintf(
                'Outgoing payment %s for %s via %s requires approval.',
                $movement->number,
                $movement->amount,
                $movement->method,
            ),
            [
                'number' => $movement->number,
                'amount' => $movement->amount,
                'method' => $movement->method,
                'threshold' => $threshold,
            ],
            $actorId,
        );
    }

    /**
     * Approval is tied to the exact snapshot that was reviewed. Editing the
     * draft after approval automatically invalidates that approval and creates
     * a fresh request on the next attempt.
     *
     * @param array<string, mixed> $snapshot
     */
    public function approved(
        string $subjectType,
        int $subjectId,
        string $category,
        array $snapshot,
    ): bool {
        $approved = DB::table('approval_requests')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            )
            ->where('subject_type', $subjectType)
            ->where('subject_id', $subjectId)
            ->where('category', $category)
            ->where('status', 'approved')
            ->latest('id')
            ->get(['snapshot']);

        foreach ($approved as $row) {
            $reviewed = $row->snapshot
                ? json_decode(
                    $row->snapshot,
                    true,
                )
                : [];

            if (
                is_array($reviewed)
                && $reviewed == $snapshot
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Create one pending approval request if necessary, then block the action
     * until a reviewer explicitly approves it.
     *
     * @param array<string, mixed> $snapshot
     */
    private function assertApproved(
        string $subjectType,
        int $subjectId,
        string $category,
        string $reason,
        array $snapshot,
        int $actorId,
    ): void {
        if (
            $this->approved(
                $subjectType,
                $subjectId,
                $category,
                $snapshot,
            )
        ) {
            return;
        }

        $organizationId =
            app(TenantContext::class)->id();

        $pending = DB::table('approval_requests')
            ->where('organization_id', $organizationId)
            ->where('subject_type', $subjectType)
            ->where('subject_id', $subjectId)
            ->where('category', $category)
            ->where('status', 'pending')
            ->latest('id')
            ->get()
            ->first(function ($row) use ($snapshot): bool {
                $pendingSnapshot = $row->snapshot
                    ? json_decode(
                        $row->snapshot,
                        true,
                    )
                    : [];

                return is_array($pendingSnapshot)
                    && $pendingSnapshot == $snapshot;
            });

        if (! $pending) {
            $id = DB::table('approval_requests')
                ->insertGetId([
                    'organization_id' => $organizationId,
                    'subject_type' => $subjectType,
                    'subject_id' => $subjectId,
                    'category' => $category,
                    'status' => 'pending',
                    'reason' => $reason,
                    'snapshot' => json_encode(
                        $snapshot,
                        JSON_THROW_ON_ERROR,
                    ),
                    'requested_by' => $actorId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

            $pending = (object) ['id' => $id];
        }

        throw ValidationException::withMessages([
            'approval' => [
                'Approval required before this action can continue. Request #'
                .$pending->id
                .' is pending.',
            ],
        ]);
    }
}
