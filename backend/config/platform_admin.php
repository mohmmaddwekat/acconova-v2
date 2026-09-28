<?php

$emails = array_values(array_filter(array_map(
    static fn (string $email): string => strtolower(trim($email)),
    explode(',', (string) env('PLATFORM_ADMIN_EMAILS', 'admin@acconova.com')),
)));

return [
    'emails' => $emails,
    'allow_any_authenticated_user_locally' => (bool) env(
        'PLATFORM_ADMIN_ALLOW_LOCAL',
        false,
    ),
    'super_admin' => [
        'email' => env('PLATFORM_SUPER_ADMIN_EMAIL', 'admin@acconova.com'),
        'name' => env('PLATFORM_SUPER_ADMIN_NAME', 'AccoNova Super Admin'),
        'password' => env('PLATFORM_SUPER_ADMIN_PASSWORD'),
    ],
];
