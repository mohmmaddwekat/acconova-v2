<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

final class AiCreditService
{
    public function __construct(
        private readonly StripeBillingGateway $gateway,
    ) {}

    /** @return array<string, mixed> */
    public function snapshot(Organization $organization): array
    {
        $id = (int) $organization->id;
        $config = (array) config('billing_growth.ai_credits', []);
        $wallet = Schema::hasTable('billing_ai_wallets')
            ? DB::table('billing_ai_wallets')->where('organization_id', $id)->first()
            : null;

        $tokensPerDollar = max(1, (int) ($config['tokens_per_dollar'] ?? 50000));
        $currency = strtoupper((string) ($config['currency'] ?? 'USD'));
        $presets = [];

        foreach ((array) ($config['preset_amounts_minor'] ?? [1000, 5000, 10000, 20000]) as $amount) {
            $amountMinor = max(0, (int) $amount);

            if ($amountMinor <= 0) {
                continue;
            }

            $presets[] = [
                'amount_minor' => $amountMinor,
                'tokens' => $this->tokensForAmount($amountMinor),
                'currency' => $currency,
            ];
        }

        return [
            'balance_tokens' => (int) ($wallet?->balance_tokens ?? 0),
            'total_purchased_tokens' => (int) ($wallet?->total_purchased_tokens ?? 0),
            'total_consumed_tokens' => (int) ($wallet?->total_consumed_tokens ?? 0),
            'auto_recharge' => [
                'enabled' => (bool) ($wallet?->auto_recharge_enabled ?? false),
                'threshold_tokens' => (int) ($wallet?->auto_recharge_threshold_tokens
                    ?? ($config['default_threshold_tokens'] ?? 100000)),
                'recharge_tokens' => (int) ($wallet?->auto_recharge_tokens ?? 0),
                'recharge_amount_minor' => (int) ($wallet?->auto_recharge_amount_minor ?? 0),
                'currency' => strtoupper((string) ($wallet?->auto_recharge_currency ?? $currency)),
            ],
            'pricing' => [
                'currency' => $currency,
                'tokens_per_dollar' => $tokensPerDollar,
                'minimum_amount_minor' => max(100, (int) ($config['minimum_amount_minor'] ?? 500)),
                'maximum_amount_minor' => max(100, (int) ($config['maximum_amount_minor'] ?? 100000)),
                'presets' => $presets,
                'threshold_options' => array_values(array_map(
                    static fn ($value): int => max(1, (int) $value),
                    (array) ($config['threshold_options'] ?? [100000, 250000, 500000]),
                )),
            ],
        ];
    }

    /** @return array{url:string,tokens:int,amount_minor:int,currency:string} */
    public function checkout(
        Organization $organization,
        int $amountMinor,
        bool $autoRecharge,
        int $thresholdTokens,
    ): array {
        $this->assertTablesReady();
        $config = (array) config('billing_growth.ai_credits', []);
        $minimum = max(100, (int) ($config['minimum_amount_minor'] ?? 500));
        $maximum = max($minimum, (int) ($config['maximum_amount_minor'] ?? 100000));

        if ($amountMinor < $minimum || $amountMinor > $maximum) {
            throw new RuntimeException('The selected AI credit amount is outside the allowed range.');
        }

        $tokens = $this->tokensForAmount($amountMinor);
        $currency = strtoupper((string) ($config['currency'] ?? 'USD'));
        $thresholdTokens = max(1, $thresholdTokens);

        $url = $this->gateway->aiCreditCheckoutUrl(
            $organization,
            $tokens,
            $amountMinor,
            $currency,
            $autoRecharge,
            $thresholdTokens,
        );

        return [
            'url' => $url,
            'tokens' => $tokens,
            'amount_minor' => $amountMinor,
            'currency' => $currency,
        ];
    }

