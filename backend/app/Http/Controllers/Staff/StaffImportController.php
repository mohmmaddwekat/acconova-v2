<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Membership;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Services\Staff\StaffMonthlyEntitlementService;
use App\Support\InventoryQuantity as Decimal;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use RuntimeException;
use Throwable;

class StaffImportController extends Controller
{
    private const MAX_ROWS = 10000;

    /** @var array<string, StaffMember|null> */
    private array $memberLookupCache = [];

    /** @var array<string, list<StaffMember>>|null */
    private ?array $normalizedNameIndex = null;

    /** @var array<int, Collection<int, StaffEntry>> */
    private array $termsHistoryCache = [];

    /** @var array<string, StaffEntry|null> */
    private array $attendanceEntryCache = [];

    public function preview(Request $request): JsonResponse
    {
        abort_unless(StaffController::allowed('staff.import'), 403);

        $request->validate([
            'file' => ['required', 'file', 'max:20480', 'mimes:csv,txt,xls,xlsx'],
        ]);

        $file = $request->file('file');
        $extension = strtolower($file->getClientOriginalExtension());
        $token = Str::uuid()->toString().'.'.$extension;
        $directory = $this->directory($request);

        if (! is_dir($directory)) {
            mkdir($directory, 0750, true);
        }

        $this->prune($directory);
        $originalName = $file->getClientOriginalName();
        $file->move($directory, $token);
        $path = $directory.DIRECTORY_SEPARATOR.$token;

        try {
            $spreadsheet = IOFactory::load($path);
            $sheets = [];

            foreach ($spreadsheet->getWorksheetIterator() as $sheet) {
                $rows = $sheet->toArray(null, true, true, false);

                if ($rows === []) {
                    continue;
                }

                $headers = $this->normalizeHeaders(array_shift($rows) ?? []);
                $nonEmpty = array_values(array_filter(
                    $rows,
                    fn (array $row): bool => $this->rowHasContent($row),
                ));

                $sheets[] = [
                    'name' => $sheet->getTitle(),
                    'headers' => $headers,
                    'sample' => array_map(
                        fn (array $row): array => $this->associateRow($headers, $row),
                        array_slice($nonEmpty, 0, 8),
                    ),
                    'row_count' => min(self::MAX_ROWS, count($nonEmpty)),
                ];
            }

            abort_if($sheets === [], 422, 'No readable sheets were found in the uploaded file.');

            return response()->json([
                'token' => $token,
                'name' => $originalName,
                'sheets' => $sheets,
            ]);
        } catch (Throwable $exception) {
            @unlink($path);
            throw $exception;
        }
    }

    public function commit(Request $request): JsonResponse
    {
        abort_unless(StaffController::allowed('staff.import'), 403);

        $data = $request->validate([
            'token' => ['required', 'string', 'regex:/^[a-f0-9\-]+\.(csv|txt|xls|xlsx)$/i'],
            'sheet' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(['employees', 'attendance', 'payroll'])],
            'mapping' => ['required', 'array'],
            'mapping.*' => ['nullable', 'string', 'max:255'],
            'match_by' => ['nullable', Rule::in(['name', 'phone', 'email'])],
            'duplicate_strategy' => ['nullable', Rule::in(['skip', 'update'])],
            'create_departments' => ['nullable', 'boolean'],
            'filters' => ['nullable', 'array', 'max:20'],
            'filters.*.column' => ['required', 'string', 'max:255'],
            'filters.*.type' => ['required', Rule::in(['text', 'number', 'date'])],
            'filters.*.operator' => ['required', Rule::in([
                'equals', 'not_equals', 'contains', 'not_contains',
                'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between',
                'before', 'after',
            ])],
            'filters.*.value' => ['nullable', 'string', 'max:255'],
            'filters.*.value2' => ['nullable', 'string', 'max:255'],
        ]);

        $this->authorizeImportType($data['type']);

        $path = $this->directory($request).DIRECTORY_SEPARATOR.$data['token'];
        abort_unless(is_file($path), 404);

        $spreadsheet = IOFactory::load($path);
        $sheet = $spreadsheet->getSheetByName($data['sheet']);
        abort_unless($sheet, 422, 'The selected sheet no longer exists in the uploaded file.');

        $rows = $sheet->toArray(null, true, true, false);
        abort_if(count($rows) > self::MAX_ROWS + 1, 422, 'This import is limited to 10,000 rows per run.');

        $headers = $this->normalizeHeaders(array_shift($rows) ?? []);
        $records = [];

        foreach ($rows as $row) {
            if ($this->rowHasContent($row)) {
                $records[] = $this->associateRow($headers, $row);
            }
        }

