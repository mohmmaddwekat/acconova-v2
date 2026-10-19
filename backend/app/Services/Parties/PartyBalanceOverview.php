<?php

namespace App\Services\Parties;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyAdjustment;
use App\Models\PartyOpeningBalance;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Workspace-wide balance totals and debt aging for the Party index.
 *
 * A dual-role Party is aged on its net balance only, on whichever side it
 * falls. Aging attributes each open balance to the newest invoices first, which is
 * the same order a first-in-first-out payment history leaves unpaid. Whatever
 * the invoices cannot explain belongs to the carried opening balance.
 */
final class PartyBalanceOverview
{
    public const BUCKET_CURRENT_DAYS = 30;

    public const BUCKET_LATE_DAYS = 60;

    public function __construct(
        private PartyBalanceSummary $balances,
    ) {}

    /**
     * Whether the viewer may see a complete balance for a Party with these roles.
     *
     * @param  list<string>  $roles
     */
    public static function canSeeBalance(
        array $roles,
        bool $canSales,
        bool $canPurchases,
        bool $canCash,
    ): bool {
        $hasCustomer = in_array('customer', $roles, true);
        $hasSupplier = in_array('supplier', $roles, true);

        return ($hasCustomer || $hasSupplier)
            && (! $hasCustomer || ($canSales && $canCash))
            && (! $hasSupplier || ($canPurchases && $canCash));
    }

    /**
     * Split each Party's open balance into age buckets.
     *
     * @param  array<int, array{customer_position: float, supplier_position: float, owed_to_us: float, we_owe: float}>  $positions
     * @return array<int, array{current: float, days_31_60: float, over_60: float, oldest_days: int}>
     */
    public function aging(
        array $positions,
        bool $canSales,
        bool $canPurchases,
        ?Carbon $asOf = null,
    ): array {
        $asOf ??= now()->endOfDay();
        $ids = array_keys($positions);
        $aging = array_fill_keys($ids, ['current' => 0.0, 'days_31_60' => 0.0, 'over_60' => 0.0, 'oldest_days' => 0]);

        if ($ids === []) {
            return $aging;
        }

        $kinds = array_values(array_filter([
            $canSales ? 'sale_invoice' : null,
            $canPurchases ? 'purchase_invoice' : null,
        ]));

        $cutoffs = PartyOpeningBalance::query()
            ->whereIn('party_id', $ids)
            ->get(['party_id', 'side', 'as_of_date'])
            ->mapWithKeys(fn (PartyOpeningBalance $opening): array => [
                $opening->party_id.'|'.$opening->side => $opening->as_of_date?->toDateString(),
            ]);

        /*
         * Plain rows keep this fast: a workspace can hold thousands of
         * historical invoices and none of them need model behaviour here.
         */
        $invoices = $kinds === []
            ? collect()
            : FinancialDocument::query()
                ->whereIn('party_id', $ids)
                ->whereIn('kind', $kinds)
                ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
                ->whereDate('issue_date', '<=', $asOf->toDateString())
                ->orderByDesc('issue_date')
                ->orderByDesc('id')
                ->toBase()
                ->get(['party_id', 'kind', 'issue_date', 'due_date', 'total'])
                ->groupBy(fn (object $document): string => $document->party_id.'|'.$document->kind);

        $this->mergeRaisingAdjustments($invoices, $ids, $canSales, $canPurchases, $asOf);

        foreach ($positions as $partyId => $position) {
            $net = ($canSales ? (float) $position['customer_position'] : 0.0)
                - ($canPurchases ? (float) $position['supplier_position'] : 0.0);
            $sides = [
                'customer' => max($net, 0.0),
                'supplier' => max(-$net, 0.0),
            ];

            foreach ($sides as $side => $outstanding) {
                if ($outstanding <= 0.005) {
                    continue;
                }

                $cutoff = $cutoffs[$partyId.'|'.$side] ?? null;
                $kind = $side === 'customer' ? 'sale_invoice' : 'purchase_invoice';

                foreach ($invoices[$partyId.'|'.$kind] ?? [] as $invoice) {
                    if ($outstanding <= 0.005) {
                        break;
                    }

                    $issueDate = substr((string) $invoice->issue_date, 0, 10);

                    if ($cutoff && $issueDate <= $cutoff) {
                        continue;
                    }

                    $portion = min($outstanding, (float) $invoice->total);
                    $this->addToBucket($aging[$partyId], $portion, $invoice->due_date ? substr((string) $invoice->due_date, 0, 10) : $issueDate, $asOf);
                    $outstanding -= $portion;
                }

                if ($outstanding > 0.005) {
                    $this->addToBucket($aging[$partyId], $outstanding, $cutoff, $asOf);
                }
            }
        }

        return array_map(fn (array $row): array => [
            'current' => round($row['current'], 2),
            'days_31_60' => round($row['days_31_60'], 2),
            'over_60' => round($row['over_60'], 2),
            'oldest_days' => $row['oldest_days'],
        ], $aging);
    }

