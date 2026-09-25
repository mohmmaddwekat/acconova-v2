<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingAddonPurchaseTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_owner_can_set_exact_seat_quantity_reduce_it_and_remove_it(): void
    {
        $owner = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Add-on Workspace',
        ]);
        $organization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        config([
            'billing.enabled' => true,
            'billing.stripe.secret' => 'sk_test_addons',
            'billing.stripe.webhook_secret' => 'whsec_addons',
            'billing.stripe.api_base' => 'https://billing-provider.test',
            'billing.plans.starter.prices.month' => 'price_starter_monthly',
            'billing_growth.addons.extra_seats_5.prices.month.price_id' => null,
            'billing_growth.addons.extra_seats_5.prices.month.lookup_key' => 'acconova_extra_seat_v2_month',
            'billing_growth.addons.extra_seats_5.prices.month.amount_minor' => 200,
            'billing_growth.addons.extra_seats_5.quantity' => 1,
            'billing_growth.addons.extra_seats_5.display_bundle_quantity' => 5,
            'billing_growth.addons.extra_seats_5.max_quantity' => 500,
        ]);

        $providerSeatQuantity = 5;

        Http::preventStrayRequests();
        Http::fake(function (Request $request) use (&$providerSeatQuantity) {
            if (str_contains($request->url(), '/v1/prices')) {
                return Http::response([
                    'data' => [[
                        'id' => 'price_extra_seat_month',
                        'product' => 'prod_seats',
                        'lookup_key' => 'acconova_extra_seat_v2_month',
                        'unit_amount' => 200,
                        'currency' => 'usd',
                        'recurring' => ['interval' => 'month'],
                    ]],
                ]);
            }

            if (
                $request->method() === 'POST'
                && str_contains($request->url(), '/v1/subscriptions/sub_addon')
            ) {
                $item = $request['items'][0] ?? [];
                $providerSeatQuantity = ($item['deleted'] ?? null) === 'true'
                    ? 0
                    : max(0, (int) ($item['quantity'] ?? $providerSeatQuantity));

                return Http::response($this->subscriptionPayload($providerSeatQuantity));
            }

            if (str_contains($request->url(), '/v1/subscriptions/sub_addon')) {
                return Http::response($this->subscriptionPayload($providerSeatQuantity));
            }

            return Http::response([], 404);
        });

        BillingAccount::create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_addon',
            'provider_subscription_id' => 'sub_addon',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'status' => 'active',
            'price_id' => 'price_starter_monthly',
            'quantity' => 1,
            'amount_minor' => 1900,
            'currency' => 'USD',
            'current_period_start' => now(),
            'current_period_end' => now()->addMonth(),
        ]);

        $session = [
            OrganizationAccess::SESSION_KEY => $organization->id,
        ];

        /* Existing Stripe quantity is 5; customer chooses the exact final value 3. */
        $this->actingAs($owner)
            ->withSession($session)
            ->postJson('/api/billing/addons/purchase', [
                'addon' => 'extra_seats_5',
                'target_quantity' => 3,
            ])
            ->assertOk()
            ->assertJsonPath('data.previous_quantity', 5)
            ->assertJsonPath('data.quantity', 3)
            ->assertJsonPath('data.quantity_delta', -2)
            ->assertJsonPath('data.pending', false);

        $this->assertDatabaseHas('billing_growth_addons', [
            'organization_id' => $organization->id,
            'addon_key' => 'extra_seats_5',
            'quantity' => 3,
            'status' => 'active',
            'provider_subscription_item_id' => 'si_seats',
            'price_id' => 'price_extra_seat_month',
            'amount_minor' => 200,
        ]);

        $this->actingAs($owner)
            ->withSession($session)
            ->getJson('/api/billing/overview')
            ->assertOk()
            ->assertJsonPath('data.usage.seats.limit', 6)
            ->assertJsonPath('data.addons.catalog.0.active_quantity', 3)
            ->assertJsonPath('data.addons.catalog.0.amount_minor', 1000)
            ->assertJsonPath('data.addons.catalog.0.unit_amount_minor', 200);

        /* Quantity zero removes the recurring Stripe item completely. */
        $this->actingAs($owner)
            ->withSession($session)
            ->postJson('/api/billing/addons/purchase', [
                'addon' => 'extra_seats_5',
                'target_quantity' => 0,
            ])
            ->assertOk()
            ->assertJsonPath('data.previous_quantity', 3)
            ->assertJsonPath('data.quantity', 0)
            ->assertJsonPath('data.quantity_delta', -3);

        $this->assertDatabaseHas('billing_growth_addons', [
            'organization_id' => $organization->id,
            'addon_key' => 'extra_seats_5',
            'quantity' => 0,
            'status' => 'inactive',
        ]);

        $this->actingAs($owner)
            ->withSession($session)
            ->getJson('/api/billing/overview')
            ->assertOk()
            ->assertJsonPath('data.usage.seats.limit', 3);

        Http::assertSent(function (Request $request): bool {
            return $request->method() === 'POST'
                && str_contains($request->url(), '/v1/subscriptions/sub_addon')
                && (int) data_get($request->data(), 'items.0.quantity') === 3
                && $request['proration_behavior'] === 'always_invoice'
                && $request['payment_behavior'] === 'pending_if_incomplete';
        });

        Http::assertSent(function (Request $request): bool {
            return $request->method() === 'POST'
                && str_contains($request->url(), '/v1/subscriptions/sub_addon')
                && data_get($request->data(), 'items.0.deleted') === 'true';
        });
    }

    /** @return array<string, mixed> */
    private function subscriptionPayload(int $seatQuantity): array
    {
        $items = [[
            'id' => 'si_base',
            'quantity' => 1,
            'price' => [
                'id' => 'price_starter_monthly',
                'unit_amount' => 1900,
                'currency' => 'usd',
                'recurring' => ['interval' => 'month'],
            ],
        ]];

        if ($seatQuantity > 0) {
            $items[] = [
                'id' => 'si_seats',
                'quantity' => $seatQuantity,
                'price' => [
                    'id' => 'price_extra_seat_month',
                    'lookup_key' => 'acconova_extra_seat_v2_month',
                    'unit_amount' => 200,
                    'currency' => 'usd',
                    'recurring' => ['interval' => 'month'],
                ],
            ];
        }

        return [
            'id' => 'sub_addon',
            'customer' => 'cus_addon',
            'status' => 'active',
            'items' => ['data' => $items],
            'default_payment_method' => null,
            'latest_invoice' => [
                'id' => 'in_addon',
                'status' => 'paid',
                'hosted_invoice_url' => 'https://billing-provider.test/invoices/in_addon',
            ],
            'pending_update' => null,
        ];
    }
}
