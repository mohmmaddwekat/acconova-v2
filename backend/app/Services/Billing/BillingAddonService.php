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
            DB::table('billing_growth_addons')->updateOrInsert(
                [
                    'organization_id' => $organization->id,
                    'addon_key' => $addonKey,
                ],
                [
                    'quantity' => max(0, (int) ($result['quantity'] ?? 0)),
                    'status' => 'active',
                    'provider_subscription_item_id' => $result['subscription_item_id'] ?? null,
                    'price_id' => $result['price_id'] ?? null,
                    'billing_interval' => $result['billing_interval'] ?? null,
                    'amount_minor' => max(0, (int) ($result['amount_minor'] ?? 0)),
                    'currency' => strtoupper((string) ($result['currency'] ?? 'USD')),
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }

        return $result;
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
}
