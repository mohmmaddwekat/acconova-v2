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
        ]);
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
                fn (StaffMember $member): bool =>
                    $this->normalizePersonName($member->name) === $normalized,
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
                ExcelDate::excelToDateTimeObject((float) $value),
            )->toDateString();
        }

        try {
            return CarbonImmutable::parse((string) $value)->toDateString();
        } catch (Throwable) {
            return null;
        }
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
     * @param list<string> $headers
     * @param array<int, mixed> $row
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
