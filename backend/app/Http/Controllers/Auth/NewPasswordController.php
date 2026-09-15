<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\ResetUserPassword;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResetPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;

class NewPasswordController extends Controller
{
    /**
     * Reset the account password after the broker validates the token.
     */
    public function store(
        ResetPasswordRequest $request,
        ResetUserPassword $resetUserPassword,
    ): JsonResponse {
        $status = $resetUserPassword->execute(
            $request->validated(),
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'message' => 'The password could not be reset.',
                'errors' => [
                    'email' => [
                        __($status),
                    ],
                ],
            ], 422);
        }

        return response()->json([
            'message' => 'Your password has been reset successfully.',
        ]);
    }
}
