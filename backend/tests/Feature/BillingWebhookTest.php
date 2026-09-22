<?php

namespace Tests\Feature;

use App\Models\Organization;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BillingWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_verified_webhooks_activate_subscription_and_store_invoice(): void
    {
        $organization = Organization::create([
            'name' => 'Webhook Workspace',
        ]);

        $this->configureBilling();

        Http::preventStrayRequests();
        Http::fake([
            'https://billing.example.test/v1/subscriptions/sub_123*' => Http::response([
                    'id' => 'sub_123',
                    'customer' => 'cus_123',
                    'status' => 'active',
                    'metadata' => [
                        'organization_id' => (string) $organization->id,
                        'plan' => 'starter',
                        'interval' => 'month',
                    ],
                    'items' => [
                        'data' => [[
                            'quantity' => 1,
                            'price' => [
                                'id' => 'price_starter_monthly',
                                'unit_amount' => 1900,
                                'currency' => 'usd',
                                'recurring' => [
                                    'interval' => 'month',
                                ],
                            ],
                        ]],
                    ],
                    'current_period_start' => 1790035200,
                    'current_period_end' => 1792627200,
                    'cancel_at_period_end' => false,
                    'trial_end' => null,
                    'canceled_at' => null,
                    'default_payment_method' => [
                        'id' => 'pm_123',
                        'card' => [
                            'brand' => 'visa',
                            'last4' => '4242',
                            'exp_month' => 12,
                            'exp_year' => 2030,
                        ],
                    ],
                ]),
        ]);

        $checkoutEvent = [
            'id' => 'evt_checkout_123',
            'type' => 'checkout.session.completed',
            'data' => [
                'object' => [
                    'id' => 'cs_123',
                    'mode' => 'subscription',
                    'client_reference_id' => (string) $organization->id,
                    'customer' => 'cus_123',
                    'subscription' => 'sub_123',
                    'metadata' => [
                        'organization_id' => (string) $organization->id,
                        'plan' => 'starter',
                        'interval' => 'month',
                    ],
                ],
            ],
        ];

        $this->sendSignedWebhook($checkoutEvent)
            ->assertOk()
            ->assertJsonPath('received', true);

        $this->assertDatabaseHas('billing_accounts', [
            'organization_id' => $organization->id,
            'provider_customer_id' => 'cus_123',
            'provider_subscription_id' => 'sub_123',
            'plan_key' => 'starter',
            'billing_interval' => 'month',
            'status' => 'active',
            'price_id' => 'price_starter_monthly',
            'amount_minor' => 1900,
            'currency' => 'USD',
            'payment_brand' => 'visa',
            'payment_last4' => '4242',
        ]);

        $invoiceEvent = [
            'id' => 'evt_invoice_123',
            'type' => 'invoice.paid',
            'data' => [
                'object' => [
                    'id' => 'in_123',
                    'customer' => 'cus_123',
                    'subscription' => 'sub_123',
                    'number' => 'ACCO-0001',
                    'status' => 'paid',
                    'amount_due' => 1900,
                    'amount_paid' => 1900,
                    'currency' => 'usd',
                    'hosted_invoice_url' => 'https://billing.example.test/invoices/in_123',
                    'invoice_pdf' => 'https://billing.example.test/invoices/in_123.pdf',
                    'created' => 1790035200,
                    'due_date' => null,
                    'status_transitions' => [
                        'paid_at' => 1790035300,
                    ],
                ],
            ],
        ];

        $this->sendSignedWebhook($invoiceEvent)
            ->assertOk();

        $this->sendSignedWebhook($invoiceEvent)
            ->assertOk();

        $this->assertDatabaseHas('billing_invoices', [
            'organization_id' => $organization->id,
            'provider_invoice_id' => 'in_123',
            'number' => 'ACCO-0001',
            'status' => 'paid',
            'amount_due_minor' => 1900,
            'amount_paid_minor' => 1900,
            'currency' => 'USD',
        ]);

        $this->assertDatabaseCount(
            'billing_invoices',
            1,
        );

        $this->assertDatabaseHas('billing_webhook_events', [
            'provider_event_id' => 'evt_checkout_123',
            'type' => 'checkout.session.completed',
        ]);

        $this->assertDatabaseHas('billing_webhook_events', [
            'provider_event_id' => 'evt_invoice_123',
            'type' => 'invoice.paid',
        ]);
    }

    public function test_invalid_webhook_signature_is_rejected(): void
    {
        $this->configureBilling();

        $payload = json_encode([
            'id' => 'evt_bad',
            'type' => 'invoice.paid',
            'data' => [
                'object' => [],
            ],
        ], JSON_THROW_ON_ERROR);

        $this->call(
            'POST',
            '/api/billing/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_STRIPE_SIGNATURE' => 't='.time().',v1=invalid',
            ],
            $payload,
        )->assertStatus(400);
    }

    private function configureBilling(): void
    {
        config([
            'billing.enabled' => true,
            'billing.stripe.secret' => 'sk_test_server_only',
            'billing.stripe.webhook_secret' => 'whsec_test',
            'billing.stripe.api_base' => 'https://billing.example.test',
            'billing.stripe.webhook_tolerance_seconds' => 300,
            'billing.plans.starter.prices.month' => 'price_starter_monthly',
        ]);
    }

    /**
     * @param  array<string, mixed>  $event
     */
    private function sendSignedWebhook(
        array $event,
    ) {
        $payload = json_encode(
            $event,
            JSON_THROW_ON_ERROR,
        );

        $timestamp = time();

        $signature = hash_hmac(
            'sha256',
            $timestamp.'.'.$payload,
            'whsec_test',
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
