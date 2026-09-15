<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class EmailVerificationController extends Controller
{
    /**
     * Fulfill a valid signed verification request and continue onboarding.
     */
    public function verify(
        EmailVerificationRequest $request,
    ): RedirectResponse {
        if (! $request->user()->hasVerifiedEmail()) {
            $request->fulfill();
        }

        return redirect()->to(
            $this->destination(
                $request->user(),
            ),
        );
    }

    /**
     * Send another verification email to an authenticated unverified user.
     */
    public function send(Request $request): JsonResponse
    {
        if ($request->user()->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Your email is already verified.',
            ]);
        }

        $request->user()
            ->sendEmailVerificationNotification();

        return response()->json([
            'message' => 'A new verification email has been sent.',
        ]);
    }

    /**
     * Determine where a newly verified account should continue.
     *
     * Users without a business workspace continue onboarding while users
     * who already belong to an organization return to the application.
     */
    private function destination(User $user): string
    {
        $hasOrganization = Organization::query()
            ->whereHas(
                'users',
                /**
                 * Restrict the organization lookup to the verified user.
                 */
                fn ($query) => $query->where(
                    'users.id',
                    $user->id,
                ),
            )
            ->exists();

        return $hasOrganization
            ? '/app'
            : '/onboarding/workspace';
    }
}
