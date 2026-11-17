<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RememberMeTest extends TestCase
{
    use RefreshDatabase;

    public function test_remember_me_sets_a_long_lived_sign_in_cookie(): void
    {
        $user = $this->userWithPassword('SecureAccountPassword123!');

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'SecureAccountPassword123!',
            'remember' => true,
        ])->assertOk();

        $recaller = collect($response->headers->getCookies())
            ->first(fn ($cookie) => str_starts_with($cookie->getName(), 'remember_web_'));

        $this->assertNotNull($recaller, 'The remember-me cookie was not issued.');
        $this->assertGreaterThan(now()->addDays(29)->getTimestamp(), $recaller->getExpiresTime());
        $this->assertNotNull($user->fresh()->remember_token);
        $this->assertAuthenticatedAs($user);
    }

    public function test_login_without_remember_me_does_not_issue_the_cookie(): void
    {
        $user = $this->userWithPassword('SecureAccountPassword123!');

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'SecureAccountPassword123!',
        ])->assertOk();

        $names = collect($response->headers->getCookies())->map(fn ($cookie) => $cookie->getName());

        $this->assertFalse($names->contains(fn (string $name) => str_starts_with($name, 'remember_web_')));
        $this->assertAuthenticatedAs($user);
    }

    public function test_remember_flag_must_be_a_boolean(): void
    {
        $user = $this->userWithPassword('SecureAccountPassword123!');

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'SecureAccountPassword123!',
            'remember' => 'maybe',
        ])->assertUnprocessable()->assertJsonValidationErrors('remember');
    }

    private function userWithPassword(string $password): User
    {
        return User::factory()->create([
            'password' => Hash::make($password),
            'must_change_password' => false,
        ]);
    }
}
