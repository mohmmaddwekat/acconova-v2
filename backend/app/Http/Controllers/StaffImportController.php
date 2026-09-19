<?php

namespace App\Http\Controllers;

use App\Models\Department;
use App\Models\Membership;
use App\Models\StaffEntry;
use App\Models\StaffMember;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use Throwable;

class StaffImportController extends Controller
{
    private const MAX_ROWS = 10000;

    /**
     * Inspect an uploaded CSV/XLS/XLSX file without mutating employee data.
     */
    public function preview(
        Request $request,
    ): JsonResponse {
        abort_unless(
            StaffController::allowed(
                'staff.import',
            ),
            403,
        );

        $request->validate([
            'file' => [
                'required',
                'file',
                'max:20480',
                'mimes:csv,txt,xls,xlsx',
            ],
        ]);

        $extension =
            strtolower(
                $request
                    ->file(
                        'file',
                    )
                    ->getClientOriginalExtension(),
            );

        $token =
            (string) Str::uuid()
            .'.'
            .$extension;

        $directory =
            storage_path(
                'app/private/staff-imports/'
                .app(
                    TenantContext::class,
                )->id()
                .'/'
                .$request
                    ->user()
                    ->id,
            );

        if (! is_dir(
            $directory,
        )) {
            mkdir(
                $directory,
                0750,
                true,
            );
        }

        foreach (
            glob(
                $directory
                .'/*',
            )
                ?: [] as $oldFile
        ) {
            if (
                is_file(
                    $oldFile,
                )
                && filemtime(
                    $oldFile,
                ) <
                    now()
                        ->subDay()
                        ->getTimestamp()
            ) {
                @unlink(
                    $oldFile,
                );
            }
        }

        $request
            ->file(
                'file',
            )
            ->move(
                $directory,
                $token,
            );

        $path =
            $directory
            .DIRECTORY_SEPARATOR
            .$token;

        try {
            $spreadsheet =
                IOFactory::load(
                    $path,
                );

            $sheets =
                [];

            foreach (
                $spreadsheet->getWorksheetIterator()
                as $sheet
            ) {
                $rows =
                    $sheet->toArray(
                        null,
                        true,
                        true,
                        false,
                    );

                if (! $rows) {
                    continue;
                }

                $headers =
                    $this->normalizeHeaders(
                        array_shift(
                            $rows,
                        ),
                    );

                $samples =
                    collect(
                        $rows,
                    )
                        ->filter(
                            fn (
                                array $row,
                            ): bool => $this->rowHasContent(
                                $row,
                            ),
                        )
                        ->take(
                            8,
                        )
                        ->map(
                            fn (
                                array $row,
                            ): array => $this->associateRow(
                                $headers,
                                $row,
                            ),
                        )
                        ->values()
                        ->all();

                $sheets[] = [
                    'name' => $sheet
                        ->getTitle(),

                    'headers' => $headers,

                    'sample' => $samples,

                    'row_count' => min(
                        self::MAX_ROWS,
                        collect(
                            $rows,
                        )
                            ->filter(
                                fn (
                                    array $row,
                                ): bool => $this->rowHasContent(
                                    $row,
                                ),
                            )
                            ->count(),
                    ),
                ];
            }

            abort_if(
                empty(
                    $sheets,
                ),
                422,
                'No readable sheets were found in the uploaded file.',
            );

            return response()->json([
                'token' => $token,

                'name' => $request
                    ->file(
                        'file',
                    )
                    ->getClientOriginalName(),

                'sheets' => $sheets,
            ]);
        } catch (
            Throwable $exception
        ) {
            @unlink(
                $path,
            );

            throw $exception;
        }
    }

