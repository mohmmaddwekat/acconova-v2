<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\BillingManualPayment;
use App\Models\Organization;
use App\Models\User;
use App\Services\Billing\WorkspaceSubscriptionAccess;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlatformManualPaymentTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_platform_admin_can_record_manual_payment_and_activate_subscription(): void
    {
        Carbon::setTestNow('2026-09-28 12:00:00');

        $admin = $this->platformAdmin();
        $organization = Organization::create(['name' => 'Manual Billing Co']);

        $response = $this
            ->actingAs($admin)
            ->postJson('/admin/manual-payments', [
                'organization_id' => $organization->id,
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'period_count' => 2,
                'method' => 'cash',
                'reference' => 'CASH-1001',
            ]);

        $response
            ->assertCreated()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('payment.amount_minor', 3800)
            ->assertJsonPath('payment.currency', 'USD')
            ->assertJsonPath('payment.plan_key', 'starter');

        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->firstOrFail();

        $this->assertSame('manual', $account->billing_source);
        $this->assertSame('active', $account->status);
        $this->assertSame('starter', $account->plan_key);
        $this->assertSame('month', $account->billing_interval);
        $this->assertSame(1900, $account->amount_minor);
        $this->assertSame('2026-09-28 12:00:00', $account->current_period_start?->format('Y-m-d H:i:s'));
        $this->assertSame('2026-11-28 12:00:00', $account->current_period_end?->format('Y-m-d H:i:s'));

        $this->assertDatabaseHas('billing_manual_payments', [
            'organization_id' => $organization->id,
            'billing_account_id' => $account->id,
            'recorded_by_user_id' => $admin->id,
            'method' => 'cash',
            'reference' => 'CASH-1001',
            'status' => 'confirmed',
            'amount_minor' => 3800,
            'currency' => 'USD',
        ]);
    }

    public function test_early_manual_renewal_extends_from_existing_expiry(): void
    {
        Carbon::setTestNow('2026-09-28 12:00:00');

        $admin = $this->platformAdmin();
        $organization = Organization::create(['name' => 'Renewal Co']);

        BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'billing_source' => 'manual',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'status' => 'active',
            'amount_minor' => 1900,
            'currency' => 'USD',
            'current_period_start' => '2026-09-15 09:00:00',
            'current_period_end' => '2026-10-15 09:00:00',
        ]);

        $this
            ->actingAs($admin)
            ->postJson('/admin/manual-payments', [
                'organization_id' => $organization->id,
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'period_count' => 1,
                'method' => 'bank_transfer',
                'reference' => 'BANK-RENEW-1',
            ])
            ->assertCreated();

        $payment = BillingManualPayment::query()
            ->where('reference', 'BANK-RENEW-1')
            ->firstOrFail();

        $this->assertSame('2026-10-15 09:00:00', $payment->service_period_start?->format('Y-m-d H:i:s'));
        $this->assertSame('2026-11-15 09:00:00', $payment->service_period_end?->format('Y-m-d H:i:s'));
        $this->assertSame(
            '2026-11-15 09:00:00',
            BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->firstOrFail()
                ->current_period_end?->format('Y-m-d H:i:s'),
        );
    }

    public function test_duplicate_manual_payment_reference_is_rejected_without_extending_again(): void
    {
        Carbon::setTestNow('2026-09-28 12:00:00');

        $admin = $this->platformAdmin();
        $organization = Organization::create(['name' => 'Duplicate Guard Co']);
        $payload = [
            'organization_id' => $organization->id,
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'period_count' => 1,
            'method' => 'bank_transfer',
            'reference' => 'UNIQUE-TRANSFER-55',
        ];

        $this->actingAs($admin)->postJson('/admin/manual-payments', $payload)->assertCreated();

        $firstExpiry = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->firstOrFail()
            ->current_period_end?->toDateTimeString();

        $this
            ->actingAs($admin)
            ->postJson('/admin/manual-payments', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['reference']);

        $this->assertSame(
            1,
            BillingManualPayment::query()
                ->where('organization_id', $organization->id)
                ->count(),
        );
        $this->assertSame(
            $firstExpiry,
            BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->firstOrFail()
                ->current_period_end?->toDateTimeString(),
        );
    }

    public function test_active_stripe_subscription_cannot_be_replaced_by_manual_payment(): void
    {
        $admin = $this->platformAdmin();
        $organization = Organization::create(['name' => 'Stripe Protected Co']);

        BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'billing_source' => 'stripe',
            'provider_subscription_id' => 'sub_live_123',
            'status' => 'active',
            'plan_key' => 'business',
            'billing_interval' => 'month',
        ]);

        $this
            ->actingAs($admin)
            ->postJson('/admin/manual-payments', [
                'organization_id' => $organization->id,
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'period_count' => 1,
                'method' => 'cash',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['organization_id']);

        $this->assertDatabaseCount('billing_manual_payments', 0);
        $this->assertSame(
            'sub_live_123',
            BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->value('provider_subscription_id'),
        );
    }

    public function test_manual_subscription_access_expires_with_its_paid_period(): void
    {
        Carbon::setTestNow('2026-09-28 12:00:00');
        config([
            'billing.enabled' => true,
            'billing.enforce_subscription' => true,
        ]);

        $organization = Organization::create(['name' => 'Expiry Co']);
        $account = BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'billing_source' => 'manual',
            'status' => 'active',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'current_period_start' => now()->subMonth(),
            'current_period_end' => now()->addDay(),
        ]);

        $access = app(WorkspaceSubscriptionAccess::class);
        $this->assertTrue($access->organizationHasAccess((int) $organization->id));

        $account->forceFill([
            'current_period_end' => now()->subSecond(),
        ])->save();

        $this->assertFalse($access->organizationHasAccess((int) $organization->id));
    }

    public function test_normal_user_cannot_record_manual_subscription_payment(): void
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => 'Forbidden Co']);

        $this
            ->actingAs($user)
            ->postJson('/admin/manual-payments', [
                'organization_id' => $organization->id,
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'period_count' => 1,
                'method' => 'cash',
            ])
            ->assertForbidden();
    }

    private function platformAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->forceFill([
            'platform_role' => User::PLATFORM_ROLE_ADMIN,
        ])->save();

        return $admin;
    }
}
