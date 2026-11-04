<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets the mobile app reach the session-authenticated business API with its
 * Passport bearer token.
 *
 * Only personal access tokens issued by the mobile login (named "mobile") are
 * honoured, so OAuth/MCP tokens never gain access to the business API. When a
 * mobile token authenticates the request, the default guard is switched to
 * the token guard so a stray session cookie can never act as the identity.
 */
class AuthenticateMobileToken
{
    public const string TOKEN_NAME = 'mobile';

    public const string ORGANIZATION_HEADER = 'X-Organization-Id';

    public function handle(Request $request, Closure $next): Response
    {
        if (
            $request->is('api/*')
            && ! $request->is('api/mobile/*')
            && $request->bearerToken() !== null
        ) {
            $user = Auth::guard('api')->user();

            if ($user instanceof User && $user->token()?->name === self::TOKEN_NAME) {
                Auth::shouldUse('api');
                $request->setUserResolver(fn () => $user);
                $request->attributes->set('mobile_token_auth', true);
                $request->attributes->set('mobile_organization_id', $this->organizationId($request, $user));

                // Token requests are stateless; never persist throwaway sessions.
                config(['session.driver' => 'array']);
            }
        }

        return $next($request);
    }

    /**
     * Resolve the tenant: the explicit header (membership required) or the
     * user's first organization when the client sends none.
     */
    private function organizationId(Request $request, User $user): ?int
    {
        $requested = $request->header(self::ORGANIZATION_HEADER);

        if ($requested !== null) {
            return is_numeric($requested)
                && $user->organizations()->whereKey((int) $requested)->exists()
                    ? (int) $requested
                    : null;
        }

        $first = $user->organizations()->orderBy('organizations.id')->value('organizations.id');

        return $first === null ? null : (int) $first;
    }
}
