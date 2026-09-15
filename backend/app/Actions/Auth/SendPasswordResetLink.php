<?php

namespace App\Actions\Auth;

use Illuminate\Support\Facades\Password;

class SendPasswordResetLink
{
    /**
     * Ask Laravel's password broker to issue and deliver a reset token.
     *
     * @param  string  $email  Normalized account email.
     * @return string Password broker status code.
     */
    public function execute(string $email): string
    {
        return Password::sendResetLink([
            'email' => $email,
        ]);
    }
}
