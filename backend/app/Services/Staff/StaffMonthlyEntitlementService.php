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
     * Recalculate every attendance-backed monthly salary period for one employee.
     */
    public function syncMember(StaffMember $member, int $createdBy): void
    {
        $history = StaffEntry::where('staff_member_id', $member->id)
            ->where('kind', 'terms')
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get();

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

        $attendancePeriods
            ->merge($generatedPeriods)
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
            });
    }

    /**
     * Recalculate monthly salary entries for every tenant employee that has
     * attendance. This is used after bulk attendance imports.
     */
    public function syncOrganization(int $createdBy): void
    {
        $memberIds = DB::table('staff_attendances')
            ->where('organization_id', app(TenantContext::class)->id())
            ->distinct()
            ->pluck('staff_member_id');

        StaffMember::whereIn('id', $memberIds)
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
        $expectedWorkDays = $this->expectedWorkDays($monthStart, $monthEnd);

        if ($expectedWorkDays <= 0) {
            return;
        }

        $attendance = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->whereBetween('occurred_on', [
                $monthStart->toDateString(),
                $monthEnd->toDateString(),
            ])
            ->orderBy('occurred_on')
            ->get();

        $weightedMonthlyRateUnits = 0;
        $presentDays = 0;
        $lastMonthlyRate = null;

        foreach ($attendance as $row) {
            $date = CarbonImmutable::parse((string) $row->occurred_on);

            if ((string) $row->status !== 'present' || $date->isFriday()) {
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

            $weightedMonthlyRateUnits += $rateUnits;
            $presentDays++;
            $lastMonthlyRate = $rate;
        }

        $amountUnits = $presentDays > 0
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
            'quantity' => number_format($presentDays, 4, '.', ''),
            'rate' => $lastMonthlyRate ?? (string) $member->rate,
            'amount' => Decimal::fromUnits($amountUnits),
            'notes' => 'Attendance salary '.$period,
            'terms' => [
                'basis' => 'month',
                'currency' => $member->currency,
                'attendance_salary' => true,
                'period' => $period,
                'present_days' => $presentDays,
                'expected_work_days' => $expectedWorkDays,
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
