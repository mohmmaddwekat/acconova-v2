<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Services\Staff\StaffMonthlyEntitlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class StaffSalaryChangeController extends Controller
{
    /**
     * Return the employee's current rate and auditable salary-change history.
     */
    public function index(
        Request $request,
        string $staff,
    ): JsonResponse {
        $member = StaffMember::findOrFail($staff);

        abort_unless(
            StaffController::canView($member),
            403,
        );

        $history = StaffEntry::where(
            'staff_member_id',
            $member->id,
        )
            ->where('kind', 'terms')
            ->latest('occurred_on')
            ->latest('id')
            ->get()
            ->filter(function (StaffEntry $entry): bool {
                $before = $entry->terms['before'] ?? null;
                $after = $entry->terms['after'] ?? null;

                if (! is_array($before) || ! is_array($after)) {
                    return false;
                }

                return (string) ($before['rate'] ?? '') !==
                    (string) ($after['rate'] ?? '');
            })
            ->map(function (StaffEntry $entry): array {
                $before = $entry->terms['before'];
                $after = $entry->terms['after'];
                $oldRate = (float) ($before['rate'] ?? 0);
                $newRate = (float) ($after['rate'] ?? 0);

                return [
                    'id' => (int) $entry->id,
                    'effective_on' => (string) $entry->occurred_on,
                    'old_rate' => number_format($oldRate, 4, '.', ''),
                    'new_rate' => number_format($newRate, 4, '.', ''),
                    'difference' => number_format($newRate - $oldRate, 4, '.', ''),
                    'notes' => $entry->notes,
                    'created_at' => $entry->created_at?->toISOString(),
                ];
            })
            ->values();

        return response()->json([
            'member' => [
                'id' => (int) $member->id,
                'name' => $member->name,
                'basis' => $member->basis,
                'rate' => (string) $member->rate,
                'currency' => $member->currency,
            ],
            'can_manage' => StaffController::canManage($member),
            'history' => $history,
        ]);
    }

    /**
     * Change the employee's rate, preserving the old compensation snapshot in
     * the staff terms ledger. `effective_on` defaults to today for an
     * ordinary raise, but can be backdated to correct historical salary
     * steps (e.g. entering "was 3500, became 4500 two months ago, became
     * 5000 last month" one change at a time). Only the change with the
     * latest effective date updates the employee's live rate; an earlier,
     * backdated change is recorded purely as history so it does not
     * overwrite a rate that is already correct. Either way, attendance-based
     * entitlements for every affected month are recalculated from the full,
     * corrected timeline afterwards.
     */
    public function store(
        Request $request,
        string $staff,
        StaffMonthlyEntitlementService $entitlements,
    ): JsonResponse {
        $data = $request->validate([
            'rate' => [
                'required',
                'numeric',
                'min:0',
                'max:999999',
                'regex:/^\d+(\.\d{1,4})?$/',
            ],
            'effective_on' => [
                'nullable',
                'date_format:Y-m-d',
                'before_or_equal:today',
            ],
            'notes' => [
                'nullable',
                'string',
                'max:1000',
            ],
        ]);

        $member = DB::transaction(
            function () use ($request, $staff, $data): StaffMember {
                $member = StaffMember::lockForUpdate()->findOrFail($staff);

                abort_unless(
                    StaffController::canManage($member),
                    403,
                );

                $effectiveOn = (string) ($data['effective_on'] ?? today()->toDateString());

                abort_if(
                    $effectiveOn < substr((string) $member->started_on, 0, 10),
                    422,
                    'The effective date cannot be before the employee\'s start date.',
                );

                $history = StaffEntry::where('staff_member_id', $member->id)
                    ->where('kind', 'terms')
                    ->orderBy('occurred_on')
                    ->orderBy('id')
                    ->get();

                $oldRate = $this->rateBefore($member, $effectiveOn, $history);
                $newRate = number_format((float) $data['rate'], 4, '.', '');

                if ($oldRate === $newRate) {
                    throw ValidationException::withMessages([
                        'rate' => [
                            'The new salary/rate must be different from the rate already in effect on that date.',
                        ],
                    ]);
                }

                $latestKnownDate = (string) ($history->last()?->occurred_on ?? '0000-00-00');
                $isLatest = substr($latestKnownDate, 0, 10) <= $effectiveOn;

                if ($isLatest) {
                    $before = $member->toArray();
                    $member->update(['rate' => $data['rate']]);
                    $member->refresh();
                    $after = $member->toArray();
                } else {
                    // A backdated correction: keep the live rate untouched
                    // because a later, already-recorded change still applies
                    // going forward from today.
                    $before = [...$member->toArray(), 'rate' => $oldRate];
                    $after = [...$member->toArray(), 'rate' => $newRate];
                }

                StaffEntry::create([
                    'staff_member_id' => $member->id,
                    'created_by' => $request->user()->id,
                    'request_id' => (string) Str::uuid(),
                    'kind' => 'terms',
                    'occurred_on' => $effectiveOn,
                    'amount' => 0,
                    'notes' => filled($data['notes'] ?? null)
                        ? trim((string) $data['notes'])
                        : 'Salary/rate adjustment',
                    'terms' => [
                        'before' => $before,
                        'after' => $after,
                        'salary_change' => true,
                    ],
                ]);

                return $member;
            },
        );

        $entitlements->syncMember(
            $member,
            (int) $request->user()->id,
        );

        return response()->json([
            'data' => [
                'id' => (int) $member->id,
                'name' => $member->name,
                'rate' => (string) $member->rate,
                'currency' => $member->currency,
                'effective_on' => (string) ($data['effective_on'] ?? today()->toDateString()),
            ],
        ]);
    }

    /**
     * The rate that was in effect the moment before `$date`, following the
     * existing terms history. Used both to validate the new rate actually
     * differs and, for a backdated change, as the "before" snapshot.
     *
     * @param  Collection<int, StaffEntry>  $history
     */
    private function rateBefore(StaffMember $member, string $date, Collection $history): string
    {
        $rate = (string) ($history->first()?->terms['before']['rate'] ?? $member->rate);

        foreach ($history as $change) {
            if (substr((string) $change->occurred_on, 0, 10) < $date) {
                $rate = (string) ($change->terms['after']['rate'] ?? $rate);
            }
        }

        return number_format((float) $rate, 4, '.', '');
    }
}
