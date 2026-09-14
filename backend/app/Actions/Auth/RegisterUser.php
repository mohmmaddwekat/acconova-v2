<?php

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Registered;

class RegisterUser
{
    /**
     * Create a new application user and announce Laravel's standard
     * registration event for future verification or onboarding listeners.
     *
     * @param  array{
     *     name: string,
     *     email: string,
     *     password: string
     * }  $data
     */
    public function execute(array $data): User
    {
        $user = User::create($data);

        /*
         * Use Laravel's standard registration event instead of inventing a
         * duplicate custom event for the same authentication lifecycle fact.
         */
        event(new Registered($user));

        return $user;
    }
}
