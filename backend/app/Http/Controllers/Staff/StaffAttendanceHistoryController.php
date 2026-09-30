<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\StaffMember;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StaffAttendanceHistoryController extends Controller
{
    /**
     * Return one employee's attendance history using database-side filtering and
     * pagination. Never load the full attendance history into PHP/React.
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
            'per_page' => ['nullable', 'integer', Rule::in([20, 50, 100])],
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
        $perPage = (int) ($filters['per_page'] ?? 20);

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

        return response()->json([
            'attendance' => $attendance,
            'summary' => [
                'total' => (int) ($summary?->total ?? 0),
                'present' => (int) ($summary?->present_count ?? 0),
                'absent' => (int) ($summary?->absent_count ?? 0),
                'quantity' => (string) ($summary?->quantity_total ?? '0'),
                'overtime' => (string) ($summary?->overtime_total ?? '0'),
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
