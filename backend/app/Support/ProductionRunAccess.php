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
     * Determine whether a member may view Production Runs.
     *
     * Legacy Inventory permissions remain accepted so existing roles do not
     * suddenly lose Production access after introducing dedicated permissions.
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
            return count(
                array_intersect(
                    $customRole->permissions,
                    [
                        'production.view',
                        'production.manage',

                        /*
                         * Backward compatibility for custom roles created
                         * before Production received dedicated permissions.
                         */
                        'inventory.view',
                        'inventory.manage',
                    ],
                ),
            ) > 0;
        }

        return true;
    }

    /**
     * Determine whether a member may create, Post, edit or reverse Production.
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
                'production.manage',
                $customRole->permissions,
                true,
            )
                || in_array(
                    'inventory.manage',
                    $customRole->permissions,
                    true,
                );
        }

        return $role ===
            OrganizationRole::Manager;
    }
}
