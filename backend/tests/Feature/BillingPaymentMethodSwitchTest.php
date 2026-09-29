<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\BillingManualPayment;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingPaymentMethodSwitchTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_active_prepaid_manual_period_is_not_replaced_early_by_stripe(): void
    {
        [$owner, $organization] = $this->workspace();
        $this->configureBilling();

        BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'billing_source' => 'manual',
            'status' => 'active',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'amount_minor' => 1900,
            'currency' => 'USD',
            'current_period_start' => now()->subDay(),
            'current_period_end' => now()->addDays(20),
        ]);

        Http::preventStrayRequests();

        $this
            ->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/checkout', [
                'plan' => 'starter',
                'interval' => 'month',
            ])
            ->assertConflict()
            ->assertJsonPath('code', 'MANUAL_PERIOD_ACTIVE');

        Http::assertNothingSent();
    }

    public function test_customer_can_return_to_stripe_after_manual_period_expires(): void
    {
        [$owner, $organization] = $this->workspace();
        $this->configureBilling();

        BillingAccount::query()->create([
            'organization_id' => $organization->id,
            'billing_source' => 'manual',
            'status' => 'active',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'amount_minor' => 1900,
            'currency' => 'USD',
            'current_period_start' => now()->subMonth(),
            'current_period_end' => now()->subMinute(),
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://billing.example.test/v1/checkout/sessions' => Http::response([
                'id' => 'cs_switch_to_stripe',
                'url' => 'https://checkout.example.test/switch-to-stripe',
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
                'https://checkout.example.test/switch-to-stripe',
            );

        Http::assertSentCount(1);
    }

    public function test_starting_stripe_checkout_cancels_pending_manual_request(): void
    {
        [$owner, $organization] = $this->workspace();
        $this->configureBilling();

        $payment = BillingManualPayment::query()->create([
            'organization_id' => $organization->id,
            'requested_by_user_id' => $owner->id,
            'receipt_number' => 'REQ-SWITCH-001',
            'method' => 'bank_transfer',
            'status' => 'pending',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'period_count' => 1,
            'amount_minor' => 1900,
            'currency' => 'USD',
            'requested_at' => now(),
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://billing.example.test/v1/checkout/sessions' => Http::response([
                'id' => 'cs_cancel_manual_request',
                'url' => 'https://checkout.example.test/card',
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
            ->assertOk();

        $payment->refresh();

        $this->assertSame('cancelled', $payment->status);
        $this->assertSame(
            'Customer switched to Stripe checkout.',
            $payment->rejection_reason,
        );
        $this->assertNotNull($payment->reviewed_at);
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

    /** @return array{0: User, 1: Organization} */
    private function workspace(): array
    {
        $user = User::factory()->create();
        $organization = Organization::create([
            'name' => 'Payment Method Switch Workspace',
        ]);

        $organization->users()->attach($user->id, [
            'role' => 'owner',
        ]);

        return [$user, $organization];
    }
}
