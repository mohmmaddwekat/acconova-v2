<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Membership;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Support\InventoryQuantity as Decimal;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

        $result = match ($data['type']) {
            'employees' => $this->importEmployees($records, $data),
            'attendance' => $this->importAttendance($request, $records, $data),
            'payroll' => $this->importPayroll($request, $records, $data),
        };

        $result['token'] = $data['token'];

        return response()->json($result);
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

        DB::transaction(function () use (
            $request,
            $rows,
            $mapping,
            $matchBy,
            $strategy,
            &$created,
            &$updated,
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

                    if (
                        Decimal::toUnits($overtimeHours) > 0
                        && Decimal::toUnits($overtimeRate) <= 0
                    ) {
                        throw new RuntimeException('Overtime rate is required when overtime hours are present.');
                    }

                    $existing = DB::table('staff_attendances')
                        ->where('staff_member_id', $member->id)
                        ->whereDate('occurred_on', $date)
                        ->first();

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
                        $created++;
                    }

                    $this->syncAttendanceLedger($request, $member, $attendanceId, $payload);
                } catch (Throwable $exception) {
                    $skipped++;
                    $this->pushError($errors, $index + 2, $exception->getMessage());
                }
            }
        });

        return [
            'type' => 'attendance',
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors' => $errors,
        ];
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
        return StaffEntry::withTrashed()
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
            'created_by' => $request->user()->id,
            'request_id' => (string) Str::uuid(),
        ]);
    }

    /** @return array<string, mixed> */
    private function termsAt(StaffMember $member, string $date): array
    {
        $history = StaffEntry::where('staff_member_id', $member->id)
            ->where('kind', 'terms')
            ->orderBy('occurred_on')
            ->orderBy('id')
            ->get();
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
            return $matches->first();
        }

        $normalized = $this->normalizePersonName($value);
        $matches = StaffMember::query()
            ->get()
            ->filter(fn (StaffMember $member): bool => $this->normalizePersonName($member->name) === $normalized)
            ->take(2)
            ->values();

        if ($matches->count() > 1) {
            throw new RuntimeException('More than one employee matched this normalized name.');
        }

        return $matches->first();
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
        $normalized = str_replace([',', ' '], '', (string) $value);
        if (! is_numeric($normalized)) {
            return null;
        }

        return number_format((float) $normalized, 4, '.', '');
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
            return CarbonImmutable::parse((string) $value)->toDateString();
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
