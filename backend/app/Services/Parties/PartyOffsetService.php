<?php

namespace App\Services\Parties;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyAdjustment;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Offsets ("مقاصة") between what a customer-and-supplier Party owes us on its
 * sales invoices and what we owe it on its purchase invoices.
 *
 * Each offset is a pair of document-linked party adjustments with the same
 * amount, one on a sales invoice and one on a purchase invoice, tied together by
 * an offset group. Both invoices therefore show the amount as paid, balances
 * and statements stay correct, and no cash moves. The group is voided as a unit.
 */
class PartyOffsetService
{
    private const EPSILON = 0.00005;

    public function __construct(
        private readonly PartyAdjustmentService $adjustments,
    ) {}

    /**
     * What would be offset now, oldest invoices first on both sides.
     *
     * @return array{pairs: list<array<string, mixed>>, total: float, available: float, sales_open: float, purchases_open: float}
     */
    public function plan(Party $party, ?float $amount = null, ?FinancialDocument $anchor = null): array
    {
        $sales = $this->openDocuments($party, 'sale_invoice', $anchor);
        $purchases = $this->openDocuments($party, 'purchase_invoice', $anchor);

        $salesOpen = round($sales->sum(fn (FinancialDocument $document): float => (float) $document->balance_due), 4);
        $purchasesOpen = round($purchases->sum(fn (FinancialDocument $document): float => (float) $document->balance_due), 4);
        $available = round(min($salesOpen, $purchasesOpen), 4);
        $limit = $amount === null ? $available : min($amount, $available);

        $saleBalances = $sales->mapWithKeys(fn (FinancialDocument $document): array => [$document->id => (float) $document->balance_due])->all();
        $purchaseBalances = $purchases->mapWithKeys(fn (FinancialDocument $document): array => [$document->id => (float) $document->balance_due])->all();

        $pairs = [];
        $remaining = $limit;

        foreach ($sales as $sale) {
            foreach ($purchases as $purchase) {
                if ($remaining <= self::EPSILON) {
                    break 2;
                }

                $part = round(min($remaining, $saleBalances[$sale->id], $purchaseBalances[$purchase->id]), 4);

                if ($part <= self::EPSILON) {
                    continue;
                }

                $pairs[] = [
                    'sale_id' => $sale->id,
                    'sale_number' => $sale->number,
                    'sale_date' => $sale->issue_date->toDateString(),
                    'purchase_id' => $purchase->id,
                    'purchase_number' => $purchase->number,
                    'purchase_date' => $purchase->issue_date->toDateString(),
                    'amount' => number_format($part, 4, '.', ''),
                ];

                $saleBalances[$sale->id] -= $part;
                $purchaseBalances[$purchase->id] -= $part;
                $remaining = round($remaining - $part, 4);
            }
        }

        return [
            'pairs' => $pairs,
            'total' => round($limit - $remaining, 4),
            'available' => $available,
            'sales_open' => $salesOpen,
            'purchases_open' => $purchasesOpen,
        ];
    }

    /**
     * Offset up to $amount (everything possible when null) for one Party.
     *
     * @return array{group: string|null, pairs: list<array<string, mixed>>, total: float}
     */
    public function apply(Party $party, ?float $amount, ?string $date, string $notes, int $actorId, ?FinancialDocument $anchor = null, bool $strict = true): array
    {
        return DB::transaction(function () use ($party, $amount, $date, $notes, $actorId, $anchor, $strict): array {
            $locked = Party::query()->with('roles')->lockForUpdate()->findOrFail($party->id);
            $roles = $locked->roles->map(fn ($role): string => is_object($role->role) ? $role->role->value : (string) $role->role)->all();

            if (! in_array('customer', $roles, true) || ! in_array('supplier', $roles, true)) {
                $this->fail('party', 'المقاصة ممكنة فقط لطرف هو عميل ومورد معاً.');
            }

            $plan = $this->plan($locked, $amount, $anchor);

            if ($plan['pairs'] === []) {
                $this->fail('amount', 'لا توجد فواتير مفتوحة على الجهتين لإجراء مقاصة.');
            }

            if ($strict && $amount !== null && $amount > $plan['available'] + self::EPSILON) {
                $this->fail('amount', 'المبلغ أكبر من المتاح للمقاصة ('.number_format($plan['available'], 2, '.', '').').');
            }

            $group = (string) Str::uuid();
            $today = now()->toDateString();

            foreach ($plan['pairs'] as $pair) {
                $adjustmentDate = max($date ?? $today, $pair['sale_date'], $pair['purchase_date']);
                $adjustmentDate = min($adjustmentDate, $today);

                $this->adjustments->create($locked, [
                    'financial_document_id' => $pair['sale_id'],
                    'amount' => $pair['amount'],
                    'adjustment_date' => $adjustmentDate,
                    'reason' => 'مقاصة مع فاتورة شراء '.$pair['purchase_number'],
                    'notes' => $notes,
                    'offset_group' => $group,
                    'side' => 'customer',
                    'direction' => PartyAdjustment::DIRECTION_WE_OWE,
                ], $actorId);

                $this->adjustments->create($locked, [
                    'financial_document_id' => $pair['purchase_id'],
                    'amount' => $pair['amount'],
                    'adjustment_date' => $adjustmentDate,
                    'reason' => 'مقاصة مع فاتورة بيع '.$pair['sale_number'],
                    'notes' => $notes,
                    'offset_group' => $group,
                    'side' => 'supplier',
                    'direction' => PartyAdjustment::DIRECTION_OWED_TO_US,
                ], $actorId);
            }

            return ['group' => $group, 'pairs' => $plan['pairs'], 'total' => $plan['total']];
        }, 3);
    }

    /**
     * Void every adjustment of one offset group together.
     */
    public function voidGroup(string $group, string $reason, int $actorId): int
    {
        return DB::transaction(function () use ($group, $reason, $actorId): int {
            $members = PartyAdjustment::query()
                ->where('offset_group', $group)
                ->where('status', PartyAdjustment::STATUS_POSTED)
                ->lockForUpdate()
                ->get();

            foreach ($members as $member) {
                $this->adjustments->void($member, $reason, $actorId);
            }

            return $members->count();
        }, 3);
    }

    /**
     * @return Collection<int, FinancialDocument>
     */
    private function openDocuments(Party $party, string $kind, ?FinancialDocument $anchor)
    {
        return FinancialDocument::query()
            ->where('party_id', $party->id)
            ->where('kind', $kind)
            ->whereIn('status', ['issued', 'partially_paid'])
            ->where('balance_due', '>', 0)
            ->when($anchor && $anchor->kind === $kind, fn ($query) => $query->whereKey($anchor->id))
            ->orderBy('issue_date')
            ->orderBy('id')
            ->get();
    }

    private function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => [$message]]);
    }
}