    /**
     * Import one mapped sheet into Employees, Attendance, or Payroll.
     */
    public function commit(
        Request $request,
    ): JsonResponse {
        abort_unless(
            StaffController::allowed(
                'staff.import',
            ),
            403,
        );

        $data =
            $request->validate([
                'token' => [
                    'required',
                    'string',
                    'regex:/^[a-f0-9\-]+\.(csv|txt|xls|xlsx)$/i',
                ],

                'sheet' => [
                    'required',
                    'string',
                    'max:120',
                ],

                'type' => [
                    'required',

                    Rule::in([
                        'employees',
                        'attendance',
                        'payroll',
                    ]),
                ],

                'mapping' => [
                    'required',
                    'array',
                ],

                'mapping.*' => [
                    'nullable',
                    'string',
                    'max:255',
                ],

                'match_by' => [
                    'nullable',

                    Rule::in([
                        'name',
                        'phone',
                        'email',
                    ]),
                ],

                'duplicate_strategy' => [
                    'nullable',

                    Rule::in([
                        'skip',
                        'update',
                    ]),
                ],

                'create_departments' => [
                    'nullable',
                    'boolean',
                ],
            ]);

        if (
            $data['type'] ===
            'employees'
        ) {
            abort_unless(
                StaffController::allowed(
                    'staff.manage',
                ),
                403,
            );
        }

        if (
            $data['type'] ===
            'attendance'
        ) {
            abort_unless(
                StaffController::allowed(
                    'staff.attendance',
                ),
                403,
            );
        }

        if (
            $data['type'] ===
            'payroll'
        ) {
            abort_unless(
                StaffController::allowed(
                    'staff.pay',
                ),
                403,
            );
        }

        $path =
            storage_path(
                'app/private/staff-imports/'
                .app(
                    TenantContext::class,
                )->id()
                .'/'
                .$request
                    ->user()
                    ->id
                .'/'
                .$data['token'],
            );

        abort_unless(
            is_file(
                $path,
            ),
            404,
        );

        $spreadsheet =
            IOFactory::load(
                $path,
            );

        $sheet =
            $spreadsheet->getSheetByName(
                $data['sheet'],
            );

        abort_unless(
            $sheet,
            422,
            'The selected sheet no longer exists in the uploaded file.',
        );

        $rows =
            $sheet->toArray(
                null,
                true,
                true,
                false,
            );

        abort_if(
            count(
                $rows,
            ) >
            self::MAX_ROWS
            + 1,
            422,
            'This import is limited to 10,000 rows per run.',
        );

        $headers =
            $this->normalizeHeaders(
                array_shift(
                    $rows,
                )
                ?? [],
            );

        $records =
            collect(
                $rows,
            )
                ->filter(
                    fn (
                        array $row,
                    ): bool => $this->rowHasContent(
                        $row,
                    ),
                )
                ->map(
                    fn (
                        array $row,
                    ): array => $this->associateRow(
                        $headers,
                        $row,
                    ),
                )
                ->values();

        $result =
            match (
                $data['type']
            ) {
                'employees' => $this->importEmployees(
                    $request,
                    $records->all(),
                    $data,
                ),

                'attendance' => $this->importAttendance(
                    $request,
                    $records->all(),
                    $data,
                ),

                'payroll' => $this->importPayroll(
                    $request,
                    $records->all(),
                    $data,
                ),
            };

        return response()->json([
            ...$result,

            'token' => $data['token'],
        ]);
    }

