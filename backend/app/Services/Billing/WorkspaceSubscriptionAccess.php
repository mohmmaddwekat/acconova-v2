<?php

namespace App\Services\Billing;

use App\Enums\OrganizationRole;
use App\Models\BillingAccount;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class WorkspaceSubscriptionAccess
{
    /**
     * Subscription enforcement only starts when billing itself is enabled.
     * This keeps local setup and emergency billing maintenance controllable.
     */
    public function enforced(): bool
    {
        return (bool) config('billing.enabled', false)
            && (bool) config('billing.enforce_subscription', true);
    }

    /**
     * Billing, profile, onboarding, and tenant-switching surfaces must remain
     * reachable even when the current workspace subscription is inactive.
     */
    public function requestIsExempt(Request $request): bool
    {
        return $request->is(
            'app/billing',
            'app/subscription-required',
            'app/profile',
            'onboarding/workspace',
            'api/billing/*',
            'api/current-organization',
        );
    }

    public function organizationHasAccess(int $organizationId): bool
    {
        if (! $this->enforced()) {
            return true;
        }

        return BillingAccount::query()
            ->where('organization_id', $organizationId)
            ->whereIn('status', [
                'active',
                'trialing',
            ])
            ->exists();
    }

    public function roleCanManageBilling(
        OrganizationRole|string|null $role,
    ): bool {
        $value = $role instanceof OrganizationRole
            ? $role->value
            : $role;

        return in_array(
            $value,
            [
                OrganizationRole::Owner->value,
                OrganizationRole::Admin->value,
            ],
            true,
        );
    }

    /**
     * Return a blocking response when this request requires a paid workspace.
     */
    public function blockedResponse(
        Request $request,
        int $organizationId,
        OrganizationRole|string|null $role,
    ): ?Response {
        if (
            ! $this->enforced()
            || $this->requestIsExempt($request)
            || $this->organizationHasAccess($organizationId)
        ) {
            return null;
        }

        if (
            $request->is('api/*')
            || $request->expectsJson()
        ) {
            return response()->json([
                'message' => 'An active AccoNova subscription is required for this workspace.',
                'code' => 'SUBSCRIPTION_REQUIRED',
                'billing_url' => $this->roleCanManageBilling($role)
                    ? '/app/billing'
                    : '/app/subscription-required',
            ], 402);
        }

        return redirect(
            $this->roleCanManageBilling($role)
                ? '/app/billing'
                : '/app/subscription-required',
        );
    }
}
