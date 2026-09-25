<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingCheckoutTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_owner_can_start_hosted_subscription_checkout(): void
    {
        [$owner, $organization] = $this->workspace();

        $this->configureBilling();

        Http::preventStrayRequests();
        Http::fake([
            'https://billing.example.test/v1/checkout/sessions' => Http::response([
                'id' => 'cs_test_123',
                'url' => 'https://checkout.example.test/session',
            ]),
        ]);

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/checkout', [
                'plan' => 'starter',
                'interval' => 'month',
            ])
            ->assertOk()
            ->assertJsonPath(
                'data.url',
                'https://checkout.example.test/session',
            );

        Http::assertSent(
            function ($request) use ($organization): bool {
                return $request->url()
                    === 'https://billing.example.test/v1/checkout/sessions'
                    && $request['mode'] === 'subscription'
                    && $request['client_reference_id']
                        === (string) $organization->id
                    && data_get(
                        $request->data(),
                        'line_items.0.price',
                    ) === 'price_starter_monthly'
                    && data_get(
                        $request->data(),
                        'metadata.organization_id',
                    ) === (string) $organization->id;
            },
        );
    }

    public function test_update_payment_opens_dedicated_stripe_payment_method_flow(): void
    {
        [$owner, $organization] = $this->workspace();

        $this->configureBilling();

        BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_payment_update',
            'status' => 'active',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://billing.example.test/v1/billing_portal/sessions' => Http::response([
                'id' => 'bps_test_123',
                'url' => 'https://billing.stripe.test/payment-method',
            ]),
        ]);

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/portal')
            ->assertOk()
            ->assertJsonPath(
                'data.url',
                'https://billing.stripe.test/payment-method',
            );

        Http::assertSent(
            fn ($request): bool =>
                $request->url() === 'https://billing.example.test/v1/billing_portal/sessions'
                && data_get($request->data(), 'customer') === 'cus_payment_update'
                && data_get($request->data(), 'flow_data.type') === 'payment_method_update'
                && data_get($request->data(), 'flow_data.after_completion.type') === 'redirect'
                && str_ends_with(
                    (string) data_get($request->data(), 'flow_data.after_completion.redirect.return_url'),
                    '/app/billing',
                ),
        );
    }

    public function test_checkout_recovers_from_stale_provider_customer_reference(): void
    {
        [$owner, $organization] = $this->workspace();

        $this->configureBilling();

        BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_stale',
            'status' => null,
        ]);

        Http::preventStrayRequests();
        Http::fakeSequence()
            ->push([
                'error' => [
                    'code' => 'resource_missing',
                    'param' => 'customer',
                ],
            ], 400)
            ->push([
                'id' => 'cs_test_recovered',
                'url' => 'https://checkout.example.test/recovered',
            ]);

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/checkout', [
                'plan' => 'starter',
                'interval' => 'month',
            ])
            ->assertOk()
            ->assertJsonPath(
                'data.url',
                'https://checkout.example.test/recovered',
            );

        $this->assertNull(
            BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->value('provider_customer_id'),
        );

        Http::assertSentCount(2);

        $requests = Http::recorded();

        $this->assertSame(
            'cus_stale',
            data_get($requests[0][0]->data(), 'customer'),
        );
        $this->assertNull(
            data_get($requests[1][0]->data(), 'customer'),
        );
        $this->assertSame(
            $owner->email,
            data_get($requests[1][0]->data(), 'customer_email'),
        );
    }

    public function test_checkout_rejects_unconfigured_plan_interval(): void
    {
        [$owner, $organization] = $this->workspace();

        $this->configureBilling();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/checkout', [
                'plan' => 'starter',
                'interval' => 'year',
            ])
            ->assertStatus(503)
            ->assertJsonPath(
                'code',
                'BILLING_UNAVAILABLE',
            );
    }

    private function configureBilling(): void
    {
        config([
            'billing.enabled' => true,
            'billing.stripe.secret' => 'sk_test_server_only',
            'billing.stripe.webhook_secret' => 'whsec_test',
            'billing.stripe.api_base' => 'https://billing.example.test',
            'billing.trial_days' => 0,
            'billing.plans.starter.prices.month' => 'price_starter_monthly',
            'billing.plans.starter.prices.year' => null,
        ]);
    }

    /**
     * @return array{0: User, 1: Organization}
     */
    private function workspace(): array
    {
        $user = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Billing Checkout Workspace',
        ]);

        $organization->users()->attach(
            $user->id,
            [
                'role' => 'owner',
            ],
        );

        return [$user, $organization];
    }
}
