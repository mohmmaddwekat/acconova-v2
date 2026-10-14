<?php

namespace App\Actions\Staff;

use App\Models\Department;
use App\Models\Membership;
use App\Models\StaffMember;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

class UpsertStaffMemberFromImport
{
    /**
     * Match-or-create a StaffMember from one normalized import row.
     *
     * This extracts the matching and payload rules that
     * StaffImportController::importEmployees() applies per spreadsheet row
     * (see that method's `$matchBy`/payload block) into a standalone action,
     * so the smart import engine's StaffMemberImportable can delegate here
     * instead of writing to StaffMember directly.
     *
     * @param  array<string, mixed>  $row
     * @return array{status: 'created'|'updated'|'skipped', member: ?StaffMember}
     */
    public function execute(
        array $row,
        string $matchBy = 'phone',
        string $duplicateStrategy = 'skip',
    ): array {
        $validated = $this->validateRow($row, $matchBy);

        $existing = $validated['existing'];

        if ($existing && $duplicateStrategy === 'skip') {
            return ['status' => 'skipped', 'member' => $existing];
        }

        return DB::transaction(function () use ($row, $existing, $validated): array {
            /*
             * Only resolved here, after the duplicate+skip early-return
             * above, so a stale/typo'd department on a row that would be
             * silently skipped as a duplicate does not abort the whole
             * commit. See resolveDepartmentId()'s docblock.
             */
            $departmentId = $this->resolveDepartmentId($row);

            $userId = null;

            if ($validated['email'] !== '') {
                $membership = Membership::query()
                    ->whereHas('user', fn ($query) => $query->where('email', $validated['email']))
                    ->first();
                $userId = $membership?->user_id;
            }

            $payload = [
                'name' => $validated['name'],
                'job_title' => $this->stringOrNull($row['job_title'] ?? null),
                'phone' => $validated['phone'],
                'user_id' => $userId,
                'department_id' => $departmentId,
                'basis' => $validated['basis'],
                'unit' => $this->stringOrNull($row['unit'] ?? null),
                'rate' => $validated['rate'],
                'monthly_allowance' => $this->decimal($row['monthly_allowance'] ?? null) ?? '0',
                'currency' => $this->stringOrNull($row['currency'] ?? null) ?? $this->defaultCurrency(),
                'started_on' => $validated['startedOn'],
                'active' => $this->boolean($row['active'] ?? null, true),
            ];

            if ($existing) {
                $existing->update($payload);

                return ['status' => 'updated', 'member' => $existing->refresh()];
            }

            return ['status' => 'created', 'member' => StaffMember::create($payload)];
        });
    }

    /**
     * Validate one import row without writing to the database, returning a
     * human-readable error message when it would fail execute()'s checks,
     * or null when it would succeed. Used by StaffMemberImportable::preview()
     * to dry-run validation before any row is committed.
     *
     * Unlike execute(), this always resolves the row's department too, even
     * for a row that execute() would end up silently skipping as a
     * duplicate — a dry run's job is to surface every validation issue, not
     * just the ones a real commit would actually reach.
     *
     * @param  array<string, mixed>  $row
     */
    public function preview(array $row, string $matchBy = 'phone'): ?string
    {
        try {
            $this->validateRow($row, $matchBy);
            $this->resolveDepartmentId($row);

            return null;
        } catch (InvalidArgumentException|RuntimeException $exception) {
            return $exception->getMessage();
        }
    }

    /**
     * Normalize and validate one import row's required fields and matching
     * lookup (name, basis, rate, started_on, phone, email, existing-match)
     * without creating or updating a StaffMember. Shared by execute() and
     * preview() so both run the exact same checks and only execute()
     * proceeds to write.
     *
     * Department existence is deliberately NOT checked here — see
     * resolveDepartmentId()'s docblock for why it must be validated
     * separately.
     *
     * @param  array<string, mixed>  $row
     * @return array{name:string, basis:string, rate:string, startedOn:string, phone:?string, email:string, existing:?StaffMember}
     */
    private function validateRow(array $row, string $matchBy): array
    {
        $name = trim((string) ($row['name'] ?? ''));
        $basis = $this->normalizeBasis($row['basis'] ?? null);
        $rate = $this->decimal($row['rate'] ?? null);
        $startedOn = $this->date($row['started_on'] ?? null);

        if ($name === '' || $basis === null || $rate === null || $startedOn === null) {
            throw new InvalidArgumentException('Name, pay basis, rate, and start date are required.');
        }

        $phone = $this->stringOrNull($row['phone'] ?? null);
        $email = strtolower((string) ($this->stringOrNull($row['email'] ?? null) ?? ''));
        $matchValue = match ($matchBy) {
            'email' => $email,
            'name' => $name,
            default => $phone ?? '',
        };

        $existing = $matchValue !== '' ? $this->findMember($matchBy, $matchValue) : null;

        return [
            'name' => $name,
            'basis' => $basis,
            'rate' => $rate,
            'startedOn' => $startedOn,
            'phone' => $phone,
            'email' => $email,
            'existing' => $existing,
        ];
    }

    /**
     * Resolve a row's department name to its id, throwing RuntimeException
     * when it names a department that does not exist.
     *
     * execute() must only call this for rows that will actually proceed to
     * a write — i.e. after the duplicate+skip early-return — so that a
     * stale or typo'd department on an otherwise-skipped duplicate row does
     * not abort the whole commit (StaffMemberImportable::commit() wraps
     * every row in one transaction with no per-row catch). preview() calls
     * it for every row regardless of duplicate status, since a dry run must
     * surface every validation issue even on a row that execute() would end
     * up silently skipping.
     *
     * @param  array<string, mixed>  $row
     */
    private function resolveDepartmentId(array $row): ?int
    {
        return $this->departmentId($this->stringOrNull($row['department'] ?? null));
    }

    /**
     * Find a StaffMember by the configured matching column, mirroring
     * StaffImportController::findMember()'s column/logic without that
     * controller's spreadsheet-wide fuzzy name index, which is unnecessary
     * when upserting one already-normalized row at a time.
     */
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

        return $matches->first();
    }

    private function departmentId(?string $name): ?int
    {
        if ($name === null || $name === '') {
            return null;
        }

        $department = Department::query()->where('name', $name)->first();

        if (! $department) {
            throw new RuntimeException('Department "'.$name.'" does not exist.');
        }

        return (int) $department->id;
    }

    private function defaultCurrency(): string
    {
        return app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS';
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
     * Excel/AI-extracted values from Arabic-locale sources can render numbers
     * with Arabic-Indic digits and separators (٠١٢٣٤٥٦٧٨٩ ، ٫) instead of
     * ASCII. Normalize them first, mirroring the spreadsheet importer.
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
}
