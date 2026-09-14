<?php

namespace App\Http\Middleware;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Tenancy\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveOrganization
{
    public function handle(Request $request, Closure $next): Response
    {
        $context = app(TenantContext::class);
        $context->clear();

        try {
            // The organization identifier is only trusted after checking authenticated membership.
            $organization = Organization::query()
                ->whereKey($request->route('organization'))
                ->whereHas('users', fn ($query) => $query->where('users.id', $request->user()->id))
                ->firstOrFail();
            $membership = $organization->users()->where('users.id', $request->user()->id)->firstOrFail();
            $context->set($organization, OrganizationRole::from($membership->pivot->role));

            return $next($request);
        } finally {
            $context->clear();
        }
    }
}
