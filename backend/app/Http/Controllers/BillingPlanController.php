<?php

namespace App\Http\Controllers;

use App\Services\Billing\BillingPlanChangeService;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Throwable;

final class BillingPlanController extends Controller
{
    public function update(
        Request $request,
        BillingPlanChangeService $plans,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.manage',
        );

        $availablePlans = array_keys((array) config('billing.plans', []));
        $data = $request->validate([
            'plan' => ['required', 'string', Rule::in($availablePlans)],
            'interval' => ['required', Rule::in(['month', 'year'])],
        ]);

        try {
            return response()->json([
                'data' => $plans->change(
                    app(TenantContext::class)->organization(),
                    (string) $data['plan'],
                    (string) $data['interval'],
                ),
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => $exception->getMessage() !== ''
                    ? $exception->getMessage()
                    : 'Could not change the subscription plan.',
                'code' => 'BILLING_PLAN_CHANGE_FAILED',
            ], 422);
        }
    }
}
