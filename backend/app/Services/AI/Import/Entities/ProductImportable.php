<?php

namespace App\Services\AI\Import\Entities;

use App\Actions\Products\ImportProductsFromSpreadsheet;
use App\Services\AI\Import\Contracts\ImportableEntity;
use Illuminate\Support\Collection;

class ProductImportable implements ImportableEntity
{
    /**
     * Wrap the existing Product spreadsheet importer so the smart import
     * engine can target Products without duplicating its business rules.
     */
    public function __construct(
        private readonly ImportProductsFromSpreadsheet $importProducts,
    ) {}

    public function key(): string
    {
        return 'product';
    }

    public function label(): string
    {
        return 'Products & Services';
    }

    /** @return array<string, mixed> */
    public function fieldSchema(): array
    {
        return [
            'type' => [
                'type' => 'string',
                'required' => true,
                'enum' => ['product', 'raw_material', 'service'],
            ],

            'name' => [
                'type' => 'string',
                'required' => true,
            ],

            'sku' => [
                'type' => 'string',
                'required' => false,
            ],

            'description' => [
                'type' => 'string',
                'required' => false,
            ],

            'unit' => [
                'type' => 'string',
                'required' => true,
            ],

            'unit_price' => [
                'type' => 'number',
                'required' => true,
            ],

            'cost_price' => [
                'type' => 'number',
                'required' => false,
            ],

            'tax_rate' => [
                'type' => 'number',
                'required' => true,
            ],
        ];
    }

    /**
     * Mirror the permission gating the real `POST /api/products/import`
     * endpoint (see WorkspaceFeaturePermissions::groups()'s `products` group).
     */
    public function requiredPermission(): string
    {
        return 'products.import.commit';
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{created:int,updated:int,skipped:int,total:int}
     */
    public function commit(Collection $rows): array
    {
        /*
         * 'skip' mirrors ProductImportRequest::prepareForValidation()'s
         * default duplicate-handling strategy, keeping bulk commits safe by
         * default.
         */
        return $this->importProducts->execute($rows, 'skip');
    }
}
