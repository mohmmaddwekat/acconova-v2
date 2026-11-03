<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\AuthenticateUser;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileAuthController extends Controller
{
    /**
     * Authenticate and return a Passport personal access token for mobile clients.
     */
    public function login(
        LoginRequest $request,
        AuthenticateUser $authenticateUser,
    ): JsonResponse {
        $user = $authenticateUser->execute($request->validated());

        $user->forceFill([
            'previous_login_at' => $user->last_login_at,
            'last_login_at' => now(),
        ])->save();

        $token = $user->createToken('mobile')->accessToken;

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
