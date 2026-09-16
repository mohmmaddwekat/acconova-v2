<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\TenantContext;
use LogicException;

class WarehousePolicy
{
    /**
     * Allow every current workspace member to inspect Inventory locations.
     */
    public function viewAny(
        User $user,
    ): bool {
        return $this->currentRole()
            !== null;
    }

    /**
     * Allow viewing only tenant-scoped warehouse records.
     */
    public function view(
        User $user,
        Warehouse $warehouse,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $warehouse,
        ) && $this->currentRole() !== null;
    }

    /**
     * Allow operational management roles to create warehouses.
     */
    public function create(
        User $user,
    ): bool {
        return $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
        ]);
    }

    /**
     * Allow operational management roles to update tenant-scoped warehouses.
     *
     * Warehouse requests resolve records through BelongsToOrganization before
     * invoking this policy, while the model itself prevents cross-tenant saves.
     */
    public function update(
        User $user,
        Warehouse $warehouse,
    ): bool {
        return $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
        ]);
    }

    /**
     * Allow operational management roles to archive warehouses.
     */
    public function delete(
        User $user,
        Warehouse $warehouse,
    ): bool {
        return $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
        ]);
    }

    /**
     * Apply warehouse lifecycle authority to restoration.
     */
    public function restore(
        User $user,
        Warehouse $warehouse,
    ): bool {
        return $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
        ]);
    }

    /**
     * Allow permanent deletion only to Owner/Admin and only after archival.
     *
     * WarehouseService performs the final stock/history safety checks.
     */
    public function forceDelete(
        User $user,
        Warehouse $warehouse,
    ): bool {
        return $warehouse->trashed()
            && $this->hasAnyRole([
                OrganizationRole::Owner,
                OrganizationRole::Admin,
            ]);
    }

    /**
     * Determine whether the current workspace role belongs to an allowlist.
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
     * Resolve the current organization role safely.
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
     * Verify warehouse ownership against the active tenant.
     */
    private function belongsToCurrentOrganization(
        Warehouse $warehouse,
    ): bool {
        try {
            return (int) $warehouse
                ->getAttribute(
                    'organization_id',
                )
                ===
                app(
                    TenantContext::class,
                )->id();
        } catch (
            LogicException) {
                return false;
            }
    }
}
