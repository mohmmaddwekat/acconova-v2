<?php

namespace App\Services\Staff;

use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class StaffMonthlyEntitlementService
{
    /**
     * Recalculate salary entitlement for one employee from attendance.
     *
     * Hour/day/piece attendance may pre-date the automatic payroll hooks (for
     * example imported or legacy attendance). Repair any missing work/overtime
     * ledger rows first, then synchronize monthly salary and recurring payroll
     * adjustments. This makes the ledger a trustworthy derived balance instead
     * of letting payments appear as a negative balance when earnings are absent.
     */
    public function syncMember(StaffMember $member, int $createdBy): void
    {
        $history = StaffEntry::where('staff_member_id', $member->id)
            ->where('kind', 'terms')
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get();

        $this->syncAttendanceEntries(
            $member,
            $createdBy,
            $history,
        );

        $attendancePeriods = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->pluck('occurred_on')
            ->map(fn ($date): string => substr((string) $date, 0, 7));

        $generatedEntries = StaffEntry::withTrashed()
            ->where('staff_member_id', $member->id)
            ->where('kind', 'work')
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return (bool) ($terms['attendance_salary'] ?? false)
                    || (bool) ($terms['accrual'] ?? false);
            })
            ->values();

        $generatedPeriods = $generatedEntries
            ->map(fn (StaffEntry $entry): string => substr((string) $entry->occurred_on, 0, 7));

        $adjustmentEntryPeriods = StaffEntry::withTrashed()
            ->where('staff_member_id', $member->id)
            ->whereIn('kind', ['allowance', 'bonus', 'deduction'])
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return isset($terms['adjustment_id'], $terms['period']);
            })
            ->map(function (StaffEntry $entry): string {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return (string) $terms['period'];
            });

        $attendancePeriods
            ->merge($generatedPeriods)
            ->merge($adjustmentEntryPeriods)
            ->unique()
            ->sort()
            ->values()
            ->each(function (string $period) use (
                $member,
                $createdBy,
                $history,
                $generatedEntries,
            ): void {
                $this->syncPeriod(
                    $member,
                    $period,
                    $createdBy,
                    $history,
                    $generatedEntries,
                );

                $this->syncAdjustmentsForPeriod(
                    $member,
                    $period,
                    $createdBy,
                    $history,
                );
            });
    }

    /**
     * Repair attendance-backed work/overtime entries for non-monthly employees.
     * Existing attendance-linked rows are preserved and only missing ledger rows
     * are created, so this is safe to run repeatedly without double counting.
     *
     * @param  Collection<int, StaffEntry>  $history
     */
    private function syncAttendanceEntries(
        StaffMember $member,
        int $createdBy,
        Collection $history,
    ): void {
        $attendance = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get();

        if ($attendance->isEmpty()) {
            return;
        }

        $linkedEntries = StaffEntry::withTrashed()
            ->where('staff_member_id', $member->id)
            ->whereIn('kind', ['work', 'overtime'])
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return isset($terms['attendance_id']);
            });

        $workByAttendance = $linkedEntries
            ->where('kind', 'work')
            ->keyBy(function (StaffEntry $entry): string {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return (string) $terms['attendance_id'];
            });

        $overtimeByAttendance = $linkedEntries
            ->where('kind', 'overtime')
            ->keyBy(function (StaffEntry $entry): string {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return (string) $terms['attendance_id'];
            });

        foreach ($attendance as $row) {
            $date = substr((string) $row->occurred_on, 0, 10);
            $terms = $this->termsAt($member, $date, $history);
            $basis = (string) ($terms['basis'] ?? $member->basis);
            $active = (bool) ($terms['active'] ?? true);
            $present = (string) $row->status === 'present';
            $quantity = (string) ($row->quantity ?? '0');
            $rate = (string) ($terms['rate'] ?? $member->rate ?? '0');
            $attendanceId = (string) $row->id;

            $workEntry = $workByAttendance->get($attendanceId);

            if (
                $active
                && $present
                && $basis !== 'month'
                && Decimal::toUnits($quantity) > 0
                && Decimal::toUnits($rate) > 0
            ) {
                if (! $workEntry) {
                    $amountUnits = intdiv(
                        Decimal::toUnits($quantity) * Decimal::toUnits($rate) + 5000,
                        10000,
                    );

                    StaffEntry::create([
                        'staff_member_id' => $member->id,
                        'created_by' => $createdBy,
                        'request_id' => (string) Str::uuid(),
                        'kind' => 'work',
                        'occurred_on' => $date,
                        'quantity' => $quantity,
                        'rate' => $rate,
                        'amount' => Decimal::fromUnits($amountUnits),
                        'notes' => 'Attendance entitlement repair',
                        'terms' => [
                            'attendance_id' => (int) $row->id,
                            'basis' => $basis,
                            'currency' => (string) ($terms['currency'] ?? $member->currency),
                            'auto_repaired' => true,
                        ],
                    ]);
                } elseif ($workEntry->trashed()) {
                    $workEntry->restore();
                }
            }

            $overtimeHours = (string) ($row->overtime_hours ?? '0');
            $overtimeRate = (string) ($row->overtime_rate ?? '0');
            $overtimeEntry = $overtimeByAttendance->get($attendanceId);

            if (
                $active
                && $present
                && Decimal::toUnits($overtimeHours) > 0
                && Decimal::toUnits($overtimeRate) > 0
            ) {
                if (! $overtimeEntry) {
                    $amountUnits = intdiv(
                        Decimal::toUnits($overtimeHours) * Decimal::toUnits($overtimeRate) + 5000,
                        10000,
                    );

                    StaffEntry::create([
                        'staff_member_id' => $member->id,
                        'created_by' => $createdBy,
                        'request_id' => (string) Str::uuid(),
                        'kind' => 'overtime',
                        'occurred_on' => $date,
                        'quantity' => $overtimeHours,
                        'rate' => $overtimeRate,
                        'amount' => Decimal::fromUnits($amountUnits),
                        'notes' => 'Attendance overtime repair',
                        'terms' => [
                            'attendance_id' => (int) $row->id,
                            'currency' => (string) ($terms['currency'] ?? $member->currency),
                            'auto_repaired' => true,
                        ],
                    ]);
                } elseif ($overtimeEntry->trashed()) {
                    $overtimeEntry->restore();
                }
            }
        }
    }

    /**
     * Recalculate attendance-backed salary entries for every tenant employee with
     * attendance, an older generated accrual, or recurring payroll adjustments.
     */
    public function syncOrganization(int $createdBy): void
    {
        $attendanceMemberIds = DB::table('staff_attendances')
            ->where('organization_id', app(TenantContext::class)->id())
            ->distinct()
            ->pluck('staff_member_id');

        $generatedMemberIds = StaffEntry::withTrashed()
            ->where('kind', 'work')
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return (bool) ($terms['attendance_salary'] ?? false)
                    || (bool) ($terms['accrual'] ?? false);
            })
            ->pluck('staff_member_id');

        $adjustmentMemberIds = DB::table('staff_adjustments')
            ->where('organization_id', app(TenantContext::class)->id())
            ->distinct()
            ->pluck('staff_member_id');

        $memberIds = $attendanceMemberIds
            ->merge($generatedMemberIds)
            ->merge($adjustmentMemberIds)
            ->unique()
            ->values();

        StaffMember::withTrashed()
            ->whereIn('id', $memberIds)
            ->orderBy('id')
            ->each(fn (StaffMember $member) => $this->syncMember($member, $createdBy));
    }

    /**
     * @param  Collection<int, StaffEntry>  $history
     * @param  Collection<int, StaffEntry>  $generatedEntries
     */
    private function syncPeriod(
        StaffMember $member,
        string $period,
        int $createdBy,
        Collection $history,
        Collection $generatedEntries,
    ): void {
        $month = CarbonImmutable::createFromFormat('!Y-m', $period);

        if (! $month) {
            return;
        }

        $monthStart = $month->startOfMonth();
        $monthEnd = $month->endOfMonth();
        $today = CarbonImmutable::today();

        if ($monthStart->gt($today)) {
            return;
        }

        $accrualEnd = $monthEnd->gt($today)
            ? $today
            : $monthEnd;

        $expectedWorkDays = $this->expectedWorkDays($monthStart, $monthEnd);

        if ($expectedWorkDays <= 0) {
            return;
        }

        $attendance = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->whereBetween('occurred_on', [
                $monthStart->toDateString(),
                $accrualEnd->toDateString(),
            ])
            ->orderBy('occurred_on')
            ->get()
            ->keyBy(fn (object $row): string => substr((string) $row->occurred_on, 0, 10));

        $weightedMonthlyRateUnits = 0;
        $presentDays = 0;
        $absentDays = 0;
        $missingDays = 0;
        $payableDays = 0;
        $lastMonthlyRate = null;
        $startedOn = CarbonImmutable::parse((string) $member->started_on)->startOfDay();

        for ($date = $monthStart; $date->lte($accrualEnd); $date = $date->addDay()) {
            if ($date->isFriday() || $date->lt($startedOn)) {
                continue;
            }

            $terms = $this->termsAt($member, $date->toDateString(), $history);

            if (
                ($terms['basis'] ?? null) !== 'month'
                || ! ($terms['active'] ?? true)
            ) {
                continue;
            }

            $rate = (string) ($terms['rate'] ?? '0');
            $rateUnits = Decimal::toUnits($rate);

            if ($rateUnits <= 0) {
                continue;
            }

            $row = $attendance->get($date->toDateString());
            $status = $row?->status !== null
                ? (string) $row->status
                : null;

            if ($status === 'absent') {
                $absentDays++;
                $lastMonthlyRate = $rate;

                continue;
            }

            if ($status === 'present') {
                $presentDays++;
            } else {
                $missingDays++;
            }

            // Missing attendance is deliberately neutral. Only an explicit
            // absent record removes that workday from monthly entitlement.
            $weightedMonthlyRateUnits += $rateUnits;
            $payableDays++;
            $lastMonthlyRate = $rate;
        }

        $amountUnits = $payableDays > 0
            ? intdiv(
                $weightedMonthlyRateUnits + intdiv($expectedWorkDays, 2),
                $expectedWorkDays,
            )
            : 0;

        $periodEntries = $generatedEntries
            ->filter(fn (StaffEntry $entry): bool => substr((string) $entry->occurred_on, 0, 7) === $period)
            ->values();

        $entry = $periodEntries->first();

        foreach ($periodEntries->slice(1) as $duplicate) {
            if (! $duplicate->trashed()) {
                $duplicate->delete();
            }
        }

        if ($amountUnits <= 0) {
            if ($entry && ! $entry->trashed()) {
                $entry->delete();
            }

            return;
        }

        $payload = [
            'kind' => 'work',
            'occurred_on' => $monthStart->toDateString(),
            'quantity' => number_format($payableDays, 4, '.', ''),
            'rate' => $lastMonthlyRate ?? (string) $member->rate,
            'amount' => Decimal::fromUnits($amountUnits),
            'notes' => 'Attendance salary '.$period,
            'terms' => [
                'basis' => 'month',
                'currency' => $member->currency,
                'attendance_salary' => true,
                'period' => $period,
                'present_days' => $presentDays,
                'absent_days' => $absentDays,
                'missing_days' => $missingDays,
                'payable_days' => $payableDays,
                'expected_work_days' => $expectedWorkDays,
                'accrual_through' => $accrualEnd->toDateString(),
                'missing_attendance_deducted' => false,
            ],
        ];

        if ($entry) {
            if ($entry->trashed()) {
                $entry->restore();
            }

            $entry->update($payload);

            return;
        }

        StaffEntry::create([
            ...$payload,
            'staff_member_id' => $member->id,
            'created_by' => $createdBy,
            'request_id' => (string) Str::uuid(),
        ]);
    }

    /**
     * Synchronize recurring payroll adjustments for one attendance-backed month.
     * Existing generated rows are updated in place, stopped/inactive rules are
     * removed, and deductions are always represented as negative ledger amounts.
     *
     * @param  Collection<int, StaffEntry>  $history
     */
    private function syncAdjustmentsForPeriod(
        StaffMember $member,
        string $period,
        int $createdBy,
        Collection $history,
    ): void {
        $month = CarbonImmutable::createFromFormat('!Y-m', $period);

        if (! $month) {
            return;
        }

        $monthStart = $month->startOfMonth();
        $monthEnd = $month->endOfMonth();

        $rules = DB::table('staff_adjustments')
            ->where('staff_member_id', $member->id)
            ->whereDate('starts_on', '<=', $monthEnd->toDateString())
            ->where(function ($query) use ($monthStart): void {
                $query->whereNull('ends_on')
                    ->orWhereDate('ends_on', '>=', $monthStart->toDateString());
            })
            ->orderBy('id')
            ->get();

        $generated = StaffEntry::withTrashed()
            ->where('staff_member_id', $member->id)
            ->whereIn('kind', ['allowance', 'bonus', 'deduction'])
            ->get()
            ->filter(function (StaffEntry $entry) use ($period): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return isset($terms['adjustment_id'])
                    && (string) ($terms['period'] ?? '') === $period;
            })
            ->keyBy(function (StaffEntry $entry): string {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return (string) $terms['adjustment_id'];
            });

        $activeRuleIds = collect();

        foreach ($rules as $rule) {
            $effectiveDate = max($monthStart->toDateString(), (string) $rule->starts_on);
            $terms = $this->termsAt($member, $effectiveDate, $history);

            if (! ($terms['active'] ?? true)) {
                continue;
            }

            $activeRuleIds->push((string) $rule->id);

            $amountUnits = Decimal::toUnits((string) $rule->amount)
                * ((string) $rule->kind === 'deduction' ? -1 : 1);

            $payload = [
                'kind' => (string) $rule->kind,
                'occurred_on' => $effectiveDate,
                'amount' => Decimal::fromUnits($amountUnits),
                'quantity' => null,
                'rate' => null,
                'notes' => (string) $rule->label,
                'terms' => [
                    'adjustment_id' => (int) $rule->id,
                    'period' => $period,
                    'currency' => $member->currency,
                    'auto_synced' => true,
                ],
            ];

            $entry = $generated->get((string) $rule->id);

            if ($entry) {
                if ($entry->trashed()) {
                    $entry->restore();
                }

                $entry->update($payload);
                continue;
            }

            StaffEntry::create([
                ...$payload,
                'staff_member_id' => $member->id,
                'created_by' => $createdBy,
                'request_id' => (string) Str::uuid(),
            ]);
        }

        foreach ($generated as $adjustmentId => $entry) {
            if (
                ! $activeRuleIds->contains((string) $adjustmentId)
                && ! $entry->trashed()
            ) {
                $entry->delete();
            }
        }
    }

    private function expectedWorkDays(
        CarbonImmutable $monthStart,
        CarbonImmutable $monthEnd,
    ): int {
        $days = 0;

        for ($date = $monthStart; $date->lte($monthEnd); $date = $date->addDay()) {
            if (! $date->isFriday()) {
                $days++;
            }
        }

        return $days;
    }

    /**
     * @param  Collection<int, StaffEntry>  $history
     * @return array<string, mixed>
     */
    private function termsAt(
        StaffMember $member,
        string $date,
        Collection $history,
    ): array {
        $terms = $history->first()?->terms['before'] ?? $member->toArray();

        foreach ($history as $change) {
            if (substr((string) $change->occurred_on, 0, 10) <= $date) {
                $terms = $change->terms['after'] ?? $terms;
            }
        }

        return $terms;
    }
}
