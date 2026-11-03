<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Finance\QuickEntryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class QuickEntryController extends Controller
{
    public function store(Request $request, QuickEntryService $service): JsonResponse
    {
        abort_unless(
            collect([
                'finance.sales.manage',
                'finance.purchases.manage',
                'finance.cash.receive',
                'finance.cash.pay',
            ])->contains(fn (string $permission): bool => FinanceAuthorization::allows($request->user(), $permission)),
            403,
        );

        $data = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:100'],
            'rows.*.type' => ['required', Rule::in(['sale', 'purchase', 'misc', 'receipt', 'payment'])],
            'rows.*.date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'rows.*.reference' => ['nullable', 'string', 'max:96'],
            'rows.*.party_id' => ['nullable', 'integer'],
            'rows.*.lines' => ['nullable', 'array', 'max:250'],
            'rows.*.lines.*.product_id' => ['required', 'integer'],
            'rows.*.lines.*.quantity' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'rows.*.lines.*.unit_price' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.discount_type' => ['nullable', Rule::in(['percent', 'fixed'])],
            'rows.*.discount_value' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.payment' => ['nullable', 'array'],
            'rows.*.payment.amount' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'rows.*.payment.full' => ['nullable', 'boolean'],
            'rows.*.payment.method' => ['nullable', Rule::in(['cash', 'transfer', 'check'])],
            'rows.*.payment.check_number' => ['nullable', 'string', 'max:120'],
            'rows.*.payment.check_due_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        return response()->json([
            'data' => $service->process($data['rows'], $request->user()),
        ]);
    }
}
