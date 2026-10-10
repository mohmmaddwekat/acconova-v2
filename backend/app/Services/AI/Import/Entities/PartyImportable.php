<?php

namespace App\Services\AI\Import\Entities;

use App\Actions\Parties\ImportPartiesFromSpreadsheet;
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
    public function requiredPermission(): string
    {
        return 'parties.import.commit';
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{created:int,updated:int,skipped:int,total:int}
     */
    public function commit(Collection $rows): array
    {
        /*
         * 'skip' mirrors PartyImportRequest::prepareForValidation()'s default
         * duplicate-handling strategy, keeping bulk commits safe by default.
         */
        return $this->importParties->execute($rows, 'skip');
    }
}
