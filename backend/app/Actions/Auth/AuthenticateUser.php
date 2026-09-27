<?php

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthenticateUser
{
    /**
     * Authenticate validated credentials and return the authenticated user.
     *
     * Invalid credentials intentionally produce a validation-style 422
     * response to preserve the existing public API contract. Expired
     * temporary credentials are rejected even when their hash still matches.
     *
     * @param  array{
     *     email: string,
     *     password: string
     * }  $credentials
     *
     * @throws ValidationException
     */
    public function execute(array $credentials): User
    {
        if (! Auth::attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => [
                    'The provided credentials are incorrect.',
                ],
            ]);
        }

        /** @var User $user */
        $user = Auth::user();

        if (
            $user->must_change_password
            && $user->temporary_password_expires_at?->isPast()
        ) {
            Auth::logout();

            throw ValidationException::withMessages([
                'email' => [
                    'The temporary password has expired. Request a recovery link or ask an administrator for a new temporary password.',
                ],
            ]);
        }

        return $user;
    }
}
