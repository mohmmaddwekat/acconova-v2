<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\Organization;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class BillingAddonService
{
    public function __construct(
        private readonly StripeSubscriptionManager $subscriptions,
        private readonly StripeBillingGateway $gateway,
    ) {}

    /** @return array<string, mixed> */
    public function purchase(
        Organization $organization,
        string $addonKey,
        int $quantity = 1,
    ): array {
        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $account?->provider_subscription_id) {
            throw new RuntimeException('No active subscription can receive add-ons.');
        }

        $result = $this->subscriptions->purchaseAddon(
            $account,
            $addonKey,
            $quantity,
        );

        if (! (bool) ($result['pending'] ?? false)) {
            $this->persistAddon(
                (int) $organization->id,
                $addonKey,
                max(0, (int) ($result['quantity'] ?? 0)),
                $result['subscription_item_id'] ?? null,
                $result['price_id'] ?? null,
                $result['billing_interval'] ?? null,
                max(0, (int) ($result['amount_minor'] ?? 0)),
                strtoupper((string) ($result['currency'] ?? 'USD')),
            );
        }

        return $result;
    }

    public function reconcileAccount(BillingAccount $account): void
    {
        $organizationId = (int) $account->organization_id;

        if (
            ! $account->provider_subscription_id
            || in_array($account->status, ['canceled', 'incomplete_expired'], true)
        ) {
            DB::table('billing_growth_addons')
                ->where('organization_id', $organizationId)
                ->update([
                    'quantity' => 0,
                    'status' => 'inactive',
                    'updated_at' => now(),
                ]);

            return;
        }

        $subscription = $this->gateway->subscription(
            (string) $account->provider_subscription_id,
        );
        $items = data_get($subscription, 'items.data', []);
        $items = is_array($items) ? $items : [];
        $catalog = (array) config('billing_growth.addons', []);
        $seen = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $price = is_array($item['price'] ?? null)
                ? $item['price']
                : [];
            $priceId = trim((string) ($price['id'] ?? ''));
            $lookupKey = trim((string) ($price['lookup_key'] ?? ''));
            $addonKey = $this->addonKeyForPrice($priceId, $lookupKey, $catalog);

            if (! $addonKey) {
                continue;
            }

            $seen[] = $addonKey;
            $this->persistAddon(
                $organizationId,
                $addonKey,
                max(0, (int) ($item['quantity'] ?? 0)),
                $item['id'] ?? null,
                $priceId !== '' ? $priceId : null,
                data_get($price, 'recurring.interval'),
                max(0, (int) ($price['unit_amount'] ?? 0)),
                strtoupper((string) ($price['currency'] ?? 'USD')),
            );
        }

        $inactive = DB::table('billing_growth_addons')
            ->where('organization_id', $organizationId)
            ->when($seen !== [], fn ($query) => $query->whereNotIn('addon_key', $seen))
            ->get(['addon_key']);

        foreach ($inactive as $row) {
            DB::table('billing_growth_addons')
                ->where('organization_id', $organizationId)
                ->where('addon_key', $row->addon_key)
                ->update([
                    'quantity' => 0,
                    'status' => 'inactive',
                    'updated_at' => now(),
                ]);
        }
    }

    /**
     * @return array<string, array{quantity:int, entitlement:int, amount_minor:int, currency:string}>
     */
    public function activeForOrganization(int $organizationId): array
    {
        $catalog = (array) config('billing_growth.addons', []);
        $rows = DB::table('billing_growth_addons')
            ->where('organization_id', $organizationId)
            ->where('status', 'active')
            ->where('quantity', '>', 0)
            ->get();
        $active = [];

        foreach ($rows as $row) {
            $addon = $catalog[$row->addon_key] ?? null;

            if (! is_array($addon)) {
                continue;
            }

            $packs = max(0, (int) $row->quantity);
            $perPack = max(0, (int) ($addon['quantity'] ?? 0));
            $active[(string) $row->addon_key] = [
                'quantity' => $packs,
                'entitlement' => $packs * $perPack,
                'amount_minor' => max(0, (int) $row->amount_minor),
                'currency' => strtoupper((string) $row->currency),
            ];
        }

        return $active;
    }

    /** @return list<array<string, mixed>> */
    public function publicCatalog(?string $interval = null, int $organizationId = 0): array
    {
        $interval = in_array($interval, ['month', 'year'], true) ? $interval : 'month';
        $active = $organizationId > 0
            ? $this->activeForOrganization($organizationId)
            : [];
        $catalog = [];

        foreach ((array) config('billing_growth.addons', []) as $key => $addon) {
            if (! is_array($addon)) {
                continue;
            }

            $price = $addon['prices'][$interval] ?? [];
            $price = is_array($price) ? $price : [];
            $amount = max(0, (int) ($price['amount_minor'] ?? 0));

            $catalog[] = [
                'key' => (string) $key,
                'name_ar' => (string) ($addon['name_ar'] ?? $key),
                'name_en' => (string) ($addon['name_en'] ?? $key),
                'description_ar' => (string) ($addon['description_ar'] ?? ''),
                'description_en' => (string) ($addon['description_en'] ?? ''),
                'unit' => (string) ($addon['unit'] ?? ''),
                'quantity_per_pack' => max(0, (int) ($addon['quantity'] ?? 0)),
                'amount_minor' => $amount,
                'currency' => strtoupper((string) ($addon['currency'] ?? 'USD')),
                'interval' => $interval,
                'active_quantity' => (int) ($active[$key]['quantity'] ?? 0),
                'available' => $amount > 0,
            ];
        }

        return $catalog;
    }

    /**
     * @param array<string, mixed> $catalog
     */
    private function addonKeyForPrice(
        string $priceId,
        string $lookupKey,
        array $catalog,
    ): ?string {
        foreach ($catalog as $key => $addon) {
            if (! is_array($addon)) {
                continue;
            }

            foreach ((array) ($addon['prices'] ?? []) as $price) {
                if (! is_array($price)) {
                    continue;
                }

                $configuredPriceId = trim((string) ($price['price_id'] ?? ''));
                $configuredLookupKey = trim((string) ($price['lookup_key'] ?? ''));

                if (
                    ($priceId !== '' && $configuredPriceId !== '' && hash_equals($configuredPriceId, $priceId))
                    || ($lookupKey !== '' && $configuredLookupKey !== '' && hash_equals($configuredLookupKey, $lookupKey))
                ) {
                    return (string) $key;
                }
            }
        }

        return null;
    }

    private function persistAddon(
        int $organizationId,
        string $addonKey,
        int $quantity,
        mixed $subscriptionItemId,
        mixed $priceId,
        mixed $interval,
        int $amountMinor,
        string $currency,
    ): void {
        $existing = DB::table('billing_growth_addons')
            ->where('organization_id', $organizationId)
            ->where('addon_key', $addonKey)
            ->first();

        DB::table('billing_growth_addons')->updateOrInsert(
            [
                'organization_id' => $organizationId,
                'addon_key' => $addonKey,
            ],
            [
                'quantity' => $quantity,
                'status' => $quantity > 0 ? 'active' : 'inactive',
                'provider_subscription_item_id' => $subscriptionItemId,
                'price_id' => $priceId,
                'billing_interval' => $interval,
                'amount_minor' => $amountMinor,
                'currency' => $currency,
                'created_at' => $existing?->created_at ?: now(),
                'updated_at' => now(),
            ],
        );
    }
}
