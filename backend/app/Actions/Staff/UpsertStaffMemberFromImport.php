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

        if ($existing && $duplicateStrategy === 'skip') {
            return ['status' => 'skipped', 'member' => $existing];
        }

        return DB::transaction(function () use (
            $row,
            $existing,
            $name,
            $basis,
            $rate,
            $startedOn,
            $phone,
            $email,
        ): array {
            $departmentId = $this->departmentId(
                $this->stringOrNull($row['department'] ?? null),
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
                'job_title' => $this->stringOrNull($row['job_title'] ?? null),
                'phone' => $phone,
                'user_id' => $userId,
                'department_id' => $departmentId,
                'basis' => $basis,
                'unit' => $this->stringOrNull($row['unit'] ?? null),
                'rate' => $rate,
                'monthly_allowance' => $this->decimal($row['monthly_allowance'] ?? null) ?? '0',
                'currency' => $this->stringOrNull($row['currency'] ?? null) ?? $this->defaultCurrency(),
                'started_on' => $startedOn,
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
