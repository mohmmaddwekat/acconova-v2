<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Services\Staff\StaffMonthlyEntitlementService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StaffAutoAccrualController extends Controller
{
    public function ledger(
        Request $request,
        string $staff,
        StaffController $staffController,
        StaffMonthlyEntitlementService $entitlements,
    ): JsonResponse {
        $member = StaffMember::findOrFail($staff);
        abort_unless(StaffController::canView($member), 403);

        $entitlements->syncMember($member, (int) $request->user()->id);

        return $staffController->ledger($request, $staff);
    }

    /**
     * Keep the dashboard read path independent from workforce size. Headline
     * figures are aggregated in SQL and only one attendance page is returned.
     */
    public function overview(Request $request): JsonResponse
    {
        $visible = $this->visibleMembers($request);
        $today = today()->toDateString();
        $monthStart = today()->startOfMonth()->toDateString();
        $monthEnd = today()->endOfMonth()->toDateString();
        $canAttendance = StaffController::allowed('staff.attendance')
            || StaffController::allowed('staff.team_attendance');
        $canPay = StaffController::allowed('staff.pay')
            || StaffController::allowed('staff.team_pay');

        $totals = (clone $visible)
            ->selectRaw('COUNT(*) as employees')
            ->selectRaw('SUM(CASE WHEN staff_members.active = 1 THEN 1 ELSE 0 END) as active_count')
            ->selectRaw('SUM(CASE WHEN staff_members.active = 0 THEN 1 ELSE 0 END) as inactive_count')
            ->selectRaw('SUM(CASE WHEN staff_members.user_id IS NOT NULL THEN 1 ELSE 0 END) as linked_accounts')
            ->selectRaw('SUM(CASE WHEN staff_members.department_id IS NULL THEN 1 ELSE 0 END) as without_department')
            ->selectRaw('AVG(TIMESTAMPDIFF(MONTH, staff_members.started_on, ?)) as average_tenure_months', [$today])
            ->first();

        $employeeCount = (int) ($totals?->employees ?? 0);
        $activeCount = (int) ($totals?->active_count ?? 0);

        $departmentRows = (clone $visible)
            ->selectRaw('staff_members.department_id, COUNT(*) as total')
            ->selectRaw('SUM(CASE WHEN staff_members.active = 1 THEN 1 ELSE 0 END) as active_count')
            ->groupBy('staff_members.department_id')
            ->orderByDesc('total')
            ->get();
        $departmentIds = $departmentRows->pluck('department_id')
            ->filter(fn ($id): bool => $id !== null)
            ->map(fn ($id): int => (int) $id)
            ->values();
        $departmentNames = Department::query()
            ->whereIn('id', $departmentIds)
            ->pluck('name', 'id');
        $departments = $departmentRows->map(function ($row) use ($departmentNames): array {
            $id = $row->department_id !== null ? (int) $row->department_id : null;

            return [
                'id' => $id,
                'name' => $id !== null ? ($departmentNames->get($id) ?? '—') : '—',
                'total' => (int) $row->total,
                'active' => (int) $row->active_count,
            ];
        })->values();

        $payBasis = (clone $visible)
            ->selectRaw('staff_members.basis, COUNT(*) as total')
            ->groupBy('staff_members.basis')
            ->get()
            ->map(fn ($row): array => [
                'basis' => (string) $row->basis,
                'total' => (int) $row->total,
            ])
            ->values();

        $recentHires = (clone $visible)
            ->leftJoin('departments as recent_department', 'recent_department.id', '=', 'staff_members.department_id')
            ->orderByDesc('staff_members.started_on')
            ->orderByDesc('staff_members.id')
            ->limit(6)
            ->get([
                'staff_members.id',
                'staff_members.name',
                'staff_members.job_title',
                'staff_members.started_on',
                'staff_members.active',
                'staff_members.user_id',
                'recent_department.name as department_name',
            ])
            ->map(fn ($member): array => [
                'id' => (int) $member->id,
                'name' => (string) $member->name,
                'job_title' => $member->job_title,
                'department' => $member->department_name,
                'started_on' => (string) $member->started_on,
                'active' => (bool) $member->active,
                'linked_account' => $member->user_id !== null,
            ])
            ->values();

        $attendance = [
            'date' => $today,
            'present_today' => 0,
            'absent_today' => 0,
            'missing_today' => $activeCount,
            'month_present_records' => 0,
            'month_absent_records' => 0,
            'month_overtime_hours' => 0.0,
            'rows' => [],
            'page' => 1,
            'per_page' => 50,
            'total' => $activeCount,
            'last_page' => max(1, (int) ceil($activeCount / 50)),
        ];

        if ($canAttendance) {
            $visibleIds = (clone $visible)->select('staff_members.id');
            $todaySummary = DB::table('staff_attendances')
                ->whereIn('staff_member_id', clone $visibleIds)
                ->where('occurred_on', $today)
                ->selectRaw('COUNT(DISTINCT staff_member_id) as recorded')
                ->selectRaw("COUNT(DISTINCT CASE WHEN status = 'present' THEN staff_member_id END) as present_count")
                ->selectRaw("COUNT(DISTINCT CASE WHEN status = 'absent' THEN staff_member_id END) as absent_count")
                ->first();
            $monthSummary = DB::table('staff_attendances')
                ->whereIn('staff_member_id', clone $visibleIds)
                ->whereBetween('occurred_on', [$monthStart, $monthEnd])
                ->selectRaw("SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count")
                ->selectRaw("SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count")
                ->selectRaw('COALESCE(SUM(overtime_hours), 0) as overtime_hours')
                ->first();

            $perPage = min(100, max(20, (int) $request->query('attendance_per_page', 50)));
            $lastPage = max(1, (int) ceil($activeCount / $perPage));
            $page = min($lastPage, max(1, (int) $request->query('attendance_page', 1)));
            $latestAttendanceIds = DB::table('staff_attendances')
                ->selectRaw('staff_member_id, MAX(id) as attendance_id')
                ->where('occurred_on', $today)
                ->groupBy('staff_member_id');

            $attendanceRows = (clone $visible)
                ->where('staff_members.active', true)
                ->leftJoinSub($latestAttendanceIds, 'today_attendance_ids', function ($join): void {
                    $join->on('today_attendance_ids.staff_member_id', '=', 'staff_members.id');
                })
                ->leftJoin('staff_attendances as today_attendance', 'today_attendance.id', '=', 'today_attendance_ids.attendance_id')
                ->leftJoin('departments as attendance_department', 'attendance_department.id', '=', 'staff_members.department_id')
                ->orderBy('staff_members.name')
                ->forPage($page, $perPage)
                ->get([
                    'staff_members.id',
                    'staff_members.name',
                    'staff_members.job_title',
                    'attendance_department.name as department_name',
                    'today_attendance.status',
                    'today_attendance.quantity',
                    'today_attendance.overtime_hours',
                ])
                ->map(fn ($row): array => [
                    'id' => (int) $row->id,
                    'name' => (string) $row->name,
                    'job_title' => $row->job_title,
                    'department' => $row->department_name,
                    'status' => $row->status,
                    'quantity' => $row->quantity !== null ? (string) $row->quantity : null,
                    'overtime_hours' => $row->overtime_hours !== null ? (string) $row->overtime_hours : '0',
                ])->values();

            $attendance = [
                'date' => $today,
                'present_today' => (int) ($todaySummary?->present_count ?? 0),
                'absent_today' => (int) ($todaySummary?->absent_count ?? 0),
                'missing_today' => max(0, $activeCount - (int) ($todaySummary?->recorded ?? 0)),
                'month_present_records' => (int) ($monthSummary?->present_count ?? 0),
                'month_absent_records' => (int) ($monthSummary?->absent_count ?? 0),
                'month_overtime_hours' => round((float) ($monthSummary?->overtime_hours ?? 0), 4),
                'rows' => $attendanceRows,
                'page' => $page,
                'per_page' => $perPage,
                'total' => $activeCount,
                'last_page' => $lastPage,
            ];
        }

        $payroll = collect();
        if ($canPay) {
            $balances = StaffEntry::query()
                ->select('staff_member_id')
                ->selectRaw("SUM(CASE WHEN kind <> 'terms' THEN amount ELSE 0 END) as balance")
                ->groupBy('staff_member_id');
            $payroll = (clone $visible)
                ->leftJoinSub($balances, 'staff_balances', function ($join): void {
                    $join->on('staff_balances.staff_member_id', '=', 'staff_members.id');
                })
                ->selectRaw("COALESCE(staff_members.currency, 'ILS') as currency")
                ->selectRaw("SUM(CASE WHEN staff_members.active = 1 AND staff_members.basis = 'month' THEN staff_members.rate ELSE 0 END) as monthly_base")
                ->selectRaw('SUM(CASE WHEN staff_members.active = 1 THEN staff_members.monthly_allowance ELSE 0 END) as monthly_allowances')
                ->selectRaw('SUM(COALESCE(staff_balances.balance, 0)) as balance')
                ->selectRaw('SUM(GREATEST(COALESCE(staff_balances.balance, 0), 0)) as positive_balance')
                ->selectRaw('SUM(LEAST(COALESCE(staff_balances.balance, 0), 0)) as negative_balance')
                ->groupBy('staff_members.currency')
                ->get()
                ->map(function ($row): array {
                    $monthlyBase = (float) $row->monthly_base;
                    $monthlyAllowances = (float) $row->monthly_allowances;

                    return [
                        'currency' => (string) $row->currency,
                        'monthly_base' => round($monthlyBase, 4),
                        'monthly_allowances' => round($monthlyAllowances, 4),
                        'monthly_commitment' => round($monthlyBase + $monthlyAllowances, 4),
                        'balance' => round((float) $row->balance, 4),
                        'positive_balance' => round((float) $row->positive_balance, 4),
                        'negative_balance' => round((float) $row->negative_balance, 4),
                    ];
                })->values();
        }

        return response()->json([
            'permissions' => [
                'can_view' => StaffController::allowed('staff.view') || $this->hasTeamScope(),
                'can_manage' => StaffController::allowed('staff.manage') || StaffController::allowed('staff.team_manage'),
                'can_attendance' => $canAttendance,
                'can_pay' => $canPay,
            ],
            'totals' => [
                'employees' => $employeeCount,
                'active' => $activeCount,
                'inactive' => (int) ($totals?->inactive_count ?? 0),
                'linked_accounts' => (int) ($totals?->linked_accounts ?? 0),
                'without_department' => (int) ($totals?->without_department ?? 0),
                'departments' => $departmentIds->count(),
                'average_tenure_months' => (int) round((float) ($totals?->average_tenure_months ?? 0)),
            ],
            'departments' => $departments,
            'pay_basis' => $payBasis,
            'recent_hires' => $recentHires,
            'attendance' => $attendance,
            'payroll' => $payroll,
        ]);
    }

    private function visibleMembers(Request $request): Builder
    {
        $query = StaffMember::query();
        if (StaffController::allowed('staff.view')) {
            return $query;
        }

        $departmentIds = $this->hasTeamScope() ? StaffController::managedDepartmentIds() : [];

        return $query->where(function (Builder $query) use ($request, $departmentIds): void {
            $query->where('staff_members.user_id', $request->user()->id);
            if ($departmentIds !== []) {
                $query->orWhereIn('staff_members.department_id', $departmentIds);
            }
        });
    }

    private function hasTeamScope(): bool
    {
        foreach (['staff.team_view', 'staff.team_manage', 'staff.team_attendance', 'staff.team_pay'] as $permission) {
            if (StaffController::allowed($permission)) {
                return true;
            }
        }

        return false;
    }
}
