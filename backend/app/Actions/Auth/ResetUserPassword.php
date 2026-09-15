<?php

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ResetUserPassword
{
    /**
     * Replace a user's password after Laravel validates the reset token.
     *
     * The new password must differ from the user's existing password.
     * Successful recovery also rotates the remember token and invalidates
     * database-backed sessions so old authenticated sessions cannot survive
     * the password-reset security boundary.
     *
     * @param  array{
     *     email: string,
     *     password: string,
     *     password_confirmation: string,
     *     token: string
     * }  $credentials
     * @return string Password broker status code.
     */
    public function execute(array $credentials): string
    {
        return Password::reset(
            $credentials,
            /**
             * Persist the replacement credentials only after Laravel's
             * password broker has accepted the email and reset token.
             */
            function (User $user, string $password): void {
                /*
                 * Never accept the existing password as the replacement.
                 * This check occurs only after the reset token is valid.
                 */
                if (
                    Hash::check(
                        $password,
                        $user->password,
                    )
                ) {
                    throw ValidationException::withMessages([
                        'password' => [
                            'Your new password must be different from your current password.',
                        ],
                    ]);
                }

                $user->forceFill([
                    'password' => $password,
                    'remember_token' => Str::random(60),
                ])->save();

                /*
                 * Invalidate existing database sessions after a successful
                 * password reset so previously authenticated browsers lose
                 * access immediately.
                 */
                if (
                    config('session.driver') === 'database'
                ) {
                    DB::table(
                        (string) config(
                            'session.table',
                            'sessions',
                        ),
                    )
                        ->where(
                            'user_id',
                            $user->id,
                        )
                        ->delete();
                }

                event(
                    new PasswordReset($user),
                );
            },
        );
    }
}
