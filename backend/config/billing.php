<?php

return [
    /*
     * Billing stays behind an AccoNova-owned boundary. The browser only sees
     * AccoNova plan/payment concepts; provider details stay server-side.
     */
    'enabled' => (bool) env('BILLING_ENABLED', false),

    'provider' => env('BILLING_PROVIDER', 'stripe'),

    'allow_promotion_codes' => (bool) env(
        'BILLING_ALLOW_PROMOTION_CODES',
        true,
    ),

    'trial_days' => max(
        0,
        (int) env('BILLING_TRIAL_DAYS', 0),
    ),

    'urls' => [
        'success' => env('BILLING_SUCCESS_URL'),
        'cancel' => env('BILLING_CANCEL_URL'),
        'portal_return' => env('BILLING_PORTAL_RETURN_URL'),
    ],

    'plans' => [
        'starter' => [
            'name_ar' => 'Starter',
            'name_en' => 'Starter',
            'description_ar' => 'للشركات الصغيرة التي تريد أساسيات AccoNova.',
            'description_en' => 'For small teams starting with AccoNova.',
            'prices' => [
                'month' => env('BILLING_PRICE_STARTER_MONTHLY'),
                'year' => env('BILLING_PRICE_STARTER_YEARLY'),
            ],
        ],
        'business' => [
            'name_ar' => 'Business',
            'name_en' => 'Business',
            'description_ar' => 'للشركات النامية التي تحتاج إدارة وتشغيل أوسع.',
            'description_en' => 'For growing companies that need broader operations.',
            'prices' => [
                'month' => env('BILLING_PRICE_BUSINESS_MONTHLY'),
                'year' => env('BILLING_PRICE_BUSINESS_YEARLY'),
            ],
        ],
        'scale' => [
            'name_ar' => 'Scale',
            'name_en' => 'Scale',
            'description_ar' => 'للشركات التي تحتاج قدرات متقدمة وحجم استخدام أكبر.',
            'description_en' => 'For larger teams with advanced needs.',
            'prices' => [
                'month' => env('BILLING_PRICE_SCALE_MONTHLY'),
                'year' => env('BILLING_PRICE_SCALE_YEARLY'),
            ],
        ],
    ],

    'stripe' => [
        'key' => env('STRIPE_KEY'),
        'secret' => env('STRIPE_SECRET'),
        'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),
        'api_base' => env('STRIPE_API_BASE', 'https://api.stripe.com'),
        'webhook_tolerance_seconds' => max(
            60,
            (int) env('STRIPE_WEBHOOK_TOLERANCE_SECONDS', 300),
        ),
    ],
];
