<?php

namespace App\Support;

use App\Http\Controllers\StaffController;
use App\Models\StaffMember;
use App\Models\Task;
use App\Models\User;
use App\Services\WorkspacePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;

final class TaskAccess
{
    /**
     * Task permissions that may be granted through a custom workspace role.
     *
     * @var list<string>
     */
    public const PERMISSIONS = [
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
     * Every workspace member may always see and progress tasks assigned to them.
     * More powerful actions are permission-driven.
     */
    public static function allowed(
        string $permission,
        ?User $user = null,
    ): bool {
        $user ??=
            auth()->user();

        if (! $user) {
            return false;
        }

        $tenant =
            app(
                TenantContext::class,
            );

        $baseRole =
            $tenant
                ->role()
                ->value;

        if (
            in_array(
                $baseRole,
                [
                    'owner',
                    'admin',
                ],
                true,
            )
        ) {
            return true;
        }

        /*
         * Viewing and progressing one's own assigned work is a baseline
         * capability for every employee, independent of hierarchy.
         */
        if (
            in_array(
                $permission,
                [
                    'tasks.view_own',
                    'tasks.update_own',
                    'tasks.complete',
                ],
                true,
            )
        ) {
            return true;
        }

        $custom =
            WorkspacePermissions::custom(
                $user->id,
                $tenant->id(),
            );

        if ($custom) {
            return in_array(
                $permission,
                $custom->permissions,
                true,
            );
        }

        /*
         * Built-in Manager retains broad operational capability until it is
         * replaced by an explicit custom role.
         */
        if (
            $baseRole ===
            'manager'
        ) {
            return in_array(
                $permission,
                [
                    ...self::PERMISSIONS,
                    'tasks.view_own',
                    'tasks.update_own',
                    'tasks.complete',
                ],
                true,
            );
        }

        return false;
    }

    /**
     * Return the active Staff record linked to the current account.
     */
    public static function currentStaff(
        ?User $user = null,
    ): ?StaffMember {
        $user ??=
            auth()->user();

        if (! $user) {
            return null;
        }

        return StaffMember::query()
            ->where(
                'user_id',
                $user->id,
            )
            ->where(
                'active',
                true,
            )
            ->first();
    }

    /**
     * Restrict a task query to the records visible to one account.
     */
    public static function applyVisible(
        Builder $query,
        ?User $user = null,
    ): Builder {
        $user ??=
            auth()->user();

        abort_unless(
            $user,
            401,
        );

        if (
            self::allowed(
                'tasks.view_all',
                $user,
            )
        ) {
            return $query;
        }

        $staff =
            self::currentStaff(
                $user,
            );

        $managedDepartments =
            self::allowed(
                'tasks.view_team',
                $user,
            )
            ? StaffController::managedDepartmentIds()
            : [];

        return $query->where(
            function (
                Builder $visible,
            ) use (
                $user,
                $staff,
                $managedDepartments,
            ): void {
                $visible->where(
                    'created_by',
                    $user->id,
                );

                if ($staff) {
                    $visible
                        ->orWhere(
                            'primary_assignee_id',
                            $staff->id,
                        )
                        ->orWhereHas(
                            'assignees',
                            fn (
                                Builder $assignees,
                            ) => $assignees->where(
                                'staff_members.id',
                                $staff->id,
                            ),
                        );
                }

                if (
                    $managedDepartments
                    !== []
                ) {
                    $visible->orWhereIn(
                        'department_id',
                        $managedDepartments,
                    );
                }
            },
        );
    }

    /**
     * Determine whether the current account may edit one task.
     */
    public static function canUpdate(
        Task $task,
        ?User $user = null,
    ): bool {
        $user ??=
            auth()->user();

        if (! $user) {
            return false;
        }

        if (
            self::allowed(
                'tasks.update_all',
                $user,
            )
        ) {
            return true;
        }

        if (
            self::allowed(
                'tasks.update_team',
                $user,
            )
            && $task->department_id
            && in_array(
                (int) $task->department_id,
                StaffController::managedDepartmentIds(),
                true,
            )
        ) {
            return true;
        }

        $staff =
            self::currentStaff(
                $user,
            );

        if (
            $task->created_by ===
            $user->id
        ) {
            return true;
        }

        if (! $staff) {
            return false;
        }

        if (
            (int) $task->primary_assignee_id ===
            $staff->id
        ) {
            return true;
        }

        return $task
            ->assignees()
            ->where(
                'staff_members.id',
                $staff->id,
            )
            ->exists();
    }

    /**
     * Determine whether an employee may be assigned by the current account.
     */
    public static function canAssign(
        StaffMember $staff,
        ?User $user = null,
    ): bool {
        $user ??=
            auth()->user();

        if (
            self::allowed(
                'tasks.assign_all',
                $user,
            )
        ) {
            return true;
        }

        if (
            self::allowed(
                'tasks.assign_team',
                $user,
            )
            && $staff->department_id
            && in_array(
                (int) $staff->department_id,
                StaffController::managedDepartmentIds(),
                true,
            )
        ) {
            return true;
        }

        return self::currentStaff(
            $user,
        )?->id ===
            $staff->id;
    }

    /**
     * Determine whether team analytics pages are available.
     */
    public static function canViewTeam(): bool
    {
        return self::allowed(
            'tasks.view_all',
        )
            || self::allowed(
                'tasks.view_team',
            )
            || self::allowed(
                'tasks.reports',
            );
    }
}
