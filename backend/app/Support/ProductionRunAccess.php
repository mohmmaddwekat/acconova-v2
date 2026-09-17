<?php

namespace App\Support;

use App\Enums\OrganizationRole;
use App\Models\User;
use App\Services\WorkspacePermissions;
use App\Tenancy\TenantContext;
use LogicException;

final class ProductionRunAccess
{
    /**
     * Determine whether the authenticated workspace member may view Production.
     *
     * Built-in workspace roles retain their normal read access. Custom roles
     * must explicitly receive Inventory view or management permission.
     */
    public static function canView(
        ?User $user,
    ): bool {
        if (! $user) {
            return false;
        }

        try {
            $context =
                app(
                    TenantContext::class,
                );

            $organizationId =
                $context->id();

            $role =
                $context->role();
        } catch (LogicException) {
            return false;
        }

        if (
            in_array(
                $role,
                [
                    OrganizationRole::Owner,
                    OrganizationRole::Admin,
                ],
                true,
            )
        ) {
            return true;
        }

        $customRole =
            WorkspacePermissions::custom(
                $user->id,
                $organizationId,
            );

        if ($customRole) {
            return in_array(
                'inventory.view',
                $customRole->permissions,
                true,
            )
                || in_array(
                    'inventory.manage',
                    $customRole->permissions,
                    true,
                );
        }

        return true;
    }

    /**
     * Determine whether the authenticated workspace member may mutate
     * Production and therefore move physical Inventory.
     *
     * Owner/Admin always retain authority. Built-in Manager retains the
     * existing Inventory-management behavior. Custom roles must explicitly
     * receive inventory.manage.
     */
    public static function canManage(
        ?User $user,
    ): bool {
        if (! $user) {
            return false;
        }

        try {
            $context =
                app(
                    TenantContext::class,
                );

            $organizationId =
                $context->id();

            $role =
                $context->role();
        } catch (LogicException) {
            return false;
        }

        if (
            in_array(
                $role,
                [
                    OrganizationRole::Owner,
                    OrganizationRole::Admin,
                ],
                true,
            )
        ) {
            return true;
        }

        $customRole =
            WorkspacePermissions::custom(
                $user->id,
                $organizationId,
            );

        if ($customRole) {
            return in_array(
                'inventory.manage',
                $customRole->permissions,
                true,
            );
        }

        return $role ===
            OrganizationRole::Manager;
    }
}
