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
                'required_approvals' => 1,
                'snapshot' => [
                    'number' => $document->number,
                    'kind' => $document->kind,
                    'total' => $document->total,
                    'threshold' => $invoiceThreshold,
                    'fingerprint' => $documentFingerprint,
                ],
            ];
        }

        if (
            $document->isSale()
            && $discountThreshold > 0
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
                'required_approvals' => 1,
                'snapshot' => [
                    'number' => $document->number,
                    'max_discount_percent' => round($maxDiscount, 2),
                    'threshold' => $discountThreshold,
                    'fingerprint' => $documentFingerprint,
                ],
            ];
        }

        $customRules = DB::table('approval_rules')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            )
            ->where(
                'subject_type',
                'financial_document',
            )
            ->where('active', true)
            ->orderBy('priority')
            ->orderBy('id')
            ->get();

        foreach ($customRules as $rule) {
            $actual = match ($rule->condition_field) {
                'total' => (float) $document->total,
                'discount_percent' => $maxDiscount,
                default => null,
            };

            if (
                $actual === null
                || ! $this->ruleMatches(
                    $actual,
                    (string) $rule->operator,
                    (string) $rule->threshold,
                )
            ) {
                continue;
            }

            $requirements[] = [
                'category' => 'custom_rule_'.$rule->id,
                'reason' => sprintf(
                    '%s requires %d approval(s).',
                    $rule->name,
                    $rule->required_approvals,
                ),
                'required_approvals' => max(
                    1,
                    (int) $rule->required_approvals,
                ),
                'snapshot' => [
                    'rule_id' => $rule->id,
                    'rule_name' => $rule->name,
                    'field' => $rule->condition_field,
                    'operator' => $rule->operator,
                    'threshold' => $rule->threshold,
                    'actual' => $actual,
                    'fingerprint' => $documentFingerprint,
                ],
            ];
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
                (int) (
                    $requirement['required_approvals']
                    ?? 1
                ),
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

        $requirements = [];
        $fingerprint =
            $this->movementFingerprint(
                $movement,
            );

        $needsApproval =
            $movement->method === 'bank_transfer'
            || (
                $threshold > 0
                && (float) $movement->amount >= $threshold
            );

        if ($needsApproval) {
            $requirements[] = [
                'category' => 'payment',
                'reason' => sprintf(
                    'Outgoing payment %s for %s via %s requires approval.',
                    $movement->number,
                    $movement->amount,
                    $movement->method,
                ),
                'required_approvals' => 1,
                'snapshot' => [
                    'number' => $movement->number,
                    'amount' => $movement->amount,
                    'method' => $movement->method,
                    'threshold' => $threshold,
                    'fingerprint' => $fingerprint,
                ],
            ];
        }

        $customRules = DB::table('approval_rules')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            )
            ->where(
                'subject_type',
                'cash_movement',
            )
            ->where('active', true)
            ->orderBy('priority')
            ->orderBy('id')
            ->get();

        foreach ($customRules as $rule) {
            $actual = match ($rule->condition_field) {
                'amount' => (float) $movement->amount,
                'method' => (string) $movement->method,
                default => null,
            };

            if (
                $actual === null
                || ! $this->ruleMatches(
                    $actual,
                    (string) $rule->operator,
                    (string) $rule->threshold,
                )
            ) {
                continue;
            }

            $requirements[] = [
                'category' => 'custom_rule_'.$rule->id,
                'reason' => sprintf(
                    '%s requires %d approval(s).',
                    $rule->name,
                    $rule->required_approvals,
                ),
                'required_approvals' => max(
                    1,
                    (int) $rule->required_approvals,
                ),
                'snapshot' => [
                    'rule_id' => $rule->id,
                    'rule_name' => $rule->name,
                    'field' => $rule->condition_field,
                    'operator' => $rule->operator,
                    'threshold' => $rule->threshold,
                    'actual' => $actual,
                    'fingerprint' => $fingerprint,
                ],
            ];
        }

        $pendingIds = [];

        foreach ($requirements as $requirement) {
            $pendingId = $this->requestApproval(
                'cash_movement',
                $movement->id,
                $requirement['category'],
                $requirement['reason'],
                $requirement['snapshot'],
                $actorId,
                (int) (
                    $requirement['required_approvals']
                    ?? 1
                ),
            );

            if ($pendingId !== null) {
                $pendingIds[] = $pendingId;
            }
        }

        $this->throwIfPending(
            $pendingIds,
        );
    }

    /**
     * Approval is tied to the exact snapshot that was reviewed. Editing the
     * draft after approval invalidates the previous approval automatically.
     *
     * @param  array<string, mixed>  $snapshot
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
     * @param  array<string, mixed>  $snapshot
     */
    private function requestApproval(
        string $subjectType,
        int $subjectId,
        string $category,
        string $reason,
        array $snapshot,
        int $actorId,
        int $requiredApprovals = 1,
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
            $requiredApprovals = max(
                1,
                $requiredApprovals,
            );

            if (
                (int) ($pending->required_approvals ?? 1)
                !== $requiredApprovals
            ) {
                DB::table('approval_requests')
                    ->where('id', $pending->id)
                    ->update([
                        'required_approvals' => $requiredApprovals,
                        'updated_at' => now(),
                    ]);
            }

            return (int) $pending->id;
        }

        $id = (int) DB::table('approval_requests')
            ->insertGetId([
                'organization_id' => $organizationId,
                'subject_type' => $subjectType,
                'subject_id' => $subjectId,
                'category' => $category,
                'status' => 'pending',
                'required_approvals' => max(
                    1,
                    $requiredApprovals,
                ),
                'approved_count' => 0,
                'reason' => $reason,
                'snapshot' => json_encode(
                    $snapshot,
                    JSON_THROW_ON_ERROR,
                ),
                'requested_by' => $actorId,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

        $this->notifyReviewers(
            $organizationId,
            $id,
            $reason,
            $actorId,
            $snapshot,
        );

        return $id;
    }

    /**
     * @param  array<string, mixed>  $snapshot
     */
    private function notifyReviewers(
        int $organizationId,
        int $approvalId,
        string $reason,
        int $requesterId,
        array $snapshot,
    ): void {
        $reviewers = DB::table('memberships as memberships')
            ->leftJoin(
                'workspace_roles as workspace_roles',
                'workspace_roles.id',
                '=',
                'memberships.workspace_role_id',
            )
            ->where(
                'memberships.organization_id',
                $organizationId,
            )
            ->where(
                'memberships.user_id',
                '!=',
                $requesterId,
            )
            ->get([
                'memberships.user_id',
                'memberships.role',
                'workspace_roles.permissions',
                'workspace_roles.is_custom',
            ])
            ->filter(function ($membership): bool {
                if (
                    in_array(
                        $membership->role,
                        [
                            'owner',
                            'admin',
                            'manager',
                        ],
                        true,
                    )
                ) {
                    return true;
                }

                if (! $membership->is_custom) {
                    return false;
                }

                $permissions =
                    $membership->permissions
                        ? json_decode(
                            $membership->permissions,
                            true,
                        )
                        : [];

                return is_array(
                    $permissions,
                )
                    && in_array(
                        'finance.approvals.review',
                        $permissions,
                        true,
                    );
            })
            ->pluck('user_id')
            ->unique()
            ->values();

        foreach ($reviewers as $userId) {
            $data = [
                'name' => 'Approval required',
                'detail' => $reason,
                'invoice_total' => $snapshot['total']
                    ?? (
                        ($snapshot['field'] ?? null) === 'total'
                            ? ($snapshot['actual'] ?? null)
                            : null
                    ),
                'amount_value' => $snapshot['amount']
                    ?? (
                        ($snapshot['field'] ?? null) === 'amount'
                            ? ($snapshot['actual'] ?? null)
                            : null
                    ),
            ];

            if (! app(NotificationRuleService::class)->allows(
                $organizationId,
                (int) $userId,
                'approval_required',
                'activity',
                $data,
            )) {
                continue;
            }

            DB::table('workspace_notifications')
                ->insertOrIgnore([
                    'organization_id' => $organizationId,
                    'user_id' => $userId,
                    'event_key' => 'approval-required:'.$approvalId.':'.$userId,
                    'kind' => 'approval_required',
                    'category' => 'activity',
                    'data' => json_encode(
                        $data,
                        JSON_THROW_ON_ERROR,
                    ),
                    'url' => '/app/finance/approvals',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
        }
    }

    private function ruleMatches(
        float|string $actual,
        string $operator,
        string $threshold,
    ): bool {
        if (
            is_string($actual)
            && ! is_numeric($actual)
        ) {
            return $operator === 'eq'
                && mb_strtolower($actual)
                    === mb_strtolower($threshold);
        }

        if (! is_numeric($threshold)) {
            return false;
        }

        $left = (float) $actual;
        $right = (float) $threshold;

        return match ($operator) {
            'gte' => $left >= $right,
            'gt' => $left > $right,
            'lte' => $left <= $right,
            'lt' => $left < $right,
            'eq' => abs($left - $right) < 0.00005,
            default => false,
        };
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
                    'financial_document_id' => $allocation->financial_document_id,
                    'amount' => $allocation->amount,
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
     * @param  list<int>  $pendingIds
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
