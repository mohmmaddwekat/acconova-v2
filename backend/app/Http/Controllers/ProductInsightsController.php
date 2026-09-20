<?php

namespace App\Http\Controllers;

use App\Models\FinancialDocumentLine;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ProductInsightsController extends Controller
{
    /**
     * Return Product 360 commercial, customer and inventory analytics.
     */
    public function __invoke(
        Request $request,
        string $product,
    ): JsonResponse {
        $record = Product::withTrashed()
            ->findOrFail($product);

        Gate::authorize(
            'view',
            $record,
        );

        $operationalStatuses = [
            'issued',
            'partially_paid',
            'paid',
            'overpaid',
        ];

        $salesLines = FinancialDocumentLine::query()
            ->where('product_id', $record->id)
            ->whereHas('document', function ($query) use ($operationalStatuses): void {
                $query
                    ->where('kind', 'sale_invoice')
                    ->whereIn('status', $operationalStatuses);
            });

        $purchaseLines = FinancialDocumentLine::query()
            ->where('product_id', $record->id)
            ->whereHas('document', function ($query) use ($operationalStatuses): void {
                $query
                    ->where('kind', 'purchase_invoice')
                    ->whereIn('status', $operationalStatuses);
            });

        $soldQuantity = (float) (clone $salesLines)->sum('quantity');
        $salesRevenue = (float) (clone $salesLines)->sum('line_total');
        $purchasedQuantity = (float) (clone $purchaseLines)->sum('quantity');
        $purchaseSpend = (float) (clone $purchaseLines)->sum('line_total');

        $currentCost = (float) ($record->cost_price ?? 0);
        $grossProfitEstimate = $salesRevenue
            - ($soldQuantity * $currentCost);

        $marginEstimate = $salesRevenue > 0
            ? ($grossProfitEstimate / $salesRevenue) * 100
            : 0;

        $topCustomers = FinancialDocumentLine::query()
            ->join(
                'financial_documents',
                'financial_documents.id',
                '=',
                'financial_document_lines.financial_document_id',
            )
            ->leftJoin(
                'parties',
                'parties.id',
                '=',
                'financial_documents.party_id',
            )
            ->where(
                'financial_document_lines.product_id',
                $record->id,
            )
            ->where(
                'financial_documents.kind',
                'sale_invoice',
            )
            ->whereIn(
                'financial_documents.status',
                $operationalStatuses,
            )
            ->whereNotNull(
                'financial_documents.party_id',
            )
            ->selectRaw(
                'financial_documents.party_id,
                 COALESCE(parties.company_name, parties.name) as party_name,
                 SUM(financial_document_lines.quantity) as quantity,
                 SUM(financial_document_lines.line_total) as total',
            )
            ->groupBy(
                'financial_documents.party_id',
                'parties.company_name',
                'parties.name',
            )
            ->orderByDesc('total')
            ->limit(6)
            ->get()
            ->map(fn ($row) => [
                'party_id' => $row->party_id,
                'name' => $row->party_name,
                'quantity' => (string) $row->quantity,
                'total' => (string) $row->total,
            ])
            ->values();

        $lastSale = FinancialDocumentLine::query()
            ->where('product_id', $record->id)
            ->whereHas('document', function ($query) use ($operationalStatuses): void {
                $query
                    ->where('kind', 'sale_invoice')
                    ->whereIn('status', $operationalStatuses);
            })
            ->with('document:id,issue_date,number')
            ->latest('id')
            ->first();

        $lastPurchase = FinancialDocumentLine::query()
            ->where('product_id', $record->id)
            ->whereHas('document', function ($query) use ($operationalStatuses): void {
                $query
                    ->where('kind', 'purchase_invoice')
                    ->whereIn('status', $operationalStatuses);
            })
            ->with('document:id,issue_date,number')
            ->latest('id')
            ->first();

        $priceHistory = FinancialDocumentLine::query()
            ->where('product_id', $record->id)
            ->whereHas('document', function ($query) use ($operationalStatuses): void {
                $query->whereIn('status', $operationalStatuses);
            })
            ->with('document:id,kind,issue_date,status')
            ->latest('id')
            ->limit(160)
            ->get()
            ->filter(fn ($line) => $line->document?->issue_date)
            ->groupBy(fn ($line) =>
                $line->document->issue_date->format('Y-m-d')
                .'|'
                .$line->document->kind,
            )
            ->map(function ($lines) {
                $first = $lines->first();

                return [
                    'date' => $first->document->issue_date->format('Y-m-d'),
                    'kind' => $first->document->kind,
                    'price' => number_format(
                        (float) $lines->avg(
                            fn ($line) => (float) $line->unit_price,
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'count' => $lines->count(),
                ];
            })
            ->sortBy('date')
            ->take(-60)
            ->values();

        $customPrices = DB::table('party_product_prices as ppp')
            ->join('parties as p', 'p.id', '=', 'ppp.party_id')
            ->where('ppp.organization_id', app(TenantContext::class)->id())
            ->where('ppp.product_id', $record->id)
            ->orderByRaw("COALESCE(NULLIF(p.company_name, ''), NULLIF(p.name, ''), '')")
            ->limit(50)
            ->get([
                'ppp.party_id',
                'p.name',
                'p.company_name',
                'ppp.unit_price',
                'ppp.currency',
                'ppp.note',
                'ppp.updated_at',
            ])
            ->map(fn ($row) => [
                'party_id' => $row->party_id,
                'party_name' => $row->company_name ?: $row->name ?: '#'.$row->party_id,
                'unit_price' => (string) $row->unit_price,
                'currency' => $row->currency,
                'note' => $row->note,
                'updated_at' => $row->updated_at,
            ])
            ->values();

        $balances = $record->inventoryBalances()
            ->with('warehouse:id,name')
            ->get();

        $recentMovements = $record->stockMovements()
            ->with('warehouse:id,name')
            ->latest('id')
            ->limit(10)
            ->get()
            ->map(fn ($movement) => [
                'id' => $movement->id,
                'type' => $movement->type->value,
                'quantity' => $movement->quantity,
                'balance_after' => $movement->balance_after,
                'warehouse' => $movement->warehouse?->name,
                'created_at' => $movement->created_at?->toIso8601String(),
            ])
            ->values();

        return response()->json([
            'data' => [
                'sales' => [
                    'quantity' => number_format($soldQuantity, 4, '.', ''),
                    'revenue' => number_format($salesRevenue, 4, '.', ''),
                    'last_price' => $lastSale?->unit_price,
                    'last_document' => $lastSale?->document?->number,
                ],
                'purchases' => [
                    'quantity' => number_format($purchasedQuantity, 4, '.', ''),
                    'spend' => number_format($purchaseSpend, 4, '.', ''),
                    'last_price' => $lastPurchase?->unit_price,
                    'last_document' => $lastPurchase?->document?->number,
                ],
                'profitability' => [
                    'current_cost' => number_format($currentCost, 4, '.', ''),
                    'gross_profit_estimate' => number_format(
                        $grossProfitEstimate,
                        4,
                        '.',
                        '',
                    ),
                    'margin_estimate_percent' => number_format(
                        $marginEstimate,
                        2,
                        '.',
                        '',
                    ),
                ],
                'inventory' => [
                    'on_hand' => number_format(
                        (float) $balances->sum(
                            fn ($balance) => (float) $balance->on_hand,
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'reserved' => number_format(
                        (float) $balances->sum(
                            fn ($balance) => (float) $balance->reserved,
                        ),
                        4,
                        '.',
                        '',
                    ),
                    'movement_count' => $record->stockMovements()->count(),
                    'warehouses' => $balances->map(fn ($balance) => [
                        'id' => $balance->warehouse_id,
                        'name' => $balance->warehouse?->name,
                        'on_hand' => $balance->on_hand,
                        'reserved' => $balance->reserved,
                    ])->values(),
                    'recent_movements' => $recentMovements,
                ],
                'top_customers' => $topCustomers,
                'custom_prices' => $customPrices,
                'price_history' => $priceHistory,
            ],
        ]);
    }
}
