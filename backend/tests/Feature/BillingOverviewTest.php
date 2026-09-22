<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingOverviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_sees_only_current_workspace_usage_and_no_stripe_secrets(): void
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
        ]);

        $response = $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->getJson('/api/billing/overview')
            ->assertOk()
            ->assertJsonPath('data.provider.name', 'stripe')
            ->assertJsonPath('data.provider.credentials_configured', true)
            ->assertJsonPath('data.provider.webhook_configured', true)
            ->assertJsonPath('data.provider.mode', 'test')
            ->assertJsonPath('data.provider.state', 'ready_for_sync')
            ->assertJsonPath('data.usage.seats.used', 1)
            ->assertJsonPath('data.subscription', null)
            ->assertJsonPath('data.next_invoice', null)
            ->assertJsonPath('data.payment_method', null);

        $payload = $response->getContent();

        $this->assertStringNotContainsString('sk_test_super_secret', $payload);
        $this->assertStringNotContainsString('whsec_super_secret', $payload);
    }
}
