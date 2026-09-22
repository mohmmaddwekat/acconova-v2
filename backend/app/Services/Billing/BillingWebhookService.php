<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\BillingInvoice;
use App\Models\Organization;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Throwable;

final class BillingWebhookService
{
    public function __construct(
        private readonly StripeBillingGateway $gateway,
    ) {
    }

    /**
     * Verify, deduplicate, and process one provider webhook.
     */
    public function handle(Request $request): void
    {
        $event = $this->verifiedEvent($request);

        $eventId = trim((string) ($event['id'] ?? ''));
        $type = trim((string) ($event['type'] ?? ''));

        if ($eventId === '' || $type === '') {
            throw new InvalidArgumentException(
                'Webhook event metadata is missing.',
            );
        }

        $existing = DB::table('billing_webhook_events')
            ->where('provider_event_id', $eventId)
            ->first();

        if ($existing?->processed_at) {
            return;
        }

        if ($existing) {
            DB::table('billing_webhook_events')
                ->where('provider_event_id', $eventId)
                ->update([
                    'attempts' => DB::raw('attempts + 1'),
                    'last_error' => null,
                    'updated_at' => now(),
                ]);
        } else {
            DB::table('billing_webhook_events')->insert([
                'provider_event_id' => $eventId,
                'type' => $type,
                'attempts' => 1,
                'processed_at' => null,
                'last_error' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        try {
            $object = $event['data']['object'] ?? [];

            if (! is_array($object)) {
                throw new InvalidArgumentException(
                    'Webhook event object is invalid.',
                );
            }

            $this->process($type, $object);

            DB::table('billing_webhook_events')
                ->where('provider_event_id', $eventId)
                ->update([
                    'processed_at' => now(),
                    'last_error' => null,
                    'updated_at' => now(),
                ]);
        } catch (Throwable $exception) {
            DB::table('billing_webhook_events')
                ->where('provider_event_id', $eventId)
                ->update([
                    'last_error' => mb_substr(
                        $exception->getMessage(),
                        0,
                        2000,
                    ),
                    'updated_at' => now(),
                ]);

            throw $exception;
        }
    }

    /**
     * @return array<string,mixed>
     */
    private function verifiedEvent(
        Request $request,
    ): array {
        $secret = trim((string) config(
            'billing.stripe.webhook_secret',
            '',
        ));

        if ($secret === '') {
            throw new InvalidArgumentException(
                'Webhook signing is not configured.',
            );
        }

        $header = trim((string) $request->header(
            'Stripe-Signature',
            '',
        ));

        $payload = $request->getContent();

        if ($header === '' || $payload === '') {
            throw new InvalidArgumentException(
                'Webhook signature is missing.',
            );
        }

        $timestamp = null;
        $signatures = [];

        foreach (explode(',', $header) as $part) {
            [$key, $value] = array_pad(
                explode('=', trim($part), 2),
                2,
                null,
            );

            if ($key === 't' && is_numeric($value)) {
                $timestamp = (int) $value;
            }

            if ($key === 'v1' && is_string($value)) {
                $signatures[] = $value;
            }
        }

        if (! $timestamp || $signatures === []) {
            throw new InvalidArgumentException(
                'Webhook signature is invalid.',
            );
        }

        $tolerance = max(
            60,
            (int) config(
                'billing.stripe.webhook_tolerance_seconds',
                300,
            ),
        );

        if (abs(time() - $timestamp) > $tolerance) {
            throw new InvalidArgumentException(
                'Webhook signature has expired.',
            );
        }

        $expected = hash_hmac(
            'sha256',
            $timestamp.'.'.$payload,
            $secret,
        );

        $valid = false;

        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                $valid = true;
                break;
            }
        }

        if (! $valid) {
            throw new InvalidArgumentException(
                'Webhook signature is invalid.',
            );
        }

        $event = json_decode(
            $payload,
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        if (! is_array($event)) {
            throw new InvalidArgumentException(
                'Webhook payload is invalid.',
            );
        }

        return $event;
    }

    /**
     * @param array<string,mixed> $object
     */
    private function process(
        string $type,
        array $object,
    ): void {
        match ($type) {
            'checkout.session.completed' =>
                $this->checkoutCompleted($object),

            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted' =>
                $this->subscriptionChanged($object),

            'invoice.created',
            'invoice.finalized',
            'invoice.paid',
            'invoice.payment_succeeded',
            'invoice.payment_failed',
            'invoice.voided' =>
                $this->invoiceChanged($object),

            'payment_method.attached' =>
                $this->paymentMethodAttached($object),

            'customer.updated' =>
                $this->customerUpdated($object),

            default => null,
        };
    }

    /**
     * @param array<string,mixed> $session
     */
    private function checkoutCompleted(
        array $session,
    ): void {
        $organizationId = $this->positiveInt(
            $session['metadata']['organization_id']
                ?? $session['client_reference_id']
                ?? null,
        );

        if (! $organizationId) {
            return;
        }

        if (! Organization::query()->whereKey($organizationId)->exists()) {
            return;
        }

        $customerId = $this->id(
            $session['customer'] ?? null,
        );
        $subscriptionId = $this->id(
            $session['subscription'] ?? null,
        );

        BillingAccount::query()->updateOrCreate(
            [
                'organization_id' => $organizationId,
            ],
            [
                'provider_customer_id' => $customerId,
                'provider_subscription_id' => $subscriptionId,
                'plan_key' => $this->stringOrNull(
                    $session['metadata']['plan'] ?? null,
                ),
                'billing_interval' => $this->stringOrNull(
                    $session['metadata']['interval'] ?? null,
                ),
            ],
        );

        if ($subscriptionId) {
            $this->syncSubscription(
                $this->gateway->subscription(
                    $subscriptionId,
                ),
                $organizationId,
            );
        }
    }

    /**
     * @param array<string,mixed> $subscription
     */
    private function subscriptionChanged(
        array $subscription,
    ): void {
        $subscriptionId = $this->id(
            $subscription['id'] ?? null,
        );

        if (! $subscriptionId) {
            return;
        }

        /*
         * Fetch the canonical object so payment-method expansion is available
         * even when the webhook event carries an unexpanded reference.
         */
        $canonical = $this->gateway->subscription(
            $subscriptionId,
        );

        $this->syncSubscription(
            $canonical,
            $this->positiveInt(
                $subscription['metadata']['organization_id']
                    ?? null,
            ),
        );
    }

    /**
     * @param array<string,mixed> $subscription
     */
    private function syncSubscription(
        array $subscription,
        ?int $preferredOrganizationId = null,
    ): void {
        $subscriptionId = $this->id(
            $subscription['id'] ?? null,
        );
        $customerId = $this->id(
            $subscription['customer'] ?? null,
        );

        $organizationId = $preferredOrganizationId
            ?: $this->positiveInt(
                $subscription['metadata']['organization_id']
                    ?? null,
            );

        if (! $organizationId) {
            $existing = BillingAccount::query()
                ->when(
                    $subscriptionId,
                    fn ($query) => $query->where(
                        'provider_subscription_id',
                        $subscriptionId,
                    ),
                    fn ($query) => $query->where(
                        'provider_customer_id',
                        $customerId,
                    ),
                )
                ->first();

            $organizationId = $existing
                ? (int) $existing->organization_id
                : null;
        }

        if (
            ! $organizationId
            || ! Organization::query()
                ->whereKey($organizationId)
                ->exists()
        ) {
            return;
        }

        $item = $subscription['items']['data'][0] ?? [];
        $item = is_array($item) ? $item : [];

        $price = $item['price'] ?? [];
        $price = is_array($price) ? $price : [];

        $priceId = $this->id(
            $price['id'] ?? null,
        );

        $paymentMethod = $subscription['default_payment_method']
            ?? null;

        if (is_string($paymentMethod)) {
            $paymentMethod = $this->gateway->paymentMethod(
                $paymentMethod,
            );
        }

        if (! is_array($paymentMethod)) {
            $paymentMethod = null;
        }

        $card = is_array(
            $paymentMethod['card'] ?? null,
        )
            ? $paymentMethod['card']
            : [];

        $planKey = $this->stringOrNull(
            $subscription['metadata']['plan'] ?? null,
        ) ?: $this->gateway->planForPrice($priceId);

        BillingAccount::query()->updateOrCreate(
            [
                'organization_id' => $organizationId,
            ],
            [
                'provider_customer_id' => $customerId,
                'provider_subscription_id' => $subscriptionId,
                'plan_key' => $planKey,
                'billing_interval' => $this->stringOrNull(
                    $price['recurring']['interval'] ?? null,
                ) ?: $this->stringOrNull(
                    $subscription['metadata']['interval'] ?? null,
                ),
                'status' => $this->stringOrNull(
                    $subscription['status'] ?? null,
                ),
                'price_id' => $priceId,
                'quantity' => max(
                    1,
                    (int) ($item['quantity'] ?? 1),
                ),
                'amount_minor' => isset($price['unit_amount'])
                    ? max(0, (int) $price['unit_amount'])
                    : null,
                'currency' => isset($price['currency'])
                    ? strtoupper((string) $price['currency'])
                    : null,
                'current_period_start' => $this->timestamp(
                    $subscription['current_period_start']
                        ?? $item['current_period_start']
                        ?? null,
                ),
                'current_period_end' => $this->timestamp(
                    $subscription['current_period_end']
                        ?? $item['current_period_end']
                        ?? null,
                ),
                'cancel_at_period_end' => (bool) (
                    $subscription['cancel_at_period_end']
                        ?? false
                ),
                'trial_ends_at' => $this->timestamp(
                    $subscription['trial_end'] ?? null,
                ),
                'canceled_at' => $this->timestamp(
                    $subscription['canceled_at'] ?? null,
                ),
                'payment_brand' => $this->stringOrNull(
                    $card['brand'] ?? null,
                ),
                'payment_last4' => $this->stringOrNull(
                    $card['last4'] ?? null,
                ),
                'payment_exp_month' => isset($card['exp_month'])
                    ? (int) $card['exp_month']
                    : null,
                'payment_exp_year' => isset($card['exp_year'])
                    ? (int) $card['exp_year']
                    : null,
            ],
        );
    }

    /**
     * @param array<string,mixed> $invoice
     */
    private function invoiceChanged(
        array $invoice,
    ): void {
        $invoiceId = $this->id(
            $invoice['id'] ?? null,
        );

        if (! $invoiceId) {
            return;
        }

        $customerId = $this->id(
            $invoice['customer'] ?? null,
        );

        $subscriptionId = $this->id(
            $invoice['subscription'] ?? null,
        );

        $account = BillingAccount::query()
            ->where(function ($query) use (
                $customerId,
                $subscriptionId,
            ): void {
                if ($subscriptionId) {
                    $query->where(
                        'provider_subscription_id',
                        $subscriptionId,
                    );
                }

                if ($customerId) {
                    $method = $subscriptionId
                        ? 'orWhere'
                        : 'where';

                    $query->{$method}(
                        'provider_customer_id',
                        $customerId,
                    );
                }
            })
            ->first();

        if (! $account) {
            return;
        }

        BillingInvoice::query()->updateOrCreate(
            [
                'provider_invoice_id' => $invoiceId,
            ],
            [
                'organization_id' => $account->organization_id,
                'number' => $this->stringOrNull(
                    $invoice['number'] ?? null,
                ),
                'status' => $this->stringOrNull(
                    $invoice['status'] ?? null,
                ),
                'amount_due_minor' => max(
                    0,
                    (int) ($invoice['amount_due'] ?? 0),
                ),
                'amount_paid_minor' => max(
                    0,
                    (int) ($invoice['amount_paid'] ?? 0),
                ),
                'currency' => isset($invoice['currency'])
                    ? strtoupper((string) $invoice['currency'])
                    : null,
                'hosted_invoice_url' => $this->stringOrNull(
                    $invoice['hosted_invoice_url'] ?? null,
                ),
                'invoice_pdf_url' => $this->stringOrNull(
                    $invoice['invoice_pdf'] ?? null,
                ),
                'issued_at' => $this->timestamp(
                    $invoice['created'] ?? null,
                ),
                'due_at' => $this->timestamp(
                    $invoice['due_date'] ?? null,
                ),
                'paid_at' => $this->timestamp(
                    $invoice['status_transitions']['paid_at']
                        ?? null,
                ),
            ],
        );
    }

    /**
     * @param array<string,mixed> $method
     */
    private function paymentMethodAttached(
        array $method,
    ): void {
        $customerId = $this->id(
            $method['customer'] ?? null,
        );

        if (! $customerId) {
            return;
        }

        $card = is_array($method['card'] ?? null)
            ? $method['card']
            : [];

        BillingAccount::query()
            ->where('provider_customer_id', $customerId)
            ->update([
                'payment_brand' => $this->stringOrNull(
                    $card['brand'] ?? null,
                ),
                'payment_last4' => $this->stringOrNull(
                    $card['last4'] ?? null,
                ),
                'payment_exp_month' => isset($card['exp_month'])
                    ? (int) $card['exp_month']
                    : null,
                'payment_exp_year' => isset($card['exp_year'])
                    ? (int) $card['exp_year']
                    : null,
                'updated_at' => now(),
            ]);
    }

    /**
     * @param array<string,mixed> $customer
     */
    private function customerUpdated(
        array $customer,
    ): void {
        $customerId = $this->id(
            $customer['id'] ?? null,
        );

        if (! $customerId) {
            return;
        }

        $paymentMethodId = $this->id(
            $customer['invoice_settings']['default_payment_method']
                ?? null,
        );

        if (! $paymentMethodId) {
            return;
        }

        $method = $this->gateway->paymentMethod(
            $paymentMethodId,
        );

        if ($method) {
            $method['customer'] = $customerId;
            $this->paymentMethodAttached($method);
        }
    }

    private function id(mixed $value): ?string
    {
        if (is_array($value)) {
            $value = $value['id'] ?? null;
        }

        return $this->stringOrNull($value);
    }

    private function stringOrNull(
        mixed $value,
    ): ?string {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }

    private function positiveInt(
        mixed $value,
    ): ?int {
        if (! is_numeric($value)) {
            return null;
        }

        $value = (int) $value;

        return $value > 0 ? $value : null;
    }

    private function timestamp(
        mixed $value,
    ): ?CarbonImmutable {
        if (! is_numeric($value)) {
            return null;
        }

        $value = (int) $value;

        if ($value <= 0) {
            return null;
        }

        return CarbonImmutable::createFromTimestampUTC(
            $value,
        );
    }
}
