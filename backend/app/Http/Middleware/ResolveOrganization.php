<?php

namespace App\Http\Middleware;

use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Closure;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ResolveOrganization
{
    public function handle(Request $request, Closure $next): Response
    {
        $context = app(TenantContext::class);
        $context->clear();
        $organizationId = $request->route('organization') ?? $request->session()->get(OrganizationAccess::SESSION_KEY);

        try {
            abort_unless(is_numeric($organizationId) && (int) $organizationId > 0, 404);

            $resolve = function () use ($request, $next, $context, $organizationId): Response {
                try {
                    app(OrganizationAccess::class)->resolve($request->user(), (int) $organizationId, $context, ! $request->isMethodSafe());

                    WorkspaceFeaturePermissions::authorizeRequest(
                        $request,
                    );
                } catch (ModelNotFoundException $exception) {
                    if ((string) $request->session()->get(OrganizationAccess::SESSION_KEY) === (string) $organizationId) {
                        $request->session()->forget(OrganizationAccess::SESSION_KEY);
                    }

                    throw $exception;
                }

                return $next($request);
            };

            return $request->isMethodSafe() ? $resolve() : DB::transaction($resolve);
        } finally {
            $context->clear();
        }
    }
}
