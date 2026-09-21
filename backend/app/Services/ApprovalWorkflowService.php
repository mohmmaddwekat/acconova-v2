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
     * Every matching rule is created in the same attempt, so a document that
     * is both high value and heavily discounted does not force users through
     * two separate retry cycles.
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

        $documentFingerprint =
            $this->documentFingerprint(
                $document,
            );

        $requirements = [];

        if (
            $invoiceThreshold > 0
            && (float) $document->total >= $invoiceThreshold
        ) {
            $requirements[] = [
                'category' => 'high_value_invoice',
                'reason' => sprintf(
                    'Invoice %s total %s exceeds the approval threshold %s.',
                    $document->number,
                    $document->total,
                    number_format($invoiceThreshold, 2, '.', ''),
                ),
                'snapshot' => [
                    'number' => $document->number,
                    'kind' => $document->kind,
                    'total' => $document->total,
                    'threshold' => $invoiceThreshold,
                    'fingerprint' => $documentFingerprint,
                ],
            ];
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
                $requirements[] = [
                    'category' => 'high_discount',
                    'reason' => sprintf(
                        'Sales invoice %s contains an effective discount of %.2f%%, above the %.2f%% approval threshold.',
                        $document->number,
                        $maxDiscount,
                        $discountThreshold,
                    ),
                    'snapshot' => [
                        'number' => $document->number,
                        'max_discount_percent' => round($maxDiscount, 2),
                        'threshold' => $discountThreshold,
                        'fingerprint' => $documentFingerprint,
                    ],
                ];
            }
        }

        $pendingIds = [];

        foreach ($requirements as $requirement) {
            $pendingId = $this->requestApproval(
                'financial_document',
                $document->id,
                $requirement['category'],
                $requirement['reason'],
                $requirement['snapshot'],
                $actorId,
            );

            if ($pendingId !== null) {
                $pendingIds[] = $pendingId;
            }
        }

        $this->throwIfPending($pendingIds);
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

        $snapshot = [
            'number' => $movement->number,
            'amount' => $movement->amount,
            'method' => $movement->method,
            'threshold' => $threshold,
            'fingerprint' => $this->movementFingerprint(
                $movement,
            ),
        ];

        $pendingId = $this->requestApproval(
            'cash_movement',
            $movement->id,
            'payment',
            sprintf(
                'Outgoing payment %s for %s via %s requires approval.',
                $movement->number,
                $movement->amount,
                $movement->method,
            ),
            $snapshot,
            $actorId,
        );

        $this->throwIfPending(
            $pendingId === null
                ? []
                : [$pendingId],
        );
    }

    /**
     * Approval is tied to the exact snapshot that was reviewed. Editing the
     * draft after approval invalidates the previous approval automatically.
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
     * Return a pending request ID when approval is still missing.
     *
     * @param array<string, mixed> $snapshot
     */
    private function requestApproval(
        string $subjectType,
        int $subjectId,
        string $category,
        string $reason,
        array $snapshot,
        int $actorId,
    ): ?int {
        if (
            $this->approved(
                $subjectType,
                $subjectId,
                $category,
                $snapshot,
            )
        ) {
            return null;
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

        if ($pending) {
            return (int) $pending->id;
        }

        return (int) DB::table('approval_requests')
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
    }

    private function documentFingerprint(
        FinancialDocument $document,
    ): string {
        $document->loadMissing('lines');

        $lines = $document->lines
            ->sortBy('position')
            ->values()
            ->map(
                fn ($line): array => [
                    'product_id' => $line->product_id,
                    'warehouse_id' => $line->warehouse_id,
                    'description' => $line->description,
                    'quantity' => $line->quantity,
                    'unit_price' => $line->unit_price,
                    'discount_type' => $line->discount_type,
                    'discount_value' => $line->discount_value,
                    'tax_rate' => $line->tax_rate,
                    'line_total' => $line->line_total,
                ],
            )
            ->all();

        return hash(
            'sha256',
            json_encode(
                [
                    'party_id' => $document->party_id,
                    'kind' => $document->kind,
                    'issue_date' => $document->issue_date?->format('Y-m-d'),
                    'due_date' => $document->due_date?->format('Y-m-d'),
                    'currency' => $document->currency,
                    'exchange_rate' => $document->exchange_rate,
                    'shipping_total' => $document->shipping_total,
                    'total' => $document->total,
                    'lines' => $lines,
                ],
                JSON_THROW_ON_ERROR,
            ),
        );
    }

    private function movementFingerprint(
        CashMovement $movement,
    ): string {
        $movement->loadMissing(
            'allocations',
        );

        $allocations = $movement->allocations
            ->sortBy('financial_document_id')
            ->values()
            ->map(
                fn ($allocation): array => [
                    'financial_document_id' =>
                        $allocation->financial_document_id,
                    'amount' =>
                        $allocation->amount,
                ],
            )
            ->all();

        return hash(
            'sha256',
            json_encode(
                [
                    'party_id' => $movement->party_id,
                    'direction' => $movement->direction,
                    'category' => $movement->category,
                    'amount' => $movement->amount,
                    'currency' => $movement->currency,
                    'movement_date' => $movement->movement_date?->format('Y-m-d'),
                    'method' => $movement->method,
                    'account_label' => $movement->account_label,
                    'reference' => $movement->reference,
                    'check_number' => $movement->check_number,
                    'check_bank' => $movement->check_bank,
                    'check_due_date' => $movement->check_due_date?->format('Y-m-d'),
                    'allocations' => $allocations,
                ],
                JSON_THROW_ON_ERROR,
            ),
        );
    }

    /**
     * @param list<int> $pendingIds
     */
    private function throwIfPending(
        array $pendingIds,
    ): void {
        if ($pendingIds === []) {
            return;
        }

        throw ValidationException::withMessages([
            'approval' => [
                'Approval required before this action can continue. Pending request(s): #'
                .implode(', #', $pendingIds)
                .'.',
            ],
        ]);
    }
}
