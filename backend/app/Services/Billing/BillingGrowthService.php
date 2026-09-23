<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\BillingInvoice;
use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

final class BillingGrowthService
{
    public function __construct(
        private readonly StripeSubscriptionManager $subscriptions,
    ) {}

    /** @return array<string, mixed> */
    public function snapshot(Organization $organization): array
    {
        $id = (int) $organization->id;
        $this->syncOrganization($organization);

        $account = BillingAccount::query()
            ->where('organization_id', $id)
            ->first();
        $profile = DB::table('billing_growth_profiles')
            ->where('organization_id', $id)
            ->first();

        $seats = (int) DB::table('memberships')
            ->where('organization_id', $id)
            ->count();
        $planKey = $account?->plan_key;
        $plan = $planKey ? (array) config('billing.plans.'.$planKey, []) : [];
        $seatLimit = isset($plan['limits']['seats']) ? (int) $plan['limits']['seats'] : null;

        $credits = (int) DB::table('billing_growth_ledger')
            ->where('organization_id', $id)
            ->where('bucket', 'credit')
            ->sum('amount_minor');

        $addons = DB::table('billing_growth_addons')
            ->where('organization_id', $id)
            ->where('status', 'active')
            ->get()
            ->map(fn ($row): array => [
                'key' => $row->addon_key,
                'quantity' => (int) $row->quantity,
                'amount_minor' => (int) $row->amount_minor,
                'currency' => $row->currency,
            ])->values()->all();

        $addonMonthly = (int) collect($addons)->sum(
            fn (array $addon): int => $addon['amount_minor'] * max(1, $addon['quantity']),
        );
        $baseMonthly = $account?->billing_interval === 'year'
            ? (int) round(((int) $account->amount_minor) / 12)
            : (int) ($account?->amount_minor ?? 0);
        $forecast = max(0, $baseMonthly + $addonMonthly - max(0, $credits));

        $recommendation = $this->recommendPlan($seats, $seatLimit, $planKey);
        $upgradePreviews = $this->planPreviews($account);
        $downgrade = $this->downgradeReadiness($seats);

        $timeline = DB::table('billing_growth_events')
            ->where('organization_id', $id)
            ->latest('occurred_at')
            ->limit(30)
            ->get()
            ->map(fn ($row): array => [
                'type' => $row->type,
                'title' => $row->title,
                'occurred_at' => $row->occurred_at,
            ])->all();

        $notifications = DB::table('billing_growth_notifications')
            ->where('organization_id', $id)
            ->latest('created_at')
            ->limit(20)
            ->get()
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'kind' => $row->kind,
                'title_ar' => $row->title_ar,
                'title_en' => $row->title_en,
                'body_ar' => $row->body_ar,
                'body_en' => $row->body_en,
                'action_url' => $row->action_url,
                'read' => $row->read_at !== null,
            ])->all();

        $offers = DB::table('billing_growth_offers')
            ->where('organization_id', $id)
            ->whereNull('redeemed_at')
            ->where(fn ($query) => $query
                ->whereNull('expires_at')
                ->orWhere('expires_at', '>', now()))
            ->latest('id')
            ->get()
            ->map(fn ($row): array => [
                'kind' => $row->kind,
                'code' => $row->code,
                'value_minor' => (int) $row->value_minor,
                'currency' => $row->currency,
                'expires_at' => $row->expires_at,
            ])->all();

        $invoices = BillingInvoice::query()
            ->where('organization_id', $id)
            ->latest('issued_at')
            ->limit(12)
            ->get()
            ->map(fn (BillingInvoice $invoice): array => [
                'id' => (int) $invoice->id,
                'number' => $invoice->number,
                'status' => $invoice->status,
                'amount_due_minor' => (int) $invoice->amount_due_minor,
                'amount_paid_minor' => (int) $invoice->amount_paid_minor,
                'currency' => $invoice->currency,
                'issued_at' => $invoice->issued_at?->toIso8601String(),
                'local_url' => '/app/billing/invoices/'.$invoice->id,
            ])->all();

        return [
            'health' => [
                'score' => (int) ($profile?->health_score ?? 100),
                'failed_payments' => (int) ($profile?->failed_payment_count ?? 0),
                'grace_ends_at' => $profile?->grace_ends_at,
                'card_expiry_risk' => $this->cardExpiryRisk($account),
            ],
            'trial' => [
                'eligible_for_extension' => $this->canExtendTrial($account, $profile),
                'extension_days' => (int) config('billing_growth.trial_extension_days', 0),
            ],
            'cancellation' => [
                'scheduled' => (bool) ($account?->cancel_at_period_end ?? false),
                'reason' => $profile?->cancel_reason,
                'save_options' => $this->cancelSaveOptions($account),
            ],
            'pause' => [
                'paused_until' => $profile?->paused_until,
                'available' => (bool) $account?->provider_subscription_id,
            ],
            'recommendation' => $recommendation,
            'plan_previews' => $upgradePreviews,
            'downgrade_readiness' => $downgrade,
            'usage' => [
                'seats' => ['used' => $seats, 'limit' => $seatLimit],
                'ai' => $this->aiUsage($id),
            ],
            'addons' => [
                'catalog' => $this->addonCatalog(),
                'active' => $addons,
            ],
            'credits' => [
                'balance_minor' => $credits,
                'currency' => 'USD',
            ],
            'referral' => $this->referralSummary($id),
            'annual_nudge' => $this->annualNudge($account),
            'renewal_calendar' => $this->renewalCalendar($account),
            'timeline' => $timeline,
            'soft_lock' => [
                'read_only' => (bool) ($profile?->read_only ?? false),
                'preserve_until' => $profile?->preserve_until,
            ],
            'notifications' => $notifications,
            'invoices' => $invoices,
            'spending_guardrail' => [
                'cap_minor' => $profile?->monthly_spend_cap_minor !== null
                    ? (int) $profile->monthly_spend_cap_minor : null,
                'currency' => $profile?->spend_cap_currency ?: 'USD',
                'forecast_minor' => $forecast,
                'over_cap' => $profile?->monthly_spend_cap_minor !== null
                    && $forecast > (int) $profile->monthly_spend_cap_minor,
            ],
            'ai_spend_forecast' => [
                'estimated_minor' => 0,
                'currency' => 'USD',
                'note' => 'Included usage is not charged separately until metered pricing is enabled.',
            ],
            'offers' => $offers,
            'recovery' => [
                'required' => in_array($account?->status, ['past_due', 'unpaid', 'incomplete'], true),
                'url' => '/app/billing',
            ],
        ];
    }

    public function syncOrganization(Organization $organization): void
    {
        if (! Schema::hasTable('billing_growth_profiles')) {
            return;
        }

        $id = (int) $organization->id;
        $account = BillingAccount::query()->where('organization_id', $id)->first();
        $status = $account?->status;
        $failed = BillingInvoice::query()
            ->where('organization_id', $id)
            ->whereIn('status', ['open', 'uncollectible'])
            ->where('amount_due_minor', '>', 0)
            ->count();
        $score = max(0, 100 - min(60, $failed * 20));
        $bad = in_array($status, ['past_due', 'unpaid', 'incomplete'], true);
        $inactive = in_array($status, ['canceled', 'incomplete_expired'], true);

        $existing = DB::table('billing_growth_profiles')->where('organization_id', $id)->first();
        $graceEnds = $bad
            ? ($existing?->grace_ends_at ?: now()->addDays((int) config('billing_growth.grace_days', 5)))
            : null;
        $preserveUntil = $inactive
            ? ($existing?->preserve_until ?: now()->addDays((int) config('billing_growth.preservation_days', 90)))
            : null;

        DB::table('billing_growth_profiles')->updateOrInsert(
            ['organization_id' => $id],
            [
                'health_score' => $score,
                'failed_payment_count' => $failed,
                'last_payment_failed_at' => $bad ? ($existing?->last_payment_failed_at ?: now()) : ($existing?->last_payment_failed_at),
                'last_payment_recovered_at' => ! $bad && ($existing?->failed_payment_count ?? 0) > 0
                    ? now() : ($existing?->last_payment_recovered_at),
                'grace_ends_at' => $graceEnds,
                'preserve_until' => $preserveUntil,
                'read_only' => $inactive || ($bad && $graceEnds && now()->greaterThan($graceEnds)),
                'created_at' => $existing?->created_at ?: now(),
                'updated_at' => now(),
            ],
        );

        if ($account) {
            $this->event($id, 'subscription_status', 'Subscription status: '.($status ?: 'unknown'), 'status:'.$status.':'.($account->updated_at?->timestamp ?? 0));
        }

        if ($bad) {
            $this->notify($id, 'payment_attention', 'تحديث الدفع مطلوب', 'Payment update required', 'حدّث وسيلة الدفع لتجنب تقييد مساحة العمل.', 'Update your payment method to avoid workspace restrictions.', 'payment:'.$status.':'.now()->toDateString());
        }

        if ($this->cardExpiryRisk($account)) {
            $this->notify($id, 'card_expiry', 'بطاقتك تقترب من الانتهاء', 'Your payment card is expiring', 'حدّث وسيلة الدفع قبل التجديد القادم.', 'Update your payment method before the next renewal.', 'card-expiry:'.($account?->payment_exp_month).':'.($account?->payment_exp_year));
        }
    }

    public function requestTrialExtension(Organization $organization): void
    {
        $account = $this->account($organization);
        $profile = DB::table('billing_growth_profiles')->where('organization_id', $organization->id)->first();

        abort_unless($this->canExtendTrial($account, $profile), 422, 'Trial extension is not available.');
        $days = (int) config('billing_growth.trial_extension_days', 0);
        $this->subscriptions->extendTrial($account, $days);
        DB::table('billing_growth_profiles')->where('organization_id', $organization->id)->update(['trial_extended_at' => now(), 'updated_at' => now()]);
        $this->event((int) $organization->id, 'trial_extended', 'Trial extended by '.$days.' days', 'trial-extension');
    }

    public function scheduleCancellation(Organization $organization, string $reason, ?string $feedback): void
    {
        $account = $this->account($organization);
        $this->subscriptions->scheduleCancellation($account);
        DB::table('billing_growth_profiles')->where('organization_id', $organization->id)->update([
            'cancel_reason' => $reason,
            'cancel_feedback' => $feedback,
            'updated_at' => now(),
        ]);
        $this->event((int) $organization->id, 'cancellation_scheduled', 'Renewal cancellation scheduled', 'cancel:'.$account->provider_subscription_id);
    }

    public function resumeRenewal(Organization $organization): void
    {
        $account = $this->account($organization);
        $this->subscriptions->resumeRenewal($account);
        $this->event((int) $organization->id, 'renewal_resumed', 'Automatic renewal resumed', 'resume-renewal:'.now()->timestamp);
    }

    public function pause(Organization $organization, int $days): void
    {
        $account = $this->account($organization);
        $this->subscriptions->pauseCollection($account);
        DB::table('billing_growth_profiles')->where('organization_id', $organization->id)->update([
            'paused_until' => now()->addDays($days),
            'read_only' => true,
            'updated_at' => now(),
        ]);
        $this->event((int) $organization->id, 'subscription_paused', 'Subscription paused', 'pause:'.now()->timestamp);
    }

    public function resume(Organization $organization): void
    {
        $account = $this->account($organization);
        $this->subscriptions->resumeCollection($account);
        DB::table('billing_growth_profiles')->where('organization_id', $organization->id)->update([
            'paused_until' => null,
            'read_only' => false,
            'updated_at' => now(),
        ]);
        $this->event((int) $organization->id, 'subscription_resumed', 'Subscription resumed', 'resume:'.now()->timestamp);
    }

    public function setSpendCap(Organization $organization, ?int $minor, string $currency): void
    {
        DB::table('billing_growth_profiles')->where('organization_id', $organization->id)->update([
            'monthly_spend_cap_minor' => $minor,
            'spend_cap_currency' => strtoupper($currency),
            'updated_at' => now(),
        ]);
    }

    public function createReferral(Organization $organization, ?string $email): string
    {
        $code = 'ACN-'.strtoupper(Str::random(8));
        DB::table('billing_growth_referrals')->insert([
            'organization_id' => $organization->id,
            'code' => $code,
            'referred_email' => $email,
            'status' => 'invited',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return $code;
    }

    public function redeemOfferCode(Organization $organization, string $code): bool
    {
        $offer = DB::table('billing_growth_offers')
            ->where('organization_id', $organization->id)
            ->where('code', strtoupper(trim($code)))
            ->whereNull('redeemed_at')
            ->where(fn ($query) => $query->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->first();
        if (! $offer) return false;

        DB::transaction(function () use ($organization, $offer): void {
            DB::table('billing_growth_offers')->where('id', $offer->id)->update(['redeemed_at' => now(), 'updated_at' => now()]);
            if ((int) $offer->value_minor > 0) {
                DB::table('billing_growth_ledger')->insertOrIgnore([
                    'organization_id' => $organization->id,
                    'bucket' => 'credit',
                    'amount_minor' => (int) $offer->value_minor,
                    'currency' => $offer->currency,
                    'reason' => 'offer_redemption',
                    'reference' => 'offer:'.$offer->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });
        return true;
    }

    /** @return array<string, mixed> */
    public function platformMetrics(): array
    {
        $accounts = BillingAccount::query();
        $active = (clone $accounts)->whereIn('status', ['active', 'trialing'])->count();
        $pastDue = (clone $accounts)->whereIn('status', ['past_due', 'unpaid'])->count();
        $mrr = BillingAccount::query()->where('status', 'active')->get()->sum(
            fn (BillingAccount $a): int => $a->billing_interval === 'year'
                ? (int) round(((int) $a->amount_minor * max(1, (int) $a->quantity)) / 12)
                : (int) $a->amount_minor * max(1, (int) $a->quantity),
        );
        return [
            'active_workspaces' => $active,
            'payment_attention' => $pastDue,
            'mrr_minor' => $mrr,
            'arr_minor' => $mrr * 12,
            'recovered_minor' => (int) DB::table('billing_growth_ledger')->where('bucket', 'recovered')->sum('amount_minor'),
            'credits_outstanding_minor' => (int) DB::table('billing_growth_ledger')->where('bucket', 'credit')->sum('amount_minor'),
        ];
    }

    private function account(Organization $organization): BillingAccount
    {
        $account = BillingAccount::query()->where('organization_id', $organization->id)->first();
        abort_unless($account?->provider_subscription_id, 422, 'No subscription can be managed.');
        return $account;
    }

    private function canExtendTrial(?BillingAccount $account, ?object $profile): bool
    {
        return $account?->status === 'trialing'
            && (int) config('billing_growth.trial_extension_days', 0) > 0
            && (! config('billing_growth.trial_extension_once', true) || ! $profile?->trial_extended_at);
    }

    /** @return array<int, array<string, mixed>> */
    private function planPreviews(?BillingAccount $account): array
    {
        $result = [];
        foreach ((array) config('billing.plans', []) as $key => $plan) {
            $month = (int) ($plan['display']['month_amount_minor'] ?? 0);
            $year = (int) ($plan['display']['year_amount_minor'] ?? 0);
            $currentMonthly = $account?->billing_interval === 'year'
                ? (int) round(((int) $account->amount_minor) / 12)
                : (int) ($account?->amount_minor ?? 0);
            $fraction = 1.0;
            if ($account?->current_period_start && $account?->current_period_end && $account->current_period_end->isFuture()) {
                $total = max(1, $account->current_period_start->diffInSeconds($account->current_period_end));
                $remaining = max(0, now()->diffInSeconds($account->current_period_end, false));
                $fraction = min(1, max(0, $remaining / $total));
            }
            $result[] = [
                'plan_key' => $key,
                'name_ar' => $plan['name_ar'] ?? $key,
                'name_en' => $plan['name_en'] ?? $key,
                'month_amount_minor' => $month,
                'year_amount_minor' => $year,
                'estimated_proration_minor' => (int) round(($month - $currentMonthly) * $fraction),
                'estimated' => true,
            ];
        }
        return $result;
    }

    /** @return array<string, mixed> */
    private function recommendPlan(int $seats, ?int $limit, ?string $current): array
    {
        $target = $current ?: 'starter';
        if ($seats > 10) $target = 'scale';
        elseif ($seats > 3) $target = 'business';
        elseif ($limit && $seats / max(1, $limit) >= .85 && $current === 'starter') $target = 'business';

        return [
            'plan_key' => $target,
            'reason' => $target === $current ? 'current_plan_fits' : 'capacity',
            'confidence' => $target === $current ? 0.88 : 0.92,
        ];
    }

    /** @return array<string, mixed> */
    private function downgradeReadiness(int $seats): array
    {
        $plans = [];
        foreach ((array) config('billing.plans', []) as $key => $plan) {
            $maxSeats = (int) ($plan['limits']['seats'] ?? 0);
            $plans[$key] = [
                'ready' => $maxSeats <= 0 || $seats <= $maxSeats,
                'blockers' => $maxSeats > 0 && $seats > $maxSeats
                    ? [['type' => 'seats', 'used' => $seats, 'limit' => $maxSeats]] : [],
            ];
        }
        return $plans;
    }

    /** @return array<string, mixed> */
    private function aiUsage(int $organizationId): array
    {
        if (! Schema::hasTable('ai_messages')) return ['tokens' => 0, 'messages' => 0];
        $row = DB::table('ai_messages')->where('organization_id', $organizationId)
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->selectRaw('COALESCE(SUM(total_tokens),0) tokens, COUNT(*) messages')->first();
        return ['tokens' => (int) ($row?->tokens ?? 0), 'messages' => (int) ($row?->messages ?? 0)];
    }

    /** @return array<int, array<string, mixed>> */
    private function addonCatalog(): array
    {
        $items = [];
        foreach ((array) config('billing_growth.addons', []) as $key => $addon) {
            $items[] = ['key' => $key] + $addon + ['enabled' => (int) ($addon['amount_minor'] ?? 0) > 0];
        }
        return $items;
    }

    /** @return array<string, mixed> */
    private function referralSummary(int $organizationId): array
    {
        return [
            'invited' => DB::table('billing_growth_referrals')->where('organization_id', $organizationId)->count(),
            'converted' => DB::table('billing_growth_referrals')->where('organization_id', $organizationId)->where('status', 'converted')->count(),
            'reward_minor' => (int) config('billing_growth.referral_credit_minor', 0),
        ];
    }

    /** @return array<string, mixed> */
    private function annualNudge(?BillingAccount $account): array
    {
        $eligible = $account?->status === 'active' && $account?->billing_interval === 'month'
            && $account->created_at?->lte(now()->subMonths((int) config('billing_growth.annual_nudge_after_months', 3)));
        return ['eligible' => (bool) $eligible, 'plan_key' => $account?->plan_key];
    }

    /** @return array<int, array<string, mixed>> */
    private function renewalCalendar(?BillingAccount $account): array
    {
        if (! $account?->current_period_end || $account->cancel_at_period_end) return [];
        return [[
            'date' => $account->current_period_end->toDateString(),
            'amount_minor' => (int) $account->amount_minor * max(1, (int) $account->quantity),
            'currency' => $account->currency ?: 'USD',
            'kind' => 'renewal',
        ]];
    }

    /** @return array<int, array<string, mixed>> */
    private function cancelSaveOptions(?BillingAccount $account): array
    {
        return [
            ['key' => 'pause', 'available' => (bool) $account?->provider_subscription_id],
            ['key' => 'annual', 'available' => $account?->billing_interval === 'month'],
            ['key' => 'downgrade', 'available' => $account?->plan_key !== 'starter'],
            ['key' => 'credit', 'available' => (int) config('billing_growth.cancel_save_credit_minor', 0) > 0],
        ];
    }

    private function cardExpiryRisk(?BillingAccount $account): bool
    {
        if (! $account?->payment_exp_month || ! $account?->payment_exp_year) return false;
        $expiry = now()->setDate((int) $account->payment_exp_year, (int) $account->payment_exp_month, 1)->endOfMonth();
        $days = max((array) config('billing_growth.card_expiry_warning_days', [30]));
        return $expiry->isBetween(now(), now()->addDays((int) $days), true);
    }

    private function event(int $organizationId, string $type, string $title, string $fingerprint): void
    {
        DB::table('billing_growth_events')->insertOrIgnore([
            'organization_id' => $organizationId,
            'type' => $type,
            'title' => $title,
            'fingerprint' => $fingerprint,
            'occurred_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function notify(int $organizationId, string $kind, string $ar, string $en, string $bodyAr, string $bodyEn, string $fingerprint): void
    {
        DB::table('billing_growth_notifications')->insertOrIgnore([
            'organization_id' => $organizationId,
            'kind' => $kind,
            'title_ar' => $ar,
            'title_en' => $en,
            'body_ar' => $bodyAr,
            'body_en' => $bodyEn,
            'action_url' => '/app/billing',
            'fingerprint' => $fingerprint,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
