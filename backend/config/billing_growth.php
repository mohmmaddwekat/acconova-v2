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

    /* Commercial values are deliberately opt-in. Zero means “do not issue”. */
    'referral_credit_minor' => max(0, (int) env('BILLING_REFERRAL_CREDIT_MINOR', 0)),
    'winback_credit_minor' => max(0, (int) env('BILLING_WINBACK_CREDIT_MINOR', 0)),
    'cancel_save_credit_minor' => max(0, (int) env('BILLING_CANCEL_SAVE_CREDIT_MINOR', 0)),

    'addons' => [
        'extra_seats_5' => [
            'name_ar' => '5 مستخدمين إضافيين',
            'name_en' => '5 extra users',
            'unit' => 'seat_pack',
            'quantity' => 5,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_EXTRA_SEATS_5_MINOR', 0)),
            'currency' => 'USD',
        ],
        'storage_25gb' => [
            'name_ar' => '25 GB تخزين إضافي',
            'name_en' => '25 GB extra storage',
            'unit' => 'storage_bytes',
            'quantity' => 25 * 1024 * 1024 * 1024,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_STORAGE_25GB_MINOR', 0)),
            'currency' => 'USD',
        ],
        'ai_credits' => [
            'name_ar' => 'رصيد AccoNova AI إضافي',
            'name_en' => 'Extra AccoNova AI credits',
            'unit' => 'ai_credit_pack',
            'quantity' => 1,
            'amount_minor' => max(0, (int) env('BILLING_ADDON_AI_CREDITS_MINOR', 0)),
            'currency' => 'USD',
        ],
    ],
];
