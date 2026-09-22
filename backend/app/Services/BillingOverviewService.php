<?php

namespace App\Services;

use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

final class BillingOverviewService
{
    /**
     * Build a tenant-safe billing snapshot without inventing subscription
     * values before a real payment provider has synchronized them.
     *
     * @return array<string,mixed>
     */
    public function forOrganization(Organization $organization): array
    {
        $organizationId = (int) $organization->id;
        $preferences = $organization->preferences ?? [];

        $stripeKey = trim((string) config('billing.stripe.key', ''));
        $stripeSecret = trim((string) config('billing.stripe.secret', ''));
        $stripeWebhookSecret = trim((string) config('billing.stripe.webhook_secret', ''));

        $credentialsConfigured = $stripeKey !== '' && $stripeSecret !== '';
        $webhookConfigured = $stripeWebhookSecret !== '';

        $providerState = 'not_configured';

        if ($credentialsConfigured) {
            $providerState = $webhookConfigured
                ? 'ready_for_sync'
                : 'credentials_ready';
        }

        $mode = null;

        if ($credentialsConfigured) {
            $mode = str_starts_with($stripeSecret, 'sk_test_')
                || str_starts_with($stripeKey, 'pk_test_')
                    ? 'test'
                    : 'live';
        }

        $periodStart = now()->startOfMonth();
        $periodEnd = now()->endOfMonth();

        $seatsUsed = (int) DB::table('memberships')
            ->where('organization_id', $organizationId)
            ->count();

        $aiTokensUsed = 0;
        $aiMessages = 0;

        if (Schema::hasTable('ai_messages')) {
            $aiUsage = DB::table('ai_messages')
                ->where('organization_id', $organizationId)
                ->whereBetween('created_at', [
                    $periodStart,
                    $periodEnd,
                ])
                ->selectRaw(
                    'COALESCE(SUM(total_tokens), 0) as total_tokens, COUNT(*) as messages_count',
                )
                ->first();

            $aiTokensUsed = (int) ($aiUsage?->total_tokens ?? 0);
            $aiMessages = (int) ($aiUsage?->messages_count ?? 0);
        }

        return [
            'provider' => [
                'name' => (string) config('billing.provider', 'stripe'),
                'enabled' => (bool) config('billing.enabled', false),
                'state' => $providerState,
                'credentials_configured' => $credentialsConfigured,
                'webhook_configured' => $webhookConfigured,
                'mode' => $mode,
            ],
            'subscription' => null,
            'next_invoice' => null,
            'payment_method' => null,
            'invoices' => [],
            'addons' => [],
            'currency' => (string) ($preferences['currency'] ?? 'USD'),
            'usage' => [
                'period' => [
                    'from' => $periodStart->toDateString(),
                    'to' => $periodEnd->toDateString(),
                ],
                'seats' => [
                    'used' => $seatsUsed,
                    'limit' => null,
                ],
                'ai_tokens' => [
                    'used' => $aiTokensUsed,
                    'messages' => $aiMessages,
                    'limit' => null,
                ],
                'storage' => [
                    'available' => false,
                    'used_bytes' => null,
                    'limit_bytes' => null,
                ],
            ],
        ];
    }
}
