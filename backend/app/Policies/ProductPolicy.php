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
     * Allow workspace members to view only current-tenant catalog items.
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
     * Allow operational and accounting roles to update catalog items.
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
     * Restrict archival to roles that control the business catalog.
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
     * Apply the same authority to restoring an archived catalog item.
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
     * Permanent deletion is intentionally unavailable.
     */
    public function forceDelete(
        User $user,
        Product $product,
    ): bool {
        return false;
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

        return $role !== null &&
            in_array(
                $role,
                $roles,
                true,
            );
    }

    /**
     * Resolve the active role without leaking TenantContext failures.
     */
    private function currentRole(): ?OrganizationRole
    {
        try {
            return app(
                TenantContext::class,
            )->role();
        } catch (LogicException) {
            return null;
        }
    }

    /**
     * Verify the Product belongs to the resolved organization.
     */
    private function belongsToCurrentOrganization(
        Product $product,
    ): bool {
        try {
            return $product->organization_id ===
                app(
                    TenantContext::class,
                )->id();
        } catch (LogicException) {
            return false;
        }
    }
}
