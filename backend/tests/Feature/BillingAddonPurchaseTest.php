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

    public function test_owner_can_buy_seat_pack_on_existing_subscription(): void
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
            'billing_growth.addons.extra_seats_5.prices.month.lookup_key' => 'acconova_extra_seats_5_month',
        ]);

        Http::preventStrayRequests();
        Http::fake(function (Request $request) {
            if (str_contains($request->url(), '/v1/prices')) {
                return Http::response([
                    'data' => [[
                        'id' => 'price_extra_seats_5_month',
                        'product' => 'prod_seats',
                        'lookup_key' => 'acconova_extra_seats_5_month',
                        'unit_amount' => 2000,
                        'currency' => 'usd',
                        'recurring' => ['interval' => 'month'],
                    ]],
                ]);
            }

            if (
                $request->method() === 'POST'
                && str_contains($request->url(), '/v1/subscriptions/sub_addon')
            ) {
                return Http::response([
                    'id' => 'sub_addon',
                    'status' => 'active',
                    'items' => [
                        'data' => [
                            [
                                'id' => 'si_base',
                                'quantity' => 1,
                                'price' => [
                                    'id' => 'price_starter_monthly',
                                    'unit_amount' => 1900,
                                    'currency' => 'usd',
                                    'recurring' => ['interval' => 'month'],
                                ],
                            ],
                            [
                                'id' => 'si_seats',
                                'quantity' => 1,
                                'price' => [
                                    'id' => 'price_extra_seats_5_month',
                                    'lookup_key' => 'acconova_extra_seats_5_month',
                                    'unit_amount' => 2000,
                                    'currency' => 'usd',
                                    'recurring' => ['interval' => 'month'],
                                ],
                            ],
                        ],
                    ],
                    'latest_invoice' => [
                        'id' => 'in_addon',
                        'status' => 'paid',
                        'hosted_invoice_url' => 'https://billing-provider.test/invoices/in_addon',
                    ],
                    'pending_update' => null,
                ]);
            }

            if (str_contains($request->url(), '/v1/subscriptions/sub_addon')) {
                return Http::response([
                    'id' => 'sub_addon',
                    'customer' => 'cus_addon',
                    'status' => 'active',
                    'items' => [
                        'data' => [[
                            'id' => 'si_base',
                            'quantity' => 1,
                            'price' => [
                                'id' => 'price_starter_monthly',
                                'unit_amount' => 1900,
                                'currency' => 'usd',
                                'recurring' => ['interval' => 'month'],
                            ],
                        ]],
                    ],
                    'default_payment_method' => null,
                ]);
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

        $this->actingAs($owner)
            ->withSession($session)
            ->postJson('/api/billing/addons/purchase', [
                'addon' => 'extra_seats_5',
                'quantity' => 1,
            ])
            ->assertOk()
            ->assertJsonPath('data.quantity', 1)
            ->assertJsonPath('data.pending', false);

        $this->assertDatabaseHas('billing_growth_addons', [
            'organization_id' => $organization->id,
            'addon_key' => 'extra_seats_5',
            'quantity' => 1,
            'status' => 'active',
            'provider_subscription_item_id' => 'si_seats',
            'price_id' => 'price_extra_seats_5_month',
        ]);

        $this->actingAs($owner)
            ->withSession($session)
            ->getJson('/api/billing/overview')
            ->assertOk()
            ->assertJsonPath('data.usage.seats.limit', 8)
            ->assertJsonPath('data.addons.catalog.0.active_quantity', 1);

        Http::assertSent(function (Request $request): bool {
            return $request->method() === 'POST'
                && str_contains($request->url(), '/v1/subscriptions/sub_addon')
                && $request['proration_behavior'] === 'always_invoice'
                && $request['payment_behavior'] === 'pending_if_incomplete';
        });
    }
}
