<?php

namespace Tests\Feature\Auth;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify the complete AccoNova first-user authentication lifecycle from
     * registration through email verification, workspace creation, logout,
     * and a fresh login.
     */
    public function test_complete_new_account_authentication_flow(): void
    {
        Notification::fake();

        $password =
            'SecureAccountPassword123!';

        /*
         * Registration creates the account, hashes its password, authenticates
         * the browser session, and dispatches email verification.
         */
        $this->postJson(
            '/api/register',
            [
                'name' => 'AccoNova Owner',
                'email' => 'owner@example.com',
                'password' => $password,
                'password_confirmation' => $password,
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'user.email',
                'owner@example.com',
            );

        $this->assertAuthenticated();

        $user = User::query()
            ->where(
                'email',
                'owner@example.com',
            )
            ->firstOrFail();

        $this->assertFalse(
            $user->hasVerifiedEmail(),
        );

        $this->assertTrue(
            Hash::check(
                $password,
                $user->password,
            ),
        );

        Notification::assertSentTo(
            $user,
            VerifyEmail::class,
        );

        /*
         * Authentication alone must not bypass the email verification
         * checkpoint.
         */
        $this->get('/app')
            ->assertRedirect(
                '/verify-email',
            );

        $this->getJson(
            '/api/organizations',
        )->assertForbidden();

        /*
         * Follow the same signed verification contract Laravel places into
         * the real verification email.
         */
        $verificationUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            [
                'id' => $user->id,
                'hash' => sha1(
                    $user->getEmailForVerification(),
                ),
            ],
        );

        $this->get($verificationUrl)
            ->assertRedirect(
                '/onboarding/workspace',
            );

        $this->assertTrue(
            $user->fresh()
                ->hasVerifiedEmail(),
        );

        /*
         * A verified first-time account can now create its first isolated
         * organization. OrganizationController also selects it as the active
         * tenant for the current session.
         */
        $organizationResponse = $this->postJson(
            '/api/organizations',
            [
                'name' => 'AccoNova Studio',
            ],
        )
            ->assertCreated();

        $organizationId =
            $organizationResponse->json(
                'data.id',
            );

        $this->assertDatabaseHas(
            'organizations',
            [
                'id' => $organizationId,
                'name' => 'AccoNova Studio',
            ],
        );

        $this->assertDatabaseHas(
            'memberships',
            [
                'organization_id' => $organizationId,
                'user_id' => $user->id,
                'role' => 'owner',
            ],
        );

        $this->assertSame(
            (string) $organizationId,
            (string) session()->get(
                OrganizationAccess::SESSION_KEY,
            ),
        );

        $this->get('/app')
            ->assertOk();

        /*
         * Logout must destroy the authenticated boundary and remove access to
         * protected application routes.
         */
        $this->postJson(
            '/api/logout',
        )->assertNoContent();

        $this->assertGuest();

        $this->get('/app')
            ->assertRedirect('/login');

        /*
         * A later login restores only identity, never stale tenant selection.
         * The active organization must be selected deliberately again.
         */
        $loginResponse = $this->postJson(
            '/api/login',
            [
                'email' => $user->email,
                'password' => $password,
            ],
        )
            ->assertOk();

        $this->assertAuthenticatedAs(
            $user,
        );

        $loginResponse->assertSessionMissing(
            OrganizationAccess::SESSION_KEY,
        );

        /*
         * The account still owns its organization even though a fresh login
         * deliberately begins without an active tenant selection.
         */
        $this->assertTrue(
            Organization::query()
                ->whereKey(
                    $organizationId,
                )
                ->whereHas(
                    'users',
                    /**
                     * Confirm the same account remains an organization member.
                     */
                    fn ($query) => $query->where(
                        'users.id',
                        $user->id,
                    ),
                )
                ->exists(),
        );
    }
}
