<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify that registration sends Laravel's standard email-verification
     * notification and leaves the new account unverified.
     */
    public function test_registration_sends_verification_email(): void
    {
        Notification::fake();

        $this->postJson(
            '/api/register',
            [
                'name' => 'New Owner',
                'email' => 'owner@example.com',
                'password' => 'SecurePassword123!',
                'password_confirmation' => 'SecurePassword123!',
            ],
        )->assertCreated();

        $user = User::query()
            ->where(
                'email',
                'owner@example.com',
            )
            ->firstOrFail();

        $this->assertFalse(
            $user->hasVerifiedEmail(),
        );

        Notification::assertSentTo(
            $user,
            VerifyEmail::class,
        );
    }

    /**
     * Prevent an unverified authenticated user from entering the normal
     * AccoNova browser application.
     */
    public function test_unverified_user_is_redirected_to_verification_notice(): void
    {
        $user = User::factory()
            ->unverified()
            ->create();

        $this->actingAs($user)
            ->get('/app')
            ->assertRedirect(
                '/verify-email',
            );
    }

    /**
     * Prevent an unverified account from bypassing the browser verification
     * checkpoint by calling protected business APIs directly.
     */
    public function test_unverified_user_cannot_access_business_api(): void
    {
        $user = User::factory()
            ->unverified()
            ->create();

        $this->actingAs($user)
            ->getJson(
                '/api/organizations',
            )
            ->assertForbidden();
    }

    /**
     * Allow a verified account to reach normal protected business APIs.
     */
    public function test_verified_user_can_access_business_api(): void
    {
        $user = User::factory()
            ->create();

        $this->actingAs($user)
            ->getJson(
                '/api/organizations',
            )
            ->assertOk();
    }

    /**
     * Allow an unverified authenticated user to request another verification
     * notification.
     */
    public function test_user_can_resend_verification_email(): void
    {
        Notification::fake();

        $user = User::factory()
            ->unverified()
            ->create();

        $this->actingAs($user)
            ->postJson(
                '/api/email/verification-notification',
            )
            ->assertOk();

        Notification::assertSentTo(
            $user,
            VerifyEmail::class,
        );
    }

    /**
     * Avoid sending redundant verification messages to an account that has
     * already completed email verification.
     */
    public function test_verified_user_does_not_receive_another_verification_email(): void
    {
        Notification::fake();

        $user = User::factory()
            ->create();

        $this->actingAs($user)
            ->postJson(
                '/api/email/verification-notification',
            )
            ->assertOk()
            ->assertJsonPath(
                'message',
                'Your email is already verified.',
            );

        Notification::assertNothingSent();
    }

    /**
     * Fulfill a valid signed email-verification URL and continue a new user's
     * first-workspace onboarding.
     */
    public function test_email_can_be_verified_with_valid_signed_url(): void
    {
        $user = User::factory()
            ->unverified()
            ->create();

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

        $this->actingAs($user)
            ->get($verificationUrl)
            ->assertRedirect(
                '/onboarding/workspace',
            );

        $this->assertTrue(
            $user->fresh()
                ->hasVerifiedEmail(),
        );
    }

    /**
     * Reject a verification URL that has been modified or was not signed by
     * Laravel.
     */
    public function test_unsigned_verification_url_is_rejected(): void
    {
        $user = User::factory()
            ->unverified()
            ->create();

        $this->actingAs($user)
            ->get(
                "/verify-email/{$user->id}/".
                    sha1(
                        $user->getEmailForVerification(),
                    ),
            )
            ->assertForbidden();

        $this->assertFalse(
            $user->fresh()
                ->hasVerifiedEmail(),
        );
    }

    /**
     * Prevent one authenticated user from using a valid signed URL that was
     * issued for a different account.
     */
    public function test_user_cannot_verify_another_users_email(): void
    {
        $firstUser = User::factory()
            ->unverified()
            ->create();

        $secondUser = User::factory()
            ->unverified()
            ->create();

        $verificationUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            [
                'id' => $secondUser->id,
                'hash' => sha1(
                    $secondUser
                        ->getEmailForVerification(),
                ),
            ],
        );

        $this->actingAs($firstUser)
            ->get($verificationUrl)
            ->assertForbidden();

        $this->assertFalse(
            $secondUser->fresh()
                ->hasVerifiedEmail(),
        );
    }

    /**
     * Keep an already verified account away from the verification notice
     * because there is no verification work left to perform.
     */
    public function test_verified_user_leaves_verification_notice(): void
    {
        $user = User::factory()
            ->create();

        $this->actingAs($user)
            ->get('/verify-email')
            ->assertRedirect('/app');
    }
}
