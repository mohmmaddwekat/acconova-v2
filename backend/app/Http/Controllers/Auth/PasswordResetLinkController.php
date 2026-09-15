<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\SendPasswordResetLink;
use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;

class PasswordResetLinkController extends Controller
{
    /**
     * Request a password-reset email for an existing AccoNova account.
     *
     * Unlike a privacy-preserving recovery flow, AccoNova intentionally
     * returns a clear validation error when the submitted email does not
     * belong to an account because the product UX requires explicit feedback.
     */
    public function store(
        ForgotPasswordRequest $request,
        SendPasswordResetLink $sendPasswordResetLink,
    ): JsonResponse {
        $status = $sendPasswordResetLink->execute(
            $request->validated('email'),
        );

        /*
         * Give the user explicit feedback when no account exists for the
         * submitted email address.
         */
        if ($status === Password::INVALID_USER) {
            return response()->json([
                'message' => 'No AccoNova account was found with this email address.',
                'errors' => [
                    'email' => [
                        'No AccoNova account was found with this email address.',
                    ],
                ],
            ], 422);
        }

        /*
         * Preserve Laravel's password-reset throttling so repeated email
         * delivery cannot be abused.
         */
        if ($status === Password::RESET_THROTTLED) {
            return response()->json([
                'message' => __($status),
                'errors' => [
                    'email' => [
                        __($status),
                    ],
                ],
            ], 429);
        }

        return response()->json([
            'message' => 'A password reset link has been sent to your email address.',
        ]);
    }
}