    /** @param array<string, mixed> $session */
    public function completeCheckout(array $session): void
    {
        if (($session['payment_status'] ?? null) !== 'paid') {
            return;
        }

        $organizationId = max(0, (int) data_get($session, 'metadata.organization_id', 0));
        $tokens = max(0, (int) data_get($session, 'metadata.tokens', 0));
        $sessionId = trim((string) ($session['id'] ?? ''));

        if ($organizationId <= 0 || $tokens <= 0 || $sessionId === '') {
            return;
        }

        if (! Organization::query()->whereKey($organizationId)->exists()) {
            return;
        }

        $amountMinor = max(0, (int) ($session['amount_total'] ?? data_get($session, 'metadata.amount_minor', 0)));
        $currency = strtoupper((string) ($session['currency'] ?? data_get($session, 'metadata.currency', 'USD')));
        $paymentIntentId = $this->providerId($session['payment_intent'] ?? null);
        $autoRecharge = filter_var(
            data_get($session, 'metadata.auto_recharge', false),
            FILTER_VALIDATE_BOOLEAN,
        );
        $thresholdTokens = max(1, (int) data_get(
            $session,
            'metadata.auto_recharge_threshold_tokens',
            config('billing_growth.ai_credits.default_threshold_tokens', 100000),
        ));

        DB::transaction(function () use (
            $organizationId,
            $tokens,
            $sessionId,
            $paymentIntentId,
            $amountMinor,
            $currency,
            $autoRecharge,
            $thresholdTokens,
        ): void {
            if (DB::table('billing_ai_credit_transactions')
                ->where('provider_checkout_session_id', $sessionId)
                ->exists()) {
                return;
            }

            $wallet = $this->lockWallet($organizationId);
            $balance = (int) $wallet->balance_tokens + $tokens;

            DB::table('billing_ai_wallets')
                ->where('organization_id', $organizationId)
                ->update([
                    'balance_tokens' => $balance,
                    'total_purchased_tokens' => (int) $wallet->total_purchased_tokens + $tokens,
                    'auto_recharge_enabled' => $autoRecharge,
                    'auto_recharge_threshold_tokens' => $thresholdTokens,
                    'auto_recharge_tokens' => $autoRecharge ? $tokens : 0,
                    'auto_recharge_amount_minor' => $autoRecharge ? $amountMinor : 0,
                    'auto_recharge_currency' => $currency,
                    'last_topup_at' => now(),
                    'updated_at' => now(),
                ]);

            DB::table('billing_ai_credit_transactions')->insert([
                'organization_id' => $organizationId,
                'kind' => 'topup',
                'status' => 'succeeded',
                'tokens' => $tokens,
                'balance_after_tokens' => $balance,
                'amount_minor' => $amountMinor,
                'currency' => $currency,
                'provider_checkout_session_id' => $sessionId,
                'provider_payment_intent_id' => $paymentIntentId,
                'reference' => 'checkout:'.$sessionId,
                'metadata' => json_encode(['auto_recharge' => $autoRecharge]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    /** @param array<string, mixed> $intent */
    public function completeAutoRecharge(array $intent): void
    {
        if (($intent['status'] ?? null) !== 'succeeded') {
            return;
        }

        if ((string) data_get($intent, 'metadata.purpose', '') !== 'ai_credit_auto_recharge') {
            return;
        }

        $organizationId = max(0, (int) data_get($intent, 'metadata.organization_id', 0));
        $tokens = max(0, (int) data_get($intent, 'metadata.tokens', 0));
        $intentId = trim((string) ($intent['id'] ?? ''));

        if ($organizationId <= 0 || $tokens <= 0 || $intentId === '') {
            return;
        }

        $amountMinor = max(0, (int) ($intent['amount_received'] ?? $intent['amount'] ?? 0));
        $currency = strtoupper((string) ($intent['currency'] ?? 'USD'));

        DB::transaction(function () use (
            $organizationId,
            $tokens,
            $intentId,
            $amountMinor,
            $currency,
        ): void {
            if (DB::table('billing_ai_credit_transactions')
                ->where('provider_payment_intent_id', $intentId)
                ->exists()) {
                return;
            }

            $wallet = $this->lockWallet($organizationId);
            $balance = (int) $wallet->balance_tokens + $tokens;

            DB::table('billing_ai_wallets')
                ->where('organization_id', $organizationId)
                ->update([
                    'balance_tokens' => $balance,
                    'total_purchased_tokens' => (int) $wallet->total_purchased_tokens + $tokens,
                    'last_topup_at' => now(),
                    'last_auto_recharge_at' => now(),
                    'updated_at' => now(),
                ]);

            DB::table('billing_ai_credit_transactions')->insert([
                'organization_id' => $organizationId,
                'kind' => 'auto_recharge',
                'status' => 'succeeded',
                'tokens' => $tokens,
                'balance_after_tokens' => $balance,
                'amount_minor' => $amountMinor,
                'currency' => $currency,
                'provider_checkout_session_id' => null,
                'provider_payment_intent_id' => $intentId,
                'reference' => 'payment_intent:'.$intentId,
                'metadata' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    public function ensureAvailable(Organization $organization): bool
    {
        if (! Schema::hasTable('billing_ai_wallets')) {
            return true;
        }

        $limit = $this->includedMonthlyLimit((int) $organization->id);

        if ($limit === null) {
            return true;
        }

        if ($this->monthlyUsage((int) $organization->id) < $limit) {
            return true;
        }

        $wallet = DB::table('billing_ai_wallets')
            ->where('organization_id', $organization->id)
            ->first();

        if ((int) ($wallet?->balance_tokens ?? 0) > 0) {
            return true;
        }

        return $this->maybeAutoRecharge($organization)
            && (int) (DB::table('billing_ai_wallets')
                ->where('organization_id', $organization->id)
                ->value('balance_tokens') ?? 0) > 0;
    }

    public function consumeOverage(Organization $organization, int $newTokens): void
    {
        if ($newTokens <= 0 || ! Schema::hasTable('billing_ai_wallets')) {
            return;
        }

        $organizationId = (int) $organization->id;
        $limit = $this->includedMonthlyLimit($organizationId);

        if ($limit === null) {
            return;
        }

        $before = $this->monthlyUsage($organizationId);
        $overageBefore = max(0, $before - $limit);
        $overageAfter = max(0, ($before + $newTokens) - $limit);
        $toDebit = max(0, $overageAfter - $overageBefore);

        if ($toDebit <= 0) {
            return;
        }

        $wallet = DB::table('billing_ai_wallets')
            ->where('organization_id', $organizationId)
            ->first();

        if ((int) ($wallet?->balance_tokens ?? 0) < $toDebit) {
            $this->maybeAutoRecharge($organization);
        }

        DB::transaction(function () use ($organizationId, $toDebit): void {
            $wallet = $this->lockWallet($organizationId);
            $available = max(0, (int) $wallet->balance_tokens);
            $debit = min($available, $toDebit);

            if ($debit <= 0) {
                return;
            }

            $balance = $available - $debit;

            DB::table('billing_ai_wallets')
                ->where('organization_id', $organizationId)
                ->update([
                    'balance_tokens' => $balance,
                    'total_consumed_tokens' => (int) $wallet->total_consumed_tokens + $debit,
                    'updated_at' => now(),
                ]);

            DB::table('billing_ai_credit_transactions')->insert([
                'organization_id' => $organizationId,
                'kind' => 'usage',
                'status' => 'succeeded',
                'tokens' => -$debit,
                'balance_after_tokens' => $balance,
                'amount_minor' => 0,
                'currency' => strtoupper((string) config('billing_growth.ai_credits.currency', 'USD')),
                'provider_checkout_session_id' => null,
                'provider_payment_intent_id' => null,
                'reference' => 'usage:'.Str::uuid(),
                'metadata' => json_encode(['requested_debit_tokens' => $toDebit]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $this->maybeAutoRecharge($organization);
    }

    public function maybeAutoRecharge(Organization $organization): bool
    {
        if (! Schema::hasTable('billing_ai_wallets')) {
            return false;
        }

        $wallet = DB::table('billing_ai_wallets')
            ->where('organization_id', $organization->id)
            ->first();

        if (! $wallet || ! $wallet->auto_recharge_enabled) {
            return false;
        }

        if ((int) $wallet->balance_tokens > (int) $wallet->auto_recharge_threshold_tokens) {
            return false;
        }

        if (
            $wallet->last_auto_recharge_at
            && now()->diffInMinutes($wallet->last_auto_recharge_at) < 5
        ) {
            return false;
        }

        $tokens = max(0, (int) $wallet->auto_recharge_tokens);
        $amountMinor = max(0, (int) $wallet->auto_recharge_amount_minor);
        $currency = strtoupper((string) $wallet->auto_recharge_currency);

        if ($tokens <= 0 || $amountMinor <= 0) {
            return false;
        }

        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $account?->provider_customer_id || ! $account?->provider_subscription_id) {
            return false;
        }

        DB::table('billing_ai_wallets')
            ->where('organization_id', $organization->id)
            ->update([
                'last_auto_recharge_at' => now(),
                'updated_at' => now(),
            ]);

        try {
            $intent = $this->gateway->chargeAiCreditsOffSession(
                $account,
                $tokens,
                $amountMinor,
                $currency,
            );

            $this->completeAutoRecharge($intent);

            return ($intent['status'] ?? null) === 'succeeded';
        } catch (Throwable $exception) {
            report($exception);

            return false;
        }
    }

    public function tokensForAmount(int $amountMinor): int
    {
        $tokensPerDollar = max(1, (int) config(
            'billing_growth.ai_credits.tokens_per_dollar',
            50000,
        ));

        return max(1, (int) floor(($amountMinor * $tokensPerDollar) / 100));
    }

    private function includedMonthlyLimit(int $organizationId): ?int
    {
        $account = BillingAccount::query()
            ->where('organization_id', $organizationId)
            ->first();

        if (! $account?->plan_key) {
            return null;
        }

        $value = config('billing.plans.'.$account->plan_key.'.limits.ai_tokens');

        return is_numeric($value) ? max(0, (int) $value) : null;
    }

    private function monthlyUsage(int $organizationId): int
    {
        if (! Schema::hasTable('ai_messages')) {
            return 0;
        }

        return (int) DB::table('ai_messages')
            ->where('organization_id', $organizationId)
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->sum('total_tokens');
    }

    private function assertTablesReady(): void
    {
        if (
            ! Schema::hasTable('billing_ai_wallets')
            || ! Schema::hasTable('billing_ai_credit_transactions')
        ) {
            throw new RuntimeException('AI credits are not ready. Run the latest database migrations.');
        }
    }

    private function lockWallet(int $organizationId): object
    {
        DB::table('billing_ai_wallets')->insertOrIgnore([
            'organization_id' => $organizationId,
            'balance_tokens' => 0,
            'total_purchased_tokens' => 0,
            'total_consumed_tokens' => 0,
            'auto_recharge_enabled' => false,
            'auto_recharge_threshold_tokens' => (int) config(
                'billing_growth.ai_credits.default_threshold_tokens',
                100000,
            ),
            'auto_recharge_tokens' => 0,
            'auto_recharge_amount_minor' => 0,
            'auto_recharge_currency' => strtoupper((string) config(
                'billing_growth.ai_credits.currency',
                'USD',
            )),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return DB::table('billing_ai_wallets')
            ->where('organization_id', $organizationId)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function providerId(mixed $value): ?string
    {
        if (is_array($value)) {
            $value = $value['id'] ?? null;
        }

        $id = trim((string) $value);

        return $id !== '' ? $id : null;
    }
}
