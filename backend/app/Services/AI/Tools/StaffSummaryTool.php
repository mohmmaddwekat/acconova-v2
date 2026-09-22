<?php

namespace App\Services\AI\Tools;

use App\Models\StaffMember;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\WorkspaceFeaturePermissions;

final class StaffSummaryTool implements AiBusinessTool
{
    public function name(): string
    {
        return 'staff_summary';
    }

    public function description(): string
    {
        return 'Return a non-payroll workforce summary: employee counts, active status and department distribution.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => new \stdClass(),
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows($user, 'staff.view');
    }

    public function execute(User $user, array $arguments): array
    {
        $base = StaffMember::query();

        $total = (clone $base)->count();
        $active = (clone $base)->where('active', true)->count();
        $inactive = (clone $base)->where('active', false)->count();
        $linked = (clone $base)->whereNotNull('user_id')->count();
        $withoutDepartment = (clone $base)->whereNull('department_id')->count();

        $departments = StaffMember::query()
            ->leftJoin('departments', function ($join): void {
                $join->on('departments.id', '=', 'staff_members.department_id')
                    ->on('departments.organization_id', '=', 'staff_members.organization_id');
            })
            ->selectRaw(
                "COALESCE(departments.name, 'Unassigned') as department, COUNT(*) as employee_count"
            )
            ->groupBy('departments.id', 'departments.name')
            ->orderByDesc('employee_count')
            ->limit(20)
            ->get()
            ->map(fn ($row): array => [
                'department' => (string) $row->department,
                'employee_count' => (int) $row->employee_count,
            ])
            ->values()
            ->all();

        return [
            'totals' => [
                'employees' => $total,
                'active' => $active,
                'inactive' => $inactive,
                'linked_accounts' => $linked,
                'without_department' => $withoutDepartment,
            ],
            'departments' => $departments,
        ];
    }
}
