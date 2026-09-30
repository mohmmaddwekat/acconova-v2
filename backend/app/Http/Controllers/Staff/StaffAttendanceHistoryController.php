<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StaffAttendanceHistoryController extends Controller
{
    /**
     * Return one employee's attendance history and complete monthly payroll
     * statement from the employee start date through the current month.
     *
     * Payroll semantics intentionally follow the UI/accounting workflow:
     * gross earnings = work + overtime + bonuses + allowances
     * net entitlement = gross earnings - deductions - advances
     * remaining = net entitlement - payments
     *
     * Advances are therefore NOT treated as payments. They reduce what is owed
     * before normal payments are applied.
     */
    public function __invoke(Request $request, string $staff): JsonResponse
    {
        $member = StaffMember::findOrFail($staff);

        abort_unless(StaffController::canView($member), 403);

        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['present', 'absent'])],
            'month' => ['nullable', 'date_format:Y-m'],
            'sort' => ['nullable', Rule::in(['desc', 'asc'])],
            'per_page' => ['nullable', 'integer', Rule::in([10, 20, 50, 100])],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id);

        if (! empty($filters['q'])) {
            $search = trim((string) $filters['q']);
            $query->where(function ($builder) use ($search): void {
                $builder
                    ->where('occurred_on', 'like', $search.'%')
                    ->orWhere('notes', 'like', '%'.$search.'%');
            });
        }

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['month'])) {
            $month = CarbonImmutable::createFromFormat('!Y-m', (string) $filters['month']);
            abort_unless($month, 422);

            $query->whereBetween('occurred_on', [
                $month->startOfMonth()->toDateString(),
                $month->endOfMonth()->toDateString(),
            ]);
        }

        $summary = (clone $query)
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count")
            ->selectRaw('COALESCE(SUM(quantity), 0) as quantity_total')
            ->selectRaw('COALESCE(SUM(overtime_hours), 0) as overtime_total')
            ->first();

        $sort = (string) ($filters['sort'] ?? 'desc');
        $perPage = (int) ($filters['per_page'] ?? 10);

        $attendance = $query
            ->orderBy('occurred_on', $sort)
            ->orderBy('id', $sort)
            ->paginate(
                $perPage,
                [
                    'id',
                    'occurred_on',
                    'status',
                    'quantity',
                    'overtime_hours',
                    'overtime_rate',
                    'notes',
                ],
            );

        $currentMonth = CarbonImmutable::today()->startOfMonth();
        $firstMonth = CarbonImmutable::parse((string) $member->started_on)->startOfMonth();

        if ($firstMonth->gt($currentMonth)) {
            $firstMonth = $currentMonth;
        }

        $rangeStart = $firstMonth->startOfMonth()->toDateString();
        $rangeEnd = $currentMonth->endOfMonth()->toDateString();

        /*
         * Do not cap payroll history. Pagination is a presentation concern and
         * print/export must be able to include every payroll month belonging to
         * the employee. StaffEntry uses soft deletes, so corrected/deleted rows
         * never reappear in history.
         */
        $entryMonths = DB::table('staff_entries')
            ->where('staff_member_id', $member->id)
            ->whereNull('deleted_at')
            ->where('kind', '!=', 'terms')
            ->whereBetween('occurred_on', [$rangeStart, $rangeEnd])
            ->selectRaw('substr(occurred_on, 1, 7) as period')
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'work' THEN amount ELSE 0 END), 0) as work")
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'overtime' THEN amount ELSE 0 END), 0) as overtime")
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'bonus' THEN amount ELSE 0 END), 0) as bonus")
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'allowance' THEN amount ELSE 0 END), 0) as allowance")
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'monthly_allowance' THEN amount ELSE 0 END), 0) as monthly_allowance")
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'deduction' THEN amount ELSE 0 END), 0) as deduction")
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount ELSE 0 END), 0) as payment")
            ->selectRaw("COALESCE(SUM(CASE WHEN kind = 'advance' THEN amount ELSE 0 END), 0) as advance")
            ->groupByRaw('substr(occurred_on, 1, 7)')
            ->get()
            ->keyBy('period');

        $attendanceMonths = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->whereBetween('occurred_on', [$rangeStart, $rangeEnd])
            ->selectRaw('substr(occurred_on, 1, 7) as period')
            ->selectRaw("SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count")
            ->selectRaw("COALESCE(SUM(CASE WHEN status = 'present' THEN quantity ELSE 0 END), 0) as quantity_total")
            ->selectRaw('COALESCE(SUM(overtime_hours), 0) as overtime_hours')
            ->groupByRaw('substr(occurred_on, 1, 7)')
            ->get()
            ->keyBy('period');

        $payroll = [];

        for (
            $month = $currentMonth;
            $month->gte($firstMonth);
            $month = $month->subMonth()
        ) {
            $period = $month->format('Y-m');
            $entry = $entryMonths->get($period);
            $attendanceMonth = $attendanceMonths->get($period);

            $work = Decimal::toUnits((string) ($entry?->work ?? '0'));
            $overtime = Decimal::toUnits((string) ($entry?->overtime ?? '0'));
            $bonus = Decimal::toUnits((string) ($entry?->bonus ?? '0'));
            $allowances = Decimal::toUnits((string) ($entry?->allowance ?? '0'))
                + Decimal::toUnits((string) ($entry?->monthly_allowance ?? '0'));
            $deductions = abs(Decimal::toUnits((string) ($entry?->deduction ?? '0')));
            $advances = abs(Decimal::toUnits((string) ($entry?->advance ?? '0')));
            $payments = abs(Decimal::toUnits((string) ($entry?->payment ?? '0')));

            $grossEarnings = $work + $overtime + $bonus + $allowances;
            $netEntitlement = $grossEarnings - $deductions - $advances;
            $remaining = $netEntitlement - $payments;

            $present = (int) ($attendanceMonth?->present_count ?? 0);
            $absent = (int) ($attendanceMonth?->absent_count ?? 0);
            $hasActivity = $grossEarnings !== 0
                || $deductions !== 0
                || $advances !== 0
                || $payments !== 0
                || $present > 0
                || $absent > 0;

            $status = 'empty';

            if ($hasActivity) {
                if ($netEntitlement < 0 && $payments === 0) {
                    $status = 'advance';
                } elseif ($remaining < 0) {
                    $status = 'overpaid';
                } elseif ($remaining === 0) {
                    $status = 'paid';
                } elseif ($payments > 0) {
                    $status = 'partial';
                } else {
                    $status = 'due';
                }
            }

            $payroll[] = [
                'period' => $period,
                'basis' => (string) $member->basis,
                'unit' => $member->unit,
                'present' => $present,
                'absent' => $absent,
                'attendance_quantity' => (string) ($attendanceMonth?->quantity_total ?? '0'),
                'attendance_overtime_hours' => (string) ($attendanceMonth?->overtime_hours ?? '0'),
                'work' => Decimal::fromUnits($work),
                'overtime' => Decimal::fromUnits($overtime),
                'bonus' => Decimal::fromUnits($bonus),
                'allowances' => Decimal::fromUnits($allowances),
                'gross_earnings' => Decimal::fromUnits($grossEarnings),
                'deductions' => Decimal::fromUnits($deductions),
                'advances' => Decimal::fromUnits($advances),
                'net_entitlement' => Decimal::fromUnits($netEntitlement),
                'payments' => Decimal::fromUnits($payments),
                'remaining' => Decimal::fromUnits($remaining),
                'status' => $status,
            ];
        }

        return response()->json([
            'attendance' => $attendance,
            'summary' => [
                'total' => (int) ($summary?->total ?? 0),
                'present' => (int) ($summary?->present_count ?? 0),
                'absent' => (int) ($summary?->absent_count ?? 0),
                'quantity' => (string) ($summary?->quantity_total ?? '0'),
                'overtime' => (string) ($summary?->overtime_total ?? '0'),
            ],
            'payroll' => [
                'employee' => [
                    'id' => (int) $member->id,
                    'name' => (string) $member->name,
                    'job_title' => $member->job_title,
                    'basis' => (string) $member->basis,
                    'unit' => $member->unit,
                    'rate' => (string) $member->rate,
                    'started_on' => substr((string) $member->started_on, 0, 10),
                ],
                'rows' => $payroll,
                'currency' => $member->currency,
                'history_months' => count($payroll),
            ],
            'adjustments' => DB::table('staff_adjustments')
                ->where('staff_member_id', $member->id)
                ->orderByDesc('starts_on')
                ->get(),
            'can_attendance' => StaffController::canRecordAttendance($member),
            'can_pay' => StaffController::canPay($member),
        ]);
    }
}
