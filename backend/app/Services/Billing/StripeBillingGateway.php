<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

final class StripeBillingGateway
{
    public function configured(): bool
    {
        return (bool) config('billing.enabled', false)
            && trim((string) config('billing.stripe.secret', '')) !== ''
            && trim((string) config('billing.stripe.webhook_secret', '')) !== '';
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function publicPlanCatalog(): array
    {
        $plans = config('billing.plans', []);

        if (! is_array($plans)) {
            return [];
        }

        $catalog = [];

        foreach ($plans as $key => $plan) {
            if (! is_array($plan)) {
                continue;
            }

            $prices = is_array($plan['prices'] ?? null)
                ? $plan['prices']
                : [];

            $catalog[] = [
                'key' => (string) $key,
                'name_ar' => (string) ($plan['name_ar'] ?? $key),
                'name_en' => (string) ($plan['name_en'] ?? $key),
                'description_ar' => (string) ($plan['description_ar'] ?? ''),
                'description_en' => (string) ($plan['description_en'] ?? ''),
                'month' => $this->publicPrice($prices['month'] ?? null),
                'year' => $this->publicPrice($prices['year'] ?? null),
            ];
        }

        return $catalog;
    }

    public function checkoutUrl(
        Organization $organization,
        User $user,
        string $plan,
        string $interval,
    ): string {
        $this->ensureConfigured();

        $priceId = $this->priceId($plan, $interval);

        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->first();

        $successUrl = trim((string) config('billing.urls.success', ''))
            ?: url('/app/settings?section=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}');

        $cancelUrl = trim((string) config('billing.urls.cancel', ''))
            ?: url('/app/settings?section=billing&checkout=cancelled');

        $payload = [
            'mode' => 'subscription',
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'client_reference_id' => (string) $organization->id,
            'line_items' => [[
                'price' => $priceId,
                'quantity' => 1,
            ]],
            'metadata' => [
                'organization_id' => (string) $organization->id,
                'plan' => $plan,
                'interval' => $interval,
            ],
            'subscription_data' => [
                'metadata' => [
                    'organization_id' => (string) $organization->id,
                    'plan' => $plan,
                    'interval' => $interval,
                ],
            ],
            'allow_promotion_codes' => (bool) config(
                'billing.allow_promotion_codes',
                true,
            ) ? 'true' : 'false',
        ];

        if ($account?->provider_customer_id) {
            $payload['customer'] = $account->provider_customer_id;
        } elseif (filled($user->email)) {
            $payload['customer_email'] = $user->email;
        }

        $trialDays = max(
            0,
            (int) config('billing.trial_days', 0),
        );

        if ($trialDays > 0) {
            $payload['subscription_data']['trial_period_days'] = $trialDays;
        }

        $session = $this->post(
            '/v1/checkout/sessions',
            $payload,
        );

        $url = trim((string) ($session['url'] ?? ''));

        if ($url === '') {
            throw new RuntimeException(
                'The billing checkout session did not return a redirect URL.',
            );
        }

        return $url;
    }

    public function portalUrl(
        Organization $organization,
    ): string {
        $this->ensureConfigured();

        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $account?->provider_customer_id) {
            throw new RuntimeException(
                'No billing customer exists for this workspace yet.',
            );
        }

        $returnUrl = trim((string) config('billing.urls.portal_return', ''))
            ?: url('/app/settings?section=billing');

        $session = $this->post(
            '/v1/billing_portal/sessions',
            [
                'customer' => $account->provider_customer_id,
                'return_url' => $returnUrl,
            ],
        );

        $url = trim((string) ($session['url'] ?? ''));

        if ($url === '') {
            throw new RuntimeException(
                'The billing portal session did not return a redirect URL.',
            );
        }

        return $url;
    }

