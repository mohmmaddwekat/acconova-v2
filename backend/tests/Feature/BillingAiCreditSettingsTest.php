<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingAiCreditSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_change_and_disable_auto_recharge_without_buying_more_credits(): void
    {
        $owner = User::factory()->create();
        $organization = Organization::create([
            'name' => 'AI Wallet Workspace',
        ]);
        $organization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        $session = [
            OrganizationAccess::SESSION_KEY => $organization->id,
        ];

        $this->actingAs($owner)
            ->withSession($session)
            ->putJson('/api/billing/ai-credits/auto-recharge', [
                'enabled' => true,
                'threshold_tokens' => 250000,
                'amount_minor' => 1000,
            ])
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.threshold_tokens', 250000)
            ->assertJsonPath('data.recharge_amount_minor', 1000)
            ->assertJsonPath('data.recharge_tokens', 500000);

        $this->assertDatabaseHas('billing_ai_wallets', [
            'organization_id' => $organization->id,
            'auto_recharge_enabled' => 1,
            'auto_recharge_threshold_tokens' => 250000,
            'auto_recharge_amount_minor' => 1000,
            'auto_recharge_tokens' => 500000,
        ]);

        $this->actingAs($owner)
            ->withSession($session)
            ->putJson('/api/billing/ai-credits/auto-recharge', [
                'enabled' => false,
                'threshold_tokens' => 250000,
                'amount_minor' => 1000,
            ])
            ->assertOk()
            ->assertJsonPath('data.enabled', false);

        $this->assertDatabaseHas('billing_ai_wallets', [
            'organization_id' => $organization->id,
            'auto_recharge_enabled' => 0,
            'auto_recharge_amount_minor' => 1000,
            'auto_recharge_tokens' => 500000,
        ]);
    }
}
