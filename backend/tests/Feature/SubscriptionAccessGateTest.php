<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubscriptionAccessGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_without_subscription_is_redirected_to_billing(): void
    {
        [$owner, $organization] = $this->workspace('owner');

        $this->enableGate();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get('/app')
            ->assertRedirect('/app/billing');

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get('/app/billing')
            ->assertOk();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get('/app/profile')
            ->assertOk();
    }

    public function test_single_workspace_is_gated_even_when_session_selection_was_lost(): void
    {
        [$owner, $organization] = $this->workspace('owner');

        $this->enableGate();

        $this
            ->actingAs($owner)
            ->get('/app')
            ->assertRedirect('/app/billing')
            ->assertSessionHas(
                OrganizationAccess::SESSION_KEY,
                $organization->id,
            );
    }

    public function test_employee_without_subscription_gets_workspace_lock_screen(): void
    {
        [$employee, $organization] = $this->workspace('employee');

        $this->enableGate();

        $this
            ->actingAs($employee)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get('/app')
            ->assertRedirect('/app/subscription-required');

        $this
            ->actingAs($employee)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get('/app/subscription-required')
            ->assertOk();
    }

    public function test_inactive_subscription_blocks_tenant_api_but_billing_api_remains_available(): void
    {
        [$owner, $organization] = $this->workspace('owner');

        $this->enableGate();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->getJson('/api/departments')
            ->assertStatus(402)
            ->assertJsonPath(
                'code',
                'SUBSCRIPTION_REQUIRED',
            )
            ->assertJsonPath(
                'billing_url',
                '/app/billing',
            );

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->getJson('/api/billing/overview')
            ->assertOk();
    }

    public function test_active_and_trialing_subscriptions_allow_workspace_access(): void
    {
        foreach (['active', 'trialing'] as $status) {
            [$owner, $organization] = $this->workspace('owner');

            $this->enableGate();

            BillingAccount::query()->create([
                'organization_id' => $organization->id,
                'status' => $status,
            ]);

            $this
                ->actingAs($owner)
                ->withSession([
                    OrganizationAccess::SESSION_KEY => $organization->id,
                ])
                ->get('/app')
                ->assertOk();

            $this
                ->actingAs($owner)
                ->withSession([
                    OrganizationAccess::SESSION_KEY => $organization->id,
                ])
                ->getJson('/api/departments')
                ->assertOk();

            $this->app['auth']->forgetGuards();
        }
    }

    public function test_canceled_subscription_is_blocked(): void
    {
        [$owner, $organization] = $this->workspace('owner');

        $this->enableGate();

        BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'status' => 'canceled',
        ]);

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get('/app')
            ->assertRedirect('/app/billing');
    }

    public function test_gate_can_be_disabled_without_disabling_billing_code(): void
    {
        [$owner, $organization] = $this->workspace('owner');

        config([
            'billing.enabled' => true,
            'billing.enforce_subscription' => false,
        ]);

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get('/app')
            ->assertOk();
    }

    private function enableGate(): void
    {
        config([
            'billing.enabled' => true,
            'billing.enforce_subscription' => true,
            'billing.stripe.secret' => null,
            'billing.stripe.webhook_secret' => null,
        ]);
    }

    /**
     * @return array{0: User, 1: Organization}
     */
    private function workspace(string $role): array
    {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Subscription Gate Workspace',
        ]);

        $organization->users()->attach(
            $user->id,
            [
                'role' => $role,
            ],
        );

        return [$user, $organization];
    }
}
