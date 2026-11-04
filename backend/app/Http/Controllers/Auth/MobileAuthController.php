<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class MobileAuthController extends Controller
{
    /**
     * Authenticate and return a Passport personal access token for mobile clients.
     *
     * Intentionally avoids Auth::attempt() to skip web-session regeneration,
     * which causes session-fixation errors in stateless API contexts.
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (
            $user->must_change_password
            && $user->temporary_password_expires_at?->isPast()
        ) {
            throw ValidationException::withMessages([
                'email' => ['The temporary password has expired. Request a recovery link or ask an administrator for a new temporary password.'],
            ]);
        }

        $user->forceFill([
            'previous_login_at' => $user->last_login_at,
            'last_login_at' => now(),
        ])->save();

        try {
            $token = $user->createToken('mobile')->accessToken;
        } catch (\Throwable $e) {
            report($e);

            return response()->json([
                'message' => 'Token issuance failed. Run `passport:keys` and `passport:client --personal` on the server.',
                'code' => 'passport_not_configured',
            ], 500);
        }

        return response()->json([
            'token' => $token,
            'user' => (new UserResource($user))->resolve($request),
        ]);
    }

    /**
     * Revoke the current mobile access token.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->token()->revoke();

        return response()->json(['message' => 'Logged out successfully.']);
    }

    /**
     * Return the currently authenticated mobile user.
     */
    public function user(Request $request): JsonResponse
    {
        return response()->json([
            'user' => (new UserResource($request->user()))->resolve($request),
        ]);
    }
}
