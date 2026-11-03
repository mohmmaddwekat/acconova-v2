<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Models\FinancialDocument;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Finance\MiscSaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MiscSaleController extends Controller
{
    /**
     * Record one walk-in sale: an issued invoice for the anonymous "متفرقات" customer that is
     * settled at once by a same-day cash receipt.
     */
    public function store(Request $request, MiscSaleService $service): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.sales.manage');
        FinanceAuthorization::authorize($request->user(), 'finance.cash.receive');

        $data = $request->validate([
            'issue_date' => ['required', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'document_discount_type' => ['nullable', Rule::in(['percent', 'fixed'])],
            'document_discount_value' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'lines' => ['required', 'array', 'min:1', 'max:200'],
            'lines.*.product_id' => ['nullable', 'integer'],
            'lines.*.description' => ['nullable', 'string', 'max:255'],
            'lines.*.unit' => ['nullable', 'string', 'max:32'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'between:0,100'],
        ]);

        $invoice = $service->create($data, $request->user()->id);

        return response()->json([
            'data' => [
                'id' => $invoice->id,
                'number' => $invoice->number,
                'total' => $invoice->total,
                'discount_total' => $invoice->discount_total,
                'issue_date' => $invoice->issue_date->format('Y-m-d'),
                'status' => $invoice->status,
            ],
        ], 201);
    }

    /**
     * Totals for the walk-in sales page. Cancelled and replaced invoices are left out.
     */
    public function summary(Request $request): JsonResponse
    {
        FinanceAuthorization::authorize($request->user(), 'finance.sales.view');

        $rows = FinancialDocument::query()
            ->where('is_misc_sale', true)
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
            ->get(['issue_date', 'total']);

        $sum = fn ($set): string => number_format((float) $set->sum(fn ($row): float => (float) $row->total), 4, '.', '');
        $today = today();
        $from = fn (int $days) => $rows->filter(fn ($row): bool => $row->issue_date->gte($today->copy()->subDays($days)));

        return response()->json([
            'data' => [
                'today' => ['count' => $from(0)->count(), 'total' => $sum($from(0))],
                'week' => ['count' => $from(6)->count(), 'total' => $sum($from(6))],
                'month' => ['count' => $from(29)->count(), 'total' => $sum($from(29))],
            ],
        ]);
    }
}
