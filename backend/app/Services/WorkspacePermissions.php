<?php

namespace App\Services;

use App\Models\Membership;
use App\Models\Party;
use App\Models\PaymentPlan;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkspaceRole;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Model;

class WorkspacePermissions
{
    /**
     * Return the complete permission catalog. KEYS is retained as the legacy
     * baseline for older code, while new features are sourced from the central
     * feature catalog.
     *
     * @return list<string>
     */
    public static function keys(): array
    {
        return WorkspaceFeaturePermissions::keys();
    }

    /**
     * Every explicit permission available to custom workspace roles.
     *
     * @var list<string>
     */
    public const KEYS = [
        'products.create',
        'products.update',
        'products.service',
        'products.view',
        'products.manage',
        'products.archive',

        'parties.create',
        'parties.update',
        'parties.view',
        'parties.manage',
        'parties.archive',

        'inventory.view',
        'inventory.manage',

        'production.view',
        'production.manage',

        'payments.create',
        'payments.update',
        'payments.record',
        'payments.view',
        'payments.manage',

        'finance.sales.view',
        'finance.sales.manage',
        'finance.purchases.view',
        'finance.purchases.manage',
        'finance.cash.view',
        'finance.cash.receive',
        'finance.cash.pay',
        'finance.cash.correct',
        'finance.documents.correct',
        'finance.approvals.review',
        'finance.taxes.view',
        'finance.taxes.manage',

        'staff.team_view',
        'staff.team_manage',
        'staff.team_attendance',
        'staff.team_pay',
        'staff.view',
        'staff.manage',
        'staff.attendance',
        'staff.pay',
        'staff.import',

        /*
         * Task Management permissions. Every member receives own-task access
         * automatically; these permissions expand authority beyond that.
         */
        'tasks.create',
        'tasks.view_team',
        'tasks.view_all',
        'tasks.assign_team',
        'tasks.assign_all',
        'tasks.update_team',
        'tasks.update_all',
        'tasks.archive',
        'tasks.reports',
        'tasks.projects_manage',

        /*
         * Team hierarchy permissions. These control the dedicated Teams
         * workspace independently from task permissions.
         */
        'teams.view',
        'teams.create',
        'teams.update',
        'teams.archive',
        'teams.members.manage',
        'teams.lead.manage',
        'teams.projects.manage',
        'teams.subteams.create',
        'teams.subteams.manage',
        'teams.move',
        'teams.view_workload',
    ];

    /**
     * Return the active custom role for one tenant membership.
     */
    public static function custom(
        int $userId,
        int $organizationId,
    ): ?WorkspaceRole {
        $membership =
            Membership::withoutGlobalScopes()
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'user_id',
                    $userId,
                )
                ->first();

        if (
            ! $membership
            || in_array(
                $membership
                    ->role
                    ->value,
                [
                    'owner',
                    'admin',
                ],
                true,
            )
            || ! $membership->workspace_role_id
        ) {
            return null;
        }

        return WorkspaceRole::withoutGlobalScopes()
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'is_custom',
                true,
            )
            ->find(
                $membership->workspace_role_id,
            );
    }

    /**
     * Intercept model policy decisions for custom workspace roles.
     */
    public static function decide(
        User $user,
        string $ability,
        array $arguments,
    ): ?bool {
        try {
            $context =
                app(
                    TenantContext::class,
                );

            $id =
                $context->id();
        } catch (\LogicException) {
            return null;
        }

        $role =
            self::custom(
                $user->id,
                $id,
            );

        if (! $role) {
            return null;
        }

        $subject =
            $arguments[0]
            ?? null;

        $class =
            is_object(
                $subject,
            )
            ? get_class(
                $subject,
            )
            : $subject;

        $module =
            match ($class) {
                Product::class => 'products',

                Party::class => 'parties',

                Warehouse::class => 'inventory',

                PaymentPlan::class => 'payments',

                default => null,
            };

        if (! $module) {
            return null;
        }

        if (
            $subject instanceof Model
            && (int) $subject->organization_id !==
            $id
        ) {
            return false;
        }

        $permission =
            match ($ability) {
                'view',
                'viewAny' => $module
                    .'.view',

                'create',
                'update' => $module
                    .'.manage',

                'delete',
                'restore' => $module ===
                    'inventory'
                    ? 'inventory.manage'
                    : $module
                    .'.archive',

                'manageInventory' => 'inventory.manage',

                default => null,
            };

        $specific =
            match ($ability) {
                'create' => $module
                    .'.create',

                'update' => $module
                    .'.update',

                default => null,
            };

        if (
            $class ===
            Product::class
            && $ability ===
            'update'
            && request()->is(
                'api/products/*/service-operations',
            )
        ) {
            $specific =
                'products.service';
        }

        if (
            $class ===
            PaymentPlan::class
            && $ability ===
            'update'
            && request()->is(
                'api/payment-plans/*/record',
            )
        ) {
            $specific =
                'payments.record';
        }

        return (
            $permission !==
            null
            && in_array(
                $permission,
                $role->permissions,
                true,
            )
        )
            || (
                $specific !==
                null
                && in_array(
                    $specific,
                    $role->permissions,
                    true,
                )
            );
    }
}
