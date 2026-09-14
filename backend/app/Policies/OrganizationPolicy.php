<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\TenantContext;
use LogicException;

class OrganizationPolicy
{
    /**
     * Any authenticated application user may create an organization.
     *
     * The user automatically becomes the immutable owner through the
     * CreateOrganization action.
     */
    public function create(User $user): bool
    {
        return true;
    }

    /**
     * Only the Owner of the currently verified organization may update it.
     */
    public function update(User $user, Organization $organization): bool
    {
        try {
            $context = app(TenantContext::class);

            return $context->id() === $organization->id
                && $context->role() === OrganizationRole::Owner;
        } catch (LogicException) {
            return false;
        }
    }

    /**
     * Only the current organization's Owner may soft-delete it.
     */
    public function delete(User $user, Organization $organization): bool
    {
        try {
            $context = app(TenantContext::class);

            return $context->id() === $organization->id
                && $context->role() === OrganizationRole::Owner;
        } catch (LogicException) {
            return false;
        }
    }

    /**
     * Allow restoration only when the authenticated user is the preserved Owner
     * of the soft-deleted organization.
     */
    public function restore(User $user, Organization $organization): bool
    {
        return $organization->trashed()
            && $organization->users()
                ->where('users.id', $user->id)
                ->wherePivot(
                    'role',
                    OrganizationRole::Owner->value,
                )
                ->exists();
    }

    /**
     * Permanent organization deletion is intentionally forbidden.
     */
    public function forceDelete(User $user, Organization $organization): bool
    {
        return false;
    }
}
