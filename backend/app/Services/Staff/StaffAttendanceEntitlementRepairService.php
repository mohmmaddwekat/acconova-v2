<?php

namespace App\Services\Staff;

use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class StaffAttendanceEntitlementRepairService
{
    /**
     * Rebuild attendance-backed earnings for hourly/daily/piece employees.
     *
     * Older imported attendance can already have a linked work entry whose
     * amount/rate is zero because the employee rate was configured later. In
     * that case the row must be recalculated, not skipped merely because a
     * work entry exists.
     */
    public function repair(StaffMember $member, int $createdBy): void
    {
        $attendance = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get();

        if ($attendance->isEmpty()) {
            return;
        }

        $history = StaffEntry::where('staff_member_id', $member->id)
            ->where('kind', 'terms')
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get();

        $linked = StaffEntry::withTrashed()
            ->where('staff_member_id', $member->id)
            ->whereIn('kind', ['work', 'overtime'])
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $terms = is_array($entry->terms) ? $entry->terms : [];

                return isset($terms['attendance_id']);
            });

        $workByAttendance = $this->byAttendance($linked->where('kind', 'work'));
        $overtimeByAttendance = $this->byAttendance($linked->where('kind', 'overtime'));

        foreach ($attendance as $row) {
            $attendanceId = (string) $row->id;
            $date = substr((string) $row->occurred_on, 0, 10);
            $terms = $this->termsAt($member, $date, $history);

            $basis = (string) ($terms['basis'] ?? $member->basis);
            if (! in_array($basis, ['hour', 'day', 'month', 'piece'], true)) {
                $basis = (string) $member->basis;
            }

            $historicalRate = (string) ($terms['rate'] ?? '0');
            $rate = Decimal::toUnits($historicalRate) > 0
                ? $historicalRate
                : (string) $member->rate;

            $present = (string) $row->status === 'present';
            $quantity = (string) ($row->quantity ?? '0');
            $workEntry = $workByAttendance->get($attendanceId);

            if (
                $present
                && $basis !== 'month'
                && Decimal::toUnits($quantity) > 0
                && Decimal::toUnits($rate) > 0
            ) {
                $amountUnits = intdiv(
                    Decimal::toUnits($quantity) * Decimal::toUnits($rate) + 5000,
                    10000,
                );

                $entryTerms = $workEntry && is_array($workEntry->terms)
                    ? $workEntry->terms
                    : [];

                $payload = [
                    'occurred_on' => $date,
                    'quantity' => $quantity,
                    'rate' => $rate,
                    'amount' => Decimal::fromUnits($amountUnits),
                    'notes' => $workEntry?->notes ?: 'Attendance entitlement',
                    'terms' => [
                        ...$entryTerms,
                        'attendance_id' => (int) $row->id,
                        'basis' => $basis,
                        'currency' => (string) ($terms['currency'] ?? $member->currency),
                        'auto_repaired' => true,
                        'used_current_rate_fallback' => Decimal::toUnits($historicalRate) <= 0,
                    ],
                ];

                if ($workEntry) {
                    // Use a direct update so legacy imported-entry normalization
                    // cannot overwrite the exact attendance x rate calculation.
                    DB::table('staff_entries')
                        ->where('id', $workEntry->id)
                        ->update([
                            ...$payload,
                            'terms' => json_encode($payload['terms'], JSON_UNESCAPED_UNICODE),
                            'deleted_at' => null,
                            'updated_at' => now(),
                        ]);
                } else {
                    StaffEntry::create([
                        ...$payload,
                        'staff_member_id' => $member->id,
                        'created_by' => $createdBy,
                        'request_id' => (string) Str::uuid(),
                        'kind' => 'work',
                    ]);
                }
            } elseif ($workEntry && ! $workEntry->trashed()) {
                $workEntry->delete();
            }

            $overtimeHours = (string) ($row->overtime_hours ?? '0');
            $overtimeRate = (string) ($row->overtime_rate ?? '0');
            $overtimeEntry = $overtimeByAttendance->get($attendanceId);

            if (
                $present
                && Decimal::toUnits($overtimeHours) > 0
                && Decimal::toUnits($overtimeRate) > 0
            ) {
                $overtimeAmountUnits = intdiv(
                    Decimal::toUnits($overtimeHours) * Decimal::toUnits($overtimeRate) + 5000,
                    10000,
                );

                $entryTerms = $overtimeEntry && is_array($overtimeEntry->terms)
                    ? $overtimeEntry->terms
                    : [];

                $payload = [
                    'occurred_on' => $date,
                    'quantity' => $overtimeHours,
                    'rate' => $overtimeRate,
                    'amount' => Decimal::fromUnits($overtimeAmountUnits),
                    'notes' => $overtimeEntry?->notes ?: 'Attendance overtime',
                    'terms' => [
                        ...$entryTerms,
                        'attendance_id' => (int) $row->id,
                        'currency' => (string) ($terms['currency'] ?? $member->currency),
                        'auto_repaired' => true,
                    ],
                ];

                if ($overtimeEntry) {
                    DB::table('staff_entries')
                        ->where('id', $overtimeEntry->id)
                        ->update([
                            ...$payload,
                            'terms' => json_encode($payload['terms'], JSON_UNESCAPED_UNICODE),
                            'deleted_at' => null,
                            'updated_at' => now(),
                        ]);
                } else {
                    StaffEntry::create([
                        ...$payload,
                        'staff_member_id' => $member->id,
                        'created_by' => $createdBy,
                        'request_id' => (string) Str::uuid(),
                        'kind' => 'overtime',
                    ]);
                }
            } elseif ($overtimeEntry && ! $overtimeEntry->trashed()) {
                $overtimeEntry->delete();
            }
        }
    }

    /** @param Collection<int, StaffEntry> $entries */
    private function byAttendance(Collection $entries): Collection
    {
        return $entries->keyBy(function (StaffEntry $entry): string {
            $terms = is_array($entry->terms) ? $entry->terms : [];

            return (string) ($terms['attendance_id'] ?? '');
        });
    }

    /**
     * @param Collection<int, StaffEntry> $history
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
}
