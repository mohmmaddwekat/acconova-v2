<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use App\Services\Billing\WorkspaceSubscriptionAccess;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingGrowthEngineTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_owner_receives_tenant_safe_growth_snapshot(): void
    {
        [$owner, $organization] = $this->workspace();

        config([
            'billing.enabled' => true,
            'billing.enforce_subscription' => true,
            'billing.stripe.secret' => 'sk_test_do_not_expose',
            'billing.stripe.webhook_secret' => 'whsec_do_not_expose',
        ]);

        Http::preventStrayRequests();

        $response = $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->getJson('/api/billing/growth')
            ->assertOk()
            ->assertJsonPath('data.health.score', 100)
            ->assertJsonPath('data.recommendation.plan_key', 'starter')
            ->assertJsonPath('data.usage.seats.used', 1)
            ->assertJsonPath('data.soft_lock.read_only', false)
            ->assertJsonPath('data.recovery.required', false)
            ->assertJsonPath('data.addons.catalog.0.enabled', false);

        $payload = strtolower($response->getContent());

        $this->assertStringNotContainsString('stripe', $payload);
        $this->assertStringNotContainsString('sk_test', $payload);
        $this->assertStringNotContainsString('whsec_', $payload);
        $this->assertDatabaseHas('billing_growth_profiles', [
            'organization_id' => $organization->id,
            'health_score' => 100,
        ]);
    }

    public function test_cancel_flow_schedules_period_end_and_records_reason(): void
    {
        [$owner, $organization] = $this->workspace();

        BillingAccount::create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_growth_test',
            'provider_subscription_id' => 'sub_growth_test',
            'plan_key' => 'business',
            'billing_interval' => 'month',
            'status' => 'trialing',
            'amount_minor' => 4900,
            'currency' => 'USD',
            'current_period_start' => now(),
            'current_period_end' => now()->addDays(14),
            'trial_ends_at' => now()->addDays(14),
        ]);

        config([
            'billing.enabled' => true,
            'billing.enforce_subscription' => true,
            'billing.stripe.secret' => 'sk_test_growth',
            'billing.stripe.api_base' => 'https://billing-provider.test',
        ]);

        Http::fake([
            'https://billing-provider.test/v1/subscriptions/sub_growth_test' => Http::response([
                'id' => 'sub_growth_test',
                'status' => 'trialing',
                'cancel_at_period_end' => true,
            ]),
        ]);

        $session = [
            OrganizationAccess::SESSION_KEY => $organization->id,
        ];

        $this->actingAs($owner)
            ->withSession($session)
            ->getJson('/api/billing/growth')
            ->assertOk();

        $this->actingAs($owner)
            ->withSession($session)
            ->postJson('/api/billing/growth/cancel', [
                'reason' => 'temporary',
                'feedback' => 'Pause for now',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true);

        Http::assertSent(function ($request): bool {
            return $request->url()
                === 'https://billing-provider.test/v1/subscriptions/sub_growth_test'
                && $request['cancel_at_period_end'] === 'true';
        });

        $this->assertDatabaseHas('billing_growth_profiles', [
            'organization_id' => $organization->id,
            'cancel_reason' => 'temporary',
            'cancel_feedback' => 'Pause for now',
        ]);
    }

    public function test_read_only_profile_soft_locks_mutations_but_keeps_reads_available(): void
    {
        [, $organization] = $this->workspace();

        BillingAccount::create([
            'organization_id' => $organization->id,
            'provider_subscription_id' => 'sub_paused',
            'status' => 'active',
            'plan_key' => 'business',
        ]);

        DB::table('billing_growth_profiles')->insert([
            'organization_id' => $organization->id,
            'health_score' => 100,
            'failed_payment_count' => 0,
            'read_only' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        config([
            'billing.enabled' => true,
            'billing.enforce_subscription' => true,
            'billing_growth.soft_lock' => true,
        ]);

        $access = app(WorkspaceSubscriptionAccess::class);

        $this->assertFalse(
            $access->organizationHasAccess((int) $organization->id),
        );

        $get = Request::create('/app/products', 'GET');
        $post = Request::create('/api/products', 'POST');

        $this->assertNull(
            $access->blockedResponse(
                $get,
                (int) $organization->id,
                'owner',
            ),
        );

        $response = $access->blockedResponse(
            $post,
            (int) $organization->id,
            'owner',
        );

        $this->assertNotNull($response);
        $this->assertSame(402, $response->getStatusCode());
        $this->assertStringContainsString(
            'SUBSCRIPTION_READ_ONLY',
            (string) $response->getContent(),
        );
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(): array
    {
        $owner = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Growth Billing Workspace',
        ]);

        $organization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        return [$owner, $organization];
    }
}
