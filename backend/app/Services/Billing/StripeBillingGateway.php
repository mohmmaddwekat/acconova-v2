<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
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
     * Customer-facing plan information is owned by AccoNova. Provider price
     * IDs are checkout execution references only and are never exposed.
     *
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
            $display = is_array($plan['display'] ?? null)
                ? $plan['display']
                : [];
            $limits = is_array($plan['limits'] ?? null)
                ? $plan['limits']
                : [];
            $currency = strtoupper((string) ($display['currency'] ?? 'USD'));

            $catalog[] = [
                'key' => (string) $key,
                'name_ar' => (string) ($plan['name_ar'] ?? $key),
                'name_en' => (string) ($plan['name_en'] ?? $key),
                'description_ar' => (string) ($plan['description_ar'] ?? ''),
                'description_en' => (string) ($plan['description_en'] ?? ''),
                'recommended' => (bool) ($plan['recommended'] ?? false),
                'features_ar' => array_values(array_filter(
                    (array) ($plan['features_ar'] ?? []),
                    'is_string',
                )),
                'features_en' => array_values(array_filter(
                    (array) ($plan['features_en'] ?? []),
                    'is_string',
                )),
                'limits' => [
                    'seats' => isset($limits['seats'])
                        ? max(0, (int) $limits['seats'])
                        : null,
                    'storage_bytes' => isset($limits['storage_bytes'])
                        ? max(0, (int) $limits['storage_bytes'])
                        : null,
                ],
                'month' => $this->publicPrice(
                    $display['month_amount_minor'] ?? null,
                    $currency,
                    $prices['month'] ?? null,
                ),
                'year' => $this->publicPrice(
                    $display['year_amount_minor'] ?? null,
                    $currency,
                    $prices['year'] ?? null,
                ),
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
            ?: url('/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}');
        $cancelUrl = trim((string) config('billing.urls.cancel', ''))
            ?: url('/app/billing?checkout=cancelled');

        $email = filter_var(
            trim((string) $user->email),
            FILTER_VALIDATE_EMAIL,
        ) ?: null;

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
            'submit_type' => 'subscribe',
        ];

        if ($account?->provider_customer_id) {
            $payload['customer'] = $account->provider_customer_id;
        } elseif ($email) {
            $payload['customer_email'] = $email;
        }

        $trialDays = max(0, (int) config('billing.trial_days', 0));

        if ($trialDays > 0) {
            $payload['subscription_data']['trial_period_days'] = $trialDays;
        }

        $session = $this->postCheckout(
            $payload,
            $account,
            $email,
        );

        $url = trim((string) ($session['url'] ?? ''));

        if ($url === '') {
            throw new RuntimeException(
                'The billing checkout session did not return a redirect URL.',
            );
        }

        return $url;
    }

    public function portalUrl(Organization $organization): string
    {
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
            ?: url('/app/billing');

        $session = $this->post('/v1/billing_portal/sessions', [
            'customer' => $account->provider_customer_id,
            'return_url' => $returnUrl,
        ]);

        $url = trim((string) ($session['url'] ?? ''));

        if ($url === '') {
            throw new RuntimeException(
                'The billing portal session did not return a redirect URL.',
            );
        }

        return $url;
    }

    /** @return array<string, mixed> */
    public function subscription(string $subscriptionId): array
    {
        return $this->get(
            '/v1/subscriptions/'.rawurlencode($subscriptionId),
            ['expand' => ['default_payment_method']],
        );
    }

    /** @return array<string, mixed>|null */
    public function paymentMethod(?string $paymentMethodId): ?array
    {
        $paymentMethodId = trim((string) $paymentMethodId);

        if ($paymentMethodId === '') {
            return null;
        }

        return $this->get(
            '/v1/payment_methods/'.rawurlencode($paymentMethodId),
        );
    }

    public function planForPrice(?string $priceId): ?string
    {
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

    private function priceId(string $plan, string $interval): string
    {
        if (! in_array($interval, ['month', 'year'], true)) {
            throw new RuntimeException(
                'The requested billing interval is not available.',
            );
        }

        $plans = (array) config('billing.plans', []);

        if (! isset($plans[$plan]) || ! is_array($plans[$plan])) {
            throw new RuntimeException('The requested plan is not available.');
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
     * @return array{available: bool, amount_minor: int|null, currency: string}
     */
    private function publicPrice(
        mixed $amountMinor,
        string $currency,
        mixed $providerPriceId,
    ): array {
        $amount = is_numeric($amountMinor)
            ? max(0, (int) $amountMinor)
            : null;
        $priceConfigured = trim((string) $providerPriceId) !== '';

        return [
            'available' => $this->configured()
                && $priceConfigured
                && $amount !== null,
            'amount_minor' => $amount,
            'currency' => $currency,
        ];
    }

    private function ensureConfigured(): void
    {
        if (! $this->configured()) {
            throw new RuntimeException('Billing is not available right now.');
        }
    }

    /**
     * Create Checkout with one narrow recovery path. A stale customer ID can
     * remain after switching sandbox/live credentials or resetting provider
     * data. Stripe rejects that request before creating a Session, so it is
     * safe to clear only that stale reference and retry once without it.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function postCheckout(
        array $payload,
        ?BillingAccount $account,
        ?string $fallbackEmail,
    ): array {
        $response = $this->sendForm('/v1/checkout/sessions', $payload);

        if ($response->successful()) {
            return (array) $response->json();
        }

        if (
            $account?->provider_customer_id
            && $this->isMissingCustomerFailure($response)
        ) {
            $account->forceFill([
                'provider_customer_id' => null,
            ])->save();

            unset($payload['customer']);

            if ($fallbackEmail) {
                $payload['customer_email'] = $fallbackEmail;
            }

            $response = $this->sendForm(
                '/v1/checkout/sessions',
                $payload,
            );

            if ($response->successful()) {
                return (array) $response->json();
            }
        }

        $this->reportProviderFailure($response, 'checkout');

        throw new RuntimeException(
            'The billing service could not start checkout.',
        );
    }

    private function isMissingCustomerFailure(Response $response): bool
    {
        if ($response->status() !== 400) {
            return false;
        }

        $body = $response->json();

        return is_array($body)
            && data_get($body, 'error.code') === 'resource_missing'
            && data_get($body, 'error.param') === 'customer';
    }

    private function reportProviderFailure(
        Response $response,
        string $operation,
    ): void {
        $body = $response->json();
        $providerCode = is_array($body)
            ? (string) data_get($body, 'error.code', 'unknown')
            : 'unknown';
        $providerParam = is_array($body)
            ? (string) data_get($body, 'error.param', '')
            : '';
        $requestId = (string) $response->header('Request-Id');

        report(new RuntimeException(sprintf(
            'Billing %s rejected with HTTP %d (code=%s, param=%s, request_id=%s).',
            $operation,
            $response->status(),
            $providerCode,
            $providerParam,
            $requestId,
        )));
    }

    /** @return array<string, mixed> */
    private function get(string $path, array $query = []): array
    {
        try {
            return $this->client()
                ->get($this->url($path), $query)
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

    /** @return array<string, mixed> */
    private function post(string $path, array $payload): array
    {
        try {
            return $this->client()
                ->asForm()
                ->post($this->url($path), $payload)
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

    /** @param array<string, mixed> $payload */
    private function sendForm(string $path, array $payload): Response
    {
        try {
            return $this->client()
                ->asForm()
                ->post($this->url($path), $payload);
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
        $secret = trim((string) config('billing.stripe.secret', ''));

        if ($secret === '') {
            throw new RuntimeException('Billing is not configured.');
        }

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
