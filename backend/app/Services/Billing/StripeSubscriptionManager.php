<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
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

    /**
     * Backwards-compatible increment operation. New UI flows use
     * setAddonQuantity() so customers can increase, reduce or remove capacity.
     *
     * @return array<string, mixed>
     */
    public function purchaseAddon(
        BillingAccount $account,
        string $addonKey,
        int $quantity,
    ): array {
        return $this->mutateAddonQuantity(
            $account,
            $addonKey,
            max(1, $quantity),
            false,
        );
    }

    /**
     * Set the exact provider quantity for one recurring capacity item on the
     * existing workspace subscription. Zero removes the item. Stripe prorates
     * both increases and decreases against the current billing period.
     *
     * @return array<string, mixed>
     */
    public function setAddonQuantity(
        BillingAccount $account,
        string $addonKey,
        int $targetQuantity,
    ): array {
        return $this->mutateAddonQuantity(
            $account,
            $addonKey,
            max(0, $targetQuantity),
            true,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function mutateAddonQuantity(
        BillingAccount $account,
        string $addonKey,
        int $requestedQuantity,
        bool $absolute,
    ): array {
        if (! in_array($account->status, ['active', 'trialing'], true)) {
            throw new RuntimeException('The subscription must be active before changing add-ons.');
        }

        $interval = in_array($account->billing_interval, ['month', 'year'], true)
            ? (string) $account->billing_interval
            : 'month';
        $addon = $this->addon($addonKey);
        $maximum = max(1, (int) ($addon['max_quantity'] ?? 100));
        $price = $this->addonPrice($addonKey, $interval, $addon);
        $priceId = $this->resolvePriceId($price);
        $subscription = $this->subscriptionGet($account);
        $items = is_array(data_get($subscription, 'items.data'))
            ? data_get($subscription, 'items.data')
            : [];

        $existingItem = null;

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $itemPriceId = trim((string) data_get($item, 'price.id', ''));
            $lookupKey = trim((string) data_get($item, 'price.lookup_key', ''));

            if (
                ($itemPriceId !== '' && hash_equals($priceId, $itemPriceId))
                || ($lookupKey !== '' && hash_equals((string) ($price['lookup_key'] ?? ''), $lookupKey))
            ) {
                $existingItem = $item;
                break;
            }
        }

        $currentQuantity = max(0, (int) ($existingItem['quantity'] ?? 0));
        $targetQuantity = $absolute
            ? min($maximum, $requestedQuantity)
            : min($maximum, $currentQuantity + max(1, $requestedQuantity));
        $delta = $targetQuantity - $currentQuantity;

        if ($targetQuantity === $currentQuantity) {
            return [
                'addon_key' => $addonKey,
                'quantity' => $targetQuantity,
                'previous_quantity' => $currentQuantity,
                'quantity_delta' => 0,
                'purchased_quantity' => 0,
                'entitlement_per_unit' => max(0, (int) ($addon['quantity'] ?? 0)),
                'amount_minor' => max(0, (int) ($price['amount_minor'] ?? 0)),
                'currency' => strtoupper((string) ($addon['currency'] ?? 'USD')),
                'billing_interval' => $interval,
                'price_id' => $priceId,
                'subscription_item_id' => $existingItem['id'] ?? null,
                'pending' => false,
                'payment_url' => null,
                'changed' => false,
            ];
        }

        if ($targetQuantity <= 0 && ! $existingItem) {
            return [
                'addon_key' => $addonKey,
                'quantity' => 0,
                'previous_quantity' => 0,
                'quantity_delta' => 0,
                'purchased_quantity' => 0,
                'entitlement_per_unit' => max(0, (int) ($addon['quantity'] ?? 0)),
                'amount_minor' => max(0, (int) ($price['amount_minor'] ?? 0)),
                'currency' => strtoupper((string) ($addon['currency'] ?? 'USD')),
                'billing_interval' => $interval,
                'price_id' => $priceId,
                'subscription_item_id' => null,
                'pending' => false,
                'payment_url' => null,
                'changed' => false,
            ];
        }

        if ($targetQuantity <= 0) {
            $itemPayload = [
                'id' => (string) ($existingItem['id'] ?? ''),
                'deleted' => 'true',
            ];
        } elseif ($existingItem) {
            $itemPayload = [
                'id' => (string) ($existingItem['id'] ?? ''),
                'quantity' => $targetQuantity,
            ];
        } else {
            $itemPayload = [
                'price' => $priceId,
                'quantity' => $targetQuantity,
            ];
        }

        $updated = $this->subscriptionPost($account, [
            'items' => [$itemPayload],
            'proration_behavior' => 'always_invoice',
            'payment_behavior' => 'pending_if_incomplete',
            'expand' => ['latest_invoice.payment_intent'],
        ]);

        $invoice = is_array($updated['latest_invoice'] ?? null)
            ? $updated['latest_invoice']
            : [];
        $invoiceStatus = trim((string) ($invoice['status'] ?? ''));
        $paymentUrl = $invoiceStatus === 'open'
            ? trim((string) ($invoice['hosted_invoice_url'] ?? ''))
            : '';
        $pending = is_array($updated['pending_update'] ?? null);

        return [
            'addon_key' => $addonKey,
            'quantity' => $targetQuantity,
            'previous_quantity' => $currentQuantity,
            'quantity_delta' => $delta,
            'purchased_quantity' => max(0, $delta),
            'entitlement_per_unit' => max(0, (int) ($addon['quantity'] ?? 0)),
            'amount_minor' => max(0, (int) ($price['amount_minor'] ?? 0)),
            'currency' => strtoupper((string) ($addon['currency'] ?? 'USD')),
            'billing_interval' => $interval,
            'price_id' => $priceId,
            'subscription_item_id' => $targetQuantity > 0
                ? $this->findAddonItemId($updated, $priceId, (string) ($price['lookup_key'] ?? ''))
                : null,
            'pending' => $pending,
            'payment_url' => $paymentUrl !== '' ? $paymentUrl : null,
            'changed' => true,
        ];
    }

    /**
     * Create missing Stripe Products/Prices for AccoNova add-ons. Existing
     * lookup keys are reused, making this command safe to run repeatedly.
     *
     * @return list<array<string, mixed>>
     */
    public function syncAddonCatalog(): array
    {
        $results = [];

        foreach ((array) config('billing_growth.addons', []) as $key => $addon) {
            if (! is_array($addon)) {
                continue;
            }

            $productId = null;
            $resolved = [];

            foreach (['month', 'year'] as $interval) {
                $price = $this->addonPrice((string) $key, $interval, $addon);
                $existing = $this->findPrice($price);

                if ($existing) {
                    $resolved[$interval] = [
                        'price_id' => (string) $existing['id'],
                        'created' => false,
                    ];
                    $productId = is_string($existing['product'] ?? null)
                        ? $existing['product']
                        : $productId;
                }
            }

            if (! $productId) {
                $product = $this->post('/v1/products', [
                    'name' => (string) ($addon['name_en'] ?? $key),
                    'description' => (string) ($addon['description_en'] ?? ''),
                    'metadata' => [
                        'acconova_addon_key' => (string) $key,
                    ],
                ]);
                $productId = trim((string) ($product['id'] ?? ''));

                if ($productId === '') {
                    throw new RuntimeException('Stripe did not return an add-on product ID.');
                }
            }

            foreach (['month', 'year'] as $interval) {
                if (isset($resolved[$interval])) {
                    continue;
                }

                $price = $this->addonPrice((string) $key, $interval, $addon);
                $amount = max(0, (int) ($price['amount_minor'] ?? 0));

                if ($amount <= 0) {
                    throw new RuntimeException("Add-on {$key} has no {$interval} price.");
                }

                $created = $this->post('/v1/prices', [
                    'product' => $productId,
                    'unit_amount' => $amount,
                    'currency' => strtolower((string) ($addon['currency'] ?? 'USD')),
                    'recurring' => [
                        'interval' => $interval,
                    ],
                    'lookup_key' => (string) ($price['lookup_key'] ?? ''),
                    'metadata' => [
                        'acconova_addon_key' => (string) $key,
                        'acconova_interval' => $interval,
                    ],
                ]);
                $createdId = trim((string) ($created['id'] ?? ''));

                if ($createdId === '') {
                    throw new RuntimeException('Stripe did not return an add-on price ID.');
                }

                $resolved[$interval] = [
                    'price_id' => $createdId,
                    'created' => true,
                ];
            }

            $results[] = [
                'key' => (string) $key,
                'product_id' => $productId,
                'prices' => $resolved,
            ];
        }

        return $results;
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

        return $this->post(
            '/v1/subscriptions/'.rawurlencode($subscriptionId),
            $payload,
        );
    }

    /** @return array<string, mixed> */
    private function subscriptionGet(BillingAccount $account): array
    {
        $subscriptionId = trim((string) $account->provider_subscription_id);

        if ($subscriptionId === '') {
            throw new RuntimeException('No active subscription exists.');
        }

        return $this->get(
            '/v1/subscriptions/'.rawurlencode($subscriptionId),
            ['expand' => ['items.data.price']],
        );
    }

    /** @return array<string, mixed> */
    private function addon(string $addonKey): array
    {
        $addon = config('billing_growth.addons.'.$addonKey);

        if (! is_array($addon)) {
            throw new RuntimeException('The requested add-on is not available.');
        }

        return $addon;
    }

    /**
     * @param array<string, mixed> $addon
     * @return array<string, mixed>
     */
    private function addonPrice(string $addonKey, string $interval, array $addon): array
    {
        $price = $addon['prices'][$interval] ?? null;

        if (! is_array($price)) {
            throw new RuntimeException("The {$addonKey} add-on is not available for {$interval} billing.");
        }

        return $price;
    }

    /** @param array<string, mixed> $price */
    private function resolvePriceId(array $price): string
    {
        $configured = trim((string) ($price['price_id'] ?? ''));

        if ($configured !== '') {
            return $configured;
        }

        $found = $this->findPrice($price);
        $priceId = trim((string) ($found['id'] ?? ''));

        if ($priceId === '') {
            throw new RuntimeException(
                'This add-on is not ready in Stripe. Run php artisan billing:sync-addons first.',
            );
        }

        return $priceId;
    }

    /**
     * @param array<string, mixed> $price
     * @return array<string, mixed>|null
     */
    private function findPrice(array $price): ?array
    {
        $configured = trim((string) ($price['price_id'] ?? ''));

        if ($configured !== '') {
            return $this->get('/v1/prices/'.rawurlencode($configured));
        }

        $lookupKey = trim((string) ($price['lookup_key'] ?? ''));

        if ($lookupKey === '') {
            return null;
        }

        $response = $this->get('/v1/prices', [
            'active' => 'true',
            'lookup_keys' => [$lookupKey],
            'limit' => 1,
        ]);
        $first = data_get($response, 'data.0');

        return is_array($first) ? $first : null;
    }

    /**
     * @param array<string, mixed> $subscription
     */
    private function findAddonItemId(
        array $subscription,
        string $priceId,
        string $lookupKey,
    ): ?string {
        $items = data_get($subscription, 'items.data', []);

        if (! is_array($items)) {
            return null;
        }

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $itemPriceId = trim((string) data_get($item, 'price.id', ''));
            $itemLookupKey = trim((string) data_get($item, 'price.lookup_key', ''));

            if (
                ($itemPriceId !== '' && hash_equals($priceId, $itemPriceId))
                || ($lookupKey !== '' && $itemLookupKey !== '' && hash_equals($lookupKey, $itemLookupKey))
            ) {
                $id = trim((string) ($item['id'] ?? ''));

                return $id !== '' ? $id : null;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function get(string $path, array $query = []): array
    {
        $response = $this->client()->get($this->url($path), $query);

        return $this->decode($response, 'Billing lookup');
    }

    /** @return array<string, mixed> */
    private function post(string $path, array $payload): array
    {
        $response = $this->client()->asForm()->post($this->url($path), $payload);

        return $this->decode($response, 'Subscription update');
    }

    /** @return array<string, mixed> */
    private function decode(Response $response, string $operation): array
    {
        if (! $response->successful()) {
            $message = trim((string) data_get($response->json(), 'error.message', ''));
            report(new RuntimeException(sprintf(
                '%s failed with HTTP %d.',
                $operation,
                $response->status(),
            )));

            throw new RuntimeException(
                $message !== ''
                    ? $message
                    : 'Subscription management is temporarily unavailable.',
            );
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
            ->timeout(20)
            ->connectTimeout(8);
    }

    private function url(string $path): string
    {
        return rtrim((string) config('billing.stripe.api_base', 'https://api.stripe.com'), '/')
            .'/'.ltrim($path, '/');
    }
}