    /**
     * Import employee master records with safe duplicate handling.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function importEmployees(
        Request $request,
        array $rows,
        array $data,
    ): array {
        $mapping =
            $data['mapping'];

        foreach (
            [
                'name',
                'basis',
                'rate',
                'started_on',
            ] as $required
        ) {
            abort_unless(
                ! empty(
                    $mapping[$required]
                    ?? null,
                ),
                422,
                'Missing required mapping: '
                .$required,
            );
        }

        $currency =
            app(
                TenantContext::class,
            )->organization()->preferences['currency']
                ?? 'ILS';

        $duplicateStrategy =
            $data['duplicate_strategy']
            ?? 'skip';

        $matchBy =
            $data['match_by']
            ?? 'phone';

        $created =
            0;

        $updated =
            0;

        $skipped =
            0;

        $errors =
            [];

        DB::transaction(
            function () use (
                $request,
                $rows,
                $mapping,
                $currency,
                $duplicateStrategy,
                $matchBy,
                $data,
                &$created,
                &$updated,
                &$skipped,
                &$errors,
            ): void {
                foreach (
                    $rows as $index => $row
                ) {
                    $line =
                        $index
                        + 2;

                    try {
                        $name =
                            trim(
                                (string) $this->mapped(
                                    $row,
                                    $mapping,
                                    'name',
                                ),
                            );

                        $basis =
                            $this->normalizeBasis(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'basis',
                                ),
                            );

                        $rate =
                            $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'rate',
                                ),
                            );

                        $startedOn =
                            $this->date(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'started_on',
                                ),
                            );

                        if (
                            $name ===
                            ''
                            || ! $basis
                            || $rate ===
                            null
                            || ! $startedOn
                        ) {
                            throw new \RuntimeException(
                                'Name, pay basis, rate, and start date are required.',
                            );
                        }

                        $phone =
                            $this->stringOrNull(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'phone',
                                ),
                            );

                        $email =
                            strtolower(
                                (string) (
                                    $this->stringOrNull(
                                        $this->mapped(
                                            $row,
                                            $mapping,
                                            'email',
                                        ),
                                    )
                                    ?? ''
                                ),
                            );

                        $matchValue =
                            match (
                                $matchBy
                            ) {
                                'email' => $email,

                                'name' => $name,

                                default => $phone
                                    ?? '',
                            };

                        $existing =
                            $matchValue !==
                                ''
                                ? $this->findMember(
                                    $matchBy,
                                    $matchValue,
                                )
                                : null;

                        if (
                            $existing
                            && $duplicateStrategy ===
                                'skip'
                        ) {
                            ++$skipped;

                            continue;
                        }

                        $departmentId =
                            $this->departmentId(
                                $this->stringOrNull(
                                    $this->mapped(
                                        $row,
                                        $mapping,
                                        'department',
                                    ),
                                ),
                                (bool) (
                                    $data['create_departments']
                                    ?? false
                                ),
                            );

                        $userId =
                            null;

                        if (
                            $email !==
                            ''
                        ) {
                            $membership =
                                Membership::query()
                                    ->whereHas(
                                        'user',
                                        fn (
                                            $query,
                                        ) => $query->where(
                                            'email',
                                            $email,
                                        ),
                                    )
                                    ->first();

                            $userId =
                                $membership?->user_id;
                        }

                        $payload = [
                            'name' => $name,

                            'job_title' => $this->stringOrNull(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'job_title',
                                ),
                            ),

                            'phone' => $phone,

                            'user_id' => $userId,

                            'department_id' => $departmentId,

                            'basis' => $basis,

                            'unit' => $this->stringOrNull(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'unit',
                                ),
                            ),

                            'rate' => $rate,

                            'monthly_allowance' => $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'monthly_allowance',
                                ),
                            )
                                ?? '0',

                            'currency' => $currency,

                            'started_on' => $startedOn,

                            'active' => $this->boolean(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'active',
                                ),
                                true,
                            ),
                        ];

                        if ($existing) {
                            $existing->update(
                                $payload,
                            );

                            ++$updated;
                        } else {
                            StaffMember::create(
                                $payload,
                            );

                            ++$created;
                        }
                    } catch (
                        Throwable $exception
                    ) {
                        ++$skipped;

                        if (
                            count(
                                $errors,
                            ) <
                            50
                        ) {
                            $errors[] = [
                                'row' => $line,

                                'message' => $exception->getMessage(),
                            ];
                        }
                    }
                }
            },
        );

        return [
            'type' => 'employees',

            'created' => $created,

            'updated' => $updated,

            'skipped' => $skipped,

            'errors' => $errors,
        ];
    }

    /**
     * Import historical attendance rows.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function importAttendance(
        Request $request,
        array $rows,
        array $data,
    ): array {
        $mapping =
            $data['mapping'];

        foreach (
            [
                'employee',
                'occurred_on',
                'status',
            ] as $required
        ) {
            abort_unless(
                ! empty(
                    $mapping[$required]
                    ?? null,
                ),
                422,
                'Missing required mapping: '
                .$required,
            );
        }

        $matchBy =
            $data['match_by']
            ?? 'name';

        $strategy =
            $data['duplicate_strategy']
            ?? 'skip';

        $created =
            0;

        $updated =
            0;

        $skipped =
            0;

        $errors =
            [];

        DB::transaction(
            function () use (
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
                foreach (
                    $rows as $index => $row
                ) {
                    $line =
                        $index
                        + 2;

                    try {
                        $identifier =
                            trim(
                                (string) $this->mapped(
                                    $row,
                                    $mapping,
                                    'employee',
                                ),
                            );

                        $member =
                            $this->findMember(
                                $matchBy,
                                $identifier,
                            );

                        if (! $member) {
                            throw new \RuntimeException(
                                'Employee could not be matched.',
                            );
                        }

                        $date =
                            $this->date(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'occurred_on',
                                ),
                            );

                        $status =
                            $this->normalizeAttendanceStatus(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'status',
                                ),
                            );

                        if (
                            ! $date
                            || ! $status
                        ) {
                            throw new \RuntimeException(
                                'Attendance date and status are required.',
                            );
                        }

                        $existing =
                            DB::table(
                                'staff_attendances',
                            )
                                ->where(
                                    'staff_member_id',
                                    $member->id,
                                )
                                ->whereDate(
                                    'occurred_on',
                                    $date,
                                )
                                ->first();

                        if (
                            $existing
                            && $strategy ===
                                'skip'
                        ) {
                            ++$skipped;

                            continue;
                        }

                        $payload = [
                            'organization_id' => app(
                                TenantContext::class,
                            )->id(),

                            'staff_member_id' => $member->id,

                            'created_by' => $request
                                ->user()
                                ->id,

                            'occurred_on' => $date,

                            'status' => $status,

                            'quantity' => $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'quantity',
                                ),
                            )
                                ?? '0',

                            'overtime_hours' => $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'overtime_hours',
                                ),
                            )
                                ?? '0',

                            'overtime_rate' => $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'overtime_rate',
                                ),
                            )
                                ?? '0',

                            'notes' => $this->stringOrNull(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'notes',
                                ),
                            ),

                            'updated_at' => now(),
                        ];

                        if ($existing) {
                            DB::table(
                                'staff_attendances',
                            )
                                ->where(
                                    'id',
                                    $existing->id,
                                )
                                ->update(
                                    $payload,
                                );

                            ++$updated;
                        } else {
                            $payload['created_at'] =
                                now();

                            DB::table(
                                'staff_attendances',
                            )->insert(
                                $payload,
                            );

                            ++$created;
                        }
                    } catch (
                        Throwable $exception
                    ) {
                        ++$skipped;

                        if (
                            count(
                                $errors,
                            ) <
                            50
                        ) {
                            $errors[] = [
                                'row' => $line,

                                'message' => $exception->getMessage(),
                            ];
                        }
                    }
                }
            },
        );

        return [
            'type' => 'attendance',

            'created' => $created,

            'updated' => $updated,

            'skipped' => $skipped,

            'errors' => $errors,
        ];
    }

    /**
     * Import legacy payroll/ledger entries while preserving source amounts.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function importPayroll(
        Request $request,
        array $rows,
        array $data,
    ): array {
        $mapping =
            $data['mapping'];

        foreach (
            [
                'employee',
                'kind',
                'occurred_on',
                'amount',
            ] as $required
        ) {
            abort_unless(
                ! empty(
                    $mapping[$required]
                    ?? null,
                ),
                422,
                'Missing required mapping: '
                .$required,
            );
        }

        $matchBy =
            $data['match_by']
            ?? 'name';

        $created =
            0;

        $skipped =
            0;

        $errors =
            [];

        DB::transaction(
            function () use (
                $request,
                $rows,
                $mapping,
                $matchBy,
                &$created,
                &$skipped,
                &$errors,
            ): void {
                foreach (
                    $rows as $index => $row
                ) {
                    $line =
                        $index
                        + 2;

                    try {
                        $identifier =
                            trim(
                                (string) $this->mapped(
                                    $row,
                                    $mapping,
                                    'employee',
                                ),
                            );

                        $member =
                            $this->findMember(
                                $matchBy,
                                $identifier,
                            );

                        if (! $member) {
                            throw new \RuntimeException(
                                'Employee could not be matched.',
                            );
                        }

                        $kind =
                            $this->normalizeEntryKind(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'kind',
                                ),
                            );

                        $date =
                            $this->date(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'occurred_on',
                                ),
                            );

                        $amount =
                            $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'amount',
                                ),
                            );

                        if (
                            ! $kind
                            || ! $date
                            || $amount ===
                                null
                        ) {
                            throw new \RuntimeException(
                                'Payroll kind, date, and amount are required.',
                            );
                        }

                        $numericAmount =
                            abs(
                                (float) $amount,
                            );

                        if (
                            $numericAmount <=
                            0
                        ) {
                            throw new \RuntimeException(
                                'Amount must be greater than zero.',
                            );
                        }

                        if (
                            in_array(
                                $kind,
                                [
                                    'deduction',
                                    'payment',
                                    'advance',
                                ],
                                true,
                            )
                        ) {
                            $numericAmount =
                                -$numericAmount;
                        }

                        $quantity =
                            $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'quantity',
                                ),
                            );

                        $rate =
                            $this->decimal(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'rate',
                                ),
                            );

                        $notes =
                            $this->stringOrNull(
                                $this->mapped(
                                    $row,
                                    $mapping,
                                    'notes',
                                ),
                            )
                            ?? 'Imported from legacy employee data';

                        $duplicate =
                            StaffEntry::query()
                                ->where(
                                    'staff_member_id',
                                    $member->id,
                                )
                                ->where(
                                    'kind',
                                    $kind,
                                )
                                ->whereDate(
                                    'occurred_on',
                                    $date,
                                )
                                ->where(
                                    'amount',
                                    number_format(
                                        $numericAmount,
                                        4,
                                        '.',
                                        '',
                                    ),
                                )
                                ->where(
                                    'notes',
                                    $notes,
                                )
                                ->exists();

                        if ($duplicate) {
                            ++$skipped;

                            continue;
                        }

                        StaffEntry::create([
                            'staff_member_id' => $member->id,

                            'created_by' => $request
                                ->user()
                                ->id,

                            'request_id' => (string) Str::uuid(),

                            'kind' => $kind,

                            'occurred_on' => $date,

                            'quantity' => $quantity,

                            'rate' => $rate,

                            'amount' => number_format(
                                $numericAmount,
                                4,
                                '.',
                                '',
                            ),

                            'notes' => $notes,

                            'terms' => [
                                'basis' => $member->basis,

                                'unit' => $member->unit,

                                'currency' => $member->currency,

                                'monthly_allowance' => $member->monthly_allowance,

                                'imported' => true,
                            ],
                        ]);

                        ++$created;
                    } catch (
                        Throwable $exception
                    ) {
                        ++$skipped;

                        if (
                            count(
                                $errors,
                            ) <
                            50
                        ) {
                            $errors[] = [
                                'row' => $line,

                                'message' => $exception->getMessage(),
                            ];
                        }
                    }
                }
            },
        );

        return [
            'type' => 'payroll',

            'created' => $created,

            'updated' => 0,

            'skipped' => $skipped,

            'errors' => $errors,
        ];
    }

    /**
     * Find exactly one employee using a migration-safe identifier.
     */
    private function findMember(
        string $matchBy,
        string $value,
    ): ?StaffMember {
        if (
            trim(
                $value,
            ) ===
            ''
        ) {
            return null;
        }

        $query =
            StaffMember::query();

        if (
            $matchBy ===
            'email'
        ) {
            $query->whereHas(
                'user',
                fn (
                    $query,
                ) => $query->where(
                    'email',
                    strtolower(
                        trim(
                            $value,
                        ),
                    ),
                ),
            );
        } else {
            $query->where(
                $matchBy,
                trim(
                    $value,
                ),
            );
        }

        $matches =
            $query
                ->limit(
                    2,
                )
                ->get();

        if (
            $matches->count() >
            1
        ) {
            throw new \RuntimeException(
                'More than one employee matched this identifier.',
            );
        }

        return $matches->first();
    }

