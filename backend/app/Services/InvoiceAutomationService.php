<?php

namespace App\Services;

use App\Models\FinancialDocument;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class InvoiceAutomationService
{
    public function __construct(
        private FinanceDocumentService $documents,
    ) {
    }

    /**
     * Capture a reusable invoice payload without lifecycle/audit fields.
     *
     * @return array<string, mixed>
     */
    public function snapshot(
        FinancialDocument $document,
    ): array {
        $document->loadMissing([
            'lines',
        ]);

        $dueOffset = null;

        if (
            $document->due_date
            && $document->issue_date
        ) {
            $dueOffset = $document->issue_date
                ->diffInDays(
                    $document->due_date,
                    false,
                );
        }

        return [
            'kind' => $document->kind,
            'party_id' => $document->party_id,
            'warehouse_id' => $document->warehouse_id,
            'department_id' => $document->department_id,
            'external_number' => null,
            'issue_date' => $document->issue_date?->format('Y-m-d')
                ?? today()->format('Y-m-d'),
            'due_date' => $document->due_date?->format('Y-m-d'),
            'due_offset_days' => $dueOffset,
            'activity_type' => $document->activity_type,
            'market_type' => $document->market_type,
            'branch_label' => $document->branch_label,
            'currency' => $document->currency,
            'exchange_rate' => $document->exchange_rate,
            'shipping_total' => $document->shipping_total,
            'payment_terms' => $document->payment_terms,
            'notes' => $document->notes,
            'internal_notes' => $document->internal_notes,
            'lines' => $document->lines
                ->map(fn ($line) => [
                    'product_id' => $line->product_id,
                    'warehouse_id' => $line->warehouse_id,
                    'tax_rule_id' => $line->tax_rule_id,
                    'description' => $line->description,
                    'unit' => $line->unit_snapshot,
                    'quantity' => $line->quantity,
                    'unit_price' => $line->unit_price,
                    'price_status' => $line->price_status,
                    'discount_percent' => $line->discount_percent,
                    'discount_type' => $line->discount_type,
                    'discount_value' => $line->discount_value,
                    'tax_rate' => $line->tax_rate,
                    'affects_inventory' => (bool) $line->affects_inventory,
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * Create a clean draft from a saved template/profile snapshot.
     *
     * @param  array<string, mixed>  $snapshot
     */
    public function createDraft(
        array $snapshot,
        int $userId,
        ?CarbonImmutable $issueDate = null,
    ): FinancialDocument {
        $issueDate ??= CarbonImmutable::today();

        $payload = $snapshot;
        $payload['issue_date'] = $issueDate->format('Y-m-d');
        $payload['external_number'] = null;

        $dueOffset = isset($snapshot['due_offset_days'])
            ? (int) $snapshot['due_offset_days']
            : null;

        $payload['due_date'] = $dueOffset !== null
            ? $issueDate->addDays(max($dueOffset, 0))->format('Y-m-d')
            : null;

        unset($payload['due_offset_days']);

        return $this->documents->createDraft(
            $payload,
            $userId,
        );
    }

    /**
     * Materialize every due recurring profile as a draft, never as an issued
     * invoice. This keeps automation review-first and accounting-safe.
     */
    public function syncDue(
        int $organizationId,
    ): int {
        $generated = 0;

        DB::table('recurring_invoice_profiles')
            ->where('organization_id', $organizationId)
            ->where('active', true)
            ->whereDate('next_run_on', '<=', today())
            ->orderBy('id')
            ->get()
            ->each(function ($profile) use (&$generated): void {
                DB::transaction(function () use ($profile, &$generated): void {
                    $locked = DB::table('recurring_invoice_profiles')
                        ->where('id', $profile->id)
                        ->lockForUpdate()
                        ->first();

                    if (
                        ! $locked
                        || ! $locked->active
                        || CarbonImmutable::parse($locked->next_run_on)->isAfter(today())
                    ) {
                        return;
                    }

                    $snapshot = json_decode(
                        $locked->snapshot,
                        true,
                        512,
                        JSON_THROW_ON_ERROR,
                    );

                    $issueDate = CarbonImmutable::parse(
                        $locked->next_run_on,
                    );

                    $this->createDraft(
                        $snapshot,
                        (int) $locked->created_by,
                        $issueDate,
                    );

                    $next = $this->nextDate(
                        $issueDate,
                        (string) $locked->frequency,
                        max((int) $locked->interval, 1),
                    );

                    $endsOn = $locked->ends_on
                        ? CarbonImmutable::parse($locked->ends_on)
                        : null;

                    $active = ! $endsOn
                        || $next->lessThanOrEqualTo($endsOn);

                    DB::table('recurring_invoice_profiles')
                        ->where('id', $locked->id)
                        ->update([
                            'last_generated_on' => $issueDate->format('Y-m-d'),
                            'next_run_on' => $next->format('Y-m-d'),
                            'active' => $active,
                            'updated_at' => now(),
                        ]);

                    $generated++;
                });
            });

        return $generated;
    }

    private function nextDate(
        CarbonImmutable $from,
        string $frequency,
        int $interval,
    ): CarbonImmutable {
        return match ($frequency) {
            'weekly' => $from->addWeeks($interval),
            'monthly' => $from->addMonthsNoOverflow($interval),
            'quarterly' => $from->addMonthsNoOverflow(3 * $interval),
            default => $from->addMonthsNoOverflow($interval),
        };
    }
}
