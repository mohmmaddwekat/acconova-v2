<?php

namespace App\Services;

use App\Tenancy\TenantContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TaskAccess
{
    public const KEYS = [
        'tasks.dashboard', 'tasks.view', 'tasks.view_all', 'tasks.create', 'tasks.update',
        'tasks.delete', 'tasks.assign', 'tasks.comment', 'tasks.projects.view',
        'tasks.projects.manage', 'tasks.team',
    ];

    /** @return list<string> */
    public static function permissions(int $userId, int $organizationId, string $role): array
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return self::KEYS;
        }
        $custom = WorkspacePermissions::custom($userId, $organizationId);
        if ($custom) {
            return array_values(array_intersect(self::KEYS, $custom->permissions ?? []));
        }

        return $role === 'manager' ? self::KEYS : [];
    }

    /** @return list<string> */
    public function forRequest(Request $request): array
    {
        $context = app(TenantContext::class);

        return self::permissions($request->user()->id, $context->id(), $context->role()->value);
    }

    public function authorize(Request $request, string $permission): void
    {
        abort_unless(in_array($permission, $this->forRequest($request), true), 403);
    }

    public function visibleTasks(Request $request): Builder
    {
        $context = app(TenantContext::class);
        $userId = $request->user()->id;
        $query = DB::table('work_tasks')->where('organization_id', $context->id());
        if (in_array($context->role()->value, ['owner', 'admin'], true)) {
            return $query;
        }
        $all = in_array('tasks.view_all', $this->forRequest($request), true);

        return $query->where(function (Builder $query) use ($userId, $all): void {
            $query->where('created_by', $userId)->orWhereJsonContains('assignees', $userId);
            if ($all) {
                $query->orWhere('visibility', 'workspace');
            }
        });
    }

    public function task(Request $request, int $task): object
    {
        $query = $this->visibleTasks($request)->where('id', $task);
        if (! $request->isMethodSafe()) {
            $query->lockForUpdate();
        }
        $record = $query->first();
        abort_unless($record, 404);

        return $record;
    }
}
