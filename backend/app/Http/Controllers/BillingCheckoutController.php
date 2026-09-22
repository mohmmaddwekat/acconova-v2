<?php

namespace App\Http\Controllers;

use App\Models\BillingAccount;
use App\Services\Billing\StripeBillingGateway;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use RuntimeException;

class BillingCheckoutController extends Controller
{
    public function checkout(
        Request $request,
        StripeBillingGateway $billing,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.manage',
        );

        $plans = array_keys(
            (array) config('billing.plans', []),
        );

        $organization = app(
            TenantContext::class,
        )->organization();

        $existing = BillingAccount::query()
            ->where(
                'organization_id',
                $organization->id,
            )
            ->first();

        if (
            $existing
            && ! in_array(
                $existing->status,
                [
                    null,
                    'canceled',
                    'incomplete_expired',
                ],
                true,
            )
        ) {
            return response()->json([
                'message' => 'An existing subscription must be managed from the subscription center.',
                'code' => 'SUBSCRIPTION_ALREADY_EXISTS',
            ], 409);
        }

        $data = $request->validate([
            'plan' => [
                'required',
                'string',
                Rule::in($plans),
            ],
            'interval' => [
                'required',
                Rule::in(['month', 'year']),
            ],
        ]);

        try {
            $url = $billing->checkoutUrl(
                $organization,
                $request->user(),
                (string) $data['plan'],
                (string) $data['interval'],
            );
        } catch (RuntimeException $exception) {
            report($exception);

            return response()->json([
                'message' => 'Billing is temporarily unavailable. Please try again.',
                'code' => 'BILLING_UNAVAILABLE',
            ], 503);
        }

        return response()->json([
            'data' => [
                'url' => $url,
            ],
        ]);
    }

    public function portal(
        Request $request,
        StripeBillingGateway $billing,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.manage',
        );

        try {
            $url = $billing->portalUrl(
                app(TenantContext::class)->organization(),
            );
        } catch (RuntimeException $exception) {
            report($exception);

            return response()->json([
                'message' => 'Subscription management is temporarily unavailable.',
                'code' => 'BILLING_PORTAL_UNAVAILABLE',
            ], 503);
        }

        return response()->json([
            'data' => [
                'url' => $url,
            ],
        ]);
    }
}
