<?php

return [
    /*
     * Billing stays behind an AccoNova-owned boundary. Stripe is the first
     * payment provider, but product logic should not depend on Stripe IDs.
     */
    'enabled' => (bool) env('BILLING_ENABLED', false),

    'provider' => env('BILLING_PROVIDER', 'stripe'),

    'stripe' => [
        'key' => env('STRIPE_KEY'),
        'secret' => env('STRIPE_SECRET'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
    ],
];
