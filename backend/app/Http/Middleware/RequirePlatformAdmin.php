<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RequirePlatformAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return redirect()->guest(route('login', ['admin' => 1]));
        }

        $email = strtolower(trim((string) $user->email));
        $emails = array_values(array_filter(array_map(
            static fn ($value): string => strtolower(trim((string) $value)),
            (array) config('platform_admin.emails', []),
        )));

        $localAllowed = app()->environment('local')
            && (bool) config('platform_admin.allow_any_authenticated_user_locally', false);

        abort_unless($localAllowed || in_array($email, $emails, true), 403);

        return $next($request);
    }
}
