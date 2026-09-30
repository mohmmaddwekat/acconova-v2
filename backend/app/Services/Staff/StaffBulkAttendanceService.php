<?php

namespace App\Services\Staff;

use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class StaffBulkAttendanceService
{
    /**
     * Save one attendance date for a batch of employees and synchronize only
     * the payroll rows affected by that date. No full employee-history repair is
     * performed here, keeping large bulk attendance operations predictable.
     *
     * @param  Collection<int, StaffMember>  $members
     * @param  array<int, array<string, mixed>>  $overrides
     * @return array{processed:int, skipped:list<array{id:int,name:string,reason:string}>}
     */
    public function save(
        Collection $members,
        string $date,
        array $defaults,
        array $overrides,
        int $createdBy,
    ): array {
        if ($members->isEmpty()) {
            return [
                'processed' => 0,
                'skipped' => [],
            ];
        }

        $ids = $members->pluck('id')->map(fn ($id): int => (int) $id)->values();
        $monthStart = CarbonImmutable::parse($date)->startOfMonth();
        $monthEnd = CarbonImmutable::parse($date)->endOfMonth();

        $historyByMember = StaffEntry::whereIn('staff_member_id', $ids)
            ->where('kind', 'terms')
            ->whereDate('occurred_on', '<=', $monthEnd->toDateString())
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get()
            ->groupBy('staff_member_id');

        $existingAttendance = DB::table('staff_attendances')
            ->whereIn('staff_member_id', $ids)
            ->whereDate('occurred_on', $date)
            ->get()
            ->keyBy('staff_member_id');

        /*
         * A manually-created work row for the same non-monthly employee/date
         * must not be silently doubled by attendance. Detect it once for the
         * whole batch and skip only that employee instead of failing the batch.
         */
        $manualWorkMemberIds = StaffEntry::whereIn('staff_member_id', $ids)
            ->where('kind', 'work')
            ->whereDate('occurred_on', $date)
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return ! isset($terms['attendance_id'])
                    && ! ($terms['attendance_salary'] ?? false)
                    && ! ($terms['accrual'] ?? false);
            })
            ->pluck('staff_member_id')
            ->map(fn ($id): int => (int) $id)
            ->flip();

        $normalized = [];
        $skipped = [];

        foreach ($members as $member) {
            $history = $historyByMember->get($member->id, collect());
            $terms = $this->termsAt($member, $date, $history);
            $basis = (string) ($terms['basis'] ?? $member->basis);
            $historicalRate = (string) ($terms['rate'] ?? '0');
            $rate = Decimal::toUnits($historicalRate) > 0
                ? $historicalRate
                : (string) $member->rate;

            if (! ($terms['active'] ?? true)) {
                $skipped[] = $this->skip($member, 'inactive_on_date');
                continue;
            }

            $values = [
                ...$defaults,
                ...($overrides[$member->id] ?? []),
            ];

            $status = (string) ($values['status'] ?? 'present');
            $present = $status === 'present';
            $quantity = $present
                ? (in_array($basis, ['day', 'month'], true)
                    ? '1.0000'
                    : (string) ($values['quantity'] ?? '0'))
                : '0.0000';
            $overtimeHours = $present
                ? (string) ($values['overtime_hours'] ?? '0')
                : '0.0000';
            $overtimeRate = Decimal::toUnits($overtimeHours) > 0
                ? (string) ($values['overtime_rate'] ?? '0')
                : '0.0000';

            if ($present && Decimal::toUnits($quantity) <= 0) {
                $skipped[] = $this->skip($member, 'missing_quantity');
                continue;
            }

            if (
                $basis === 'hour'
                && Decimal::toUnits($quantity) + Decimal::toUnits($overtimeHours) > 240000
            ) {
                $skipped[] = $this->skip($member, 'hours_over_24');
                continue;
            }

            if (
                Decimal::toUnits($overtimeHours) > 0
                && Decimal::toUnits($overtimeRate) <= 0
            ) {
                $skipped[] = $this->skip($member, 'missing_overtime_rate');
                continue;
            }

            if (
                $basis !== 'month'
                && $manualWorkMemberIds->has((int) $member->id)
                && ! $existingAttendance->has($member->id)
            ) {
                $skipped[] = $this->skip($member, 'manual_work_exists');
                continue;
            }

            $normalized[(int) $member->id] = [
                'member' => $member,
                'basis' => $basis,
                'rate' => $rate,
                'status' => $status,
                'quantity' => $quantity,
                'overtime_hours' => $overtimeHours,
                'overtime_rate' => $overtimeRate,
                'notes' => isset($values['notes']) && trim((string) $values['notes']) !== ''
                    ? trim((string) $values['notes'])
                    : null,
            ];
        }

        if ($normalized === []) {
            return [
                'processed' => 0,
                'skipped' => $skipped,
            ];
        }

        DB::transaction(function () use (
            $normalized,
            $date,
            $createdBy,
            $historyByMember,
            $monthStart,
            $monthEnd,
        ): void {
            $now = now();
            $attendanceRows = [];

            foreach ($normalized as $memberId => $row) {
                /** @var StaffMember $member */
                $member = $row['member'];
                $attendanceRows[] = [
                    'organization_id' => $member->organization_id,
                    'staff_member_id' => $memberId,
                    'created_by' => $createdBy,
                    'occurred_on' => $date,
                    'status' => $row['status'],
                    'quantity' => $row['quantity'],
                    'overtime_hours' => $row['overtime_hours'],
                    'overtime_rate' => $row['overtime_rate'],
                    'notes' => $row['notes'],
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            DB::table('staff_attendances')->upsert(
                $attendanceRows,
                ['staff_member_id', 'occurred_on'],
                [
                    'status',
                    'quantity',
                    'overtime_hours',
                    'overtime_rate',
                    'notes',
                    'updated_at',
                ],
            );

            $memberIds = array_keys($normalized);
            $attendanceByMember = DB::table('staff_attendances')
                ->whereIn('staff_member_id', $memberIds)
                ->whereDate('occurred_on', $date)
                ->get()
                ->keyBy('staff_member_id');

            $linkedEntries = StaffEntry::withTrashed()
                ->whereIn('staff_member_id', $memberIds)
                ->whereIn('kind', ['work', 'overtime'])
                ->whereDate('occurred_on', $date)
                ->get()
                ->filter(function (StaffEntry $entry): bool {
                    $terms = is_array($entry->terms) ? $entry->terms : [];

                    return isset($terms['attendance_id']);
                });

            $workByAttendance = $this->entriesByAttendance($linkedEntries->where('kind', 'work'));
            $overtimeByAttendance = $this->entriesByAttendance($linkedEntries->where('kind', 'overtime'));

            foreach ($normalized as $memberId => $row) {
                /** @var StaffMember $member */
                $member = $row['member'];
                $attendance = $attendanceByMember->get($memberId);

                if (! $attendance) {
                    continue;
                }

                $attendanceId = (string) $attendance->id;
                $workEntry = $workByAttendance->get($attendanceId);
                $overtimeEntry = $overtimeByAttendance->get($attendanceId);
                $present = $row['status'] === 'present';

                if (
                    $present
                    && $row['basis'] !== 'month'
                    && Decimal::toUnits((string) $row['quantity']) > 0
                    && Decimal::toUnits((string) $row['rate']) > 0
                ) {
                    $amount = intdiv(
                        Decimal::toUnits((string) $row['quantity'])
                        * Decimal::toUnits((string) $row['rate'])
                        + 5000,
                        10000,
                    );

                    $this->saveLinkedEntry(
                        $workEntry,
                        $member,
                        $createdBy,
                        'work',
                        $date,
                        Decimal::fromUnits($amount),
                        (string) $row['quantity'],
                        (string) $row['rate'],
                        $row['notes'] ?: 'Attendance',
                        [
                            'attendance_id' => (int) $attendance->id,
                            'basis' => $row['basis'],
                            'currency' => $member->currency,
                            'bulk_attendance' => true,
                        ],
                    );
                } elseif ($workEntry && ! $workEntry->trashed()) {
                    $workEntry->delete();
                }

                if (
                    $present
                    && Decimal::toUnits((string) $row['overtime_hours']) > 0
                    && Decimal::toUnits((string) $row['overtime_rate']) > 0
                ) {
                    $amount = intdiv(
                        Decimal::toUnits((string) $row['overtime_hours'])
                        * Decimal::toUnits((string) $row['overtime_rate'])
                        + 5000,
                        10000,
                    );

                    $this->saveLinkedEntry(
                        $overtimeEntry,
                        $member,
                        $createdBy,
                        'overtime',
                        $date,
                        Decimal::fromUnits($amount),
                        (string) $row['overtime_hours'],
                        (string) $row['overtime_rate'],
                        $row['notes'] ?: 'Overtime',
                        [
                            'attendance_id' => (int) $attendance->id,
                            'currency' => $member->currency,
                            'bulk_attendance' => true,
                        ],
                    );
                } elseif ($overtimeEntry && ! $overtimeEntry->trashed()) {
                    $overtimeEntry->delete();
                }
            }

            $monthly = collect($normalized)
                ->filter(fn (array $row): bool => $row['basis'] === 'month')
                ->map(fn (array $row): StaffMember => $row['member'])
                ->values();

            if ($monthly->isNotEmpty()) {
                $this->syncMonthlySalaryBatch(
                    $monthly,
                    $historyByMember,
                    $monthStart,
                    $monthEnd,
                    $createdBy,
                );
            }
        });

        return [
            'processed' => count($normalized),
            'skipped' => $skipped,
        ];
    }

    /** @param Collection<int, StaffEntry> $entries */
    private function entriesByAttendance(Collection $entries): Collection
    {
        return $entries->keyBy(function (StaffEntry $entry): string {
            $terms = is_array($entry->terms) ? $entry->terms : [];

            return (string) ($terms['attendance_id'] ?? '');
        });
    }

    private function saveLinkedEntry(
        ?StaffEntry $entry,
        StaffMember $member,
        int $createdBy,
        string $kind,
        string $date,
        string $amount,
        string $quantity,
        string $rate,
        string $notes,
        array $terms,
    ): void {
        $payload = [
            'kind' => $kind,
            'occurred_on' => $date,
            'amount' => $amount,
            'quantity' => $quantity,
            'rate' => $rate,
            'notes' => $notes,
            'terms' => $terms,
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
     * Recalculate one month for all monthly employees in this chunk using two
     * set-based reads, then update only their generated monthly salary entries.
     *
     * @param  Collection<int, StaffMember>  $members
     * @param  Collection<int, Collection<int, StaffEntry>>  $historyByMember
     */
    private function syncMonthlySalaryBatch(
        Collection $members,
        Collection $historyByMember,
        CarbonImmutable $monthStart,
        CarbonImmutable $monthEnd,
        int $createdBy,
    ): void {
        $today = CarbonImmutable::today();

        if ($monthStart->gt($today)) {
            return;
        }

        $accrualEnd = $monthEnd->gt($today) ? $today : $monthEnd;
        $memberIds = $members->pluck('id')->all();
        $attendance = DB::table('staff_attendances')
            ->whereIn('staff_member_id', $memberIds)
            ->whereBetween('occurred_on', [
                $monthStart->toDateString(),
                $accrualEnd->toDateString(),
            ])
            ->get()
            ->groupBy('staff_member_id')
            ->map(fn (Collection $rows): Collection => $rows->keyBy(
                fn (object $row): string => substr((string) $row->occurred_on, 0, 10),
            ));

        $generated = StaffEntry::withTrashed()
            ->whereIn('staff_member_id', $memberIds)
            ->where('kind', 'work')
            ->whereBetween('occurred_on', [
                $monthStart->toDateString(),
                $monthEnd->toDateString(),
            ])
            ->get()
            ->filter(function (StaffEntry $entry) use ($monthStart): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return ((bool) ($terms['attendance_salary'] ?? false)
                    || (bool) ($terms['accrual'] ?? false))
                    && substr((string) $entry->occurred_on, 0, 7) === $monthStart->format('Y-m');
            })
            ->groupBy('staff_member_id');

        $expectedWorkDays = 0;
        for ($day = $monthStart; $day->lte($monthEnd); $day = $day->addDay()) {
            if (! $day->isFriday()) {
                $expectedWorkDays++;
            }
        }

        if ($expectedWorkDays <= 0) {
            return;
        }

        foreach ($members as $member) {
            $history = $historyByMember->get($member->id, collect());
            $memberAttendance = $attendance->get($member->id, collect());
            $startedOn = CarbonImmutable::parse((string) $member->started_on)->startOfDay();
            $weightedRateUnits = 0;
            $presentDays = 0;
            $absentDays = 0;
            $missingDays = 0;
            $payableDays = 0;
            $lastRate = null;

            for ($day = $monthStart; $day->lte($accrualEnd); $day = $day->addDay()) {
                if ($day->isFriday() || $day->lt($startedOn)) {
                    continue;
                }

                $terms = $this->termsAt($member, $day->toDateString(), $history);

                if (($terms['basis'] ?? null) !== 'month' || ! ($terms['active'] ?? true)) {
                    continue;
                }

                $rate = (string) ($terms['rate'] ?? $member->rate ?? '0');
                $rateUnits = Decimal::toUnits($rate);

                if ($rateUnits <= 0) {
                    continue;
                }

                $status = $memberAttendance->get($day->toDateString())?->status;

                if ($status === 'absent') {
                    $absentDays++;
                    $lastRate = $rate;
                    continue;
                }

                if ($status === 'present') {
                    $presentDays++;
                } else {
                    $missingDays++;
                }

                $weightedRateUnits += $rateUnits;
                $payableDays++;
                $lastRate = $rate;
            }

            $amountUnits = $payableDays > 0
                ? intdiv($weightedRateUnits + intdiv($expectedWorkDays, 2), $expectedWorkDays)
                : 0;
            $entries = $generated->get($member->id, collect())->values();
            $entry = $entries->first();

            foreach ($entries->slice(1) as $duplicate) {
                if (! $duplicate->trashed()) {
                    $duplicate->delete();
                }
            }

            if ($amountUnits <= 0) {
                if ($entry && ! $entry->trashed()) {
                    $entry->delete();
                }
                continue;
            }

            $payload = [
                'kind' => 'work',
                'occurred_on' => $monthStart->toDateString(),
                'quantity' => number_format($payableDays, 4, '.', ''),
                'rate' => $lastRate ?? (string) $member->rate,
                'amount' => Decimal::fromUnits($amountUnits),
                'notes' => 'Attendance salary '.$monthStart->format('Y-m'),
                'terms' => [
                    'basis' => 'month',
                    'currency' => $member->currency,
                    'attendance_salary' => true,
                    'period' => $monthStart->format('Y-m'),
                    'present_days' => $presentDays,
                    'absent_days' => $absentDays,
                    'missing_days' => $missingDays,
                    'payable_days' => $payableDays,
                    'expected_work_days' => $expectedWorkDays,
                    'accrual_through' => $accrualEnd->toDateString(),
                    'missing_attendance_deducted' => false,
                    'bulk_attendance' => true,
                ],
            ];

            if ($entry) {
                if ($entry->trashed()) {
                    $entry->restore();
                }
                $entry->update($payload);
            } else {
                StaffEntry::create([
                    ...$payload,
                    'staff_member_id' => $member->id,
                    'created_by' => $createdBy,
                    'request_id' => (string) Str::uuid(),
                ]);
            }
        }
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

        return is_array($terms) ? $terms : $member->toArray();
    }

    /** @return array{id:int,name:string,reason:string} */
    private function skip(StaffMember $member, string $reason): array
    {
        return [
            'id' => (int) $member->id,
            'name' => (string) $member->name,
            'reason' => $reason,
        ];
    }
}
