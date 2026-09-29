<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\BillingAccount;
use App\Models\BillingManualPayment;
use App\Services\Billing\StripeBillingGateway;
use App\Services\Billing\StripePaymentMethodPortal;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Throwable;

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

        if ($existing && ! in_array(
            $existing->status,
            [null, 'canceled', 'incomplete_expired'],
            true,
        )) {
            $manualPeriodExpired = $existing->billing_source === 'manual'
                && $existing->current_period_end
                && $existing->current_period_end->isPast();

            if (! $manualPeriodExpired) {
                return response()->json([
                    'message' => $existing->billing_source === 'manual'
                        ? 'Your prepaid manual billing period is still active. Stripe checkout becomes available when that paid period ends.'
                        : 'An existing subscription must be managed from the subscription center.',
                    'code' => $existing->billing_source === 'manual'
                        ? 'MANUAL_PERIOD_ACTIVE'
                        : 'SUBSCRIPTION_ALREADY_EXISTS',
                ], 409);
            }
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
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Billing is temporarily unavailable. Please try again.',
                'code' => 'BILLING_UNAVAILABLE',
            ], 503);
        }

        if (
            Schema::hasTable('billing_manual_payments')
            && Schema::hasColumn('billing_manual_payments', 'requested_at')
        ) {
            BillingManualPayment::query()
                ->where('organization_id', $organization->id)
                ->where('status', 'pending')
                ->update([
                    'status' => 'cancelled',
                    'reviewed_at' => now(),
                    'rejection_reason' => 'Customer switched to Stripe checkout.',
                    'updated_at' => now(),
                ]);
        }

        return response()->json([
            'data' => [
                'url' => $url,
            ],
        ]);
    }

    public function portal(
        Request $request,
        StripePaymentMethodPortal $paymentMethods,
    ): JsonResponse {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.manage',
        );

        try {
            $url = $paymentMethods->url(
                app(TenantContext::class)->organization(),
            );
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Payment settings are temporarily unavailable.',
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
