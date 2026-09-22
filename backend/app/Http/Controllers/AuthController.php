<?php

namespace App\Http\Controllers;

use App\Actions\Auth\AuthenticateUser;
use App\Actions\Auth\RegisterUser;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    /**
     * Return the current session CSRF token for the session-based JSON client.
     */
    public function csrf(Request $request): JsonResponse
    {
        return response()->json([
            'csrf_token' => $request->session()->token(),
        ]);
    }

    /**
     * Register a user, authenticate the new account, reset any stale tenant
     * selection, and rotate the session identifier against fixation attacks.
     */
    public function register(
        RegisterRequest $request,
        RegisterUser $registerUser,
    ): JsonResponse {
        $user = $registerUser->execute(
            $request->validated(),
        );

        Auth::login($user);

        $user->forceFill([
            'previous_login_at' => $user->last_login_at,
            'last_login_at' => now(),
        ])->save();

        /*
         * A newly authenticated identity must never inherit an active tenant
         * selection that belonged to a previous session identity.
         */
        $request->session()->forget(
            OrganizationAccess::SESSION_KEY,
        );

        // Rotate the session ID after authentication to prevent fixation.
        $request->session()->regenerate();

        return response()->json([
            'user' => (new UserResource($user))
                ->resolve($request),
        ], 201);
    }

    /**
     * Authenticate validated credentials, discard any previous tenant
     * selection, and rotate the session identifier.
     */
    public function login(
        LoginRequest $request,
        AuthenticateUser $authenticateUser,
    ): JsonResponse {
        $user = $authenticateUser->execute(
            $request->validated(),
        );

        $user->forceFill([
            'previous_login_at' => $user->last_login_at,
            'last_login_at' => now(),
        ])->save();

        /*
         * Active organization state belongs to the authenticated identity and
         * must not survive a login transition from a previous identity.
         */
        $request->session()->forget(
            OrganizationAccess::SESSION_KEY,
        );

        // Rotate the session ID after successful authentication.
        $request->session()->regenerate();

        return response()->json([
            'user' => (new UserResource($user))
                ->resolve($request),
        ]);
    }

    /**
     * End authentication, clear tenant state, invalidate the old session, and
     * rotate the CSRF token before returning an empty successful response.
     */
    public function logout(Request $request): Response
    {
        Auth::logout();

        /*
         * TenantContext is request-scoped, but explicitly clearing it keeps
         * the logout boundary fail-closed even if logout is reused elsewhere.
         */
        app(TenantContext::class)->clear();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }
}
