<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ForcePasswordChange
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->must_change_password) {
            return $next($request);
        }

        if ($this->allowed($request)) {
            return $next($request);
        }

        if ($request->expectsJson() || $request->is('api/*')) {
            return response()->json([
                'message' => 'A password change is required before continuing.',
                'code' => 'password_change_required',
                'redirect' => route('password.change-required'),
            ], 423);
        }

        return redirect()->route('password.change-required');
    }

    private function allowed(Request $request): bool
    {
        return $request->is('password-change-required')
            || $request->is('api/security/change-required-password')
            || $request->is('api/security/send-recovery-link')
            || $request->is('api/logout')
            || $request->is('api/auth/logout');
    }
}
