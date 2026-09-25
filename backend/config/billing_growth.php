<?php

return [
    /*
     * AccoNova owns these policies. Provider-specific settings never leave
     * the server-side billing boundary.
     */
    'grace_days' => max(0, (int) env('BILLING_GRACE_DAYS', 5)),
    'preservation_days' => max(1, (int) env('BILLING_PRESERVATION_DAYS', 90)),
    'trial_extension_days' => max(0, (int) env('BILLING_TRIAL_EXTENSION_DAYS', 7)),
    'trial_extension_once' => (bool) env('BILLING_TRIAL_EXTENSION_ONCE', true),
    'card_expiry_warning_days' => [30, 15, 7],
    'annual_nudge_after_months' => max(1, (int) env('BILLING_ANNUAL_NUDGE_AFTER_MONTHS', 3)),
    'soft_lock' => (bool) env('BILLING_SOFT_LOCK', true),

    /* Commercial credits remain opt-in. Zero means “do not issue”. */
    'referral_credit_minor' => max(0, (int) env('BILLING_REFERRAL_CREDIT_MINOR', 0)),
    'winback_credit_minor' => max(0, (int) env('BILLING_WINBACK_CREDIT_MINOR', 0)),
    'cancel_save_credit_minor' => max(0, (int) env('BILLING_CANCEL_SAVE_CREDIT_MINOR', 0)),

    /*
     * AI credits are one-time wallet top-ups, separate from the recurring
     * workspace subscription. 50K tokens per $1 keeps the same unit economics
     * as the original 500K / $10 add-on while allowing flexible amounts.
     */
    'ai_credits' => [
        'currency' => env('BILLING_AI_CREDIT_CURRENCY', 'USD'),
        'tokens_per_dollar' => max(1, (int) env('BILLING_AI_CREDIT_TOKENS_PER_DOLLAR', 50000)),
        'minimum_amount_minor' => max(100, (int) env('BILLING_AI_CREDIT_MINIMUM_MINOR', 500)),
        'maximum_amount_minor' => max(100, (int) env('BILLING_AI_CREDIT_MAXIMUM_MINOR', 100000)),
        'preset_amounts_minor' => [1000, 5000, 10000, 20000],
        'default_threshold_tokens' => max(1, (int) env('BILLING_AI_AUTO_RECHARGE_THRESHOLD', 100000)),
        'threshold_options' => [100000, 250000, 500000],
    ],

    /*
     * Recurring capacity add-ons are separate Stripe subscription items on the
     * workspace's existing subscription. The lookup keys let
     * `php artisan billing:sync-addons` create/reuse the catalog without
     * hard-coding provider IDs in application code.
     *
     * `amount_minor` mirrors the monthly amount for the older growth-center
     * forecast while `prices` is the canonical month/year purchase catalog.
     */
    'addons' => [
        'extra_seats_5' => [
            'name_ar' => '5 مقاعد إضافية',
            'name_en' => '5 extra seats',
            'description_ar' => 'أضف حتى 5 موظفين إضافيين إلى مساحة العمل.',
            'description_en' => 'Add capacity for up to 5 additional workspace members.',
            'unit' => 'seats',
            'quantity' => 5,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_EXTRA_SEATS_5_MONTHLY_MINOR', 2000)),
            'currency' => 'USD',
            'prices' => [
                'month' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_EXTRA_SEATS_5_MONTHLY_MINOR', 2000)),
                    'price_id' => env('BILLING_ADDON_EXTRA_SEATS_5_MONTHLY_PRICE'),
                    'lookup_key' => 'acconova_extra_seats_5_month',
                ],
                'year' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_EXTRA_SEATS_5_YEARLY_MINOR', 20000)),
                    'price_id' => env('BILLING_ADDON_EXTRA_SEATS_5_YEARLY_PRICE'),
                    'lookup_key' => 'acconova_extra_seats_5_year',
                ],
            ],
        ],
        'ai_tokens_500k' => [
            'name_ar' => '500 ألف Token إضافي لـ AccoNova AI',
            'name_en' => '500K extra AccoNova AI tokens',
            'description_ar' => 'إضافة دورية قديمة. الشراء الجديد يتم الآن من رصيد AccoNova AI المرن.',
            'description_en' => 'Legacy recurring add-on. New purchases now use the flexible AccoNova AI wallet.',
            'unit' => 'ai_tokens',
            'quantity' => 500000,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_AI_500K_MONTHLY_MINOR', 1000)),
            'currency' => 'USD',
            'customer_visible' => false,
            'prices' => [
                'month' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_AI_500K_MONTHLY_MINOR', 1000)),
                    'price_id' => env('BILLING_ADDON_AI_500K_MONTHLY_PRICE'),
                    'lookup_key' => 'acconova_ai_500k_month',
                ],
                'year' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_AI_500K_YEARLY_MINOR', 10000)),
                    'price_id' => env('BILLING_ADDON_AI_500K_YEARLY_PRICE'),
                    'lookup_key' => 'acconova_ai_500k_year',
                ],
            ],
        ],
        'storage_25gb' => [
            'name_ar' => '25 GB تخزين إضافي',
            'name_en' => '25 GB extra storage',
            'description_ar' => 'أضف 25 GB للملفات والمرفقات في مساحة العمل.',
            'description_en' => 'Add 25 GB for workspace files and attachments.',
            'unit' => 'storage_bytes',
            'quantity' => 25 * 1024 * 1024 * 1024,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_STORAGE_25GB_MONTHLY_MINOR', 500)),
            'currency' => 'USD',
            'prices' => [
                'month' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_STORAGE_25GB_MONTHLY_MINOR', 500)),
                    'price_id' => env('BILLING_ADDON_STORAGE_25GB_MONTHLY_PRICE'),
                    'lookup_key' => 'acconova_storage_25gb_month',
                ],
                'year' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_STORAGE_25GB_YEARLY_MINOR', 5000)),
                    'price_id' => env('BILLING_ADDON_STORAGE_25GB_YEARLY_PRICE'),
                    'lookup_key' => 'acconova_storage_25gb_year',
                ],
            ],
        ],
    ],
];
