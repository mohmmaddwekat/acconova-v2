<?php

namespace App\Http\Controllers;

use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\FinancialDocumentLine;
use App\Models\Party;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
