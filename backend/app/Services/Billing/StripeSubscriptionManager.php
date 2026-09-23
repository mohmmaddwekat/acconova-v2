<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class StripeSubscriptionManager
{
    public function scheduleCancellation(BillingAccount $account): void
    {
        $this->subscriptionPost($account, [
            'cancel_at_period_end' => 'true',
        ]);
    }

    public function resumeRenewal(BillingAccount $account): void
    {
        $this->subscriptionPost($account, [
            'cancel_at_period_end' => 'false',
        ]);
    }

    public function pauseCollection(BillingAccount $account): void
    {
        $this->subscriptionPost($account, [
            'pause_collection' => [
                'behavior' => 'void',
            ],
        ]);
    }

    public function resumeCollection(BillingAccount $account): void
    {
        $this->subscriptionPost($account, [
            'pause_collection' => '',
        ]);
    }

    public function extendTrial(BillingAccount $account, int $days): void
    {
        if ($days <= 0) {
            throw new RuntimeException('Trial extension is disabled.');
        }

        $base = $account->trial_ends_at?->isFuture()
            ? $account->trial_ends_at
            : now();

        $this->subscriptionPost($account, [
            'trial_end' => $base->copy()->addDays($days)->timestamp,
            'proration_behavior' => 'none',
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function subscriptionPost(
        BillingAccount $account,
        array $payload,
    ): array {
        $subscriptionId = trim((string) $account->provider_subscription_id);

        if ($subscriptionId === '') {
            throw new RuntimeException('No active subscription exists.');
        }

        $response = $this->client()->asForm()->post(
            rtrim((string) config('billing.stripe.api_base', 'https://api.stripe.com'), '/')
                .'/v1/subscriptions/'.rawurlencode($subscriptionId),
            $payload,
        );

        if (! $response->successful()) {
            report(new RuntimeException(sprintf(
                'Subscription lifecycle request failed with HTTP %d.',
                $response->status(),
            )));

            throw new RuntimeException('Subscription management is temporarily unavailable.');
        }

        $data = $response->json();

        if (! is_array($data)) {
            throw new RuntimeException('Subscription response was invalid.');
        }

        return $data;
    }

    private function client(): PendingRequest
    {
        $secret = trim((string) config('billing.stripe.secret', ''));

        if ($secret === '') {
            throw new RuntimeException('Billing is not configured.');
        }

        return Http::withToken($secret)
            ->acceptJson()
            ->timeout(15)
            ->connectTimeout(8);
    }
}
