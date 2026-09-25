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
     * Recurring capacity add-ons live as extra items on the workspace's
     * existing Stripe subscription. Provider quantity is the exact number of
     * seats / GB, so customers can move from 5 seats to 3 (or to zero) without
     * being forced into packs. Stripe handles the proration on each change.
     *
     * The public display bundle keeps the UI easy to scan: 5 seats = $10/mo
     * and 25 GB = $5/mo, while the canonical Stripe price remains per unit.
     */
    'addons' => [
        'extra_seats_5' => [
            'name_ar' => 'مقاعد إضافية',
            'name_en' => 'Extra seats',
            'description_ar' => 'اختر العدد الدقيق الذي تحتاجه. السعر 2$ لكل مقعد شهريًا؛ 5 مقاعد = 10$.',
            'description_en' => 'Choose the exact number you need. $2 per seat/month; 5 seats = $10.',
            'unit' => 'seats',
            'quantity' => 1,
            'display_bundle_quantity' => 5,
            'max_quantity' => 500,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_EXTRA_SEAT_MONTHLY_MINOR', 200)),
            'currency' => 'USD',
            'prices' => [
                'month' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_EXTRA_SEAT_MONTHLY_MINOR', 200)),
                    'price_id' => env('BILLING_ADDON_EXTRA_SEAT_MONTHLY_PRICE'),
                    'lookup_key' => 'acconova_extra_seat_v2_month',
                ],
                'year' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_EXTRA_SEAT_YEARLY_MINOR', 2000)),
                    'price_id' => env('BILLING_ADDON_EXTRA_SEAT_YEARLY_PRICE'),
                    'lookup_key' => 'acconova_extra_seat_v2_year',
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
            'name_ar' => 'تخزين إضافي',
            'name_en' => 'Extra storage',
            'description_ar' => 'اختر المساحة الدقيقة بالـ GB. السعر 0.20$ لكل GB شهريًا؛ 25 GB = 5$.',
            'description_en' => 'Choose the exact GB you need. $0.20 per GB/month; 25 GB = $5.',
            'unit' => 'storage_bytes',
            'quantity' => 1024 * 1024 * 1024,
            'display_bundle_quantity' => 25,
            'max_quantity' => 10000,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_STORAGE_1GB_MONTHLY_MINOR', 20)),
            'currency' => 'USD',
            'prices' => [
                'month' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_STORAGE_1GB_MONTHLY_MINOR', 20)),
                    'price_id' => env('BILLING_ADDON_STORAGE_1GB_MONTHLY_PRICE'),
                    'lookup_key' => 'acconova_storage_1gb_v2_month',
                ],
                'year' => [
                    'amount_minor' => max(0, (int) env('BILLING_ADDON_STORAGE_1GB_YEARLY_MINOR', 200)),
                    'price_id' => env('BILLING_ADDON_STORAGE_1GB_YEARLY_PRICE'),
                    'lookup_key' => 'acconova_storage_1gb_v2_year',
                ],
            ],
        ],
    ],
];
