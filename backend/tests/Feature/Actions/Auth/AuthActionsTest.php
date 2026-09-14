<?php

namespace Tests\Feature\Actions\Auth;

use App\Actions\Auth\AuthenticateUser;
use App\Actions\Auth\RegisterUser;
use App\Models\User;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Registered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AuthActionsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify registration persists a hashed password and emits Laravel's
     * standard Registered event.
     */
    public function test_register_user_creates_account_and_dispatches_registered_event(): void
    {
        Event::fake([
            Registered::class,
        ]);

        $user = app(RegisterUser::class)->execute([
            'name' => 'Alice',
            'email' => 'alice@example.com',
            'password' => 'long-password-123',
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => 'Alice',
            'email' => 'alice@example.com',
        ]);

        $this->assertNotSame(
            'long-password-123',
            $user->password,
        );

        Event::assertDispatched(
            Registered::class,
            fn (Registered $event): bool => $event->user->is($user),
        );
    }

    /**
     * Verify valid credentials authenticate the expected user and trigger
     * Laravel's normal Login lifecycle event.
     */
    public function test_authenticate_user_logs_in_valid_credentials(): void
    {
        Event::fake([
            Login::class,
        ]);

        $user = User::factory()->create([
            'email' => 'alice@example.com',
            'password' => 'long-password-123',
        ]);

        $authenticated = app(
            AuthenticateUser::class,
        )->execute([
            'email' => 'alice@example.com',
            'password' => 'long-password-123',
        ]);

        $this->assertAuthenticatedAs($user);

        $this->assertTrue(
            $authenticated->is($user),
        );

        Event::assertDispatched(Login::class);
    }

    /**
     * Verify invalid credentials preserve the existing validation response
     * behavior and do not authenticate a user.
     */
    public function test_authenticate_user_rejects_invalid_credentials(): void
    {
        User::factory()->create([
            'email' => 'alice@example.com',
            'password' => 'long-password-123',
        ]);

        try {
            app(AuthenticateUser::class)->execute([
                'email' => 'alice@example.com',
                'password' => 'wrong-password',
            ]);

            $this->fail(
                'Invalid credentials were authenticated.',
            );
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey(
                'email',
                $exception->errors(),
            );
        }

        $this->assertGuest();
    }
}