    /**
     * Resolve or optionally create a department by exact name.
     */
    private function departmentId(
        ?string $name,
        bool $create,
    ): ?int {
        if (! $name) {
            return null;
        }

        $department =
            Department::query()
                ->where(
                    'name',
                    $name,
                )
                ->first();

        if (
            ! $department
            && $create
        ) {
            $department =
                Department::create([
                    'name' => $name,
                ]);
        }

        if (! $department) {
            throw new \RuntimeException(
                'Department "'
                .$name
                .'" does not exist.',
            );
        }

        return (int) $department->id;
    }

    /**
     * Normalize a spreadsheet header row and make duplicate names unique.
     *
     * @param  array<int, mixed>  $row
     * @return list<string>
     */
    private function normalizeHeaders(
        array $row,
    ): array {
        $seen =
            [];

        $headers =
            [];

        foreach (
            array_values(
                $row,
            ) as $index => $value
        ) {
            $base =
                trim(
                    (string) (
                        $value
                        ?? ''
                    ),
                );

            if (
                $base ===
                ''
            ) {
                $base =
                    'Column '
                    .(
                        $index
                        + 1
                    );
            }

            $count =
                ($seen[$base]
                ?? 0)
                + 1;

            $seen[$base] =
                $count;

            $headers[] =
                $count ===
                    1
                    ? $base
                    : $base
                        .' ('
                        .$count
                        .')';
        }

        return $headers;
    }

