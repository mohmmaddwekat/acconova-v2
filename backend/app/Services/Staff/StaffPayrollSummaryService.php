<?php

namespace App\Services\Staff;

use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use Illuminate\Support\Facades\DB;

class StaffPayrollSummaryService
{
    /**
     * Return the canonical payroll calculation for one employee.
     *
     * Order matters:
     * 1. attendance-backed work + bonus + allowances + overtime = gross earned
     * 2. deductions and advances reduce the employee's entitlement
     * 3. payments reduce only what is still payable after that
     *
     * @return array<string, mixed>
     */
    public function summarize(StaffMember $member): array
    {
        $totals = StaffEntry::query()
            ->where('staff_member_id', $member->id)
            ->where('kind', '!=', 'terms')
            ->selectRaw('kind, SUM(amount) as amount')
            ->groupBy('kind')
            ->pluck('amount', 'kind');

        $work = $this->positiveUnits($totals->get('work'));
        $bonus = $this->positiveUnits($totals->get('bonus'));
        $allowance = $this->positiveUnits($totals->get('allowance'));
        $monthlyAllowance = $this->positiveUnits($totals->get('monthly_allowance'));
        $overtime = $this->positiveUnits($totals->get('overtime'));

        $grossEarned = $work
            + $bonus
            + $allowance
            + $monthlyAllowance
            + $overtime;

        $deductions = $this->absoluteUnits($totals->get('deduction'));
        $advances = $this->absoluteUnits($totals->get('advance'));
        $paid = $this->absoluteUnits($totals->get('payment'));

        $netEntitlement = $grossEarned - $deductions - $advances;
        $remaining = $netEntitlement - $paid;

        $attendance = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->selectRaw("SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_count")
            ->selectRaw("SUM(CASE WHEN status = 'present' THEN quantity ELSE 0 END) as present_quantity")
            ->first();

        return [
            'work_earned' => Decimal::fromUnits($work),
            'bonus' => Decimal::fromUnits($bonus),
            'allowances' => Decimal::fromUnits($allowance + $monthlyAllowance),
            'overtime' => Decimal::fromUnits($overtime),
            'gross_earned' => Decimal::fromUnits($grossEarned),
            'deductions' => Decimal::fromUnits($deductions),
            'advances' => Decimal::fromUnits($advances),
            'net_entitlement' => Decimal::fromUnits($netEntitlement),
            'paid' => Decimal::fromUnits($paid),
            'remaining' => Decimal::fromUnits($remaining),
            'remaining_due' => Decimal::fromUnits(max(0, $remaining)),
            'employee_debt_or_overpayment' => Decimal::fromUnits(max(0, -$remaining)),
            'attendance' => [
                'present_count' => (int) ($attendance?->present_count ?? 0),
                'absent_count' => (int) ($attendance?->absent_count ?? 0),
                'present_quantity' => number_format((float) ($attendance?->present_quantity ?? 0), 4, '.', ''),
                'basis' => (string) $member->basis,
                'rate' => (string) $member->rate,
            ],
        ];
    }

    private function positiveUnits(mixed $amount): int
    {
        return max(0, Decimal::toUnits((string) ($amount ?? '0')));
    }

    private function absoluteUnits(mixed $amount): int
    {
        return abs(Decimal::toUnits((string) ($amount ?? '0')));
    }
}
