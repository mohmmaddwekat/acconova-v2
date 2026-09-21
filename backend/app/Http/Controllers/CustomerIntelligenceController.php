<?php

namespace App\Http\Controllers;

use Carbon\Carbon;

use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class CustomerIntelligenceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Party::class);

        $organizationId = app(TenantContext::class)->id();
        $since = now()->subYear()->toDateString();

        $customers = DB::table('parties as p')
            ->join('party_roles as pr', function ($join): void {
                $join
                    ->on('pr.party_id', '=', 'p.id')
                    ->where('pr.role', '=', 'customer');
            })
            ->where('p.organization_id', $organizationId)
            ->whereNull('p.deleted_at')
            ->select([
                'p.id',
                DB::raw("COALESCE(NULLIF(p.company_name, ''), NULLIF(p.name, ''), CONCAT('#', p.id)) as name"),
            ])
            ->get();

        $sales = DB::table('financial_documents')
            ->where('organization_id', $organizationId)
            ->where('kind', 'sale_invoice')
            ->whereIn('status', [
                'issued',
                'partially_paid',
                'paid',
                'overpaid',
            ])
            ->whereDate('issue_date', '>=', $since)
            ->whereNotNull('party_id')
            ->groupBy('party_id')
            ->selectRaw(
                'party_id,
                 COUNT(*) as invoice_count,
                 SUM(total) as revenue,
                 SUM(balance_due) as outstanding,
                 MAX(issue_date) as last_sale_date',
            )
            ->get()
            ->keyBy('party_id');

        $overdue = DB::table('financial_documents')
            ->where('organization_id', $organizationId)
            ->where('kind', 'sale_invoice')
            ->whereIn('status', [
                'issued',
                'partially_paid',
            ])
            ->whereDate('due_date', '<', today()->toDateString())
            ->whereNotNull('party_id')
            ->groupBy('party_id')
            ->selectRaw(
                'party_id, SUM(balance_due) as overdue_balance, COUNT(*) as overdue_count',
            )
            ->get()
            ->keyBy('party_id');

        /*
         * Profitability is an operational estimate using each product's
         * current cost price because historical cost snapshots are not yet
         * stored on invoice lines.
         */
        $profit = DB::table('financial_document_lines as l')
            ->join(
                'financial_documents as d',
                'd.id',
                '=',
                'l.financial_document_id',
            )
            ->leftJoin(
                'products as products',
                'products.id',
                '=',
                'l.product_id',
            )
            ->where('l.organization_id', $organizationId)
            ->where('d.organization_id', $organizationId)
            ->where('d.kind', 'sale_invoice')
            ->whereIn('d.status', [
                'issued',
                'partially_paid',
                'paid',
                'overpaid',
            ])
            ->whereDate('d.issue_date', '>=', $since)
            ->whereNotNull('d.party_id')
            ->groupBy('d.party_id')
            ->selectRaw(
                'd.party_id,
                 SUM(l.line_total - l.line_tax) as revenue,
                 SUM(l.quantity * COALESCE(l.cost_price_snapshot, products.cost_price, 0)) as estimated_cost',
            )
            ->get()
            ->keyBy('party_id');

        $revenueValues = $sales
            ->pluck('revenue')
            ->map(fn ($value): float => (float) $value)
            ->filter(fn (float $value): bool => $value > 0)
            ->sort()
            ->values();

        $vipThreshold = $this->percentile(
            $revenueValues->all(),
            0.80,
        );

        $rows = $customers->map(function ($customer) use (
            $sales,
            $overdue,
            $profit,
            $vipThreshold,
        ): array {
            $sale = $sales->get($customer->id);
            $late = $overdue->get($customer->id);
            $profitRow = $profit->get($customer->id);

            $revenue = (float) ($sale->revenue ?? 0);
            $estimatedCost = (float) ($profitRow->estimated_cost ?? 0);
            $grossProfit = $revenue - $estimatedCost;
            $margin = $revenue > 0
                ? ($grossProfit / $revenue) * 100
                : 0;

            $lastSaleDate = $sale->last_sale_date ?? null;
            $daysSinceSale = $lastSaleDate
                ? Carbon::parse($lastSaleDate)->diffInDays(now())
                : null;

            $segments = [];

            if (
                $revenue > 0
                && $vipThreshold > 0
                && $revenue >= $vipThreshold
            ) {
                $segments[] = 'vip';
            }

            if (
                $daysSinceSale !== null
                && $daysSinceSale <= 30
            ) {
                $segments[] = 'active';
            } elseif (
                $daysSinceSale !== null
                && $daysSinceSale <= 90
            ) {
                $segments[] = 'at_risk';
            } else {
                $segments[] = 'inactive';
            }

            if ((float) ($late->overdue_balance ?? 0) > 0) {
                $segments[] = 'overdue';
            }

            if (
                $grossProfit > 0
                && $margin >= 25
            ) {
                $segments[] = 'high_profitability';
            }

            return [
                'party_id' => (int) $customer->id,
                'name' => (string) $customer->name,
                'segments' => array_values(
                    array_unique($segments),
                ),
                'invoice_count' => (int) ($sale->invoice_count ?? 0),
                'revenue' => number_format($revenue, 4, '.', ''),
                'outstanding' => number_format(
                    (float) ($sale->outstanding ?? 0),
                    4,
                    '.',
                    '',
                ),
                'overdue_balance' => number_format(
                    (float) ($late->overdue_balance ?? 0),
                    4,
                    '.',
                    '',
                ),
                'overdue_count' => (int) ($late->overdue_count ?? 0),
                'last_sale_date' => $lastSaleDate,
                'days_since_sale' => $daysSinceSale,
                'estimated_cost' => number_format(
                    $estimatedCost,
                    4,
                    '.',
                    '',
                ),
                'gross_profit_estimate' => number_format(
                    $grossProfit,
                    4,
                    '.',
                    '',
                ),
                'margin_estimate_percent' => number_format(
                    $margin,
                    2,
                    '.',
                    '',
                ),
            ];
        })->values();

        $segmentCounts = [
            'vip' => 0,
            'active' => 0,
            'at_risk' => 0,
            'inactive' => 0,
            'overdue' => 0,
            'high_profitability' => 0,
        ];

        foreach ($rows as $row) {
            foreach ($row['segments'] as $segment) {
                $segmentCounts[$segment]++;
            }
        }

        return response()->json([
            'data' => [
                'summary' => [
                    ...$segmentCounts,
                    'total_customers' => $rows->count(),
                    'vip_revenue_threshold' => number_format(
                        $vipThreshold,
                        4,
                        '.',
                        '',
                    ),
                ],
                'customers' => $rows
                    ->sortByDesc(
                        fn (array $row): float =>
                            (float) $row['revenue'],
                    )
                    ->values(),
                'methodology' => [
                    'vip' => 'Top 20% of customers by trailing-12-month revenue.',
                    'active' => 'Last sale within 30 days.',
                    'at_risk' => 'Last sale 31-90 days ago.',
                    'inactive' => 'No sale in the last 90 days or no sale history.',
                    'overdue' => 'Has an issued or partially-paid sales invoice past due.',
                    'high_profitability' => 'Estimated gross margin is at least 25%.',
                    'profitability_note' => 'Uses issue-time cost snapshots when available, with current product cost only as a fallback for older invoices.',
                ],
            ],
        ]);
    }

    /**
     * @param list<float> $sorted
     */
    private function percentile(
        array $sorted,
        float $percentile,
    ): float {
        $count = count($sorted);

        if ($count === 0) {
            return 0;
        }

        if ($count === 1) {
            return $sorted[0];
        }

        sort($sorted);

        $index = ($count - 1) * $percentile;
        $lower = (int) floor($index);
        $upper = (int) ceil($index);

        if ($lower === $upper) {
            return $sorted[$lower];
        }

        $weight = $index - $lower;

        return $sorted[$lower] * (1 - $weight)
            + $sorted[$upper] * $weight;
    }
}
