<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingOverviewTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_owner_sees_local_plan_catalog_without_provider_requests_or_secrets(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Billing Workspace',
        ]);

        $otherOrganization = Organization::create([
            'name' => 'Other Workspace',
        ]);

        $organization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        $otherOrganization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        $otherOrganization->users()->attach($otherUser->id, [
            'role' => 'employee',
        ]);

        config([
            'billing.enabled' => true,
            'billing.provider' => 'stripe',
            'billing.stripe.key' => 'pk_test_public',
            'billing.stripe.secret' => 'sk_test_super_secret',
            'billing.stripe.webhook_secret' => 'whsec_super_secret',
            'billing.plans.starter.prices.month' => 'price_starter_monthly',
            'billing.plans.starter.prices.year' => 'price_starter_yearly',
            'billing.plans.business.prices.month' => 'price_business_monthly',
            'billing.plans.business.prices.year' => 'price_business_yearly',
            'billing.plans.scale.prices.month' => 'price_scale_monthly',
            'billing.plans.scale.prices.year' => 'price_scale_yearly',
        ]);

        Http::preventStrayRequests();

        $response = $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->getJson('/api/billing/overview')
            ->assertOk()
            ->assertJsonPath('data.payments_available', true)
            ->assertJsonMissingPath('data.provider')
            ->assertJsonPath('data.usage.seats.used', 1)
            ->assertJsonPath('data.subscription', null)
            ->assertJsonPath('data.next_invoice', null)
            ->assertJsonPath('data.payment_method', null)
            ->assertJsonPath('data.plans.0.key', 'starter')
            ->assertJsonPath('data.plans.0.month.amount_minor', 1900)
            ->assertJsonPath('data.plans.0.month.currency', 'USD')
            ->assertJsonPath('data.plans.0.month.available', true)
            ->assertJsonPath('data.plans.1.key', 'business')
            ->assertJsonPath('data.plans.1.month.amount_minor', 4900)
            ->assertJsonPath('data.plans.1.recommended', true)
            ->assertJsonPath('data.plans.2.key', 'scale')
            ->assertJsonPath('data.plans.2.month.amount_minor', 9900);

        $payload = $response->getContent();

        $this->assertStringContainsString('حتى 3 مستخدمين', $payload);
        $this->assertStringNotContainsString('price_starter_monthly', $payload);
        $this->assertStringNotContainsString('sk_test_super_secret', $payload);
        $this->assertStringNotContainsString('whsec_super_secret', $payload);
        $this->assertStringNotContainsString('stripe', strtolower($payload));
        $this->assertStringNotContainsString('webhook', strtolower($payload));
    }

    public function test_plan_prices_remain_visible_when_checkout_is_temporarily_unavailable(): void
    {
        [$owner, $organization] = $this->workspace();

        config([
            'billing.enabled' => false,
            'billing.stripe.secret' => null,
            'billing.stripe.webhook_secret' => null,
        ]);

        Http::preventStrayRequests();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->getJson('/api/billing/overview')
            ->assertOk()
            ->assertJsonPath('data.payments_available', false)
            ->assertJsonPath('data.plans.0.month.amount_minor', 1900)
            ->assertJsonPath('data.plans.0.month.currency', 'USD')
            ->assertJsonPath('data.plans.0.month.available', false)
            ->assertJsonPath('data.plans.1.month.amount_minor', 4900)
            ->assertJsonPath('data.plans.2.month.amount_minor', 9900);
    }

    /**
     * @return array{0: User, 1: Organization}
     */
    private function workspace(): array
    {
        $owner = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Billing Catalog Workspace',
        ]);

        $organization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        return [$owner, $organization];
    }
}
