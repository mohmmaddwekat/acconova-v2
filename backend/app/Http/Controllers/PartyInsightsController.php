<?php

namespace App\Http\Controllers;

use App\Enums\StockMovementType;
use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\Party;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class PartyInsightsController extends Controller
{
    /**
     * Return one permission-aware 360-degree commercial view for a Party.
     */
    public function __invoke(
        Request $request,
        string $party,
    ): JsonResponse {
        $record = Party::withTrashed()
            ->with('roles')
            ->findOrFail($party);

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

        $sales = FinancialDocument::query()
            ->where('party_id', $record->id)
            ->where('kind', 'sale_invoice')
            ->whereIn('status', $operationalStatuses);

        $purchases = FinancialDocument::query()
            ->where('party_id', $record->id)
            ->where('kind', 'purchase_invoice')
            ->whereIn('status', $operationalStatuses);

        $effectiveCash = CashMovement::query()
            ->where('party_id', $record->id)
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->where(function ($query): void {
                $query
                    ->where('method', '!=', 'check')
                    ->orWhereNull('check_status')
                    ->orWhereNotIn('check_status', ['bounced', 'cancelled']);
            });

        $receipts = (clone $effectiveCash)
            ->where('direction', 'incoming');

        $payments = (clone $effectiveCash)
            ->where('direction', 'outgoing');

        $topProducts = FinancialDocumentLine::query()
            ->join(
                'financial_documents',
                'financial_documents.id',
                '=',
                'financial_document_lines.financial_document_id',
            )
            ->leftJoin(
                'products',
                'products.id',
                '=',
                'financial_document_lines.product_id',
            )
            ->where(
                'financial_documents.party_id',
                $record->id,
            )
            ->whereIn(
                'financial_documents.status',
                $operationalStatuses,
            )
            ->selectRaw(
                'financial_document_lines.product_id,
                 COALESCE(products.name, financial_document_lines.description) as label,
                 financial_documents.kind,
                 SUM(financial_document_lines.quantity) as quantity,
                 SUM(financial_document_lines.line_total) as total',
            )
            ->groupBy(
                'financial_document_lines.product_id',
                'products.name',
                'financial_document_lines.description',
                'financial_documents.kind',
            )
            ->orderByDesc('total')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'product_id' => $row->product_id,
                'label' => $row->label,
                'kind' => $row->kind,
                'quantity' => (string) $row->quantity,
                'total' => (string) $row->total,
            ])
            ->values();

        $recentDocuments = FinancialDocument::query()
            ->where('party_id', $record->id)
            ->with('party:id,name,company_name')
            ->latest('issue_date')
            ->latest('id')
            ->limit(8)
            ->get()
            ->map(fn (FinancialDocument $document) => [
                'id' => $document->id,
                'kind' => $document->kind,
                'number' => $document->number,
                'status' => $document->status,
                'date' => $document->issue_date?->format('Y-m-d'),
                'total' => $document->total,
                'balance_due' => $document->balance_due,
                'currency' => $document->currency,
            ])
            ->values();

        /*
         * Customer profitability is an operational estimate. Invoice lines do
         * not yet snapshot historical product cost, so the current catalog cost
         * is used and the UI labels the result as an estimate.
         */
        $customerProfitabilityRow = FinancialDocumentLine::query()
            ->join(
                'financial_documents as profit_documents',
                'profit_documents.id',
                '=',
                'financial_document_lines.financial_document_id',
            )
            ->leftJoin(
                'products as profit_products',
                'profit_products.id',
                '=',
                'financial_document_lines.product_id',
            )
            ->where(
                'profit_documents.party_id',
                $record->id,
            )
            ->where(
                'profit_documents.kind',
                'sale_invoice',
            )
            ->whereIn(
                'profit_documents.status',
                $operationalStatuses,
            )
            ->selectRaw(
                'COALESCE(SUM(financial_document_lines.line_total - financial_document_lines.line_tax), 0) as revenue,
                 COALESCE(SUM(financial_document_lines.quantity * COALESCE(financial_document_lines.cost_price_snapshot, profit_products.cost_price, 0)), 0) as estimated_cost',
            )
            ->first();

        $customerRevenue =
            (float) ($customerProfitabilityRow?->revenue ?? 0);
        $customerEstimatedCost =
            (float) ($customerProfitabilityRow?->estimated_cost ?? 0);
        $customerGrossProfit =
            $customerRevenue - $customerEstimatedCost;
        $customerMargin =
            $customerRevenue > 0
                ? (
                    $customerGrossProfit
                    / $customerRevenue
                    * 100
                )
                : 0;

        $customerProfitability = [
            'revenue' => number_format(
                $customerRevenue,
                4,
                '.',
                '',
            ),
            'estimated_cost' => number_format(
                $customerEstimatedCost,
                4,
                '.',
                '',
            ),
            'gross_profit_estimate' => number_format(
                $customerGrossProfit,
                4,
                '.',
                '',
            ),
            'margin_estimate_percent' => number_format(
                $customerMargin,
                2,
                '.',
                '',
            ),
            'basis' => 'issue_cost_snapshot_with_current_cost_fallback',
        ];

        $purchasePriceRows = FinancialDocumentLine::query()
            ->join(
                'financial_documents as score_documents',
                'score_documents.id',
                '=',
                'financial_document_lines.financial_document_id',
            )
            ->where(
                'score_documents.party_id',
                $record->id,
            )
            ->where(
                'score_documents.kind',
                'purchase_invoice',
            )
            ->whereIn(
                'score_documents.status',
                $operationalStatuses,
            )
            ->whereNotNull(
                'financial_document_lines.product_id',
            )
            ->orderBy(
                'financial_document_lines.product_id',
            )
            ->orderBy(
                'score_documents.issue_date',
            )
            ->orderBy(
                'financial_document_lines.id',
            )
            ->get([
                'financial_document_lines.product_id',
                'financial_document_lines.unit_price',
                'financial_document_lines.quantity',
                'score_documents.issue_date',
                'score_documents.id as document_id',
            ]);

        $priceChanges = [];
        foreach (
            $purchasePriceRows
                ->groupBy('product_id') as $rows
        ) {
            $previous = null;

            foreach ($rows as $row) {
                $current =
                    (float) $row->unit_price;

                if (
                    $previous !== null
                    && $previous > 0
                ) {
                    $priceChanges[] =
                        abs(
                            (
                                $current
                                - $previous
                            )
                            / $previous
                            * 100,
                        );
                }

                $previous = $current;
            }
        }

        $averagePriceChange =
            $priceChanges === []
                ? 0
                : array_sum($priceChanges)
                    / count($priceChanges);

        $receiptRows = DB::table(
            'financial_line_fulfillments as fulfillments',
        )
            ->join(
                'financial_document_lines as receipt_lines',
                'receipt_lines.id',
                '=',
                'fulfillments.financial_document_line_id',
            )
            ->join(
                'financial_documents as receipt_documents',
                'receipt_documents.id',
                '=',
                'receipt_lines.financial_document_id',
            )
            ->where(
                'receipt_documents.party_id',
                $record->id,
            )
            ->where(
                'receipt_documents.kind',
                'purchase_invoice',
            )
            ->get([
                'fulfillments.occurred_on',
                'receipt_documents.issue_date',
            ]);

        $receiptDayValues = $receiptRows
            ->map(function ($row): float {
                return max(
                    0,
                    (float) \Carbon\Carbon::parse(
                        $row->issue_date,
                    )->diffInDays(
                        \Carbon\Carbon::parse(
                            $row->occurred_on,
                        ),
                    ),
                );
            });

        $averageReceiptDays =
            $receiptDayValues->isEmpty()
                ? null
                : (float) $receiptDayValues->avg();

        $delayedOpenLines = DB::table(
            'financial_document_lines as delayed_lines',
        )
            ->join(
                'financial_documents as delayed_documents',
                'delayed_documents.id',
                '=',
                'delayed_lines.financial_document_id',
            )
            ->leftJoinSub(
                DB::table('financial_line_fulfillments')
                    ->selectRaw(
                        'financial_document_line_id, SUM(quantity) as fulfilled_quantity',
                    )
                    ->groupBy(
                        'financial_document_line_id',
                    ),
                'fulfilled',
                'fulfilled.financial_document_line_id',
                '=',
                'delayed_lines.id',
            )
            ->where(
                'delayed_documents.party_id',
                $record->id,
            )
            ->where(
                'delayed_documents.kind',
                'purchase_invoice',
            )
            ->whereIn(
                'delayed_documents.status',
                $operationalStatuses,
            )
            ->whereDate(
                'delayed_documents.issue_date',
                '<=',
                now()->subDays(30)->toDateString(),
            )
            ->whereRaw(
                'COALESCE(fulfilled.fulfilled_quantity, 0) < delayed_lines.quantity',
            )
            ->count();

        $purchaseDocumentIds = FinancialDocument::query()
            ->where(
                'party_id',
                $record->id,
            )
            ->where(
                'kind',
                'purchase_invoice',
            )
            ->whereIn(
                'status',
                $operationalStatuses,
            )
            ->pluck('id');

        $supplierReturnQuantity =
            (float) DB::table('stock_movements')
                ->where(
                    'type',
                    StockMovementType::SupplierReturn->value,
                )
                ->where(
                    'reference_type',
                    'financial_document',
                )
                ->whereIn(
                    'reference_id',
                    $purchaseDocumentIds,
                )
                ->sum(DB::raw('ABS(quantity)'));

        $purchasedQuantity =
            (float) $purchasePriceRows
                ->sum(
                    fn ($row): float =>
                        (float) $row->quantity,
                );

        $returnRate =
            $purchasedQuantity > 0
                ? (
                    $supplierReturnQuantity
                    / $purchasedQuantity
                    * 100
                )
                : 0;

        $priceStabilityScore =
            max(
                0,
                100
                - min(
                    100,
                    $averagePriceChange * 2,
                ),
            );

        $receiptSpeedScore =
            $averageReceiptDays === null
                ? 70
                : match (true) {
                    $averageReceiptDays <= 7 => 100,
                    $averageReceiptDays <= 14 => 90,
                    $averageReceiptDays <= 30 => 75,
                    default => 50,
                };

        $completionScore =
            max(
                50,
                100
                - min(
                    50,
                    $delayedOpenLines * 10,
                ),
            );

        $returnsScore =
            max(
                0,
                100
                - min(
                    100,
                    $returnRate * 5,
                ),
            );

        $supplierScore =
            (
                $priceStabilityScore * 0.30
                + $receiptSpeedScore * 0.30
                + $completionScore * 0.20
                + $returnsScore * 0.20
            );

        $supplierInvoiceCount =
            (clone $purchases)->count();
        $hasSupplierHistory =
            $supplierInvoiceCount > 0;

        $supplierPerformance = [
            'score' => $hasSupplierHistory
                ? round(
                    $supplierScore,
                    1,
                )
                : null,
            'sample_invoice_count' => $supplierInvoiceCount,
            'data_quality' => $hasSupplierHistory
                ? 'measured'
                : 'insufficient',
            'price_stability_score' => round(
                $priceStabilityScore,
                1,
            ),
            'receipt_speed_score' => round(
                $receiptSpeedScore,
                1,
            ),
            'completion_score' => round(
                $completionScore,
                1,
            ),
            'returns_score' => round(
                $returnsScore,
                1,
            ),
            'average_price_change_percent' => round(
                $averagePriceChange,
                2,
            ),
            'average_receipt_days' => $averageReceiptDays === null
                ? null
                : round(
                    $averageReceiptDays,
                    1,
                ),
            'delayed_open_lines' => $delayedOpenLines,
            'supplier_return_rate_percent' => round(
                $returnRate,
                2,
            ),
            'methodology' => 'Operational score: 30% price stability, 30% receipt speed, 20% open-line completion, 20% linked supplier-return rate.',
        ];

        $recentCash = CashMovement::query()
            ->where('party_id', $record->id)
            ->latest('movement_date')
            ->latest('id')
            ->limit(8)
            ->get()
            ->map(fn (CashMovement $movement) => [
                'id' => $movement->id,
                'direction' => $movement->direction,
                'number' => $movement->number,
                'status' => $movement->status,
                'date' => $movement->movement_date?->format('Y-m-d'),
                'amount' => $movement->amount,
                'currency' => $movement->currency,
                'method' => $movement->method,
            ])
            ->values();

        return response()->json([
            'data' => [
                'customer' => [
                    'invoice_count' => (clone $sales)->count(),
                    'sales_total' => number_format(
                        (float) (clone $sales)->sum('total'),
                        4,
                        '.',
                        '',
                    ),
                    'outstanding' => number_format(
                        (float) (clone $sales)->sum('balance_due'),
                        4,
                        '.',
                        '',
                    ),
                    'receipts_total' => number_format(
                        (float) (clone $receipts)->sum('amount'),
                        4,
                        '.',
                        '',
                    ),
                    'profitability' => $customerProfitability,
                ],
                'supplier' => [
                    'invoice_count' => (clone $purchases)->count(),
                    'purchase_total' => number_format(
                        (float) (clone $purchases)->sum('total'),
                        4,
                        '.',
                        '',
                    ),
                    'outstanding' => number_format(
                        (float) (clone $purchases)->sum('balance_due'),
                        4,
                        '.',
                        '',
                    ),
                    'payments_total' => number_format(
                        (float) (clone $payments)->sum('amount'),
                        4,
                        '.',
                        '',
                    ),
                    'performance' => $supplierPerformance,
                ],
                'top_products' => $topProducts,
                'recent_documents' => $recentDocuments,
                'recent_cash' => $recentCash,
                'last_activity_at' => collect([
                    (clone $sales)->max('updated_at'),
                    (clone $purchases)->max('updated_at'),
                    (clone $effectiveCash)->max('updated_at'),
                    $record->updated_at,
                ])->filter()->max(),
            ],
        ]);
    }
}