    /**
     * @return array<string, mixed>
     */
    public function subscription(
        string $subscriptionId,
    ): array {
        return $this->get(
            '/v1/subscriptions/'.rawurlencode($subscriptionId),
            [
                'expand' => [
                    'default_payment_method',
                ],
            ],
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public function paymentMethod(
        ?string $paymentMethodId,
    ): ?array {
        $paymentMethodId = trim((string) $paymentMethodId);

        if ($paymentMethodId === '') {
            return null;
        }

        return $this->get(
            '/v1/payment_methods/'.rawurlencode($paymentMethodId),
        );
    }

    public function planForPrice(
        ?string $priceId,
    ): ?string {
        $priceId = trim((string) $priceId);

        if ($priceId === '') {
            return null;
        }

        foreach ((array) config('billing.plans', []) as $plan => $config) {
            foreach ((array) ($config['prices'] ?? []) as $configuredPriceId) {
                if (
                    is_string($configuredPriceId)
                    && hash_equals($configuredPriceId, $priceId)
                ) {
                    return (string) $plan;
                }
            }
        }

        return null;
    }

    private function priceId(
        string $plan,
        string $interval,
    ): string {
        if (! in_array($interval, ['month', 'year'], true)) {
            throw new RuntimeException(
                'The requested billing interval is not available.',
            );
        }

        $plans = (array) config('billing.plans', []);

        if (! isset($plans[$plan]) || ! is_array($plans[$plan])) {
            throw new RuntimeException(
                'The requested plan is not available.',
            );
        }

        $priceId = trim((string) (
            $plans[$plan]['prices'][$interval] ?? ''
        ));

        if ($priceId === '') {
            throw new RuntimeException(
                'The requested plan is not available for purchase yet.',
            );
        }

        return $priceId;
    }

    /**
     * @return array<string, mixed>
     */
    private function publicPrice(
        mixed $priceId,
    ): array {
        $priceId = trim((string) $priceId);

        if ($priceId === '') {
            return [
                'available' => false,
                'amount_minor' => null,
                'currency' => null,
            ];
        }

        if (! $this->configured()) {
            return [
                'available' => false,
                'amount_minor' => null,
                'currency' => null,
            ];
        }

        try {
            $price = Cache::remember(
                'billing-price:'.hash('sha256', $priceId),
                now()->addMinutes(15),
                fn (): array => $this->get(
                    '/v1/prices/'.rawurlencode($priceId),
                ),
            );

            return [
                'available' => (bool) ($price['active'] ?? true),
                'amount_minor' => isset($price['unit_amount'])
                    ? (int) $price['unit_amount']
                    : null,
                'currency' => isset($price['currency'])
                    ? strtoupper((string) $price['currency'])
                    : null,
            ];
        } catch (Throwable $exception) {
            report($exception);

            return [
                'available' => true,
                'amount_minor' => null,
                'currency' => null,
            ];
        }
    }

    private function ensureConfigured(): void
    {
        if (! $this->configured()) {
            throw new RuntimeException(
                'Billing is not available right now.',
            );
        }
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private function get(
        string $path,
        array $query = [],
    ): array {
        try {
            return $this->client()
                ->get(
                    $this->url($path),
                    $query,
                )
                ->throw()
                ->json();
        } catch (Throwable $exception) {
            report($exception);

            throw new RuntimeException(
                'The billing service is temporarily unavailable.',
                previous: $exception,
            );
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function post(
        string $path,
        array $payload,
    ): array {
        try {
            return $this->client()
                ->asForm()
                ->post(
                    $this->url($path),
                    $payload,
                )
                ->throw()
                ->json();
        } catch (Throwable $exception) {
            report($exception);

            throw new RuntimeException(
                'The billing service is temporarily unavailable.',
                previous: $exception,
            );
        }
    }

    private function client(): PendingRequest
    {
        $secret = trim((string) config(
            'billing.stripe.secret',
            '',
        ));

        if ($secret === '') {
            throw new RuntimeException(
                'Billing is not configured.',
            );
        }

        /*
         * Do not automatically retry POST requests here: checkout/session
         * creation is a money-moving workflow and duplicate provider objects
         * are worse than asking the user to retry once.
         */
        return Http::withToken($secret)
            ->acceptJson()
            ->timeout(20);
    }

    private function url(string $path): string
    {
        return rtrim(
            (string) config(
                'billing.stripe.api_base',
                'https://api.stripe.com',
            ),
            '/',
        ).'/'.ltrim($path, '/');
    }
}
