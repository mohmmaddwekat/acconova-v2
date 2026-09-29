<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\BillingAccount;
use App\Models\BillingManualPayment;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class BillingManualPaymentRequestController extends Controller
{
    private const METHODS = [
        'cash',
        'bank_transfer',
        'card_terminal',
        'mobile_wallet',
        'other',
    ];

    public function current(Request $request): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.view',
        );

        $organization = app(TenantContext::class)->organization();

        $payment = Schema::hasTable('billing_manual_payments')
            && Schema::hasColumn('billing_manual_payments', 'requested_at')
            ? BillingManualPayment::query()
                ->where('organization_id', $organization->id)
                ->where('status', 'pending')
                ->latest('requested_at')
                ->latest('id')
                ->first()
            : null;

        return response()->json([
            'data' => [
                'request' => $payment ? $this->payload($payment) : null,
                'methods' => self::METHODS,
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.manage',
        );

        abort_unless(
            Schema::hasTable('billing_manual_payments')
                && Schema::hasColumn('billing_manual_payments', 'requested_at'),
            503,
            'Run the latest billing migrations first.',
        );

        $planKeys = array_keys((array) config('billing.plans', []));

        $data = $request->validate([
            'plan_key' => ['required', 'string', Rule::in($planKeys)],
            'billing_interval' => ['required', 'string', Rule::in(['month', 'year'])],
            'method' => ['required', 'string', Rule::in(self::METHODS)],
            'reference' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $organization = app(TenantContext::class)->organization();
        $planKey = (string) $data['plan_key'];
        $interval = (string) $data['billing_interval'];
        $plan = (array) config('billing.plans.'.$planKey, []);
        $amountMinor = $interval === 'year'
            ? (int) data_get($plan, 'display.year_amount_minor', 0)
            : (int) data_get($plan, 'display.month_amount_minor', 0);
        $currency = strtoupper((string) data_get($plan, 'display.currency', 'USD'));

        if ($amountMinor < 1) {
            throw ValidationException::withMessages([
                'plan_key' => 'The selected plan does not have a valid offline payment amount.',
            ]);
        }

        $reference = trim((string) ($data['reference'] ?? '')) ?: null;
        $notes = trim((string) ($data['notes'] ?? '')) ?: null;

        $payment = BillingManualPayment::query()
            ->where('organization_id', $organization->id)
            ->where('status', 'pending')
            ->latest('id')
            ->first();

        $attributes = [
            'billing_account_id' => BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->value('id'),
            'requested_by_user_id' => $request->user()?->id,
            'recorded_by_user_id' => null,
            'reviewed_by_user_id' => null,
            'method' => (string) $data['method'],
            'reference' => $reference,
            'status' => 'pending',
            'plan_key' => $planKey,
            'billing_interval' => $interval,
            'period_count' => 1,
            'amount_minor' => $amountMinor,
            'currency' => $currency,
            'service_period_start' => null,
            'service_period_end' => null,
            'paid_at' => null,
            'confirmed_at' => null,
            'requested_at' => now(),
            'reviewed_at' => null,
            'rejection_reason' => null,
            'notes' => $notes,
        ];

        if ($payment) {
            $payment->forceFill($attributes)->save();
            $created = false;
        } else {
            $payment = BillingManualPayment::query()->create([
                'organization_id' => $organization->id,
                'receipt_number' => 'REQ-'.now()->format('Ymd').'-'.Str::upper(Str::random(10)),
                ...$attributes,
            ]);
            $created = true;
        }

        return response()->json([
            'ok' => true,
            'message' => $created
                ? 'Manual payment request submitted for admin confirmation.'
                : 'Pending manual payment request updated.',
            'data' => $this->payload($payment->fresh()),
        ], $created ? 201 : 200);
    }

    public function cancel(Request $request, BillingManualPayment $payment): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.manage',
        );

        $organization = app(TenantContext::class)->organization();

        abort_unless(
            (int) $payment->organization_id === (int) $organization->id,
            404,
        );

        if ($payment->status !== 'pending') {
            throw ValidationException::withMessages([
                'payment' => 'Only a pending manual payment request can be cancelled.',
            ]);
        }

        $payment->forceFill([
            'status' => 'cancelled',
            'reviewed_at' => now(),
            'rejection_reason' => 'Cancelled by customer.',
        ])->save();

        return response()->json([
            'ok' => true,
            'message' => 'Manual payment request cancelled.',
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(BillingManualPayment $payment): array
    {
        return [
            'id' => (int) $payment->id,
            'method' => (string) $payment->method,
            'status' => (string) $payment->status,
            'plan_key' => (string) $payment->plan_key,
            'billing_interval' => (string) $payment->billing_interval,
            'amount_minor' => (int) $payment->amount_minor,
            'currency' => (string) $payment->currency,
            'reference' => $payment->reference,
            'notes' => $payment->notes,
            'requested_at' => $payment->requested_at?->toIso8601String(),
        ];
    }
}
