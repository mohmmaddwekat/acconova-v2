<?php

namespace Tests\Feature;

use App\Models\BillingAccount;
use App\Models\Organization;
use App\Models\User;
use App\Services\Billing\AiCreditService;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingAiCreditsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_owner_can_start_one_time_ai_credit_checkout(): void
    {
        [$owner, $organization] = $this->workspace();

        BillingAccount::create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_ai_credit_test',
            'provider_subscription_id' => 'sub_ai_credit_test',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'status' => 'active',
        ]);

        $this->configureBilling();
        Http::preventStrayRequests();
        Http::fake([
            'https://billing.example.test/v1/checkout/sessions' => Http::response([
                'id' => 'cs_ai_credit_test',
                'url' => 'https://checkout.example.test/ai-credit',
            ]),
        ]);

        $this->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->postJson('/api/billing/ai-credits/checkout', [
                'amount_minor' => 1000,
                'auto_recharge' => true,
                'threshold_tokens' => 100000,
            ])
            ->assertOk()
            ->assertJsonPath('data.url', 'https://checkout.example.test/ai-credit')
            ->assertJsonPath('data.tokens', 500000)
            ->assertJsonPath('data.amount_minor', 1000);

        Http::assertSent(function ($request): bool {
            return $request->url() === 'https://billing.example.test/v1/checkout/sessions'
                && $request['mode'] === 'payment'
                && $request['customer'] === 'cus_ai_credit_test'
                && data_get($request->data(), 'metadata.purpose') === 'ai_credit_topup'
                && data_get($request->data(), 'metadata.tokens') === '500000'
                && data_get($request->data(), 'payment_intent_data.setup_future_usage') === 'off_session';
        });
    }

    public function test_paid_ai_credit_checkout_is_fulfilled_once_and_enables_auto_recharge(): void
    {
        $organization = Organization::create([
            'name' => 'AI Credit Wallet Workspace',
        ]);

        $this->configureBilling();

        $event = [
            'id' => 'evt_ai_credit_checkout',
            'type' => 'checkout.session.completed',
            'data' => [
                'object' => [
                    'id' => 'cs_ai_credit_paid',
                    'mode' => 'payment',
                    'payment_status' => 'paid',
                    'amount_total' => 1000,
                    'currency' => 'usd',
                    'customer' => 'cus_ai_credit_paid',
                    'payment_intent' => 'pi_ai_credit_paid',
                    'client_reference_id' => (string) $organization->id,
                    'metadata' => [
                        'purpose' => 'ai_credit_topup',
                        'organization_id' => (string) $organization->id,
                        'tokens' => '500000',
                        'amount_minor' => '1000',
                        'currency' => 'USD',
                        'auto_recharge' => 'true',
                        'auto_recharge_threshold_tokens' => '100000',
                    ],
                ],
            ],
        ];

        $this->sendSignedWebhook($event)->assertOk();
        $this->sendSignedWebhook($event)->assertOk();

        $this->assertDatabaseHas('billing_ai_wallets', [
            'organization_id' => $organization->id,
            'balance_tokens' => 500000,
            'total_purchased_tokens' => 500000,
            'auto_recharge_enabled' => 1,
            'auto_recharge_threshold_tokens' => 100000,
            'auto_recharge_tokens' => 500000,
            'auto_recharge_amount_minor' => 1000,
            'auto_recharge_currency' => 'USD',
        ]);

        $this->assertDatabaseHas('billing_ai_credit_transactions', [
            'organization_id' => $organization->id,
            'kind' => 'topup',
            'tokens' => 500000,
            'provider_checkout_session_id' => 'cs_ai_credit_paid',
            'provider_payment_intent_id' => 'pi_ai_credit_paid',
        ]);

        $this->assertDatabaseCount('billing_ai_credit_transactions', 1);
    }

    public function test_only_usage_above_the_included_monthly_allowance_debits_wallet(): void
    {
        [, $organization] = $this->workspace();

        BillingAccount::create([
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_overage',
            'provider_subscription_id' => 'sub_overage',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'status' => 'active',
        ]);

        DB::table('billing_ai_wallets')->insert([
            'organization_id' => $organization->id,
            'balance_tokens' => 500000,
            'total_purchased_tokens' => 500000,
            'total_consumed_tokens' => 0,
            'auto_recharge_enabled' => false,
            'auto_recharge_threshold_tokens' => 100000,
            'auto_recharge_tokens' => 0,
            'auto_recharge_amount_minor' => 0,
            'auto_recharge_currency' => 'USD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('ai_conversations')->insert([
            'organization_id' => $organization->id,
            'user_id' => User::factory()->create()->id,
            'title' => 'Usage',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $conversationId = (int) DB::getPdo()->lastInsertId();

        DB::table('ai_messages')->insert([
            'organization_id' => $organization->id,
            'ai_conversation_id' => $conversationId,
            'user_id' => null,
            'role' => 'assistant',
            'content' => 'Previous usage',
            'input_tokens' => 125000,
            'output_tokens' => 124000,
            'total_tokens' => 249000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        app(AiCreditService::class)->consumeOverage($organization, 2000);

        $this->assertDatabaseHas('billing_ai_wallets', [
            'organization_id' => $organization->id,
            'balance_tokens' => 499000,
            'total_consumed_tokens' => 1000,
        ]);

        $this->assertDatabaseHas('billing_ai_credit_transactions', [
            'organization_id' => $organization->id,
            'kind' => 'usage',
            'tokens' => -1000,
            'balance_after_tokens' => 499000,
        ]);
    }

    private function configureBilling(): void
    {
        config([
            'billing.enabled' => true,
            'billing.stripe.secret' => 'sk_test_ai_credit',
            'billing.stripe.webhook_secret' => 'whsec_ai_credit_test',
            'billing.stripe.api_base' => 'https://billing.example.test',
            'billing.stripe.webhook_tolerance_seconds' => 300,
            'billing_growth.ai_credits.tokens_per_dollar' => 50000,
            'billing_growth.ai_credits.minimum_amount_minor' => 500,
            'billing_growth.ai_credits.maximum_amount_minor' => 100000,
        ]);
    }

    /** @return array{0: User, 1: Organization} */
    private function workspace(): array
    {
        $owner = User::factory()->create();
        $organization = Organization::create([
            'name' => 'AI Billing Workspace',
        ]);
        $organization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        return [$owner, $organization];
    }

    /** @param array<string, mixed> $event */
    private function sendSignedWebhook(array $event)
    {
        $payload = json_encode($event, JSON_THROW_ON_ERROR);
        $timestamp = time();
        $signature = hash_hmac(
            'sha256',
            $timestamp.'.'.$payload,
            'whsec_ai_credit_test',
        );

        return $this->call(
            'POST',
            '/api/billing/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_STRIPE_SIGNATURE' => "t={$timestamp},v1={$signature}",
            ],
            $payload,
        );
    }
}
