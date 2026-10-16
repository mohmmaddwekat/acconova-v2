<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\CashFlowForecastService;
use App\Services\Finance\FinanceAuthorization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The dated cash forecast: confirmed money, expected receipts and pending
 * cheques are returned separately. Needs cash and sales visibility.
 */
class CashFlowForecastController extends Controller
{
    public function show(Request $request, CashFlowForecastService $service): JsonResponse
    {
        abort_unless(
            FinanceAuthorization::allows($request->user(), 'finance.cash.view')
            && FinanceAuthorization::allows($request->user(), 'finance.sales.view'),
            403,
        );

        $input = $request->validate([
            'horizon_days' => ['sometimes', 'integer', 'between:7,180'],
            'delay_days' => ['sometimes', 'integer', 'between:0,120'],
            'currency' => ['sometimes', 'string', 'size:3'],
        ]);

        return response()->json(['data' => $service->forecast(
            (int) ($input['horizon_days'] ?? 60),
            (int) ($input['delay_days'] ?? 30),
            $input['currency'] ?? null,
        )]);
    }
}