    /**
     * Totals and counts across every active Party whose balance the viewer may see.
     *
     * @return array{owed_to_us: float, we_owe: float, overdue: float, counts: array{all: int, customers: int, suppliers: int, receivable: int, payable: int, overdue: int}}
     */
    public function overview(
        bool $canSales,
        bool $canPurchases,
        bool $canCash,
    ): array {
        $rows = $this->visibleRows($canSales, $canPurchases, $canCash);
        $parties = Party::query()->with('roles')->get(['id']);

        return [
            'owed_to_us' => round(array_sum(array_column($rows, 'owed_to_us')), 2),
            'we_owe' => round(array_sum(array_column($rows, 'we_owe')), 2),
            'overdue' => round(array_sum(array_column($rows, 'over_60')), 2),
            'counts' => [
                'all' => $parties->count(),
                'customers' => $parties->filter(fn (Party $party): bool => in_array('customer', $this->roles($party), true))->count(),
                'suppliers' => $parties->filter(fn (Party $party): bool => in_array('supplier', $this->roles($party), true))->count(),
                'receivable' => count(array_filter($rows, fn (array $row): bool => $row['owed_to_us'] > 0.005)),
                'payable' => count(array_filter($rows, fn (array $row): bool => $row['we_owe'] > 0.005)),
                'overdue' => count(array_filter($rows, fn (array $row): bool => $row['over_60'] > 0.005)),
            ],
        ];
    }

    /**
     * Ids of the Parties that match a balance filter.
     *
     * @return list<int>
     */
    public function matchingIds(
        string $balance,
        bool $canSales,
        bool $canPurchases,
        bool $canCash,
    ): array {
        $field = match ($balance) {
            'receivable' => 'owed_to_us',
            'payable' => 'we_owe',
            default => 'over_60',
        };

        return array_keys(array_filter(
            $this->visibleRows($canSales, $canPurchases, $canCash),
            fn (array $row): bool => $row[$field] > 0.005,
        ));
    }

    /**
     * @return array<int, array{owed_to_us: float, we_owe: float, over_60: float}>
     */
    private function visibleRows(
        bool $canSales,
        bool $canPurchases,
        bool $canCash,
    ): array {
        /** @var Collection<int, Party> $parties */
        $parties = Party::query()
            ->with('roles')
            ->get(['id'])
            ->filter(fn (Party $party): bool => self::canSeeBalance($this->roles($party), $canSales, $canPurchases, $canCash))
            ->values();

        $positions = $this->balances->forParties($parties, $canSales, $canPurchases, $canCash);
        $aging = $this->aging($positions, $canSales, $canPurchases);

        $rows = [];

        foreach ($positions as $partyId => $position) {
            $rows[$partyId] = [
                'owed_to_us' => (float) $position['owed_to_us'],
                'we_owe' => (float) $position['we_owe'],
                'over_60' => (float) ($aging[$partyId]['over_60'] ?? 0),
            ];
        }

        return $rows;
    }

    /**
     * @return list<string>
     */
    private function roles(Party $party): array
    {
        return $party->roles
            ->pluck('role')
            ->map(fn ($role): string => $role instanceof \BackedEnum ? (string) $role->value : (string) $role)
            ->all();
    }

    /**
     * A difference entry that raises a balance ages like an invoice dated on
     * the entry, so it joins the invoice rows newest first.
     *
     * @param  Collection<string, Collection<int, object>>  $invoices
     * @param  list<int>  $ids
     */
    private function mergeRaisingAdjustments(
        Collection &$invoices,
        array $ids,
        bool $canSales,
        bool $canPurchases,
        Carbon $asOf,
    ): void {
        $raising = array_filter([
            'customer' => $canSales ? PartyAdjustment::DIRECTION_OWED_TO_US : null,
            'supplier' => $canPurchases ? PartyAdjustment::DIRECTION_WE_OWE : null,
        ]);

        if ($raising === []) {
            return;
        }

        $adjustments = PartyAdjustment::query()
            ->whereIn('party_id', $ids)
            ->where('status', PartyAdjustment::STATUS_POSTED)
            ->whereDate('adjustment_date', '<=', $asOf->toDateString())
            ->where(function ($query) use ($raising): void {
                foreach ($raising as $side => $direction) {
                    $query->orWhere(fn ($pair) => $pair->where('side', $side)->where('direction', $direction));
                }
            })
            ->toBase()
            ->get(['id', 'party_id', 'side', 'adjustment_date', 'amount']);

        foreach ($adjustments as $adjustment) {
            $key = $adjustment->party_id.'|'.($adjustment->side === 'customer' ? 'sale_invoice' : 'purchase_invoice');
            $row = (object) [
                'party_id' => $adjustment->party_id,
                'issue_date' => $adjustment->adjustment_date,
                'due_date' => null,
                'total' => $adjustment->amount,
            ];

            $invoices[$key] = collect($invoices[$key] ?? [])
                ->push($row)
                ->sortByDesc(fn (object $document): string => substr((string) $document->issue_date, 0, 10))
                ->values();
        }
    }

    /**
     * @param  array{current: float, days_31_60: float, over_60: float, oldest_days: int}  $row
     */
    private function addToBucket(
        array &$row,
        float $amount,
        ?string $date,
        Carbon $asOf,
    ): void {
        $days = $date
            ? max(intdiv(strtotime($asOf->toDateString()) - strtotime($date), 86400), 0)
            : self::BUCKET_LATE_DAYS + 1;
        $bucket = $days <= self::BUCKET_CURRENT_DAYS ? 'current' : ($days <= self::BUCKET_LATE_DAYS ? 'days_31_60' : 'over_60');
        $row[$bucket] += $amount;
        $row['oldest_days'] = max($row['oldest_days'], $days);
    }
}
