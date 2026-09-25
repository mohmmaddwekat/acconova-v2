<?php

namespace App\Services\Billing;

use App\Models\BillingAccount;
use App\Models\Organization;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class StripePaymentMethodPortal
{
    public function url(Organization $organization): string
    {
        $secret = trim((string) config('billing.stripe.secret', ''));
        $apiBase = rtrim((string) config('billing.stripe.api_base', 'https://api.stripe.com'), '/');

        if (! (bool) config('billing.enabled', false) || $secret === '') {
            throw new RuntimeException('Billing is not configured.');
        }

        $account = BillingAccount::query()
            ->where('organization_id', $organization->id)
            ->first();

        if (! $account?->provider_customer_id) {
            throw new RuntimeException('No billing customer exists for this workspace yet.');
        }

        $returnUrl = trim((string) config('billing.urls.portal_return', ''))
            ?: url('/app/billing');

        $response = Http::withToken($secret)
            ->acceptJson()
            ->asForm()
            ->timeout(20)
            ->post($apiBase.'/v1/billing_portal/sessions', [
                'customer' => $account->provider_customer_id,
                'return_url' => $returnUrl,
                'flow_data' => [
                    'type' => 'payment_method_update',
                    'after_completion' => [
                        'type' => 'redirect',
                        'redirect' => [
                            'return_url' => $returnUrl,
                        ],
                    ],
                ],
            ]);

        if (! $response->successful()) {
            report(new RuntimeException(sprintf(
                'Stripe payment-method portal failed with HTTP %d.',
                $response->status(),
            )));

            throw new RuntimeException('The billing service could not open payment settings.');
        }

        $url = trim((string) data_get($response->json(), 'url', ''));

        if ($url === '') {
            throw new RuntimeException('The payment-method portal did not return a redirect URL.');
        }

        return $url;
    }
}
