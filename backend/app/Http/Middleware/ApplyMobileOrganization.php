<?php

namespace App\Http\Middleware;

use App\Tenancy\OrganizationAccess;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Publishes the organization chosen for a mobile token request as the active
 * tenant of the (in-memory) session, so every downstream middleware and
 * controller that reads the web session sees the same tenant.
 */
class ApplyMobileOrganization
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->attributes->get('mobile_token_auth') === true) {
            $organizationId = $request->attributes->get('mobile_organization_id');

            if ($organizationId !== null) {
                $request->session()->put(OrganizationAccess::SESSION_KEY, $organizationId);
            } else {
                $request->session()->forget(OrganizationAccess::SESSION_KEY);
            }
        }

        return $next($request);
    }
}
