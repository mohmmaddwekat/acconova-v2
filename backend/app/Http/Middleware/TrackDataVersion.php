<?php

namespace App\Http\Middleware;

use App\Support\LiveDataVersion;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TrackDataVersion
{
    /**
     * Bump the organization's data version after every successful API write and
     * return it, so the writing browser does not mistake its own change for
     * someone else's.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $organizationId = $request->attributes->get('tenant.organization_id');

        if (
            ! is_int($organizationId)
            || $request->isMethodSafe()
            || ! $request->is('api/*')
            || $request->is('api/live/*')
            || $response->getStatusCode() >= 400
        ) {
            return $response;
        }

        $response->headers->set(
            'X-Data-Version',
            LiveDataVersion::bump($organizationId),
        );

        return $response;
    }
}
