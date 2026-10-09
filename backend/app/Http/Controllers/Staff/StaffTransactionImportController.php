<?php

namespace App\Http\Controllers\Staff;

use App\Http\Controllers\Controller;
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
use RuntimeException;
use Throwable;

class StaffTransactionImportController extends Controller
{
    private const MAX_ROWS = 10000;

    /**
     * Import only historical manual employee transactions.
     *
     * Salary/work and overtime are deliberately excluded because AccoNova
     * derives them from attendance and the employee's pay terms.
     */
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless(
            StaffController::allowed('staff.import')
            && StaffController::allowed('staff.pay'),
            403,
        );

        $data = $request->validate([
            'token' => ['required', 'string', 'regex:/^[a-f0-9\-]+\.(csv|txt|xls|xlsx)$/i'],
            'sheet' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(['transactions'])],
            'mapping' => ['required', 'array'],
            'mapping.*' => ['nullable', 'string', 'max:255'],
            'match_by' => ['nullable', Rule::in(['name', 'phone', 'email'])],
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

        $mapping = $data['mapping'];
        $this->requireMappings($mapping, ['employee', 'kind', 'occurred_on', 'amount']);

        $path = storage_path(
            'app/private/staff-imports/'
            .app(TenantContext::class)->id()
            .'/'
            .$request->user()->id
            .DIRECTORY_SEPARATOR
            .$data['token'],
        );

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

        $matchBy = $data['match_by'] ?? 'name';
        $created = 0;
        $skipped = 0;
        $errors = [];

        DB::transaction(function () use (
            $request,
            $records,
            $mapping,
            $matchBy,
            &$created,
            &$skipped,
            &$errors,
        ): void {
            foreach ($records as $index => $row) {
                try {
                    $identifier = trim((string) $this->mapped($row, $mapping, 'employee'));
                    $member = $this->findMember($matchBy, $identifier);

                    if (! $member) {
                        throw new RuntimeException(
                            'Employee "'.$identifier.'" could not be matched. Check the employee name or selected matching field.'
                        );
                    }

                    $kind = $this->normalizeTransactionKind(
                        $this->mapped($row, $mapping, 'kind'),
                    );
                    $date = $this->date($this->mapped($row, $mapping, 'occurred_on'));
                    $amount = $this->decimal($this->mapped($row, $mapping, 'amount'));

                    if ($kind === null) {
                        throw new RuntimeException(
                            'Only payment, deduction, bonus, allowance, and advance can be imported. Salary/work and overtime are calculated by AccoNova.'
                        );
                    }

                    if ($date === null || $amount === null) {
                        throw new RuntimeException('Transaction date and amount are required.');
                    }

                    if ($date > today()->toDateString()) {
                        throw new RuntimeException('Transaction date cannot be in the future.');
                    }

                    $numericAmount = abs((float) $amount);
                    if ($numericAmount <= 0) {
                        throw new RuntimeException('Amount must be greater than zero.');
                    }

                    if (in_array($kind, ['deduction', 'payment', 'advance'], true)) {
                        $numericAmount = -$numericAmount;
                    }

                    $notes = $this->stringOrNull($this->mapped($row, $mapping, 'notes'))
                        ?? 'Imported historical staff transaction';
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
                        'quantity' => null,
                        'rate' => null,
                        'amount' => $normalizedAmount,
                        'notes' => $notes,
                        'terms' => [
                            'basis' => $member->basis,
                            'unit' => $member->unit,
                            'currency' => $member->currency,
                            'imported' => true,
                            'import_type' => 'manual_transaction',
                        ],
                    ]);

                    $created++;
                } catch (Throwable $exception) {
                    $skipped++;
                    $this->pushError($errors, $index + 2, $exception->getMessage());
                }
            }
        });

        return response()->json([
            'type' => 'transactions',
            'created' => $created,
            'updated' => 0,
            'skipped' => $skipped,
            'errors' => $errors,
            'filtered_out' => $filteredOut,
        ]);
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

    /** @param array<string, mixed> $mapping */
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

    private function normalizeTransactionKind(mixed $value): ?string
    {
        $normalized = mb_strtolower(trim((string) ($value ?? '')));

        return [
            'payment' => 'payment',
            'paid' => 'payment',
            'salary payment' => 'payment',
            'دفعة' => 'payment',
            'دفع' => 'payment',
            'مدفوع' => 'payment',
            'deduction' => 'deduction',
            'خصم' => 'deduction',
            'bonus' => 'bonus',
            'مكافأة' => 'bonus',
            'مكافاه' => 'bonus',
            'حافز' => 'bonus',
            'allowance' => 'allowance',
            'بدل' => 'allowance',
            'advance' => 'advance',
            'سلفة' => 'advance',
            'سلفه' => 'advance',
        ][$normalized] ?? null;
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
            ->filter(
                fn (StaffMember $member): bool => $this->normalizePersonName($member->name) === $normalized,
            )
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

        return preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    }

    /** @param array<string, mixed> $row */
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

    private function date(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        if (is_numeric($value) && (float) $value > 20000) {
            return CarbonImmutable::instance(
                ExcelDate::excelToDateTimeObject((float) $value),
            )->toDateString();
        }

        try {
            return CarbonImmutable::parse($this->normalizeArabicNumerals((string) $value))->toDateString();
        } catch (Throwable) {
            return null;
        }
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

    /** @param array<int, mixed> $row */
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

    /** @param array<int, mixed> $row */
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

    /** @param list<array{row:int,message:string}> $errors */
    private function pushError(array &$errors, int $row, string $message): void
    {
        if (count($errors) >= 50) {
            return;
        }

        $errors[] = [
            'row' => $row,
            'message' => $message,
        ];
    }
}
