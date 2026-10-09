<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\StaffMember;
use App\Services\Staff\StaffBulkAttendanceService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StaffBulkAttendanceController extends Controller
{
    private const CHUNK_SIZE = 250;

    /**
     * Return one lightweight, server-paginated attendance roster for a date.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:tomorrow'],
            'search' => ['nullable', 'string', 'max:100'],
            'department_id' => ['nullable', 'integer'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', Rule::in([20, 50, 100])],
        ]);

        $date = (string) ($filters['date'] ?? CarbonImmutable::today()->toDateString());
        $query = $this->attendanceScope($request, $date, $filters);
        $perPage = (int) ($filters['per_page'] ?? 50);

        $paginator = $query
            ->orderBy('name')
            ->orderBy('id')
            ->paginate(
                $perPage,
                [
                    'id',
                    'name',
                    'job_title',
                    'department_id',
                    'basis',
                    'unit',
                    'rate',
                    'currency',
                    'started_on',
                ],
            );

        $memberIds = collect($paginator->items())
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->values();

        $attendance = $memberIds->isEmpty()
            ? collect()
            : DB::table('staff_attendances')
                ->whereIn('staff_member_id', $memberIds)
                ->whereDate('occurred_on', $date)
                ->get()
                ->keyBy('staff_member_id');

        $departments = Department::query();
        if (! StaffController::allowed('staff.attendance')) {
            $departments->whereIn('id', StaffController::managedDepartmentIds());
        }

        $rows = collect($paginator->items())
            ->map(function (StaffMember $member) use ($attendance): array {
                $row = $attendance->get($member->id);

                return [
                    'id' => (int) $member->id,
                    'name' => (string) $member->name,
                    'job_title' => $member->job_title,
                    'department_id' => $member->department_id,
                    'basis' => (string) $member->basis,
                    'unit' => $member->unit,
                    'rate' => (string) $member->rate,
                    'currency' => (string) $member->currency,
                    'attendance' => $row
                        ? [
                            'status' => (string) $row->status,
                            'quantity' => (string) $row->quantity,
                            'overtime_hours' => (string) $row->overtime_hours,
                            'overtime_rate' => (string) $row->overtime_rate,
                            'notes' => $row->notes,
                            'deduction_override' => $row->deduction_override,
                        ]
                        : null,
                ];
            })
            ->values();

        return response()->json([
            'date' => $date,
            'data' => $rows,
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'departments' => $departments
                ->orderBy('name')
                ->get(['id', 'name']),
        ]);
    }

    /**
     * Save selected employees or the next 250 matching employees. `all` mode
     * uses an ID cursor so the browser can keep submitting short predictable
     * requests even for very large workforces.
     */
    public function store(
        Request $request,
        StaffBulkAttendanceService $service,
    ): JsonResponse {
        $data = $request->validate([
            'scope' => ['required', Rule::in(['selected', 'all'])],
            'occurred_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:tomorrow'],
            'dates' => ['nullable', 'array', 'min:1', 'max:31'],
            'dates.*' => ['date_format:Y-m-d', 'before_or_equal:tomorrow', 'distinct'],
            'absent_dates' => ['nullable', 'array', 'max:31'],
            'absent_dates.*' => ['date_format:Y-m-d', 'distinct'],
            'status' => ['required', Rule::in(['present', 'absent'])],
            'quantity' => ['nullable', 'numeric', 'gt:0', 'max:9999', 'regex:/^\d+(\.\d{1,4})?$/'],
            'overtime_hours' => ['required', 'numeric', 'min:0', 'max:24', 'regex:/^\d+(\.\d{1,4})?$/'],
            'overtime_rate' => ['required', 'numeric', 'min:0', 'max:999999', 'regex:/^\d+(\.\d{1,4})?$/'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'staff_ids' => ['required_if:scope,selected', 'array', 'max:100'],
            'staff_ids.*' => ['integer', 'distinct'],
            'overrides' => ['nullable', 'array', 'max:100'],
            'overrides.*.staff_id' => ['required', 'integer', 'distinct'],
            'overrides.*.status' => ['nullable', Rule::in(['present', 'absent'])],
            'overrides.*.quantity' => ['nullable', 'numeric', 'gt:0', 'max:9999', 'regex:/^\d+(\.\d{1,4})?$/'],
            'overrides.*.overtime_hours' => ['nullable', 'numeric', 'min:0', 'max:24', 'regex:/^\d+(\.\d{1,4})?$/'],
            'overrides.*.overtime_rate' => ['nullable', 'numeric', 'min:0', 'max:999999', 'regex:/^\d+(\.\d{1,4})?$/'],
            'overrides.*.notes' => ['nullable', 'string', 'max:2000'],
            'overrides.*.deduction_override' => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'search' => ['nullable', 'string', 'max:100'],
            'department_id' => ['nullable', 'integer'],
            'cursor' => ['nullable', 'integer', 'min:0'],
        ]);

        $dates = collect($data['dates'] ?? [(string) $data['occurred_on']])
            ->map(fn ($day): string => (string) $day)
            ->unique()
            ->sort()
            ->values();
        $date = (string) $dates->last();
        $chunkSize = max(10, intdiv(self::CHUNK_SIZE, $dates->count()));
        $filters = [
            'search' => $data['search'] ?? null,
            'department_id' => $data['department_id'] ?? null,
        ];
        $query = $this->attendanceScope($request, $date, $filters);
        $hasMore = false;
        $nextCursor = null;

        if ($data['scope'] === 'selected') {
            $requestedIds = collect($data['staff_ids'] ?? [])
                ->map(fn ($id): int => (int) $id)
                ->unique()
                ->values();

            $members = (clone $query)
                ->whereIn('id', $requestedIds)
                ->orderBy('id')
                ->get();

            abort_unless($members->count() === $requestedIds->count(), 422);
        } else {
            $cursor = (int) ($data['cursor'] ?? 0);
            $members = (clone $query)
                ->where('id', '>', $cursor)
                ->orderBy('id')
                ->limit($chunkSize + 1)
                ->get();

            $hasMore = $members->count() > $chunkSize;
            $members = $members->take($chunkSize)->values();
            $nextCursor = $members->isNotEmpty()
                ? (int) $members->last()->id
                : $cursor;
        }

        $overrides = collect($data['overrides'] ?? [])
            ->keyBy(fn (array $row): int => (int) $row['staff_id'])
            ->map(function (array $row): array {
                unset($row['staff_id']);

                return array_filter(
                    $row,
                    fn ($value): bool => $value !== null && $value !== '',
                );
            })
            ->all();

        $defaults = [
            'status' => (string) $data['status'],
            'quantity' => isset($data['quantity']) ? (string) $data['quantity'] : '0',
            'overtime_hours' => (string) $data['overtime_hours'],
            'overtime_rate' => (string) $data['overtime_rate'],
            'notes' => $data['notes'] ?? null,
        ];
        $processed = 0;
        $skipped = [];
        $multiDay = isset($data['dates']);
        $absentDates = collect($data['absent_dates'] ?? [])->flip();

        // In multi-day mode each day carries its own present/absent status.
        $overridesWithoutStatus = collect($overrides)
            ->map(function (array $row): array {
                unset($row['status']);

                return $row;
            })
            ->all();

        foreach ($dates as $day) {
            // An employee only takes part in days on or after their start date.
            $dayMembers = $members
                ->filter(fn (StaffMember $member): bool => substr((string) $member->started_on, 0, 10) <= $day)
                ->values();

            $result = $service->save(
                $dayMembers,
                $day,
                $multiDay
                    ? [...$defaults, 'status' => $absentDates->has($day) ? 'absent' : 'present']
                    : $defaults,
                $multiDay ? $overridesWithoutStatus : $overrides,
                (int) $request->user()->id,
            );

            $processed += $result['processed'];

            foreach ($result['skipped'] as $skip) {
                $skipped[$skip['id']] = $skip;
            }
        }

        $result = [
            'processed' => $processed,
            'skipped' => array_values($skipped),
            'days' => $dates->count(),
        ];

        return response()->json([
            ...$result,
            'requested' => $members->count(),
            'next_cursor' => $nextCursor,
            'has_more' => $data['scope'] === 'all' ? $hasMore : false,
            'chunk_size' => $chunkSize,
        ]);
    }

    /**
     * Build the exact attendance-authorized Staff scope used by both list and
     * save endpoints. This prevents bulk APIs from broadening team permissions.
     *
     * @param  array<string, mixed>  $filters
     */
    private function attendanceScope(
        Request $request,
        string $date,
        array $filters,
    ): Builder {
        $canAll = StaffController::allowed('staff.attendance');
        $canTeam = StaffController::allowed('staff.team_attendance');

        abort_unless($canAll || $canTeam, 403);

        $query = StaffMember::query()
            ->where('active', true)
            ->whereDate('started_on', '<=', $date);

        if (! $canAll) {
            $query->whereIn('department_id', StaffController::managedDepartmentIds());
        }

        if (! empty($filters['search'])) {
            $search = '%'.trim((string) $filters['search']).'%';
            $query->where(function (Builder $query) use ($search): void {
                $query->where('name', 'like', $search)
                    ->orWhere('job_title', 'like', $search);
            });
        }

        if (! empty($filters['department_id'])) {
            $query->where('department_id', (int) $filters['department_id']);
        }

        return $query;
    }
}
