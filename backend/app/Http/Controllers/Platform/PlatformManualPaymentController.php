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
    private const METHODS = [
        'cash',
        'bank_transfer',
        'card_terminal',
        'mobile_wallet',
        'other',
    ];

    public function index(Request $request): Response
    {
        $this->authorizeAdmin($request);

        $payments = Schema::hasTable('billing_manual_payments')
            ? BillingManualPayment::query()
                ->with([
                    'organization:id,name',
                    'recordedBy:id,name,email',
                    'requestedBy:id,name,email',
                    'reviewedBy:id,name,email',
                ])
                ->latest('created_at')
                ->latest('id')
                ->limit(150)
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
        $this->ensureStorageReady();

        $planKeys = array_keys((array) config('billing.plans', []));

        $data = $request->validate([
            'organization_id' => ['required', 'integer', 'exists:organizations,id'],
            'plan_key' => ['required', 'string', Rule::in($planKeys)],
            'billing_interval' => ['required', 'string', Rule::in(['month', 'year'])],
            'period_count' => ['required', 'integer', 'min:1', 'max:36'],
            'method' => ['required', 'string', Rule::in(self::METHODS)],
            'amount_minor' => ['nullable', 'integer', 'min:1', 'max:999999999999'],
            'reference' => ['nullable', 'string', 'max:120'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $organizationId = (int) $data['organization_id'];
        $planKey = (string) $data['plan_key'];
        $interval = (string) $data['billing_interval'];
        $periodCount = (int) $data['period_count'];
        $reference = trim((string) ($data['reference'] ?? '')) ?: null;
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

        $this->assertReferenceAvailable($organizationId, $reference);

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
            $payment = new BillingManualPayment([
                'organization_id' => $organizationId,
                'receipt_number' => 'MAN-'.now()->format('Ymd').'-'.Str::upper(Str::random(10)),
                'method' => (string) $data['method'],
                'reference' => $reference,
                'plan_key' => $planKey,
                'billing_interval' => $interval,
                'period_count' => $periodCount,
                'amount_minor' => $amountMinor,
                'currency' => $currency,
                'notes' => trim((string) ($data['notes'] ?? '')) ?: null,
            ]);

            return $this->confirmPayment($payment, $request, $paidAt);
        });

        return response()->json([
            'ok' => true,
            'message' => 'Manual payment recorded and subscription access activated.',
            'payment' => $this->paymentPayload($payment),
        ], 201);
    }

    public function approve(Request $request, BillingManualPayment $payment): JsonResponse
    {
        $this->authorizeAdmin($request);
        $this->ensureStorageReady();

        $data = $request->validate([
            'reference' => ['nullable', 'string', 'max:120'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $reference = array_key_exists('reference', $data)
            ? trim((string) ($data['reference'] ?? '')) ?: null
            : $payment->reference;

        $this->assertReferenceAvailable(
            (int) $payment->organization_id,
            $reference,
            (int) $payment->id,
        );

        $paidAt = isset($data['paid_at'])
            ? CarbonImmutable::parse((string) $data['paid_at'])
            : CarbonImmutable::now();

        $payment = DB::transaction(function () use (
            $request,
            $payment,
            $reference,
            $paidAt,
            $data,
        ): BillingManualPayment {
            $locked = BillingManualPayment::query()
                ->whereKey($payment->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages([
                    'payment' => 'This manual payment request has already been reviewed.',
                ]);
            }

            $locked->forceFill([
                'reference' => $reference,
                'notes' => array_key_exists('notes', $data)
                    ? trim((string) ($data['notes'] ?? '')) ?: null
                    : $locked->notes,
            ]);

            return $this->confirmPayment($locked, $request, $paidAt);
        });

        return response()->json([
            'ok' => true,
            'message' => 'Manual payment request approved and subscription activated.',
            'payment' => $this->paymentPayload($payment),
        ]);
    }

    public function reject(Request $request, BillingManualPayment $payment): JsonResponse
    {
        $this->authorizeAdmin($request);
        $this->ensureStorageReady();

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $payment = DB::transaction(function () use ($request, $payment, $data): BillingManualPayment {
            $locked = BillingManualPayment::query()
                ->whereKey($payment->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages([
                    'payment' => 'This manual payment request has already been reviewed.',
                ]);
            }

            $locked->forceFill([
                'status' => 'rejected',
                'reviewed_by_user_id' => $request->user()?->id,
                'reviewed_at' => now(),
                'rejection_reason' => trim((string) $data['reason']),
            ])->save();

            return $locked->load([
                'organization:id,name',
                'recordedBy:id,name,email',
                'requestedBy:id,name,email',
                'reviewedBy:id,name,email',
            ]);
        });

        return response()->json([
            'ok' => true,
            'message' => 'Manual payment request rejected.',
            'payment' => $this->paymentPayload($payment),
        ]);
    }

    private function confirmPayment(
        BillingManualPayment $payment,
        Request $request,
        CarbonImmutable $paidAt,
    ): BillingManualPayment {
        $organizationId = (int) $payment->organization_id;
        $interval = (string) $payment->billing_interval;
        $periodCount = max(1, (int) $payment->period_count);
        $amountMinor = max(1, (int) $payment->amount_minor);

        $account = BillingAccount::query()
            ->where('organization_id', $organizationId)
            ->lockForUpdate()
            ->first();

        if (
            $account?->provider_subscription_id
            && in_array($account->status, ['active', 'trialing', 'past_due', 'unpaid'], true)
        ) {
            throw ValidationException::withMessages([
                'organization_id' => 'This organization still has a Stripe subscription. Finish or cancel that provider subscription before confirming manual billing.',
            ]);
        }

        $serviceStart = $paidAt;

        if ($account?->current_period_end && $account->current_period_end->isAfter($paidAt)) {
            $serviceStart = CarbonImmutable::instance($account->current_period_end);
        }

        $serviceEnd = $interval === 'year'
            ? $serviceStart->addYears($periodCount)
            : $serviceStart->addMonthsNoOverflow($periodCount);

        $accountPeriodStart = $serviceStart;

        if (
            $account?->billing_source === 'manual'
            && $account->current_period_start
            && $account->current_period_end
            && $account->current_period_end->isAfter($paidAt)
        ) {
            $accountPeriodStart = CarbonImmutable::instance($account->current_period_start);
        }

        $account ??= new BillingAccount([
            'organization_id' => $organizationId,
        ]);

        $account->forceFill([
            'billing_source' => 'manual',
            'provider_subscription_id' => null,
            'plan_key' => (string) $payment->plan_key,
            'billing_interval' => $interval,
            'status' => 'active',
            'price_id' => null,
            'quantity' => 1,
            'amount_minor' => (int) round($amountMinor / $periodCount),
            'currency' => (string) $payment->currency,
            'current_period_start' => $accountPeriodStart,
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

        $isNew = ! $payment->exists;

        $payment->forceFill([
            'billing_account_id' => $account->id,
            'recorded_by_user_id' => $request->user()?->id,
            'reviewed_by_user_id' => $request->user()?->id,
            'status' => 'confirmed',
            'service_period_start' => $serviceStart,
            'service_period_end' => $serviceEnd,
            'paid_at' => $paidAt,
            'confirmed_at' => now(),
            'reviewed_at' => now(),
            'rejection_reason' => null,
        ]);

        $payment->save();

        $this->recoverBillingGrowth($organizationId, $payment, $serviceEnd);

        return $payment->load([
            'organization:id,name',
            'recordedBy:id,name,email',
            'requestedBy:id,name,email',
            'reviewedBy:id,name,email',
        ]);
    }

    private function recoverBillingGrowth(
        int $organizationId,
        BillingManualPayment $payment,
        CarbonImmutable $serviceEnd,
    ): void {
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
    }

    private function assertReferenceAvailable(
        int $organizationId,
        ?string $reference,
        ?int $ignorePaymentId = null,
    ): void {
        if (! $reference) {
            return;
        }

        $query = BillingManualPayment::query()
            ->where('organization_id', $organizationId)
            ->where('reference', $reference);

        if ($ignorePaymentId) {
            $query->whereKeyNot($ignorePaymentId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'reference' => 'This payment reference has already been recorded for the organization.',
            ]);
        }
    }

    private function ensureStorageReady(): void
    {
        abort_unless(
            Schema::hasTable('billing_manual_payments'),
            503,
            'Run the latest billing migrations first.',
        );
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
                'pending_requests' => 0,
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
            'pending_requests' => BillingManualPayment::query()
                ->where('status', 'pending')
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
            'requested_by' => $payment->requestedBy?->email,
            'reviewed_by' => $payment->reviewedBy?->email,
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
            'requested_at' => $payment->requested_at?->toIso8601String(),
            'reviewed_at' => $payment->reviewed_at?->toIso8601String(),
            'rejection_reason' => $payment->rejection_reason,
            'notes' => $payment->notes,
        ];
    }
}
