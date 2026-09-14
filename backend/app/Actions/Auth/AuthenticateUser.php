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
     * response to preserve the existing public API contract.
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

        return $user;
    }
}
