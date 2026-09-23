<?php

namespace App\Services\Billing;

use App\Enums\OrganizationRole;
use App\Models\BillingAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

final class WorkspaceSubscriptionAccess
{
    public function enforced(): bool
    {
        return (bool) config('billing.enabled', false)
            && (bool) config('billing.enforce_subscription', true);
    }

    public function requestIsExempt(Request $request): bool
    {
        return $request->is(
            'app/billing',
            'app/billing/*',
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

        if ($this->organizationIsReadOnly($organizationId)) {
            return false;
        }

        $account = BillingAccount::query()
            ->where('organization_id', $organizationId)
            ->first();

        if (in_array($account?->status, ['active', 'trialing'], true)) {
            return true;
        }

        if (
            in_array($account?->status, ['past_due', 'unpaid'], true)
            && Schema::hasTable('billing_growth_profiles')
        ) {
            $graceEndsAt = DB::table('billing_growth_profiles')
                ->where('organization_id', $organizationId)
                ->value('grace_ends_at');

            if ($graceEndsAt && now()->lt($graceEndsAt)) {
                return true;
            }
        }

        return false;
    }

    public function roleCanManageBilling(OrganizationRole|string|null $role): bool
    {
        $value = $role instanceof OrganizationRole ? $role->value : $role;

        return in_array($value, [
            OrganizationRole::Owner->value,
            OrganizationRole::Admin->value,
        ], true);
    }

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

        $readOnly = $this->organizationIsReadOnly($organizationId);

        /*
         * Soft lock is an explicit lifecycle state. It preserves reads and
         * exports only after a workspace has actually entered read-only mode.
         * New or otherwise unsubscribed workspaces remain fully gated.
         */
        if (
            $readOnly
            && (bool) config('billing_growth.soft_lock', true)
            && in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true)
        ) {
            return null;
        }

        if ($request->is('api/*') || $request->expectsJson()) {
            return response()->json([
                'message' => $readOnly
                    ? 'This workspace is read-only until its AccoNova subscription is restored.'
                    : 'An active AccoNova subscription is required for this workspace.',
                'code' => $readOnly
                    ? 'SUBSCRIPTION_READ_ONLY'
                    : 'SUBSCRIPTION_REQUIRED',
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

    private function organizationIsReadOnly(int $organizationId): bool
    {
        if (! Schema::hasTable('billing_growth_profiles')) {
            return false;
        }

        return (bool) DB::table('billing_growth_profiles')
            ->where('organization_id', $organizationId)
            ->value('read_only');
    }
}
