<?php

return [
    /*
     * Billing stays behind an AccoNova-owned boundary. The browser only sees
     * AccoNova plan/payment concepts; provider details stay server-side.
     */
    'enabled' => (bool) env('BILLING_ENABLED', false),

    /*
     * When billing is enabled, lock workspace application/API access until
     * the organization has an active or trialing subscription.
     */
    'enforce_subscription' => (bool) env(
        'BILLING_ENFORCE_SUBSCRIPTION',
        true,
    ),

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

    /*
     * AccoNova owns the commercial catalog. Display prices, plan limits and
     * customer-facing benefits must never depend on a provider API request.
     * The provider price IDs below are only execution references for checkout.
     */
    'plans' => [
        'starter' => [
            'name_ar' => 'Starter',
            'name_en' => 'Starter',
            'description_ar' => 'بداية قوية للشركات الصغيرة التي تريد إدارة أعمالها من مكان واحد.',
            'description_en' => 'A strong start for small teams managing their business in one place.',
            'recommended' => false,
            'display' => [
                'currency' => 'USD',
                'month_amount_minor' => 1900,
                'year_amount_minor' => 19000,
            ],
            'limits' => [
                'seats' => 3,
                'storage_bytes' => 5 * 1024 * 1024 * 1024,
            ],
            'features_ar' => [
                'حتى 3 مستخدمين',
                'المبيعات والمشتريات والمخزون',
                'الفواتير والمقبوضات والمدفوعات',
                '5 GB مساحة تخزين',
                'AccoNova AI أساسي',
            ],
            'features_en' => [
                'Up to 3 users',
                'Sales, purchases and inventory',
                'Invoices, receipts and payments',
                '5 GB storage',
                'AccoNova AI Basic',
            ],
            'prices' => [
                'month' => env('BILLING_PRICE_STARTER_MONTHLY'),
                'year' => env('BILLING_PRICE_STARTER_YEARLY'),
            ],
        ],
        'business' => [
            'name_ar' => 'Business',
            'name_en' => 'Business',
            'description_ar' => 'للشركات النامية التي تحتاج تقارير وصلاحيات وأتمتة أقوى.',
            'description_en' => 'For growing companies that need stronger reporting, controls and automation.',
            'recommended' => true,
            'display' => [
                'currency' => 'USD',
                'month_amount_minor' => 4900,
                'year_amount_minor' => 49000,
            ],
            'limits' => [
                'seats' => 10,
                'storage_bytes' => 25 * 1024 * 1024 * 1024,
            ],
            'features_ar' => [
                'حتى 10 مستخدمين',
                'كل مزايا Starter',
                'تقارير وصلاحيات متقدمة',
                '25 GB مساحة تخزين',
                'AccoNova AI Plus',
                'أتمتة وتدفقات عمل متعددة المستودعات',
            ],
            'features_en' => [
                'Up to 10 users',
                'Everything in Starter',
                'Advanced reports and permissions',
                '25 GB storage',
                'AccoNova AI Plus',
                'Automation and multi-warehouse workflows',
            ],
            'prices' => [
                'month' => env('BILLING_PRICE_BUSINESS_MONTHLY'),
                'year' => env('BILLING_PRICE_BUSINESS_YEARLY'),
            ],
        ],
        'scale' => [
            'name_ar' => 'Scale',
            'name_en' => 'Scale',
            'description_ar' => 'للشركات الأكبر التي تحتاج سعة أعلى وذكاء وتحكم متقدم.',
            'description_en' => 'For larger teams that need more capacity, intelligence and advanced controls.',
            'recommended' => false,
            'display' => [
                'currency' => 'USD',
                'month_amount_minor' => 9900,
                'year_amount_minor' => 99000,
            ],
            'limits' => [
                'seats' => 30,
                'storage_bytes' => 100 * 1024 * 1024 * 1024,
            ],
            'features_ar' => [
                'حتى 30 مستخدمًا',
                'كل مزايا Business',
                'تحليلات وذكاء متقدم',
                '100 GB مساحة تخزين',
                'API وتدفقات عمل متقدمة',
                'دعم بأولوية أعلى',
            ],
            'features_en' => [
                'Up to 30 users',
                'Everything in Business',
                'Advanced AI and analytics',
                '100 GB storage',
                'API and advanced workflows',
                'Priority support',
            ],
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
