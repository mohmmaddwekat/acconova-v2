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
    private const CHUNK_SIZE = 100;

    /**
     * Return one lightweight, server-paginated attendance roster for a date.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
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
     * Save selected employees or the next 100 matching employees. `all` mode
     * uses an ID cursor so the browser can keep submitting short predictable
     * requests even for very large workforces.
     */
    public function store(
        Request $request,
        StaffBulkAttendanceService $service,
    ): JsonResponse {
        $data = $request->validate([
            'scope' => ['required', Rule::in(['selected', 'all'])],
            'occurred_on' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
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
            'search' => ['nullable', 'string', 'max:100'],
            'department_id' => ['nullable', 'integer'],
            'cursor' => ['nullable', 'integer', 'min:0'],
        ]);

        $date = (string) $data['occurred_on'];
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
                ->limit(self::CHUNK_SIZE + 1)
                ->get();

            $hasMore = $members->count() > self::CHUNK_SIZE;
            $members = $members->take(self::CHUNK_SIZE)->values();
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

        $result = $service->save(
            $members,
            $date,
            [
                'status' => (string) $data['status'],
                'quantity' => isset($data['quantity']) ? (string) $data['quantity'] : '0',
                'overtime_hours' => (string) $data['overtime_hours'],
                'overtime_rate' => (string) $data['overtime_rate'],
                'notes' => $data['notes'] ?? null,
            ],
            $overrides,
            (int) $request->user()->id,
        );

        return response()->json([
            ...$result,
            'requested' => $members->count(),
            'next_cursor' => $nextCursor,
            'has_more' => $data['scope'] === 'all' ? $hasMore : false,
            'chunk_size' => self::CHUNK_SIZE,
        ]);
    }

    /**
     * Build the exact attendance-authorized Staff scope used by both list and
     * save endpoints. This prevents bulk APIs from broadening team permissions.
     *
     * @param array<string, mixed> $filters
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
