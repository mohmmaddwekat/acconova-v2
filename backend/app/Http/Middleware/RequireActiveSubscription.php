<?php

namespace App\Http\Middleware;

use App\Services\Billing\WorkspaceSubscriptionAccess;
use App\Tenancy\OrganizationAccess;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

final class RequireActiveSubscription
{
    public function __construct(
        private readonly WorkspaceSubscriptionAccess $subscriptions,
    ) {}

    public function handle(
        Request $request,
        Closure $next,
    ): Response {
        if (
            ! $this->subscriptions->enforced()
            || $this->subscriptions->requestIsExempt($request)
        ) {
            return $next($request);
        }

        $user = $request->user();
        $organizationId = $request->session()->get(
            OrganizationAccess::SESSION_KEY,
        );

        /*
         * Users without a selected workspace still need onboarding and tenant
         * selection to work. The normal tenancy layer will handle stale state.
         */
        if (
            ! $user
            || ! is_numeric($organizationId)
            || (int) $organizationId <= 0
        ) {
            return $next($request);
        }

        $role = DB::table('memberships')
            ->where(
                'organization_id',
                (int) $organizationId,
            )
            ->where(
                'user_id',
                $user->id,
            )
            ->value('role');

        if (! is_string($role)) {
            $request->session()->forget(
                OrganizationAccess::SESSION_KEY,
            );

            return redirect('/onboarding/workspace');
        }

        return $this->subscriptions->blockedResponse(
            $request,
            (int) $organizationId,
            $role,
        ) ?? $next($request);
    }
}
