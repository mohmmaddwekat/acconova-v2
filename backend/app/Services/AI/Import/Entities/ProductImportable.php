<?php

namespace App\Services\AI\Import\Entities;

use App\Actions\Products\ImportProductsFromSpreadsheet;
use App\Models\Product;
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
        return 'products.import.commit';
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
         * 'skip' mirrors ProductImportRequest::prepareForValidation()'s
         * default duplicate-handling strategy, keeping bulk commits safe by
         * default.
         */
        return $this->importProducts->execute($rows, $duplicateMode, $this->changes, $this->progressListener);
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

        foreach (Product::query()->whereIn('id', $changes['created'] ?? [])->get() as $created) {
            $created->delete();
            $removed++;
        }

        $restored = 0;

        foreach ((array) ($changes['updated'] ?? []) as $id => $restore) {
            $record = Product::query()->find($id);

            if ($record === null) {
                continue;
            }

            $record->forceFill($restore['attributes'])->save();

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
        $analysis = $this->importProducts->preview($rows, $duplicateMode);

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
