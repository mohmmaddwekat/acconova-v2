<?php

$emails = array_values(array_filter(array_map(
    static fn (string $email): string => strtolower(trim($email)),
    explode(',', (string) env('PLATFORM_ADMIN_EMAILS', '')),
)));

return [
    'emails' => $emails,
    'allow_any_authenticated_user_locally' => (bool) env(
        'PLATFORM_ADMIN_ALLOW_LOCAL',
        true,
    ),
];
