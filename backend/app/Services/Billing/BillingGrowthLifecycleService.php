<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\BillingInvoice;
use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

final class BillingGrowthLifecycleService
{
    public function __construct(
        private readonly StripeSubscriptionManager $subscriptions,
    ) {}

    public function process(Organization $organization): void
    {
        if (! Schema::hasTable('billing_growth_profiles')) {
            return;
        }

        $organizationId = (int) $organization->id;
        $account = BillingAccount::query()
            ->where('organization_id', $organizationId)
            ->first();
        $profile = DB::table('billing_growth_profiles')
            ->where('organization_id', $organizationId)
            ->first();

        if (! $profile) {
            return;
        }

        $this->resumeExpiredPause($organizationId, $account, $profile);
        $this->recordRecoveredPayment($organizationId, $account, $profile);
        $this->ensureRetentionOffer($organizationId, $account);
    }

    private function resumeExpiredPause(
        int $organizationId,
        ?BillingAccount $account,
        object $profile,
    ): void {
        if (
            ! $account?->provider_subscription_id
            || ! $profile->paused_until
            || now()->lt($profile->paused_until)
        ) {
            return;
        }

        try {
            $this->subscriptions->resumeCollection($account);

            DB::table('billing_growth_profiles')
                ->where('organization_id', $organizationId)
                ->update([
                    'paused_until' => null,
                    'read_only' => false,
                    'updated_at' => now(),
                ]);

            $this->event(
                $organizationId,
                'subscription_auto_resumed',
                'Subscription automatically resumed after pause',
                'auto-resume:'.$profile->paused_until,
            );
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    private function recordRecoveredPayment(
        int $organizationId,
        ?BillingAccount $account,
        object $profile,
    ): void {
        if (
            (int) $profile->failed_payment_count <= 0
            || in_array($account?->status, ['past_due', 'unpaid', 'incomplete'], true)
        ) {
            return;
        }

        $invoice = BillingInvoice::query()
            ->where('organization_id', $organizationId)
            ->where('amount_paid_minor', '>', 0)
            ->latest('paid_at')
            ->latest('id')
            ->first();

        if (! $invoice) {
            return;
        }

        $reference = 'recovered:'.$invoice->id;

        DB::table('billing_growth_ledger')->insertOrIgnore([
            'organization_id' => $organizationId,
            'bucket' => 'recovered',
            'amount_minor' => (int) $invoice->amount_paid_minor,
            'currency' => strtoupper((string) ($invoice->currency ?: 'USD')),
            'reason' => 'failed_payment_recovered',
            'reference' => $reference,
            'meta' => json_encode([
                'invoice_id' => (int) $invoice->id,
            ], JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('billing_growth_profiles')
            ->where('organization_id', $organizationId)
            ->update([
                'failed_payment_count' => 0,
                'last_payment_recovered_at' => now(),
                'grace_ends_at' => null,
                'read_only' => false,
                'updated_at' => now(),
            ]);

        $this->event(
            $organizationId,
            'payment_recovered',
            'A previously failed subscription payment was recovered',
            $reference,
        );

        DB::table('billing_growth_notifications')->insertOrIgnore([
            'organization_id' => $organizationId,
            'kind' => 'payment_recovered',
            'title_ar' => 'تمت استعادة الاشتراك بنجاح',
            'title_en' => 'Subscription recovered successfully',
            'body_ar' => 'تم تأكيد الدفعة وعادت مساحة العمل للوضع الطبيعي.',
            'body_en' => 'The payment was confirmed and the workspace is fully active again.',
            'action_url' => '/app/billing',
            'fingerprint' => $reference,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function ensureRetentionOffer(
        int $organizationId,
        ?BillingAccount $account,
    ): void {
        if (! $account) {
            return;
        }

        $kind = null;
        $valueMinor = 0;

        if ($account->cancel_at_period_end) {
            $kind = 'cancel_save';
            $valueMinor = (int) config(
                'billing_growth.cancel_save_credit_minor',
                0,
            );
        } elseif (in_array($account->status, ['canceled', 'incomplete_expired'], true)) {
            $kind = 'winback';
            $valueMinor = (int) config(
                'billing_growth.winback_credit_minor',
                0,
            );
        }

        if (! $kind || $valueMinor <= 0) {
            return;
        }

        $exists = DB::table('billing_growth_offers')
            ->where('organization_id', $organizationId)
            ->where('kind', $kind)
            ->whereNull('redeemed_at')
            ->where(fn ($query) => $query
                ->whereNull('expires_at')
                ->orWhere('expires_at', '>', now()))
            ->exists();

        if ($exists) {
            return;
        }

        DB::table('billing_growth_offers')->insert([
            'organization_id' => $organizationId,
            'kind' => $kind,
            'code' => strtoupper('ACN-'.Str::random(10)),
            'value_minor' => $valueMinor,
            'currency' => 'USD',
            'expires_at' => now()->addDays(30),
            'meta' => json_encode([
                'generated_by' => 'retention_engine',
            ], JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function event(
        int $organizationId,
        string $type,
        string $title,
        string $fingerprint,
    ): void {
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
}
