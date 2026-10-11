<?php

namespace App\Services\AI\Import\Entities;

use App\Actions\Staff\UpsertStaffMemberFromImport;
use App\Services\AI\Import\Contracts\ImportableEntity;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Throwable;

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
    public function requiredPermission(): string
    {
        return 'staff.import';
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{created:int,updated:int,skipped:int,total:int}
     */
    public function commit(Collection $rows): array
    {
        $created = 0;
        $updated = 0;
        $skipped = 0;

        DB::transaction(function () use ($rows, &$created, &$updated, &$skipped): void {
            foreach ($rows as $row) {
                try {
                    /*
                     * 'phone'/'skip' mirror StaffImportController::importEmployees()'s
                     * defaults, keeping bulk commits safe and non-destructive by
                     * default.
                     */
                    $result = $this->upsertStaffMember->execute((array) $row, 'phone', 'skip');

                    match ($result['status']) {
                        'created' => $created++,
                        'updated' => $updated++,
                        'skipped' => $skipped++,
                    };
                } catch (Throwable) {
                    $skipped++;
                }
            }
        });

        return [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'total' => $created + $updated + $skipped,
        ];
    }
}
