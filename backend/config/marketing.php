<?php

return [
    'brand' => 'AccoNova',

    'tagline' => 'Intelligent business management for growing companies',

    'contact_email' => env(
        'MARKETING_CONTACT_EMAIL',
        env('MAIL_FROM_ADDRESS'),
    ),

    'company_name' => env('MARKETING_COMPANY_NAME', 'AccoNova'),

    'social' => [
        'linkedin' => env('MARKETING_LINKEDIN_URL'),
        'x' => env('MARKETING_X_URL'),
    ],
];
