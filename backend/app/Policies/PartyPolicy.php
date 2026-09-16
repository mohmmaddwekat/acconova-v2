<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\TenantContext;
use LogicException;

class PartyPolicy
{
    /**
     * Allow every current workspace member to list Parties.
     */
    public function viewAny(
        User $user,
    ): bool {
        return $this->currentRole() !==
            null;
    }

    /**
     * Allow viewing current-tenant Party records.
     */
    public function view(
        User $user,
        Party $party,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $party,
        ) && $this->currentRole() !== null;
    }

    /**
     * Allow operating roles to create Parties.
     */
    public function create(
        User $user,
    ): bool {
        return $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
            OrganizationRole::Accountant,
        ]);
    }

    /**
     * Allow operating/accounting roles to update Parties.
     */
    public function update(
        User $user,
        Party $party,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $party,
        ) && $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
            OrganizationRole::Accountant,
        ]);
    }

    /**
     * Allow Owner/Admin/Manager to archive a Party.
     */
    public function delete(
        User $user,
        Party $party,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $party,
        ) && $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
        ]);
    }

    /**
     * Use the same lifecycle authority for restoration.
     */
    public function restore(
        User $user,
        Party $party,
    ): bool {
        return $this->delete(
            $user,
            $party,
        );
    }

    /**
     * Permanent deletion requires Owner/Admin authority and an archived Party.
     */
    public function forceDelete(
        User $user,
        Party $party,
    ): bool {
        return $party->trashed()
            && $this->belongsToCurrentOrganization(
                $party,
            )
            && $this->hasAnyRole([
                OrganizationRole::Owner,
                OrganizationRole::Admin,
            ]);
    }

    /**
     * Test the active organization role against an explicit allowlist.
     *
     * @param  list<OrganizationRole>  $roles
     */
    private function hasAnyRole(
        array $roles,
    ): bool {
        $role =
            $this->currentRole();

        return $role !== null
            && in_array(
                $role,
                $roles,
                true,
            );
    }

    /**
     * Resolve the current tenant role safely.
     */
    private function currentRole(): ?OrganizationRole
    {
        try {
            return app(
                TenantContext::class,
            )->role();
        } catch (
            LogicException) {
                return null;
            }
    }

    /**
     * Confirm the Party belongs to the currently resolved tenant.
     */
    private function belongsToCurrentOrganization(
        Party $party,
    ): bool {
        try {
            return $party->organization_id
                === app(
                    TenantContext::class,
                )->id();
        } catch (
            LogicException) {
                return false;
            }
    }
}
