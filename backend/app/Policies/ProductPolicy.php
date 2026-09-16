<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\Product;
use App\Models\User;
use App\Tenancy\TenantContext;
use LogicException;

class ProductPolicy
{
    /**
     * Allow every workspace member to read the catalog.
     */
    public function viewAny(
        User $user,
    ): bool {
        return $this->currentRole() !==
            null;
    }

    /**
     * Allow workspace members to view current-tenant catalog items.
     */
    public function view(
        User $user,
        Product $product,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $product,
        ) && $this->currentRole() !== null;
    }

    /**
     * Allow operational and accounting roles to create catalog items.
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
     * Allow operational and accounting roles to update active catalog items.
     */
    public function update(
        User $user,
        Product $product,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $product,
        ) && $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
            OrganizationRole::Accountant,
        ]);
    }

    /**
     * Restrict physical stock mutations to operational management roles.
     *
     * Accountants can edit catalog metadata but inventory movement authority
     * stays with Owner/Admin/Manager.
     */
    public function manageInventory(
        User $user,
        Product $product,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $product,
        ) && $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
        ]);
    }

    /**
     * Restrict archival to roles that manage catalog lifecycle.
     */
    public function delete(
        User $user,
        Product $product,
    ): bool {
        return $this->belongsToCurrentOrganization(
            $product,
        ) && $this->hasAnyRole([
            OrganizationRole::Owner,
            OrganizationRole::Admin,
            OrganizationRole::Manager,
        ]);
    }

    /**
     * Apply archival authority to restoration.
     */
    public function restore(
        User $user,
        Product $product,
    ): bool {
        return $this->delete(
            $user,
            $product,
        );
    }

    /**
     * Allow permanent deletion only to Owner/Admin and only after archival.
     */
    public function forceDelete(
        User $user,
        Product $product,
    ): bool {
        return $product->trashed()
            && $this->belongsToCurrentOrganization(
                $product,
            )
            && $this->hasAnyRole([
                OrganizationRole::Owner,
                OrganizationRole::Admin,
            ]);
    }

    /**
     * Determine whether the active organization role is allowed.
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
     * Resolve the active organization role safely.
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
     * Verify that the Product belongs to the active organization.
     */
    private function belongsToCurrentOrganization(
        Product $product,
    ): bool {
        try {
            return (int) $product
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
