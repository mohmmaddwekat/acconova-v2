<?php

namespace App\Services\Production;

use App\Models\FinancialDocumentLine;
use App\Models\Product;
use App\Models\ProductionCostPeriod;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class ProductionCostingService
{
    /**
     * Outgoing cash categories that are running costs. Materials, resale
     * goods, tax, assets, corrections and "other" (owner profit withdrawals)
     * are not production overhead.
     */
    public const EXPENSE_CATEGORIES = ['utilities', 'rent', 'shipping_customs', 'operating_expense', 'maintenance'];

    /** Share the overhead equally per unit produced. */
    public const BASIS_UNITS = 'units';

    /** Share the overhead in proportion to quantity times material cost. */
    public const BASIS_MATERIAL = 'material';

    public function __construct(
        private readonly RecipeCostCalculator $recipeCosts,
        private readonly TenantContext $tenant,
    ) {}

    /**
     * Compute, per month and product, the unit production cost: raw material
     * cost from the recipe plus the product's share of that month's wages and
     * running expenses. The overhead is shared in proportion to each product's
     * produced quantity times its material cost, so large or expensive bottles
     * carry more than small ones.
     *
     * @return list<array<string, mixed>>
     */
    public function compute(string $basis = self::BASIS_UNITS, int $smoothMonths = 3): array
    {
        $materialCosts = $this->recipeCosts->costs();
        $production = $this->monthlyProduction();
        $wages = $this->smooth($this->monthlyWages(), array_keys($production), $smoothMonths);
        $expenses = $this->smooth($this->monthlyExpenses(), array_keys($production), $smoothMonths);
        $rows = [];

        foreach ($production as $month => $products) {
            $costed = array_filter($products, fn (float $quantity, int $productId): bool => (float) ($materialCosts[$productId] ?? 0) > 0, ARRAY_FILTER_USE_BOTH);
            $costedWeight = 0.0;

            foreach ($costed as $productId => $quantity) {
                $costedWeight += $quantity * (float) $materialCosts[$productId];
            }

            $fallback = $costed === [] ? 1.0 : $costedWeight / array_sum($costed);
            $weightUnit = [];
            $totalWeight = 0.0;

            foreach ($products as $productId => $quantity) {
                $weightUnit[$productId] = $basis === self::BASIS_UNITS
                    ? 1.0
                    : ((float) ($materialCosts[$productId] ?? 0) ?: $fallback);
                $totalWeight += $quantity * $weightUnit[$productId];
            }

            $pool = ($wages[$month] ?? 0.0) + ($expenses[$month] ?? 0.0);

            foreach ($products as $productId => $quantity) {
                $materialUnit = (float) ($materialCosts[$productId] ?? 0);
                $overheadUnit = $totalWeight > 0 ? $pool * $weightUnit[$productId] / $totalWeight : 0.0;

                $rows[] = [
                    'product_id' => $productId,
                    'period' => $month.'-01',
                    'quantity_produced' => $quantity,
                    'material_unit_cost' => $materialUnit,
                    'overhead_unit_cost' => $overheadUnit,
                    'unit_cost' => $materialUnit + $overheadUnit,
                    'wages_pool' => $wages[$month] ?? 0.0,
                    'expenses_pool' => $expenses[$month] ?? 0.0,
                ];
            }
        }

        return $rows;
    }

    /**
     * Replace the stored monthly costs, set each product's current cost to
     * its latest month, and re-cost sale invoice lines using the cost of the
     * month they were sold in (nearest earlier month, else the first).
     *
     * @param  list<array<string, mixed>>  $rows
     * @return array{periods: int, products: int, lines: int}
     */
    public function apply(array $rows): array
    {
        return DB::transaction(function () use ($rows): array {
            ProductionCostPeriod::query()->delete();

            foreach ($rows as $row) {
                ProductionCostPeriod::query()->create([
                    'product_id' => $row['product_id'],
                    'period' => $row['period'],
                    'quantity_produced' => $this->money($row['quantity_produced']),
                    'material_unit_cost' => $this->money($row['material_unit_cost']),
                    'overhead_unit_cost' => $this->money($row['overhead_unit_cost']),
                    'unit_cost' => $this->money($row['unit_cost']),
                    'wages_pool' => $this->money($row['wages_pool']),
                    'expenses_pool' => $this->money($row['expenses_pool']),
                ]);
            }

            $byProduct = [];

            foreach ($rows as $row) {
                $byProduct[$row['product_id']][$row['period']] = $row['unit_cost'];
            }

            $lines = 0;

            foreach ($byProduct as $productId => $costs) {
                ksort($costs);
                $periods = array_keys($costs);

                Product::query()->whereKey($productId)->update(['cost_price' => $this->money($costs[end($periods)])]);

                $months = DB::table('financial_document_lines as l')
                    ->join('financial_documents as d', 'd.id', '=', 'l.financial_document_id')
                    ->where('l.product_id', $productId)
                    ->where('d.kind', 'sale_invoice')
                    ->selectRaw("date_format(d.issue_date, '%Y-%m-01') as month")
                    ->distinct()
                    ->pluck('month');

                foreach ($months as $month) {
                    $earlier = array_filter($periods, fn (string $period): bool => $period <= $month);
                    $chosen = $earlier === [] ? $periods[0] : end($earlier);
                    $start = CarbonImmutable::parse($month);

                    $lines += FinancialDocumentLine::query()
                        ->where('product_id', $productId)
                        ->whereIn('financial_document_id', DB::table('financial_documents')
                            ->where('kind', 'sale_invoice')
                            ->whereBetween('issue_date', [$start->toDateString(), $start->endOfMonth()->toDateString()])
                            ->select('id'))
                        ->update(['cost_price_snapshot' => $this->money($costs[$chosen])]);
                }
            }

            return ['periods' => count($rows), 'products' => count($byProduct), 'lines' => $lines];
        });
    }

    /**
     * Average each month with the previous ones so one-off payments (e.g. a
     * large electricity top-up) do not distort a single month's unit cost.
     *
     * @param  array<string, float>  $totals
     * @param  list<string>  $months
     * @return array<string, float>
     */
    private function smooth(array $totals, array $months, int $window): array
    {
        $smoothed = [];

        foreach ($months as $month) {
            $sum = 0.0;

            for ($back = 0; $back < $window; $back++) {
                $key = CarbonImmutable::parse($month.'-01')->subMonths($back)->format('Y-m');
                $sum += $totals[$key] ?? 0.0;
            }

            $smoothed[$month] = $sum / $window;
        }

        return $smoothed;
    }

    /** @return array<string, float> */
    private function monthlyWages(): array
    {
        return DB::table('staff_entries')
            ->where('organization_id', $this->tenant->id())
            ->where('kind', 'work')
            ->whereNull('deleted_at')
            ->selectRaw("date_format(occurred_on, '%Y-%m') as month, sum(amount) as total")
            ->groupBy('month')
            ->pluck('total', 'month')
            ->map(fn ($total): float => (float) $total)
            ->all();
    }

    /** @return array<string, float> */
    private function monthlyExpenses(): array
    {
        return DB::table('cash_movements')
            ->where('organization_id', $this->tenant->id())
            ->where('direction', 'outgoing')
            ->where('status', 'posted')
            ->whereIn('category', self::EXPENSE_CATEGORIES)
            ->selectRaw("date_format(movement_date, '%Y-%m') as month, sum(amount) as total")
            ->groupBy('month')
            ->pluck('total', 'month')
            ->map(fn ($total): float => (float) $total)
            ->all();
    }

    /** @return array<string, array<int, float>> */
    private function monthlyProduction(): array
    {
        $production = [];

        $rows = DB::table('production_run_outputs as o')
            ->join('production_runs as r', 'r.id', '=', 'o.production_run_id')
            ->where('o.organization_id', $this->tenant->id())
            ->whereNull('r.deleted_at')
            ->whereNull('o.reversed_at')
            ->whereIn('r.status', ['posted', 'partially_reversed'])
            ->selectRaw("date_format(r.occurred_on, '%Y-%m') as month, o.product_id, sum(o.quantity) as quantity")
            ->groupBy('month', 'o.product_id')
            ->orderBy('month')
            ->get();

        foreach ($rows as $row) {
            $production[$row->month][(int) $row->product_id] = (float) $row->quantity;
        }

        return $production;
    }

    private function money(float|string $value): string
    {
        return number_format((float) $value, 4, '.', '');
    }
}
