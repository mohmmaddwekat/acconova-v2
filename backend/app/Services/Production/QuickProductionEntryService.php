<?php

namespace App\Services\Production;

use App\Models\Product;
use App\Models\ProductionRecipe;
use App\Support\InventoryQuantity;
use App\Support\ProductionSuggestion;
use Illuminate\Validation\ValidationException;

/**
 * Creates one Production Run per row from the Product's active Recipe, so
 * paper records can be keyed in as date, product and quantity only.
 */
class QuickProductionEntryService
{
    public function __construct(
        private readonly ProductionRunService $runs,
        private readonly ProductionSuggestion $suggestions,
    ) {}

    /**
     * @param  list<array{occurred_on: string, product_id: int|string, quantity: int|float|string}>  $rows
     * @return list<array{index: int, status: string, run_id: int|null, run_number: string|null, message: string|null}>
     */
    public function enter(
        array $rows,
        int $warehouseId,
        bool $post,
        int $actorId,
    ): array {
        $recipes = [];
        $results = [];

        foreach ($rows as $index => $row) {
            $productId = (int) $row['product_id'];

            try {
                $recipes[$productId] ??= ProductionRecipe::query()
                    ->where('product_id', $productId)
                    ->where('is_active', true)
                    ->with('components.options')
                    ->first();

                $results[] = $this->enterRow(
                    $index,
                    $row,
                    $recipes[$productId],
                    $warehouseId,
                    $post,
                    $actorId,
                );
            } catch (ValidationException $failure) {
                $results[] = $this->result($index, 'failed', null, null, $this->firstMessage($failure));
            }
        }

        return $results;
    }

    /**
     * @param  array{occurred_on: string, product_id: int|string, quantity: int|float|string}  $row
     * @return array{index: int, status: string, run_id: int|null, run_number: string|null, message: string|null}
     */
    private function enterRow(
        int $index,
        array $row,
        ?ProductionRecipe $recipe,
        int $warehouseId,
        bool $post,
        int $actorId,
    ): array {
        $product = Product::query()->find((int) $row['product_id']);

        if (! $product) {
            return $this->result($index, 'failed', null, null, 'product_not_found');
        }

        if (! $recipe) {
            return $this->result($index, 'failed', null, null, 'no_active_recipe');
        }

        $quantity = InventoryQuantity::fromUnits(
            InventoryQuantity::toUnits((string) $row['quantity']),
        );

        $snapshot = $this->suggestions->snapshot($product, $recipe, $quantity, []);

        $unitsByMaterial = [];

        foreach ($snapshot['components'] ?? [] as $component) {
            $units = InventoryQuantity::toUnits((string) $component['required_quantity']);

            if ($units > 0) {
                $id = (int) $component['raw_material_id'];
                $unitsByMaterial[$id] = ($unitsByMaterial[$id] ?? 0) + $units;
            }
        }

        if ($unitsByMaterial === []) {
            return $this->result($index, 'failed', null, null, 'no_materials_available');
        }

        $materials = [];

        foreach ($unitsByMaterial as $materialId => $units) {
            $materials[] = [
                'raw_material_id' => $materialId,
                'warehouse_id' => $warehouseId,
                'actual_quantity' => InventoryQuantity::fromUnits($units),
                'note' => null,
            ];
        }

        $run = $this->runs->createDraft([
            'occurred_on' => $row['occurred_on'],
            'note' => null,
            'outputs' => [[
                'product_id' => $product->id,
                'warehouse_id' => $warehouseId,
                'quantity' => $quantity,
                'recipe_id' => $recipe->id,
                'selections' => [],
                'materials' => $materials,
            ]],
        ], $actorId);

        if (! $post) {
            return $this->result($index, 'draft', $run->id, $run->run_number, null);
        }

        try {
            $posted = $this->runs->post($run, (int) $run->revision, $actorId);

            return $this->result($index, 'posted', $posted->id, $posted->run_number, null);
        } catch (ValidationException $failure) {
            return $this->result($index, 'draft', $run->id, $run->run_number, $this->firstMessage($failure));
        }
    }

    private function firstMessage(ValidationException $failure): string
    {
        $messages = collect($failure->errors())->flatten();

        return (string) ($messages->first() ?? 'failed');
    }

    /**
     * @return array{index: int, status: string, run_id: int|null, run_number: string|null, message: string|null}
     */
    private function result(
        int $index,
        string $status,
        ?int $runId,
        ?string $runNumber,
        ?string $message,
    ): array {
        return [
            'index' => $index,
            'status' => $status,
            'run_id' => $runId,
            'run_number' => $runNumber,
            'message' => $message,
        ];
    }
}
