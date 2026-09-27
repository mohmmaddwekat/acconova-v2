<?php

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ResetUserPassword
{
    /**
     * Replace a user's password after Laravel validates the reset token.
     *
     * The new password must differ from the user's existing password.
     * Successful recovery also clears any temporary-password state, rotates
     * the remember token and invalidates existing browser/API sessions.
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
            function (User $user, string $password): void {
                if (Hash::check($password, $user->password)) {
                    throw ValidationException::withMessages([
                        'password' => [
                            __('feedback.password_reuse'),
                        ],
                    ]);
                }

                $user->forceFill([
                    'password' => $password,
                    'must_change_password' => false,
                    'temporary_password_expires_at' => null,
                    'password_changed_at' => now(),
                    'remember_token' => Str::random(60),
                ])->save();

                if (
                    config('session.driver') === 'database'
                    && Schema::hasTable((string) config('session.table', 'sessions'))
                ) {
                    DB::table((string) config('session.table', 'sessions'))
                        ->where('user_id', $user->id)
                        ->delete();
                }

                if (Schema::hasTable('oauth_access_tokens')) {
                    DB::table('oauth_access_tokens')
                        ->where('user_id', $user->id)
                        ->update(['revoked' => true]);
                }

                event(new PasswordReset($user));
            },
        );
    }
}
