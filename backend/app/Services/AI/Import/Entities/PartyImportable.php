<?php

namespace App\Services\AI\Import\Entities;

use App\Actions\Parties\ImportPartiesFromSpreadsheet;
use App\Actions\Parties\UpdateParty;
use App\Models\Party;
use App\Services\AI\Import\Contracts\ImportableEntity;
use Illuminate\Support\Collection;

class PartyImportable implements ImportableEntity
{
    /**
     * Wrap the existing Party spreadsheet importer so the smart import
     * engine can target Parties without duplicating its business rules.
     */
    public function __construct(
        private readonly ImportPartiesFromSpreadsheet $importParties,
    ) {}

    public function key(): string
    {
        return 'party';
    }

    public function label(): string
    {
        return 'Customers & Suppliers';
    }

    /** @return array<string, mixed> */
    public function fieldSchema(): array
    {
        return [
            'type' => [
                'type' => 'string',
                'required' => true,
                'enum' => ['person', 'company', 'other'],
            ],

            'name' => [
                'type' => 'string',
                'required' => false,
            ],

            'company_name' => [
                'type' => 'string',
                'required' => false,
            ],

            'email' => [
                'type' => 'string',
                'required' => false,
            ],

            'phone' => [
                'type' => 'string',
                'required' => false,
            ],

            'tax_number' => [
                'type' => 'string',
                'required' => false,
            ],

            'address_line_1' => [
                'type' => 'string',
                'required' => false,
            ],

            'address_line_2' => [
                'type' => 'string',
                'required' => false,
            ],

            'city' => [
                'type' => 'string',
                'required' => false,
            ],

            'state' => [
                'type' => 'string',
                'required' => false,
            ],

            'postal_code' => [
                'type' => 'string',
                'required' => false,
            ],

            'country_code' => [
                'type' => 'string',
                'required' => false,
            ],

            'roles' => [
                'type' => 'array',
                'required' => true,
                'enum' => ['customer', 'supplier', 'contact'],
            ],
        ];
    }

    /**
     * Mirror the permission gating the real `POST /api/parties/import`
     * endpoint (see WorkspaceFeaturePermissions::groups()'s `parties` group).
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
        return 'parties.import.commit';
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{created:int,updated:int,skipped:int,total:int}
     */
    /** @var array{created:list<int>,updated:array<int,array<string,mixed>>} */
    private array $changes = ['created' => [], 'updated' => []];

    public function commit(Collection $rows, string $duplicateMode = 'skip'): array
    {
        /*
         * 'skip' mirrors PartyImportRequest::prepareForValidation()'s default
         * duplicate-handling strategy, keeping bulk commits safe by default.
         */
        return $this->importParties->execute($rows, $duplicateMode, $this->changes, $this->progressListener);
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{valid_rows:int, error_rows:int, errors:list<array{row:int,message:string}>}
     */
    public function lastChanges(): array
    {
        return $this->changes;
    }

    public function rollback(array $changes): array
    {
        $removed = 0;

        foreach (Party::query()->whereIn('id', $changes['created'] ?? [])->get() as $created) {
            $created->delete();
            $removed++;
        }

        $restored = 0;

        foreach ((array) ($changes['updated'] ?? []) as $id => $restore) {
            $record = Party::query()->find($id);

            if ($record === null) {
                continue;
            }

            $record->forceFill($restore['attributes'])->save();

            if (isset($restore['roles'])) {
                app(UpdateParty::class)->execute($record, ['roles' => $restore['roles']]);
            }

            $restored++;
        }

        return ['removed' => $removed, 'restored' => $restored];
    }

    public function preview(Collection $rows, string $duplicateMode = 'skip'): array
    {
        /*
         * 'skip' mirrors commit()'s duplicate-handling strategy; it has no
         * effect on which rows are valid or invalid, only on how duplicates
         * would be classified if committed.
         */
        $analysis = $this->importParties->preview($rows, $duplicateMode);

        return [
            'valid_rows' => $analysis['valid_rows'],
            'error_rows' => $analysis['error_rows'],
            'duplicate_rows' => $analysis['duplicate_rows'],
            'errors' => array_map(
                static fn (array $error): array => [
                    'row' => $error['row'],
                    'message' => $error['message'],
                ],
                $analysis['errors'],
            ),
        ];
    }
}