        $totalRecords = count($records);
        $records = $this->applyFilters($records, $data['filters'] ?? []);
        $filteredOut = $totalRecords - count($records);

        $result = match ($data['type']) {
            'employees' => $this->importEmployees($records, $data),
            'attendance' => $this->importAttendance($request, $records, $data),
            'payroll' => $this->importPayroll($request, $records, $data),
        };

        $result['token'] = $data['token'];
        $result['filtered_out'] = $filteredOut;

        return response()->json($result);
    }

    /**
     * Keep only the rows that satisfy every row-level filter the user picked
     * in the preview step (e.g. one employee, or a date/amount range) before
     * they are matched and written.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  list<array<string, mixed>>  $filters
     * @return list<array<string, mixed>>
     */
    private function applyFilters(array $rows, array $filters): array
    {
        if ($filters === []) {
            return $rows;
        }

        return array_values(array_filter(
            $rows,
            fn (array $row): bool => $this->rowMatchesFilters($row, $filters),
        ));
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  list<array<string, mixed>>  $filters
     */
    private function rowMatchesFilters(array $row, array $filters): bool
    {
        foreach ($filters as $filter) {
            if (! $this->rowMatchesFilter($row, $filter)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<string, mixed>  $filter
     */
    private function rowMatchesFilter(array $row, array $filter): bool
    {
        $raw = $row[$filter['column']] ?? null;
        $operator = (string) $filter['operator'];
        $value = $filter['value'] ?? null;
        $value2 = $filter['value2'] ?? null;

        return match ($filter['type']) {
            'number' => $this->filterNumber($raw, $operator, $value, $value2),
            'date' => $this->filterDate($raw, $operator, $value, $value2),
            default => $this->filterText($raw, $operator, $value),
        };
    }

    private function filterText(mixed $raw, string $operator, ?string $value): bool
    {
        $haystack = mb_strtolower(trim((string) ($raw ?? '')));
        $needle = mb_strtolower(trim((string) ($value ?? '')));

        return match ($operator) {
            'equals' => $haystack === $needle,
            'not_equals' => $haystack !== $needle,
            'not_contains' => ! str_contains($haystack, $needle),
            default => str_contains($haystack, $needle),
        };
    }

    private function filterNumber(mixed $raw, string $operator, ?string $value, ?string $value2): bool
    {
        $rawDecimal = $this->decimal($raw);
        if ($rawDecimal === null) {
            return false;
        }
        $rawValue = (float) $rawDecimal;

        if ($operator === 'between') {
            $low = $this->decimal($value);
            $high = $this->decimal($value2);
            if ($low === null || $high === null) {
                return false;
            }

            return $rawValue >= (float) $low && $rawValue <= (float) $high;
        }

        $compareDecimal = $this->decimal($value);
        if ($compareDecimal === null) {
            return false;
        }
        $compareValue = (float) $compareDecimal;

        return match ($operator) {
            'eq' => abs($rawValue - $compareValue) < 0.0001,
            'neq' => abs($rawValue - $compareValue) >= 0.0001,
            'gt' => $rawValue > $compareValue,
            'gte' => $rawValue >= $compareValue,
            'lt' => $rawValue < $compareValue,
            'lte' => $rawValue <= $compareValue,
            default => false,
        };
    }

    private function filterDate(mixed $raw, string $operator, ?string $value, ?string $value2): bool
    {
        $rawDate = $this->date($raw);
        if ($rawDate === null) {
            return false;
        }

        if ($operator === 'between') {
            $start = $this->date($value);
            $end = $this->date($value2);
            if ($start === null || $end === null) {
                return false;
            }

            return $rawDate >= $start && $rawDate <= $end;
        }

        $compare = $this->date($value);
        if ($compare === null) {
            return false;
        }

        return match ($operator) {
            'eq' => $rawDate === $compare,
            'before' => $rawDate < $compare,
            'after' => $rawDate > $compare,
            default => false,
        };
    }

    private function authorizeImportType(string $type): void
    {
        $permission = match ($type) {
            'employees' => 'staff.manage',
            'attendance' => 'staff.attendance',
            'payroll' => 'staff.pay',
        };

        abort_unless(StaffController::allowed($permission), 403);
    }

    private function directory(Request $request): string
    {
        return storage_path(
            'app/private/staff-imports/'
            .app(TenantContext::class)->id()
            .'/'
            .$request->user()->id
        );
    }

    private function prune(string $directory): void
    {
        foreach (glob($directory.'/*') ?: [] as $oldFile) {
            if (is_file($oldFile) && filemtime($oldFile) < now()->subDay()->getTimestamp()) {
                @unlink($oldFile);
            }
        }
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function importEmployees(array $rows, array $data): array
    {
        $mapping = $data['mapping'];
        $this->requireMappings($mapping, ['name', 'basis', 'rate', 'started_on']);

        $currency = app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS';
        $duplicateStrategy = $data['duplicate_strategy'] ?? 'skip';
        $matchBy = $data['match_by'] ?? 'phone';
        $createDepartments = (bool) ($data['create_departments'] ?? false);
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        DB::transaction(function () use (
            $rows,
            $mapping,
            $currency,
            $duplicateStrategy,
            $matchBy,
            $createDepartments,
            &$created,
            &$updated,
            &$skipped,
            &$errors,
        ): void {
            foreach ($rows as $index => $row) {
                try {
                    $name = trim((string) $this->mapped($row, $mapping, 'name'));
                    $basis = $this->normalizeBasis($this->mapped($row, $mapping, 'basis'));
                    $rate = $this->decimal($this->mapped($row, $mapping, 'rate'));
                    $startedOn = $this->date($this->mapped($row, $mapping, 'started_on'));

                    if ($name === '' || $basis === null || $rate === null || $startedOn === null) {
                        throw new RuntimeException('Name, pay basis, rate, and start date are required.');
                    }

                    $phone = $this->stringOrNull($this->mapped($row, $mapping, 'phone'));
                    $email = strtolower((string) ($this->stringOrNull(
                        $this->mapped($row, $mapping, 'email')
                    ) ?? ''));
                    $matchValue = match ($matchBy) {
                        'email' => $email,
                        'name' => $name,
                        default => $phone ?? '',
                    };
                    $existing = $matchValue !== '' ? $this->findMember($matchBy, $matchValue) : null;

                    if ($existing && $duplicateStrategy === 'skip') {
                        $skipped++;

                        continue;
                    }

                    $departmentId = $this->departmentId(
                        $this->stringOrNull($this->mapped($row, $mapping, 'department')),
                        $createDepartments,
                    );
                    $userId = null;

                    if ($email !== '') {
                        $membership = Membership::query()
                            ->whereHas('user', fn ($query) => $query->where('email', $email))
                            ->first();
                        $userId = $membership?->user_id;
                    }

                    $payload = [
                        'name' => $name,
                        'job_title' => $this->stringOrNull($this->mapped($row, $mapping, 'job_title')),
                        'phone' => $phone,
                        'user_id' => $userId,
                        'department_id' => $departmentId,
                        'basis' => $basis,
                        'unit' => $this->stringOrNull($this->mapped($row, $mapping, 'unit')),
                        'rate' => $rate,
                        'monthly_allowance' => $this->decimal(
                            $this->mapped($row, $mapping, 'monthly_allowance')
                        ) ?? '0',
                        'currency' => $currency,
                        'started_on' => $startedOn,
                        'active' => $this->boolean($this->mapped($row, $mapping, 'active'), true),
                    ];

                    if ($existing) {
                        $existing->update($payload);
                        $updated++;
                    } else {
                        StaffMember::create($payload);
                        $created++;
                    }
                } catch (Throwable $exception) {
                    $skipped++;
                    $this->pushError($errors, $index + 2, $exception->getMessage());
                }
            }
        });

        return [
            'type' => 'employees',
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => $errors,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function importAttendance(Request $request, array $rows, array $data): array
    {
        $mapping = $data['mapping'];
        $this->requireMappings($mapping, ['employee', 'occurred_on', 'status']);

        $matchBy = $data['match_by'] ?? 'name';
        $strategy = $data['duplicate_strategy'] ?? 'skip';
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];
        $existingAttendances = $this->preloadAttendanceState($rows, $mapping, $matchBy);
        $touchedMembers = [];

        DB::transaction(function () use (
            $request,
            $rows,
            $mapping,
            $matchBy,
            $strategy,
            &$existingAttendances,
            &$created,
            &$updated,
            &$skipped,
            &$errors,
            &$touchedMembers,
        ): void {
            foreach ($rows as $index => $row) {
                try {
                    $identifier = trim((string) $this->mapped($row, $mapping, 'employee'));
                    $member = $this->findMember($matchBy, $identifier);

                    if (! $member) {
                        throw new RuntimeException(
                            'Employee "'.$identifier.'" could not be matched. Check the employee name or selected matching field.'
                        );
                    }

                    $date = $this->date($this->mapped($row, $mapping, 'occurred_on'));
                    $status = $this->normalizeAttendanceStatus(
                        $this->mapped($row, $mapping, 'status')
                    );

                    if ($date === null || $status === null) {
                        throw new RuntimeException('Attendance date and status are required.');
                    }

                    $terms = $this->termsAt($member, $date);
                    $basis = (string) ($terms['basis'] ?? $member->basis);
                    $quantity = $this->attendanceQuantity(
                        $status,
                        $basis,
                        $this->decimal($this->mapped($row, $mapping, 'quantity')),
                    );
                    $overtimeHours = $this->decimal(
                        $this->mapped($row, $mapping, 'overtime_hours')
                    ) ?? '0.0000';
                    $overtimeRate = $this->decimal(
                        $this->mapped($row, $mapping, 'overtime_rate')
                    ) ?? '0.0000';

                    if ($status !== 'present' && Decimal::toUnits($overtimeHours) > 0) {
                        throw new RuntimeException('Overtime cannot be recorded for an absence or holiday.');
                    }

                    $attendanceKey = $this->attendanceKey((int) $member->id, $date);
                    $existing = $existingAttendances[$attendanceKey] ?? null;

                    if ($existing && $strategy === 'skip') {
                        $this->syncAttendanceLedger($request, $member, (int) $existing->id, [
                            'occurred_on' => (string) $existing->occurred_on,
                            'status' => (string) $existing->status,
                            'quantity' => (string) $existing->quantity,
                            'overtime_hours' => (string) $existing->overtime_hours,
                            'overtime_rate' => (string) $existing->overtime_rate,
                            'notes' => $existing->notes,
                        ]);
                        $skipped++;

                        continue;
                    }

                    $payload = [
                        'organization_id' => app(TenantContext::class)->id(),
                        'staff_member_id' => $member->id,
                        'created_by' => $request->user()->id,
                        'occurred_on' => $date,
                        'status' => $status,
                        'quantity' => $quantity,
                        'overtime_hours' => $overtimeHours,
                        'overtime_rate' => $overtimeRate,
                        'notes' => $this->stringOrNull($this->mapped($row, $mapping, 'notes')),
                        'updated_at' => now(),
                    ];

                    if ($existing) {
                        DB::table('staff_attendances')->where('id', $existing->id)->update($payload);
                        $attendanceId = (int) $existing->id;
                        $updated++;
                    } else {
                        $payload['created_at'] = now();
                        $attendanceId = (int) DB::table('staff_attendances')->insertGetId($payload);
                        $this->attendanceEntryCache[$this->attendanceEntryKey((int) $member->id, $attendanceId, 'work')] = null;
                        $this->attendanceEntryCache[$this->attendanceEntryKey((int) $member->id, $attendanceId, 'overtime')] = null;
                        $created++;
                    }

                    $existingAttendances[$attendanceKey] = (object) [
                        'id' => $attendanceId,
                        ...$payload,
                    ];

                    $this->syncAttendanceLedger($request, $member, $attendanceId, $payload);
                    $touchedMembers[(int) $member->id] = $member;
                } catch (Throwable $exception) {
                    $skipped++;
                    $this->pushError($errors, $index + 2, $exception->getMessage());
                }
            }
        });

        // Monthly salary is derived from attendance and is not written row by
        // row, so refresh it once per affected employee after the import.
        $entitlements = app(StaffMonthlyEntitlementService::class);

        foreach ($touchedMembers as $member) {
            $entitlements->syncMember($member, (int) $request->user()->id);
        }

        return [
            'type' => 'attendance',
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => $errors,
        ];
    }

    /**
     * Load existing attendance and its generated ledger rows in batches before
     * the import loop. This avoids several SQL queries for every spreadsheet row.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $mapping
     * @return array<string, object>
     */
    private function preloadAttendanceState(array $rows, array $mapping, string $matchBy): array
    {
        $memberIds = [];
        $dates = [];

        foreach ($rows as $row) {
            try {
                $identifier = trim((string) $this->mapped($row, $mapping, 'employee'));
                $member = $this->findMember($matchBy, $identifier);
                $date = $this->date($this->mapped($row, $mapping, 'occurred_on'));

                if ($member && $date !== null) {
                    $memberIds[(int) $member->id] = (int) $member->id;
                    $dates[$date] = $date;
                }
            } catch (Throwable) {
                // The main import loop will report the row-level validation error.
            }
        }

        if ($memberIds === [] || $dates === []) {
            return [];
        }

        $existing = [];
        $memberIdList = array_values($memberIds);

        foreach (array_chunk(array_values($dates), 500) as $dateChunk) {
            $records = DB::table('staff_attendances')
                ->whereIn('staff_member_id', $memberIdList)
                ->whereIn('occurred_on', $dateChunk)
                ->get();

            foreach ($records as $attendance) {
                $date = substr((string) $attendance->occurred_on, 0, 10);
                $existing[$this->attendanceKey((int) $attendance->staff_member_id, $date)] = $attendance;
            }
        }

        $attendanceIds = array_values(array_unique(array_map(
            static fn (object $attendance): int => (int) $attendance->id,
            array_values($existing),
        )));

        foreach ($existing as $attendance) {
            $memberId = (int) $attendance->staff_member_id;
            $attendanceId = (int) $attendance->id;
            $this->attendanceEntryCache[$this->attendanceEntryKey($memberId, $attendanceId, 'work')] = null;
            $this->attendanceEntryCache[$this->attendanceEntryKey($memberId, $attendanceId, 'overtime')] = null;
        }

        foreach (array_chunk($attendanceIds, 500) as $attendanceIdChunk) {
            $entries = StaffEntry::withTrashed()
                ->whereIn('staff_member_id', $memberIdList)
                ->whereIn('kind', ['work', 'overtime'])
                ->whereIn('terms->attendance_id', $attendanceIdChunk)
                ->get();

            foreach ($entries as $entry) {
                $attendanceId = (int) ($entry->terms['attendance_id'] ?? 0);
                if ($attendanceId <= 0) {
                    continue;
                }
                $this->attendanceEntryCache[
                    $this->attendanceEntryKey((int) $entry->staff_member_id, $attendanceId, (string) $entry->kind)
                ] = $entry;
            }
        }

        return $existing;
    }

    private function attendanceKey(int $memberId, string $date): string
    {
        return $memberId.'|'.$date;
    }

    private function attendanceEntryKey(int $memberId, int $attendanceId, string $kind): string
    {
        return $memberId.'|'.$attendanceId.'|'.$kind;
    }

    /**
     * Keep the payroll ledger derived from one attendance row in sync.
     * Re-importing the same employee/date updates the existing derived entry
     * instead of creating a second entitlement.
     *
     * @param  array<string, mixed>  $attendance
     */
    private function syncAttendanceLedger(
        Request $request,
        StaffMember $member,
        int $attendanceId,
        array $attendance,
    ): void {
        $date = substr((string) $attendance['occurred_on'], 0, 10);
        $terms = $this->termsAt($member, $date);
        $basis = (string) ($terms['basis'] ?? $member->basis);
        $rate = (string) ($terms['rate'] ?? $member->rate);
        $status = (string) $attendance['status'];
        $quantity = (string) ($attendance['quantity'] ?? '0');
        $notes = $this->stringOrNull($attendance['notes'] ?? null) ?? 'Imported attendance';

        $work = $this->attendanceEntry($member, $attendanceId, 'work');

        if ($status === 'present' && $basis !== 'month' && Decimal::toUnits($quantity) > 0) {
            $amount = intdiv(
                Decimal::toUnits($quantity) * Decimal::toUnits($rate) + 5000,
                10000,
            );

            $this->saveAttendanceEntry(
                $request,
                $member,
                $work,
                $attendanceId,
                'work',
                $date,
                $quantity,
                $rate,
                $amount,
                $notes,
                ['basis' => $basis],
            );
        } elseif ($work) {
            $work->delete();
        }

        $overtimeHours = (string) ($attendance['overtime_hours'] ?? '0');
        $overtimeRate = (string) ($attendance['overtime_rate'] ?? '0');
        $overtime = $this->attendanceEntry($member, $attendanceId, 'overtime');

        if (
            $status === 'present'
            && Decimal::toUnits($overtimeHours) > 0
            && Decimal::toUnits($overtimeRate) > 0
        ) {
            $amount = intdiv(
                Decimal::toUnits($overtimeHours) * Decimal::toUnits($overtimeRate) + 5000,
                10000,
            );

            $this->saveAttendanceEntry(
                $request,
                $member,
                $overtime,
                $attendanceId,
                'overtime',
                $date,
                $overtimeHours,
                $overtimeRate,
                $amount,
                $notes,
                [],
            );
        } elseif ($overtime) {
            $overtime->delete();
        }
    }

    private function attendanceEntry(
        StaffMember $member,
        int $attendanceId,
        string $kind,
    ): ?StaffEntry {
        $cacheKey = $this->attendanceEntryKey((int) $member->id, $attendanceId, $kind);

        if (array_key_exists($cacheKey, $this->attendanceEntryCache)) {
            return $this->attendanceEntryCache[$cacheKey];
        }

        return $this->attendanceEntryCache[$cacheKey] = StaffEntry::withTrashed()
            ->where('staff_member_id', $member->id)
            ->where('kind', $kind)
            ->where('terms->attendance_id', $attendanceId)
            ->first();
    }

    /** @param  array<string, mixed>  $extraTerms */
    private function saveAttendanceEntry(
        Request $request,
        StaffMember $member,
        ?StaffEntry $entry,
        int $attendanceId,
        string $kind,
        string $date,
        string $quantity,
        string $rate,
        int $amount,
        string $notes,
        array $extraTerms,
    ): void {
        $payload = [
            'kind' => $kind,
            'occurred_on' => $date,
            'quantity' => $quantity,
            'rate' => $rate,
            'amount' => Decimal::fromUnits($amount),
            'notes' => $notes,
            'terms' => [
                'attendance_id' => $attendanceId,
                'currency' => $member->currency,
                'imported' => true,
                ...$extraTerms,
            ],
        ];
        $cacheKey = $this->attendanceEntryKey((int) $member->id, $attendanceId, $kind);

        if ($entry) {
            if ($entry->trashed()) {
                $entry->restore();
            }
            $entry->update($payload);
            $this->attendanceEntryCache[$cacheKey] = $entry;

            return;
        }

        $this->attendanceEntryCache[$cacheKey] = StaffEntry::create([
            ...$payload,
            'staff_member_id' => $member->id,
            'created_by' => $request->user()->id,
            'request_id' => (string) Str::uuid(),
        ]);
    }

    /** @return array<string, mixed> */
    private function termsAt(StaffMember $member, string $date): array
    {
        $memberId = (int) $member->id;
        if (! array_key_exists($memberId, $this->termsHistoryCache)) {
            $this->termsHistoryCache[$memberId] = StaffEntry::where('staff_member_id', $memberId)
                ->where('kind', 'terms')
                ->orderBy('occurred_on')
                ->orderBy('id')
                ->get();
        }

        $history = $this->termsHistoryCache[$memberId];
        $terms = $history->first()?->terms['before'] ?? $member->toArray();

        foreach ($history as $change) {
            if (substr((string) $change->occurred_on, 0, 10) <= $date) {
                $terms = $change->terms['after'] ?? $terms;
            }
        }

        return $terms;
    }

    private function attendanceQuantity(string $status, string $basis, ?string $quantity): string
    {
        if ($status !== 'present') {
            return '0.0000';
        }

        if (in_array($basis, ['day', 'month'], true)) {
            return '1.0000';
        }

        $quantity ??= '0.0000';

        if (Decimal::toUnits($quantity) <= 0) {
            throw new RuntimeException('Attendance quantity/hours are required for a present employee.');
        }

        return $quantity;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function importPayroll(Request $request, array $rows, array $data): array
    {
        $mapping = $data['mapping'];
        $this->requireMappings($mapping, ['employee', 'kind', 'occurred_on', 'amount']);

        $matchBy = $data['match_by'] ?? 'name';
        $created = 0;
        $skipped = 0;
        $errors = [];

        DB::transaction(function () use (
            $request,
            $rows,
            $mapping,
            $matchBy,
            &$created,
            &$skipped,
            &$errors,
        ): void {
            foreach ($rows as $index => $row) {
                try {
                    $identifier = trim((string) $this->mapped($row, $mapping, 'employee'));
                    $member = $this->findMember($matchBy, $identifier);

                    if (! $member) {
                        throw new RuntimeException(
                            'Employee "'.$identifier.'" could not be matched. Check the employee name or selected matching field.'
                        );
                    }

                    $kind = $this->normalizeEntryKind($this->mapped($row, $mapping, 'kind'));
                    $date = $this->date($this->mapped($row, $mapping, 'occurred_on'));
                    $amount = $this->decimal($this->mapped($row, $mapping, 'amount'));

                    if ($kind === null || $date === null || $amount === null) {
                        throw new RuntimeException('Payroll kind, date, and amount are required.');
                    }

                    $numericAmount = abs((float) $amount);
                    if ($numericAmount <= 0) {
                        throw new RuntimeException('Amount must be greater than zero.');
                    }
                    if (in_array($kind, ['deduction', 'payment', 'advance'], true)) {
                        $numericAmount = -$numericAmount;
                    }

                    $quantity = $this->decimal($this->mapped($row, $mapping, 'quantity'));
                    $rate = $this->decimal($this->mapped($row, $mapping, 'rate'));
                    $notes = $this->stringOrNull($this->mapped($row, $mapping, 'notes'))
                        ?? 'Imported from legacy employee data';
                    $normalizedAmount = number_format($numericAmount, 4, '.', '');

                    $duplicate = StaffEntry::query()
                        ->where('staff_member_id', $member->id)
                        ->where('kind', $kind)
                        ->whereDate('occurred_on', $date)
                        ->where('amount', $normalizedAmount)
                        ->where('notes', $notes)
                        ->exists();

                    if ($duplicate) {
                        $skipped++;

                        continue;
                    }

                    StaffEntry::create([
                        'staff_member_id' => $member->id,
                        'created_by' => $request->user()->id,
                        'request_id' => Str::uuid()->toString(),
                        'kind' => $kind,
                        'occurred_on' => $date,
                        'quantity' => $quantity,
                        'rate' => $rate,
                        'amount' => $normalizedAmount,
                        'notes' => $notes,
                        'terms' => [
                            'basis' => $member->basis,
                            'unit' => $member->unit,
                            'currency' => $member->currency,
                            'monthly_allowance' => $member->monthly_allowance,
                            'imported' => true,
                        ],
                    ]);
                    $created++;
                } catch (Throwable $exception) {
                    $skipped++;
                    $this->pushError($errors, $index + 2, $exception->getMessage());
                }
            }
        });

        return [
            'type' => 'payroll',
            'created' => $created,
            'updated' => 0,
            'skipped' => $skipped,
            'errors' => $errors,
        ];
    }

    /**
     * @param  array<string, mixed>  $mapping
     * @param  list<string>  $fields
     */
    private function requireMappings(array $mapping, array $fields): void
    {
        foreach ($fields as $field) {
            abort_unless(
                isset($mapping[$field]) && trim((string) $mapping[$field]) !== '',
                422,
                'Missing required mapping: '.$field,
            );
        }
    }

    private function findMember(string $matchBy, string $value): ?StaffMember
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $cacheKey = $matchBy.'|'.mb_strtolower($value);
        if (array_key_exists($cacheKey, $this->memberLookupCache)) {
            return $this->memberLookupCache[$cacheKey];
        }

        $query = StaffMember::query();
        if ($matchBy === 'email') {
            $email = strtolower($value);
            $query->whereHas('user', fn ($builder) => $builder->where('email', $email));
        } else {
            $query->where($matchBy, $value);
        }

        $matches = $query->limit(2)->get();
        if ($matches->count() > 1) {
            throw new RuntimeException('More than one employee matched this identifier.');
        }
        if ($matches->isNotEmpty() || $matchBy !== 'name') {
            return $this->memberLookupCache[$cacheKey] = $matches->first();
        }

        if ($this->normalizedNameIndex === null) {
            $this->normalizedNameIndex = [];
            foreach (StaffMember::query()->get() as $member) {
                $normalizedMemberName = $this->normalizePersonName((string) $member->name);
                $this->normalizedNameIndex[$normalizedMemberName] ??= [];
                $this->normalizedNameIndex[$normalizedMemberName][] = $member;
            }
        }

        $normalized = $this->normalizePersonName($value);
        $normalizedMatches = $this->normalizedNameIndex[$normalized] ?? [];

        if (count($normalizedMatches) > 1) {
            throw new RuntimeException('More than one employee matched this normalized name.');
        }

        return $this->memberLookupCache[$cacheKey] = ($normalizedMatches[0] ?? null);
    }

    private function normalizePersonName(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = preg_replace('/[\x{064B}-\x{065F}\x{0670}\x{0640}]/u', '', $value) ?? $value;
        $value = strtr($value, [
            'أ' => 'ا',
            'إ' => 'ا',
            'آ' => 'ا',
            'ٱ' => 'ا',
            'ى' => 'ي',
            'ة' => 'ه',
        ]);
        $value = str_replace('عبدال', 'عبد ال', $value);
        $value = str_replace('الرحمان', 'الرحمن', $value);

        return preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    }

    private function departmentId(?string $name, bool $create): ?int
    {
        if ($name === null || $name === '') {
            return null;
        }

        $department = Department::query()->where('name', $name)->first();
        if (! $department && $create) {
            $department = Department::create(['name' => $name]);
        }
        if (! $department) {
            throw new RuntimeException('Department "'.$name.'" does not exist.');
        }

        return (int) $department->id;
    }

    /** @param  list<array{row: int, message: string}>  $errors */
    private function pushError(array &$errors, int $row, string $message): void
    {
        if (count($errors) >= 50) {
            return;
        }
        $errors[] = ['row' => $row, 'message' => $message];
    }

    /**
     * @param  array<int, mixed>  $row
     * @return list<string>
     */
    private function normalizeHeaders(array $row): array
    {
        $seen = [];
        $headers = [];
        foreach (array_values($row) as $index => $value) {
            $base = trim((string) ($value ?? ''));
            if ($base === '') {
                $base = 'Column '.($index + 1);
            }
            $seen[$base] = ($seen[$base] ?? 0) + 1;
            $headers[] = $seen[$base] === 1 ? $base : $base.' ('.$seen[$base].')';
        }

        return $headers;
    }

    /**
     * @param  list<string>  $headers
     * @param  array<int, mixed>  $row
     * @return array<string, mixed>
     */
    private function associateRow(array $headers, array $row): array
    {
        $values = array_values($row);
        $result = [];
        foreach ($headers as $index => $header) {
            $result[$header] = $values[$index] ?? null;
        }

        return $result;
    }

    /** @param  array<int, mixed>  $row */
    private function rowHasContent(array $row): bool
    {
        foreach ($row as $value) {
            if (trim((string) ($value ?? '')) !== '') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $row
     * @param  array<string, mixed>  $mapping
     */
    private function mapped(array $row, array $mapping, string $field): mixed
    {
        $header = $mapping[$field] ?? null;
        if (! is_string($header) || $header === '') {
            return null;
        }

        return $row[$header] ?? null;
    }

    private function stringOrNull(mixed $value): ?string
    {
        $string = trim((string) ($value ?? ''));

        return $string === '' ? null : $string;
    }

    private function decimal(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        $normalized = str_replace([',', ' '], '', $this->normalizeArabicNumerals((string) $value));
        if (! is_numeric($normalized)) {
            return null;
        }

        return number_format((float) $normalized, 4, '.', '');
    }

    /**
     * Excel cells formatted under an Arabic locale can render numbers with
     * Arabic-Indic digits and the Arabic decimal/thousands separators
     * (٠١٢٣٤٥٦٧٨٩ ، ٫ ، ٬) instead of plain ASCII. PHP's is_numeric() and
     * Carbon's date parser reject those, silently turning a valid amount or
     * date into "required field missing". Normalize them to ASCII first.
     */
    private function normalizeArabicNumerals(string $value): string
    {
        return strtr($value, [
            "\u{0660}" => '0', "\u{0661}" => '1', "\u{0662}" => '2', "\u{0663}" => '3',
            "\u{0664}" => '4', "\u{0665}" => '5', "\u{0666}" => '6', "\u{0667}" => '7',
            "\u{0668}" => '8', "\u{0669}" => '9',
            "\u{066B}" => '.', "\u{066C}" => '',
        ]);
    }

    private function date(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }
        if (is_numeric($value) && (float) $value > 20000) {
            return CarbonImmutable::instance(
                ExcelDate::excelToDateTimeObject((float) $value)
            )->toDateString();
        }
        try {
            return CarbonImmutable::parse($this->normalizeArabicNumerals((string) $value))->toDateString();
        } catch (Throwable) {
            return null;
        }
    }

    private function boolean(mixed $value, bool $default): bool
    {
        $normalized = mb_strtolower(trim((string) ($value ?? '')));
        if ($normalized === '') {
            return $default;
        }

        return in_array(
            $normalized,
            ['1', 'true', 'yes', 'active', 'enabled', 'نعم', 'نشط', 'فعال', 'على رأس العمل'],
            true,
        );
    }

    private function normalizeBasis(mixed $value): ?string
    {
        $normalized = mb_strtolower(trim((string) ($value ?? '')));

        return [
            'hour' => 'hour',
            'hourly' => 'hour',
            'ساعة' => 'hour',
            'بالساعة' => 'hour',
            'day' => 'day',
            'daily' => 'day',
            'يوم' => 'day',
            'باليوم' => 'day',
            'month' => 'month',
            'monthly' => 'month',
            'شهر' => 'month',
            'شهري' => 'month',
            'piece' => 'piece',
            'piece rate' => 'piece',
            'قطعة' => 'piece',
            'بالقطعة' => 'piece',
        ][$normalized] ?? null;
    }

    private function normalizeAttendanceStatus(mixed $value): ?string
    {
        $normalized = mb_strtolower(trim((string) ($value ?? '')));
        if (in_array($normalized, ['present', 'حاضر', 'دوام', '1'], true)) {
            return 'present';
        }
        if (in_array($normalized, ['absent', 'غائب', 'غياب', '0'], true)) {
            return 'absent';
        }
        if (in_array($normalized, ['holiday', 'day off', 'off', 'عطلة', 'عطله', 'إجازة', 'اجازة'], true)) {
            return 'holiday';
        }

        return null;
    }

    private function normalizeEntryKind(mixed $value): ?string
    {
        $normalized = mb_strtolower(trim((string) ($value ?? '')));

        return [
            'work' => 'work',
            'salary' => 'work',
            'wage' => 'work',
            'راتب' => 'work',
            'أجر' => 'work',
            'bonus' => 'bonus',
            'مكافأة' => 'bonus',
            'حافز' => 'bonus',
            'allowance' => 'allowance',
            'بدل' => 'allowance',
            'monthly allowance' => 'monthly_allowance',
            'علاوة شهرية' => 'monthly_allowance',
            'deduction' => 'deduction',
            'خصم' => 'deduction',
            'payment' => 'payment',
            'دفعة' => 'payment',
            'دفع' => 'payment',
            'advance' => 'advance',
            'سلفة' => 'advance',
            'overtime' => 'overtime',
            'إضافي' => 'overtime',
        ][$normalized] ?? null;
    }
}
