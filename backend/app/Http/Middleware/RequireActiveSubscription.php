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
            !$this->subscriptions->enforced()
            || $this->subscriptions->requestIsExempt($request)
        ) {
            return $next($request);
        }

        $user = $request->user();

        if (!$user) {
            return $next($request);
        }

        $organizationId = $request->session()->get(
            OrganizationAccess::SESSION_KEY,
        );

        $role = null;

        /*
         * Match AccoNova's normal one-workspace auto-selection before the page
         * renders. Otherwise a user with one unpaid workspace could briefly
         * reach the dashboard on the request that restores their session.
         */
        if (
            !is_numeric($organizationId)
            || (int) $organizationId <= 0
        ) {
            $memberships = DB::table('memberships')
                ->where('user_id', $user->id)
                ->limit(2)
                ->get([
                    'organization_id',
                    'role',
                ]);

            if ($memberships->count() !== 1) {
                return $next($request);
            }

            $membership = $memberships->first();
            $organizationId = (int) $membership->organization_id;
            $role = (string) $membership->role;

            $request->session()->put(
                OrganizationAccess::SESSION_KEY,
                $organizationId,
            );
        }

        $role ??= DB::table('memberships')
            ->where(
                'organization_id',
                (int) $organizationId,
            )
            ->where(
                'user_id',
                $user->id,
            )
            ->value('role');

        if (!is_string($role)) {
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
