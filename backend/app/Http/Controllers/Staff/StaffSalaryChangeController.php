<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Services\Staff\StaffMonthlyEntitlementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
     * Change the employee's rate from today forward while preserving the old
     * compensation snapshot in the staff terms ledger.
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

                $oldRate = number_format((float) $member->rate, 4, '.', '');
                $newRate = number_format((float) $data['rate'], 4, '.', '');

                if ($oldRate === $newRate) {
                    throw ValidationException::withMessages([
                        'rate' => [
                            'The new salary/rate must be different from the current one.',
                        ],
                    ]);
                }

                $before = $member->toArray();

                $member->update([
                    'rate' => $data['rate'],
                ]);

                $member->refresh();

                StaffEntry::create([
                    'staff_member_id' => $member->id,
                    'created_by' => $request->user()->id,
                    'request_id' => (string) Str::uuid(),
                    'kind' => 'terms',
                    'occurred_on' => today()->toDateString(),
                    'amount' => 0,
                    'notes' => filled($data['notes'] ?? null)
                        ? trim((string) $data['notes'])
                        : 'Salary/rate adjustment',
                    'terms' => [
                        'before' => $before,
                        'after' => $member->toArray(),
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
                'effective_on' => today()->toDateString(),
            ],
        ]);
    }
}
