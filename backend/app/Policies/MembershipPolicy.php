<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Models\User;
use App\Tenancy\TenantContext;
use LogicException;

class MembershipPolicy
{
    /**
     * Allow authorized organization administrators to list memberships.
     */
    public function viewAny(User $user): bool
    {
        return $this->manage($user);
    }

    /**
     * Allow Owners and Admins to inspect a membership in their organization.
     */
    public function view(User $user, Membership $membership): bool
    {
        return $this->belongsToCurrentOrganization($membership)
            && $this->canManageMembers();
    }

    /**
     * Allow authorized organization administrators to start adding a member.
     */
    public function create(User $user): bool
    {
        return $this->manage($user);
    }

    /**
     * Allow an Owner to manage any non-Owner membership.
     *
     * Admins may manage normal operational roles but may not manage another
     * Admin or the immutable Owner membership.
     */
    public function update(User $user, Membership $membership): bool
    {
        return $this->canChangeMembership($membership);
    }

    /**
     * Apply the same membership hierarchy rules to removal.
     */
    public function delete(User $user, Membership $membership): bool
    {
        return $this->canChangeMembership($membership);
    }

    /**
     * Memberships are permanently removed through the normal delete flow;
     * a separate force-delete capability is intentionally unavailable.
     */
    public function forceDelete(User $user, Membership $membership): bool
    {
        return false;
    }

    /**
     * Determine whether the active organization role may manage members.
     */
    private function canManageMembers(): bool
    {
        try {
            return in_array(
                app(TenantContext::class)->role(),
                [
                    OrganizationRole::Owner,
                    OrganizationRole::Admin,
                ],
                true,
            );
        } catch (LogicException) {
            return false;
        }
    }

    /**
     * Enforce organization isolation and the Owner/Admin role hierarchy for
     * modifying one existing membership.
     */
    private function canChangeMembership(Membership $membership): bool
    {
        try {
            $context = app(TenantContext::class);

            if (! $this->belongsToCurrentOrganization($membership)) {
                return false;
            }

            if ($membership->role === OrganizationRole::Owner) {
                return false;
            }

            return match ($context->role()) {
                OrganizationRole::Owner => true,

                OrganizationRole::Admin => $membership->role !== OrganizationRole::Admin,

                default => false,
            };
        } catch (LogicException) {
            return false;
        }
    }

    /**
     * Confirm that the membership belongs to the currently verified tenant.
     */
    private function belongsToCurrentOrganization(
        Membership $membership,
    ): bool {
        try {
            return (int) $membership->organization_id
                === app(TenantContext::class)->id();
        } catch (LogicException) {
            return false;
        }
    }

    /**
     * Determine whether the current organization role may enter membership
     * management flows at all.
     *
     * Fine-grained checks for a specific membership are performed separately.
     */
    public function manage(User $user): bool
    {
        return $this->canManageMembers();
    }
}