    /**
     * Pair one spreadsheet row with its normalized headers.
     *
     * @param  list<string>  $headers
     * @param  array<int, mixed>  $row
     * @return array<string, mixed>
     */
    private function associateRow(
        array $headers,
        array $row,
    ): array {
        $values =
            array_values(
                $row,
            );

        $result =
            [];

        foreach (
            $headers as $index => $header
        ) {
            $result[$header] =
                $values[$index]
                ?? null;
        }

        return $result;
    }

    /**
     * Check whether a spreadsheet row contains any non-empty value.
     *
     * @param  array<int, mixed>  $row
     */
    private function rowHasContent(
        array $row,
    ): bool {
        foreach (
            $row as $value
        ) {
            if (
                trim(
                    (string) (
                        $value
                        ?? ''
                    ),
                ) !==
                ''
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Read one mapped field from an associated spreadsheet row.
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, mixed>  $mapping
     */
    private function mapped(
        array $row,
        array $mapping,
        string $field,
    ): mixed {
        $header =
            $mapping[$field]
            ?? null;

        if (
            ! is_string(
                $header,
            )
            || $header ===
                ''
        ) {
            return null;
        }

        return $row[$header]
            ?? null;
    }

    private function stringOrNull(
        mixed $value,
    ): ?string {
        $string =
            trim(
                (string) (
                    $value
                    ?? ''
                ),
            );

        return $string ===
            ''
            ? null
            : $string;
    }

    private function decimal(
        mixed $value,
    ): ?string {
        if (
            $value ===
            null
            || trim(
                (string) $value,
            ) ===
                ''
        ) {
            return null;
        }

        $normalized =
            str_replace(
                [
                    ',',
                    ' ',
                ],
                '',
                (string) $value,
            );

        if (! is_numeric(
            $normalized,
        )) {
            return null;
        }

        return number_format(
            (float) $normalized,
            4,
            '.',
            '',
        );
    }

    private function date(
        mixed $value,
    ): ?string {
        if (
            $value ===
            null
            || trim(
                (string) $value,
            ) ===
                ''
        ) {
            return null;
        }

        if (
            is_numeric(
                $value,
            )
            && (float) $value >
                20000
        ) {
            return CarbonImmutable::instance(
                ExcelDate::excelToDateTimeObject(
                    (float) $value,
                ),
            )->toDateString();
        }

        try {
            return CarbonImmutable::parse(
                (string) $value,
            )->toDateString();
        } catch (
            Throwable
        ) {
            return null;
        }
    }

    private function boolean(
        mixed $value,
        bool $default,
    ): bool {
        $normalized =
            mb_strtolower(
                trim(
                    (string) (
                        $value
                        ?? ''
                    ),
                ),
            );

        if (
            $normalized ===
            ''
        ) {
            return $default;
        }

        return in_array(
            $normalized,
            [
                '1',
                'true',
                'yes',
                'active',
                'enabled',
                'نعم',
                'نشط',
                'فعال',
                'على رأس العمل',
            ],
            true,
        );
    }

    private function normalizeBasis(
        mixed $value,
    ): ?string {
        $normalized =
            mb_strtolower(
                trim(
                    (string) (
                        $value
                        ?? ''
                    ),
                ),
            );

        $map = [
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
        ];

        return $map[$normalized]
            ?? null;
    }

    private function normalizeAttendanceStatus(
        mixed $value,
    ): ?string {
        $normalized =
            mb_strtolower(
                trim(
                    (string) (
                        $value
                        ?? ''
                    ),
                ),
            );

        if (
            in_array(
                $normalized,
                [
                    'present',
                    'حاضر',
                    '1',
                ],
                true,
            )
        ) {
            return 'present';
        }

        if (
            in_array(
                $normalized,
                [
                    'absent',
                    'غائب',
                    '0',
                ],
                true,
            )
        ) {
            return 'absent';
        }

        return null;
    }

    private function normalizeEntryKind(
        mixed $value,
    ): ?string {
        $normalized =
            mb_strtolower(
                trim(
                    (string) (
                        $value
                        ?? ''
                    ),
                ),
            );

        $map = [
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
        ];

        return $map[$normalized]
            ?? null;
    }
}
