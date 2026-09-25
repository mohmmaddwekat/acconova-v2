<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\Organization;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class BillingPlanChangeService
{
    public function __construct(
        private readonly StripeBillingGateway $gateway,
        private readonly BillingAddonService $addons,
    ) {}

    /**
     * Change only the base AccoNova plan item on the existing Stripe
     * subscription. Recurring seats/storage add-ons stay attached to the same
     * subscription and Stripe prorates the plan difference automatically.
     *
     * @return array<string, mixed>
     */
    public function change(
        Organization $organization,
        string $planKey,
        string $interval,
    ): array {
        if (! in_array($interval, ['month', 'year'], true)) {
            throw new RuntimeException('The requested billing interval is not available.');
        }

        $plan = config('billing.plans.'.$planKey);

        if (! is_array($plan)) {
            throw new RuntimeException('The requested plan is not available.');
        }

        $priceId = trim((string) ($plan['prices'][$interval] ?? ''));

        if ($priceId === '') {
            throw new RuntimeException('This plan is not ready in Stripe yet.');
        }

        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $account?->provider_subscription_id) {
            throw new RuntimeException('No active subscription exists for this workspace.');
        }

        if (! in_array($account->status, ['active', 'trialing'], true)) {
            throw new RuntimeException('Resolve the current subscription payment state before changing plans.');
        }

        $this->assertSeatCapacity($organization, $plan);

        $subscription = $this->gateway->subscription(
            (string) $account->provider_subscription_id,
        );
        $items = data_get($subscription, 'items.data', []);
        $items = is_array($items) ? $items : [];
        $baseItem = $this->findBaseItem($items, $account);

        if (! $baseItem) {
            throw new RuntimeException('Could not identify the current AccoNova plan item in Stripe.');
        }

        $baseItemId = trim((string) ($baseItem['id'] ?? ''));
        $currentPriceId = trim((string) data_get($baseItem, 'price.id', ''));

        if ($baseItemId === '') {
            throw new RuntimeException('The current subscription item is incomplete.');
        }

        if ($currentPriceId !== '' && hash_equals($currentPriceId, $priceId)) {
            return [
                'changed' => false,
                'pending' => false,
                'payment_url' => null,
                'plan_key' => $account->plan_key,
                'interval' => $account->billing_interval,
                'message' => 'This plan and billing period are already active.',
            ];
        }

        $updated = $this->postSubscription(
            (string) $account->provider_subscription_id,
            [
                'items' => [[
                    'id' => $baseItemId,
                    'price' => $priceId,
                    'quantity' => 1,
                ]],
                'proration_behavior' => 'always_invoice',
                'payment_behavior' => 'pending_if_incomplete',
                'metadata' => [
                    'organization_id' => (string) $organization->id,
                    'plan' => $planKey,
                    'interval' => $interval,
                ],
                'expand' => [
                    'latest_invoice.payment_intent',
                    'items.data.price',
                ],
            ],
        );

        $pending = is_array($updated['pending_update'] ?? null);
        $invoice = is_array($updated['latest_invoice'] ?? null)
            ? $updated['latest_invoice']
            : [];
        $paymentUrl = trim((string) ($invoice['hosted_invoice_url'] ?? ''));

        if (! $pending) {
            $this->addons->reconcileSubscription($account, $updated);
            $account->refresh();

            $periodEnd = isset($updated['current_period_end'])
                ? CarbonImmutable::createFromTimestamp((int) $updated['current_period_end'])
                : $account->current_period_end;

            $account->forceFill([
                'plan_key' => $planKey,
                'price_id' => $priceId,
                'billing_interval' => $interval,
                'quantity' => 1,
                'status' => (string) ($updated['status'] ?? $account->status),
                'cancel_at_period_end' => (bool) ($updated['cancel_at_period_end'] ?? false),
                'current_period_end' => $periodEnd,
            ])->save();
        }

        $display = is_array($plan['display'] ?? null) ? $plan['display'] : [];

        return [
            'changed' => true,
            'pending' => $pending,
            'payment_url' => $paymentUrl !== '' ? $paymentUrl : null,
            'plan_key' => $pending ? $account->plan_key : $planKey,
            'requested_plan_key' => $planKey,
            'interval' => $pending ? $account->billing_interval : $interval,
            'requested_interval' => $interval,
            'amount_minor' => max(0, (int) (
                $interval === 'year'
                    ? ($display['year_amount_minor'] ?? 0)
                    : ($display['month_amount_minor'] ?? 0)
            )),
            'currency' => strtoupper((string) ($display['currency'] ?? 'USD')),
        ];
    }

    /** @param array<string, mixed> $plan */
    private function assertSeatCapacity(Organization $organization, array $plan): void
    {
        $limits = is_array($plan['limits'] ?? null) ? $plan['limits'] : [];

        if (! isset($limits['seats'])) {
            return;
        }

        $includedSeats = max(0, (int) $limits['seats']);
        $extraSeats = 0;
        $active = $this->addons->activeForOrganization((int) $organization->id);
        $catalog = (array) config('billing_growth.addons', []);

        foreach ($active as $key => $row) {
            $addon = $catalog[$key] ?? null;

            if (is_array($addon) && ($addon['unit'] ?? null) === 'seats') {
                $extraSeats += max(0, (int) ($row['entitlement'] ?? 0));
            }
        }

        $usedSeats = (int) DB::table('memberships')
            ->where('organization_id', $organization->id)
            ->count();
        $newLimit = $includedSeats + $extraSeats;

        if ($usedSeats > $newLimit) {
            throw new RuntimeException(
                "This plan would allow {$newLimit} seats, but {$usedSeats} are currently in use. Remove members or keep enough extra seats before downgrading.",
            );
        }
    }

    /**
     * @param list<mixed> $items
     * @return array<string, mixed>|null
     */
    private function findBaseItem(array $items, BillingAccount $account): ?array
    {
        $accountPriceId = trim((string) $account->price_id);

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $priceId = trim((string) data_get($item, 'price.id', ''));

            if ($accountPriceId !== '' && $priceId !== '' && hash_equals($accountPriceId, $priceId)) {
                return $item;
            }
        }

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $priceId = trim((string) data_get($item, 'price.id', ''));

            if ($this->gateway->planForPrice($priceId) !== null) {
                return $item;
            }
        }

        return null;
    }

    /** @param array<string, mixed> $payload */
    private function postSubscription(string $subscriptionId, array $payload): array
    {
        $secret = trim((string) config('billing.stripe.secret', ''));
        $base = rtrim((string) config('billing.stripe.api_base', 'https://api.stripe.com'), '/');

        if ($secret === '') {
            throw new RuntimeException('Billing is not configured.');
        }

        $response = Http::asForm()
            ->withBasicAuth($secret, '')
            ->acceptJson()
            ->timeout(20)
            ->post(
                $base.'/v1/subscriptions/'.rawurlencode($subscriptionId),
                $payload,
            );

        if (! $response->successful()) {
            $this->throwProviderFailure($response);
        }

        return (array) $response->json();
    }

    private function throwProviderFailure(Response $response): never
    {
        $body = $response->json();
        $message = is_array($body)
            ? trim((string) data_get($body, 'error.message', ''))
            : '';

        throw new RuntimeException(
            $message !== ''
                ? $message
                : 'Stripe could not change the subscription plan.',
        );
    }
}
