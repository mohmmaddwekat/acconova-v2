<?php

namespace App\Services\AI\Import\Entities;

use App\Actions\Staff\UpsertStaffMemberFromImport;
use App\Models\StaffMember;
use App\Services\AI\Import\Contracts\ImportableEntity;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class StaffMemberImportable implements ImportableEntity
{
    /**
     * Wrap the extracted staff upsert action so the smart import engine can
     * target StaffMember without duplicating StaffImportController's
     * matching and payload rules.
     */
    public function __construct(
        private readonly UpsertStaffMemberFromImport $upsertStaffMember,
    ) {}

    public function key(): string
    {
        return 'staff_member';
    }

    public function label(): string
    {
        return 'Staff Members';
    }

    /** @return array<string, mixed> */
    public function fieldSchema(): array
    {
        return [
            'name' => [
                'type' => 'string',
                'required' => true,
            ],

            'job_title' => [
                'type' => 'string',
                'required' => false,
            ],

            'phone' => [
                'type' => 'string',
                'required' => false,
            ],

            'email' => [
                'type' => 'string',
                'required' => false,
            ],

            'department' => [
                'type' => 'string',
                'required' => false,
            ],

            'basis' => [
                'type' => 'string',
                'required' => true,
                'enum' => ['hour', 'day', 'month', 'piece'],
            ],

            'unit' => [
                'type' => 'string',
                'required' => false,
            ],

            'rate' => [
                'type' => 'number',
                'required' => true,
            ],

            'monthly_allowance' => [
                'type' => 'number',
                'required' => false,
            ],

            'currency' => [
                'type' => 'string',
                'required' => false,
            ],

            'started_on' => [
                'type' => 'string',
                'required' => true,
            ],

            'active' => [
                'type' => 'boolean',
                'required' => false,
            ],
        ];
    }

    /**
     * Mirror the permission gating the real staff import endpoints
     * (`StaffImportController::preview()`/`commit()` both call
     * `StaffController::allowed('staff.import')`; see
     * WorkspaceFeaturePermissions::groups()'s `staff` group for the same key).
     */
    /** @var (callable(int, int): void)|null */
    private $progressListener = null;

    public function isFinancial(): bool
    {
        return false;
    }

    public function onProgress(?callable $listener): void
    {
        $this->progressListener = $listener;
    }

    public function requiredPermission(): string
    {
        return 'staff.import';
    }

    /**
     * Commit every row inside one transaction, the same all-or-nothing
     * guarantee ImportPartiesFromSpreadsheet::execute()/ImportProductsFromSpreadsheet::execute()
     * give their callers.
     *
     * Only `UpsertStaffMemberFromImport::execute()`'s deliberate
     * duplicate-match "skip" result is counted as `skipped`. Any row that
     * fails validation (missing/invalid name, basis, rate, or started_on),
     * references an unknown department, or matches more than one existing
     * employee throws instead of being swallowed, aborting the whole commit
     * and rolling back anything already written in this batch — a bad row
     * must surface loudly, not disappear into an indistinguishable "skipped"
     * count.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{created:int,updated:int,skipped:int,total:int}
     */
    /** @var array{created:list<int>,updated:array<int,array<string,mixed>>} */
    private array $changes = ['created' => [], 'updated' => []];

    public function lastChanges(): array
    {
        return $this->changes;
    }

    public function rollback(array $changes): array
    {
        $removed = 0;

        foreach (StaffMember::query()->whereIn('id', $changes['created'] ?? [])->get() as $member) {
            $member->delete();
            $removed++;
        }

        $restored = 0;

        foreach ((array) ($changes['updated'] ?? []) as $id => $restore) {
            $member = StaffMember::query()->find($id);

            if ($member !== null) {
                $member->forceFill($restore['attributes'])->save();
                $restored++;
            }
        }

        return ['removed' => $removed, 'restored' => $restored];
    }

    public function commit(Collection $rows, string $duplicateMode = 'skip'): array
    {
        $this->changes = ['created' => [], 'updated' => []];
        $created = 0;
        $updated = 0;
        $skipped = 0;

        DB::transaction(function () use ($rows, $duplicateMode, &$created, &$updated, &$skipped): void {
            $done = 0;

            foreach ($rows as $row) {
                if ($this->progressListener !== null) {
                    ($this->progressListener)(++$done, $rows->count());
                }

                /*
                 * 'phone'/'skip' mirror StaffImportController::importEmployees()'s
                 * defaults, keeping bulk commits safe and non-destructive by
                 * default.
                 */
                $result = $this->upsertStaffMember->execute((array) $row, 'phone', $duplicateMode);

                match ($result['status']) {
                    'created' => [$created++, $this->changes['created'][] = $result['member']->id],
                    'updated' => [$updated++, $this->changes['updated'][$result['member']->id] = ['attributes' => $result['before']]],
                    'skipped' => $skipped++,
                };
            }
        });

        return [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'total' => $created + $updated + $skipped,
        ];
    }

    /**
     * Dry-run every row through UpsertStaffMemberFromImport's validation
     * checks (required fields, matching-column lookup, department
     * existence) without writing to the database, mirroring row numbering
     * with ImportPartiesFromSpreadsheet/ImportProductsFromSpreadsheet (row 1
     * is the header, so data rows start at 2).
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{valid_rows:int, error_rows:int, errors:list<array{row:int,message:string}>}
     */
    public function preview(Collection $rows, string $duplicateMode = 'skip'): array
    {
        $errors = [];
        $validRows = 0;
        $duplicateRows = 0;

        foreach ($rows->values() as $index => $row) {
            /*
             * 'phone' mirrors commit()'s matching column default, keeping
             * preview's duplicate detection consistent with what commit()
             * would actually match on.
             */
            $message = $this->upsertStaffMember->preview((array) $row, 'phone');

            if ($message === null) {
                $validRows++;

                if ($this->upsertStaffMember->isDuplicate((array) $row, 'phone')) {
                    $duplicateRows++;
                }

                continue;
            }

            $errors[] = [
                'row' => $index + 2,
                'message' => $message,
            ];
        }

        return [
            'valid_rows' => $validRows,
            'error_rows' => count($errors),
            'duplicate_rows' => $duplicateRows,
            'errors' => $errors,
        ];
    }
}
