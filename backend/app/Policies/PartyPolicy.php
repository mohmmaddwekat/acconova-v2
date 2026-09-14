<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\TenantContext;
use LogicException;

class PartyPolicy
{
    public function viewAny(User $user): bool
    {
        return $this->currentRole() !== null;
    }

    public function view(User $user, Party $party): bool
    {
        return $this->belongsToCurrentOrganization($party)
            && $this->currentRole() !== null;
    }

    public function create(User $user): bool
    {
        return $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
            OrganizationRole::Accountant,
        ]);
    }

    public function update(User $user, Party $party): bool
    {
        return $this->belongsToCurrentOrganization($party)
            && $this->hasAnyRole([
                OrganizationRole::Owner,
                OrganizationRole::Admin,
                OrganizationRole::Manager,
                OrganizationRole::Accountant,
            ]);
    }

    public function delete(User $user, Party $party): bool
    {
        return $this->belongsToCurrentOrganization($party)
            && $this->hasAnyRole([
                OrganizationRole::Owner,
                OrganizationRole::Admin,
                OrganizationRole::Manager,
            ]);
    }

    /**
     * Allow authorized operational roles to restore a Party in the current
     * organization.
     */
    public function restore(User $user, Party $party): bool
    {
        return $this->delete(
            $user,
            $party,
        );
    }

    /**
     * Permanent Party deletion is intentionally unavailable.
     */
    public function forceDelete(User $user, Party $party): bool
    {
        return false;
    }

    private function hasAnyRole(array $roles): bool
    {
        $role = $this->currentRole();

        return $role !== null && in_array($role, $roles, true);
    }

    private function currentRole(): ?OrganizationRole
    {
        try {
            return app(TenantContext::class)->role();
        } catch (LogicException) {
            return null;
        }
    }

    private function belongsToCurrentOrganization(Party $party): bool
    {
        try {
            return $party->organization_id === app(TenantContext::class)->id();
        } catch (LogicException) {
            return false;
        }
    }
}
