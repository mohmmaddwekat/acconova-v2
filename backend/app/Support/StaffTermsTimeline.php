<?php

namespace App\Support;

use App\Models\StaffEntry;
use App\Models\StaffMember;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StaffTermsTimeline
{
    /**
     * Last date a stopped employee with no recorded terms history was working.
     *
     * Without history, the member row only says that the employee is stopped
     * today. Applying that flag to every past date would erase salary that was
     * already earned, so treat the employee as working until their last
     * attendance (or start date when no attendance exists).
     *
     * @param  Collection<int, StaffEntry>  $history
     */
    public static function legacyActiveUntil(StaffMember $member, Collection $history): ?string
    {
        if ($member->active || $history->isNotEmpty()) {
            return null;
        }

        $lastAttendance = DB::table('staff_attendances')
            ->where('staff_member_id', $member->id)
            ->max('occurred_on');

        $lastWorked = $lastAttendance ?: $member->started_on;

        return substr((string) $lastWorked, 0, 10);
    }

    /**
     * @param  array<string, mixed>  $terms
     * @return array<string, mixed>
     */
    public static function withLegacyActivity(array $terms, ?string $activeUntil, string $date): array
    {
        if ($activeUntil === null) {
            return $terms;
        }

        $terms['active'] = $date <= $activeUntil;

        return $terms;
    }
}
