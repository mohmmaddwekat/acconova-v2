<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\BillingManualPayment;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BillingManualPaymentRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_submit_pending_manual_payment_request_without_activating_subscription(): void
    {
        [$owner, $organization] = $this->workspace();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/manual-payment-requests', [
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'method' => 'mobile_wallet',
                'reference' => 'WALLET-REQ-1',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.method', 'mobile_wallet')
            ->assertJsonPath('data.amount_minor', 1900);

        $payment = BillingManualPayment::query()->firstOrFail();

        $this->assertSame('pending', $payment->status);
        $this->assertSame($owner->id, $payment->requested_by_user_id);
        $this->assertNull($payment->paid_at);
        $this->assertNull($payment->confirmed_at);
        $this->assertNull($payment->service_period_start);
        $this->assertNull($payment->service_period_end);
        $this->assertFalse(
            BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->exists(),
        );
    }

    public function test_resubmitting_changes_same_pending_request_instead_of_creating_duplicate(): void
    {
        [$owner, $organization] = $this->workspace();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/manual-payment-requests', [
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'method' => 'bank_transfer',
            ])
            ->assertCreated();

        $firstId = BillingManualPayment::query()->value('id');

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/manual-payment-requests', [
                'plan_key' => 'business',
                'billing_interval' => 'year',
                'method' => 'cash',
                'notes' => 'Changed my payment method.',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $firstId)
            ->assertJsonPath('data.plan_key', 'business')
            ->assertJsonPath('data.billing_interval', 'year')
            ->assertJsonPath('data.method', 'cash');

        $this->assertDatabaseCount('billing_manual_payments', 1);
        $this->assertDatabaseHas('billing_manual_payments', [
            'id' => $firstId,
            'organization_id' => $organization->id,
            'status' => 'pending',
            'method' => 'cash',
            'plan_key' => 'business',
            'billing_interval' => 'year',
        ]);
    }

    public function test_cheque_is_not_an_available_manual_payment_method(): void
    {
        [$owner, $organization] = $this->workspace();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/manual-payment-requests', [
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'method' => 'cheque',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['method']);

        $this->assertDatabaseCount('billing_manual_payments', 0);
    }

    public function test_customer_can_cancel_pending_manual_payment_request(): void
    {
        [$owner, $organization] = $this->workspace();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/manual-payment-requests', [
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'method' => 'cash',
            ])
            ->assertCreated();

        $payment = BillingManualPayment::query()->firstOrFail();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->deleteJson('/api/billing/manual-payment-requests/'.$payment->id)
            ->assertOk();

        $this->assertDatabaseHas('billing_manual_payments', [
            'id' => $payment->id,
            'status' => 'cancelled',
        ]);
        $this->assertFalse(
            BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->exists(),
        );
    }

    public function test_platform_admin_can_approve_pending_request_and_activate_subscription(): void
    {
        [$owner, $organization] = $this->workspace();
        $admin = $this->platformAdmin();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/manual-payment-requests', [
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'method' => 'bank_transfer',
                'reference' => 'TRANSFER-APPROVE-1',
            ])
            ->assertCreated();

        $payment = BillingManualPayment::query()->firstOrFail();

        $this
            ->actingAs($admin)
            ->postJson('/admin/manual-payments/'.$payment->id.'/approve')
            ->assertOk()
            ->assertJsonPath('payment.status', 'confirmed')
            ->assertJsonPath('payment.method', 'bank_transfer');

        $payment->refresh();
        $this->assertSame('confirmed', $payment->status);
        $this->assertSame($admin->id, $payment->reviewed_by_user_id);
        $this->assertSame($admin->id, $payment->recorded_by_user_id);
        $this->assertNotNull($payment->paid_at);
        $this->assertNotNull($payment->confirmed_at);

        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->firstOrFail();

        $this->assertSame('manual', $account->billing_source);
        $this->assertSame('active', $account->status);
        $this->assertSame('starter', $account->plan_key);
        $this->assertNotNull($account->current_period_end);
    }

    public function test_rejecting_pending_request_does_not_activate_subscription(): void
    {
        [$owner, $organization] = $this->workspace();
        $admin = $this->platformAdmin();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/manual-payment-requests', [
                'plan_key' => 'starter',
                'billing_interval' => 'month',
                'method' => 'cash',
            ])
            ->assertCreated();

        $payment = BillingManualPayment::query()->firstOrFail();

        $this
            ->actingAs($admin)
            ->postJson('/admin/manual-payments/'.$payment->id.'/reject', [
                'reason' => 'Payment was not received.',
            ])
            ->assertOk()
            ->assertJsonPath('payment.status', 'rejected');

        $this->assertDatabaseHas('billing_manual_payments', [
            'id' => $payment->id,
            'status' => 'rejected',
            'reviewed_by_user_id' => $admin->id,
        ]);
        $this->assertFalse(
            BillingAccount::query()
                ->where('organization_id', $organization->id)
                ->exists(),
        );
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(): array
    {
        $user = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Manual Payment Request Workspace',
        ]);

        $organization->users()->attach($user->id, [
            'role' => 'owner',
        ]);

        return [$user, $organization];
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
