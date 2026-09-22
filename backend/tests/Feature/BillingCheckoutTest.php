<?php

namespace Tests\Feature;

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
        $owner = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Billing Checkout Workspace',
        ]);

        $organization->users()->attach(
            $owner->id,
            [
                'role' => 'owner',
            ],
        );

        return [$owner, $organization];
    }
}
