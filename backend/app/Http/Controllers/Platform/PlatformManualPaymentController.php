<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\BillingAccount;
use App\Models\BillingManualPayment;
use App\Models\Organization;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

final class PlatformManualPaymentController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorizeAdmin($request);

        $payments = Schema::hasTable('billing_manual_payments')
            ? BillingManualPayment::query()
                ->with(['organization:id,name', 'recordedBy:id,name,email'])
                ->latest('paid_at')
                ->latest('id')
                ->limit(100)
                ->get()
                ->map(fn (BillingManualPayment $payment): array => $this->paymentPayload($payment))
                ->values()
                ->all()
            : [];

        return Inertia::render('Admin/ManualPayments', [
            'adminEmail' => (string) $request->user()->email,
            'organizations' => Organization::query()
                ->orderBy('name')
                ->limit(500)
                ->get(['id', 'name'])
                ->map(fn (Organization $organization): array => [
                    'id' => (int) $organization->id,
                    'name' => (string) $organization->name,
                ])
                ->values()
                ->all(),
            'plans' => $this->plans(),
            'payments' => $payments,
            'stats' => $this->stats(),
            'storageReady' => Schema::hasTable('billing_manual_payments'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);

        abort_unless(Schema::hasTable('billing_manual_payments'), 503, 'Run the latest billing migrations first.');

        $planKeys = array_keys((array) config('billing.plans', []));

        $data = $request->validate([
            'organization_id' => ['required', 'integer', 'exists:organizations,id'],
            'plan_key' => ['required', 'string', Rule::in($planKeys)],
            'billing_interval' => ['required', 'string', Rule::in(['month', 'year'])],
            'period_count' => ['required', 'integer', 'min:1', 'max:36'],
            'method' => ['required', 'string', Rule::in(['cash', 'bank_transfer', 'cheque', 'card_terminal', 'other'])],
            'amount_minor' => ['nullable', 'integer', 'min:1', 'max:999999999999'],
            'reference' => ['nullable', 'string', 'max:120'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $organizationId = (int) $data['organization_id'];
        $planKey = (string) $data['plan_key'];
        $interval = (string) $data['billing_interval'];
        $periodCount = (int) $data['period_count'];
        $reference = isset($data['reference']) ? trim((string) $data['reference']) : null;
        $reference = $reference === '' ? null : $reference;
        $plan = (array) config('billing.plans.'.$planKey, []);
        $currency = strtoupper((string) data_get($plan, 'display.currency', 'USD'));
        $defaultAmountMinor = $interval === 'year'
            ? (int) data_get($plan, 'display.year_amount_minor', 0)
            : (int) data_get($plan, 'display.month_amount_minor', 0);
        $amountMinor = isset($data['amount_minor'])
            ? (int) $data['amount_minor']
            : $defaultAmountMinor * $periodCount;

        if ($amountMinor < 1) {
            throw ValidationException::withMessages([
                'amount_minor' => 'The selected plan does not have a valid amount configured.',
            ]);
        }

        if ($reference && BillingManualPayment::query()
            ->where('organization_id', $organizationId)
            ->where('reference', $reference)
            ->exists()) {
            throw ValidationException::withMessages([
                'reference' => 'This payment reference has already been recorded for the organization.',
            ]);
        }

        $paidAt = isset($data['paid_at'])
            ? CarbonImmutable::parse((string) $data['paid_at'])
            : CarbonImmutable::now();

        $payment = DB::transaction(function () use (
            $request,
            $organizationId,
            $planKey,
            $interval,
            $periodCount,
            $amountMinor,
            $currency,
            $reference,
            $paidAt,
            $data,
        ): BillingManualPayment {
            $account = BillingAccount::query()
                ->where('organization_id', $organizationId)
                ->lockForUpdate()
                ->first();

            if (
                $account?->provider_subscription_id
                && $account->billing_source !== 'manual'
                && in_array($account->status, ['active', 'trialing', 'past_due', 'unpaid'], true)
            ) {
                throw ValidationException::withMessages([
                    'organization_id' => 'This organization still has a Stripe subscription. Cancel or finish that provider subscription before switching it to manual billing.',
                ]);
            }

            $serviceStart = $paidAt;

            if ($account?->current_period_end && $account->current_period_end->isAfter($paidAt)) {
                $serviceStart = CarbonImmutable::instance($account->current_period_end);
            }

            $serviceEnd = $interval === 'year'
                ? $serviceStart->addYears($periodCount)
                : $serviceStart->addMonthsNoOverflow($periodCount);

            $account ??= new BillingAccount([
                'organization_id' => $organizationId,
            ]);

            $account->forceFill([
                'billing_source' => 'manual',
                'provider_subscription_id' => null,
                'plan_key' => $planKey,
                'billing_interval' => $interval,
                'status' => 'active',
                'price_id' => null,
                'quantity' => 1,
                'amount_minor' => (int) round($amountMinor / $periodCount),
                'currency' => $currency,
                'current_period_start' => $serviceStart,
                'current_period_end' => $serviceEnd,
                'cancel_at_period_end' => false,
                'trial_ends_at' => null,
                'canceled_at' => null,
                'last_manual_payment_at' => $paidAt,
                'payment_brand' => null,
                'payment_last4' => null,
                'payment_exp_month' => null,
                'payment_exp_year' => null,
            ])->save();

            $payment = BillingManualPayment::query()->create([
                'organization_id' => $organizationId,
                'billing_account_id' => $account->id,
                'recorded_by_user_id' => $request->user()?->id,
                'receipt_number' => 'MAN-'.now()->format('Ymd').'-'.Str::upper(Str::random(10)),
                'method' => (string) $data['method'],
                'reference' => $reference,
                'status' => 'confirmed',
                'plan_key' => $planKey,
                'billing_interval' => $interval,
                'period_count' => $periodCount,
                'amount_minor' => $amountMinor,
                'currency' => $currency,
                'service_period_start' => $serviceStart,
                'service_period_end' => $serviceEnd,
                'paid_at' => $paidAt,
                'confirmed_at' => now(),
                'notes' => isset($data['notes']) ? trim((string) $data['notes']) ?: null : null,
            ]);

            if (Schema::hasTable('billing_growth_profiles')) {
                DB::table('billing_growth_profiles')
                    ->where('organization_id', $organizationId)
                    ->update([
                        'read_only' => false,
                        'grace_ends_at' => null,
                        'paused_until' => null,
                        'last_payment_recovered_at' => now(),
                        'updated_at' => now(),
                    ]);
            }

            if (Schema::hasTable('billing_growth_events')) {
                DB::table('billing_growth_events')->insertOrIgnore([
                    'organization_id' => $organizationId,
                    'type' => 'manual_payment_confirmed',
                    'title' => 'Manual subscription payment confirmed',
                    'meta' => json_encode([
                        'payment_id' => $payment->id,
                        'receipt_number' => $payment->receipt_number,
                        'method' => $payment->method,
                        'amount_minor' => $payment->amount_minor,
                        'currency' => $payment->currency,
                        'plan_key' => $payment->plan_key,
                        'service_period_end' => $serviceEnd->toIso8601String(),
                    ], JSON_THROW_ON_ERROR),
                    'fingerprint' => 'manual-payment:'.$payment->id,
                    'occurred_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return $payment->load(['organization:id,name', 'recordedBy:id,name,email']);
        });

        return response()->json([
            'ok' => true,
            'message' => 'Manual payment recorded and subscription access activated.',
            'payment' => $this->paymentPayload($payment),
        ], 201);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->isPlatformAdmin(), 403);
    }

    /** @return list<array<string, mixed>> */
    private function plans(): array
    {
        return collect((array) config('billing.plans', []))
            ->map(function ($plan, string $key): array {
                $plan = is_array($plan) ? $plan : [];

                return [
                    'key' => $key,
                    'name_ar' => (string) ($plan['name_ar'] ?? $key),
                    'name_en' => (string) ($plan['name_en'] ?? $key),
                    'currency' => (string) data_get($plan, 'display.currency', 'USD'),
                    'monthly_minor' => (int) data_get($plan, 'display.month_amount_minor', 0),
                    'yearly_minor' => (int) data_get($plan, 'display.year_amount_minor', 0),
                ];
            })
            ->values()
            ->all();
    }

    /** @return array<string, int> */
    private function stats(): array
    {
        if (! Schema::hasTable('billing_manual_payments')) {
            return [
                'active_manual_accounts' => 0,
                'expiring_7d' => 0,
                'payments_30d' => 0,
                'revenue_30d_minor' => 0,
            ];
        }

        return [
            'active_manual_accounts' => BillingAccount::query()
                ->where('billing_source', 'manual')
                ->where('status', 'active')
                ->where('current_period_end', '>', now())
                ->count(),
            'expiring_7d' => BillingAccount::query()
                ->where('billing_source', 'manual')
                ->where('status', 'active')
                ->whereBetween('current_period_end', [now(), now()->addDays(7)])
                ->count(),
            'payments_30d' => BillingManualPayment::query()
                ->where('status', 'confirmed')
                ->where('paid_at', '>=', now()->subDays(30))
                ->count(),
            'revenue_30d_minor' => (int) BillingManualPayment::query()
                ->where('status', 'confirmed')
                ->where('currency', 'USD')
                ->where('paid_at', '>=', now()->subDays(30))
                ->sum('amount_minor'),
        ];
    }

    /** @return array<string, mixed> */
    private function paymentPayload(BillingManualPayment $payment): array
    {
        return [
            'id' => (int) $payment->id,
            'organization_id' => (int) $payment->organization_id,
            'organization' => $payment->organization?->name,
            'recorded_by' => $payment->recordedBy?->email,
            'receipt_number' => $payment->receipt_number,
            'method' => $payment->method,
            'reference' => $payment->reference,
            'status' => $payment->status,
            'plan_key' => $payment->plan_key,
            'billing_interval' => $payment->billing_interval,
            'period_count' => (int) $payment->period_count,
            'amount_minor' => (int) $payment->amount_minor,
            'currency' => $payment->currency,
            'service_period_start' => $payment->service_period_start?->toIso8601String(),
            'service_period_end' => $payment->service_period_end?->toIso8601String(),
            'paid_at' => $payment->paid_at?->toIso8601String(),
            'confirmed_at' => $payment->confirmed_at?->toIso8601String(),
            'notes' => $payment->notes,
        ];
    }
}
