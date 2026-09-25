<?php

namespace App\Http\Controllers;

use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class AiCreditSettingsController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        WorkspaceFeaturePermissions::authorize(
            $request->user(),
            'workspace.settings.manage',
        );

        abort_unless(Schema::hasTable('billing_ai_wallets'), 503, 'AI credits are not ready.');

        $minimum = max(100, (int) config('billing_growth.ai_credits.minimum_amount_minor', 500));
        $maximum = max($minimum, (int) config('billing_growth.ai_credits.maximum_amount_minor', 100000));
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'threshold_tokens' => ['required', 'integer', 'min:1', 'max:1000000000'],
            'amount_minor' => ['nullable', 'integer', 'min:'.$minimum, 'max:'.$maximum],
        ]);

        $organization = app(TenantContext::class)->organization();
        $organizationId = (int) $organization->id;
        $currency = strtoupper((string) config('billing_growth.ai_credits.currency', 'USD'));
        $tokensPerDollar = max(1, (int) config('billing_growth.ai_credits.tokens_per_dollar', 50000));

        DB::transaction(function () use (
            $organizationId,
            $data,
            $currency,
            $tokensPerDollar,
        ): void {
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
                'auto_recharge_currency' => $currency,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $wallet = DB::table('billing_ai_wallets')
                ->where('organization_id', $organizationId)
                ->lockForUpdate()
                ->firstOrFail();

            $enabled = (bool) $data['enabled'];
            $amountMinor = isset($data['amount_minor'])
                ? (int) $data['amount_minor']
                : (int) ($wallet->auto_recharge_amount_minor ?? 0);

            if ($enabled && $amountMinor <= 0) {
                abort(422, 'Choose an auto-recharge amount before enabling it.');
            }

            $tokens = $amountMinor > 0
                ? max(1, (int) floor(($amountMinor * $tokensPerDollar) / 100))
                : 0;

            DB::table('billing_ai_wallets')
                ->where('organization_id', $organizationId)
                ->update([
                    'auto_recharge_enabled' => $enabled,
                    'auto_recharge_threshold_tokens' => (int) $data['threshold_tokens'],
                    'auto_recharge_tokens' => $tokens,
                    'auto_recharge_amount_minor' => $amountMinor,
                    'auto_recharge_currency' => $currency,
                    'updated_at' => now(),
                ]);
        });

        $wallet = DB::table('billing_ai_wallets')
            ->where('organization_id', $organizationId)
            ->first();

        return response()->json([
            'data' => [
                'enabled' => (bool) ($wallet?->auto_recharge_enabled ?? false),
                'threshold_tokens' => (int) ($wallet?->auto_recharge_threshold_tokens ?? 0),
                'recharge_tokens' => (int) ($wallet?->auto_recharge_tokens ?? 0),
                'recharge_amount_minor' => (int) ($wallet?->auto_recharge_amount_minor ?? 0),
                'currency' => strtoupper((string) ($wallet?->auto_recharge_currency ?? $currency)),
            ],
        ]);
    }
}
