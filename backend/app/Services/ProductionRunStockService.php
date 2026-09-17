<?php

namespace App\Services;

use App\Enums\ProductType;
use App\Enums\StockMovementType;
use App\Events\StockMovementRecorded;
use App\Exceptions\SafeValidationException;
use App\Models\InventoryBalance;
use App\Models\Product;
use App\Models\ProductionRun;
use App\Models\ProductionRunOutput;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Support\InventoryQuantity;
use Illuminate\Support\Collection;

class ProductionRunStockService
{
    private const MAX_UNITS =
        999999999999999999;

    /**
     * Commit authoritative actual material quantities and finished outputs.
     *
     * @return array<int, StockMovement>
     */
    public function post(
        ProductionRun $run,
        int $actorId,
    ): array {
        $run->loadMissing([
            'outputs.product',
            'outputs.warehouse',
            'outputs.materials.rawMaterial',
            'outputs.materials.warehouse',
        ]);

        $productIds =
            collect();

        $warehouseIds =
            collect();

        $pairs = [];

        foreach (
            $run->outputs as $output
        ) {
            $productIds->push(
                $output->product_id,
            );

            $warehouseIds->push(
                $output->warehouse_id,
            );

            $pairs[] = [
                $output->product_id,
                $output->warehouse_id,
            ];

            foreach (
                $output->materials as $material
            ) {
                $productIds->push(
                    $material->raw_material_id,
                );

                $warehouseIds->push(
                    $material->warehouse_id,
                );

                $pairs[] = [
                    $material->raw_material_id,
                    $material->warehouse_id,
                ];
            }
        }

        $productIds =
            $productIds
                ->unique()
                ->sort()
                ->values();

        $warehouseIds =
            $warehouseIds
                ->unique()
                ->sort()
                ->values();

        $products =
            Product::withTrashed()
                ->whereIn(
                    'id',
                    $productIds,
                )
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

        $warehouses =
            Warehouse::withTrashed()
                ->whereIn(
                    'id',
                    $warehouseIds,
                )
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

        if (
            $products->count() !==
            $productIds->count()
        ) {
            throw SafeValidationException::forField(
                'outputs',
                'production_run_dependency_missing',
            );
        }

        if (
            $warehouses->count() !==
            $warehouseIds->count()
        ) {
            throw SafeValidationException::forField(
                'outputs',
                'production_run_dependency_missing',
            );
        }

        foreach (
            $warehouses as $warehouse
        ) {
            if ($warehouse->trashed()) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_archived_warehouse',
                );
            }
        }

        $balances =
            $this->lockBalances(
                $pairs,
            );

        $materialDemand = [];

        $outputGrowth = [];

        foreach (
            $run->outputs as $output
        ) {
            /** @var Product $finished */
            $finished =
                $products->get(
                    $output->product_id,
                );

            if (
                $finished->trashed()
                || $finished->type !==
                ProductType::Product
            ) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_product_invalid',
                );
            }

            if (! $finished->tracksInventory()) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_inventory_not_tracked',
                );
            }

            $outputUnits =
                InventoryQuantity::toUnits(
                    $output->quantity,
                );

            $outputKey =
                $this->pairKey(
                    $finished->id,
                    $output->warehouse_id,
                );

            $currentGrowth =
                $outputGrowth[$outputKey]
                ?? 0;

            if (
                $currentGrowth >
                self::MAX_UNITS
                - $outputUnits
            ) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_quantity_overflow',
                );
            }

            $outputGrowth[$outputKey] =
                $currentGrowth
                + $outputUnits;

            foreach (
                $output->materials as $material
            ) {
                /** @var Product $raw */
                $raw =
                    $products->get(
                        $material->raw_material_id,
                    );

                if (
                    $raw->trashed()
                    || $raw->type !==
                    ProductType::RawMaterial
                ) {
                    throw SafeValidationException::forField(
                        'outputs',
                        'production_run_material_invalid',
                    );
                }

                if (! $raw->tracksInventory()) {
                    throw SafeValidationException::forField(
                        'outputs',
                        'production_run_inventory_not_tracked',
                    );
                }

                $actualUnits =
                    InventoryQuantity::toUnits(
                        $material->actual_quantity,
                    );

                $key =
                    $this->pairKey(
                        $raw->id,
                        $material->warehouse_id,
                    );

                $current =
                    $materialDemand[$key]
                    ?? 0;

                if (
                    $current >
                    self::MAX_UNITS
                    - $actualUnits
                ) {
                    throw SafeValidationException::forField(
                        'outputs',
                        'production_run_quantity_overflow',
                    );
                }

                $materialDemand[$key] =
                    $current
                    + $actualUnits;
            }
        }

        foreach (
            $materialDemand as $key => $required
        ) {
            $balance =
                $balances[$key];

            $available =
                InventoryQuantity::toUnits(
                    $balance->on_hand,
                )
                -
                InventoryQuantity::toUnits(
                    $balance->reserved,
                );

            if ($available < $required) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_insufficient_material',
                );
            }
        }

        foreach (
            $outputGrowth as $key => $growth
        ) {
            $balance =
                $balances[$key];

            $onHand =
                InventoryQuantity::toUnits(
                    $balance->on_hand,
                );

            if (
                $onHand >
                self::MAX_UNITS
                - $growth
            ) {
                throw SafeValidationException::forField(
                    'outputs',
                    'production_run_quantity_overflow',
                );
            }
        }

        $movements = [];

        foreach (
            $run->outputs as $output
        ) {
            /** @var Product $finished */
            $finished =
                $products->get(
                    $output->product_id,
                );

            /** @var Warehouse $outputWarehouse */
            $outputWarehouse =
                $warehouses->get(
                    $output->warehouse_id,
                );

            $outputBalance =
                $balances[$this->pairKey(
                    $finished->id,
                    $outputWarehouse->id,
                )];

            $outputUnits =
                InventoryQuantity::toUnits(
                    $output->quantity,
                );

            $onHand =
                InventoryQuantity::toUnits(
                    $outputBalance->on_hand,
                );

            $reserved =
                InventoryQuantity::toUnits(
                    $outputBalance->reserved,
                );

            $next =
                $onHand
                + $outputUnits;

            $outputBalance->on_hand =
                InventoryQuantity::fromUnits(
                    $next,
                );

            $outputBalance->save();

            $outputMovement =
                StockMovement::create([
                    'warehouse_id' => $outputWarehouse->id,

                    'product_id' => $finished->id,

                    'created_by' => $actorId,

                    'type' => StockMovementType::ProductionIn,

                    'quantity' => InventoryQuantity::fromUnits(
                        $outputUnits,
                    ),

                    'balance_after' => $outputBalance->on_hand,

                    'reference_type' => 'production',

                    'reference_id' => null,

                    'production_run_output_id' => $output->id,

                    'production_run_material_id' => null,

                    'note' => $run->note,
                ]);

            $outputMovement->forceFill([
                'reference_id' => $outputMovement->id,
            ])->save();

            $this->dispatchMovement(
                $finished,
                $outputWarehouse,
                $outputMovement,
                $onHand
                    - $reserved,
                $next
                    - $reserved,
                $actorId,
            );

            foreach (
                $output->materials as $material
            ) {
                /** @var Product $raw */
                $raw =
                    $products->get(
                        $material->raw_material_id,
                    );

                /** @var Warehouse $source */
                $source =
                    $warehouses->get(
                        $material->warehouse_id,
                    );

                $balance =
                    $balances[$this->pairKey(
                        $raw->id,
                        $source->id,
                    )];

                $actualUnits =
                    InventoryQuantity::toUnits(
                        $material->actual_quantity,
                    );

                $rawOnHand =
                    InventoryQuantity::toUnits(
                        $balance->on_hand,
                    );

                $rawReserved =
                    InventoryQuantity::toUnits(
                        $balance->reserved,
                    );

                $rawNext =
                    $rawOnHand
                    - $actualUnits;

                $balance->on_hand =
                    InventoryQuantity::fromUnits(
                        $rawNext,
                    );

                $balance->save();

                $movement =
                    StockMovement::create([
                        'warehouse_id' => $source->id,

                        'product_id' => $raw->id,

                        'created_by' => $actorId,

                        'type' => StockMovementType::ProductionOut,

                        'quantity' => InventoryQuantity::fromUnits(
                            -$actualUnits,
                        ),

                        'balance_after' => $balance->on_hand,

                        'reference_type' => 'production',

                        'reference_id' => $outputMovement->id,

                        'production_run_output_id' => $output->id,

                        'production_run_material_id' => $material->id,

                        'note' => $material->note
                            ?? $run->note,
                    ]);

                $this->dispatchMovement(
                    $raw,
                    $source,
                    $movement,
                    $rawOnHand
                        - $rawReserved,
                    $rawNext
                        - $rawReserved,
                    $actorId,
                );
            }

            $movements[$output->id] =
                $outputMovement;
        }

        return $movements;
    }

    /**
     * Reverse one or more complete Product outputs using compensating rows.
     *
     * @param  Collection<int, ProductionRunOutput>  $outputs
     */
    public function reverseOutputs(
        ProductionRun $run,
        Collection $outputs,
        string $reason,
        int $actorId,
    ): void {
        $outputs->loadMissing([
            'product',
            'warehouse',
            'materials.rawMaterial',
            'materials.warehouse',
        ]);

        $outputIds =
            $outputs
                ->pluck('id')
                ->all();

        $originals =
            StockMovement::query()
                ->whereIn(
                    'production_run_output_id',
                    $outputIds,
                )
                ->whereIn(
                    'type',
                    [
                        StockMovementType::ProductionIn,
                        StockMovementType::ProductionOut,
                    ],
                )
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

        $this->validateOriginalMovements(
            $outputs,
            $originals,
        );

        if (
            StockMovement::query()
                ->whereIn(
                    'reversal_of_movement_id',
                    $originals->pluck('id'),
                )
                ->exists()
        ) {
            throw SafeValidationException::forField(
                'run',
                'production_run_already_reversed',
            );
        }

        $productIds =
            $originals
                ->pluck('product_id')
                ->unique()
                ->sort()
                ->values();

        $warehouseIds =
            $originals
                ->pluck('warehouse_id')
                ->unique()
                ->sort()
                ->values();

        $products =
            Product::withTrashed()
                ->whereIn(
                    'id',
                    $productIds,
                )
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

        $warehouses =
            Warehouse::withTrashed()
                ->whereIn(
                    'id',
                    $warehouseIds,
                )
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

        foreach (
            $products as $product
        ) {
            if ($product->trashed()) {
                throw SafeValidationException::forField(
                    'run',
                    'production_run_reversal_archived_product',
                );
            }
        }

        foreach (
            $warehouses as $warehouse
        ) {
            if ($warehouse->trashed()) {
                throw SafeValidationException::forField(
                    'run',
                    'production_run_reversal_archived_warehouse',
                );
            }
        }

        $pairs =
            $originals
                ->map(
                    fn (
                        StockMovement $movement,
                    ): array => [
                        $movement->product_id,
                        $movement->warehouse_id,
                    ],
                )
                ->all();

        $balances =
            $this->lockBalances(
                $pairs,
            );

        $netDeltas = [];

        foreach (
            $originals as $movement
        ) {
            $key =
                $this->pairKey(
                    $movement->product_id,
                    $movement->warehouse_id,
                );

            $netDeltas[$key] =
                (
                    $netDeltas[$key]
                    ?? 0
                )
                -
                InventoryQuantity::toUnits(
                    $movement->quantity,
                );
        }

        foreach (
            $netDeltas as $key => $delta
        ) {
            $balance =
                $balances[$key];

            $onHand =
                InventoryQuantity::toUnits(
                    $balance->on_hand,
                );

            $reserved =
                InventoryQuantity::toUnits(
                    $balance->reserved,
                );

            $next =
                $onHand
                + $delta;

            if (
                $next < 0
                || $next < $reserved
            ) {
                throw SafeValidationException::forField(
                    'run',
                    'production_run_reversal_output_unavailable',
                );
            }

            if ($next > self::MAX_UNITS) {
                throw SafeValidationException::forField(
                    'run',
                    'production_run_quantity_overflow',
                );
            }
        }

        foreach (
            $originals as $original
        ) {
            /** @var Product $product */
            $product =
                $products->get(
                    $original->product_id,
                );

            /** @var Warehouse $warehouse */
            $warehouse =
                $warehouses->get(
                    $original->warehouse_id,
                );

            $balance =
                $balances[$this->pairKey(
                    $product->id,
                    $warehouse->id,
                )];

            $onHand =
                InventoryQuantity::toUnits(
                    $balance->on_hand,
                );

            $reserved =
                InventoryQuantity::toUnits(
                    $balance->reserved,
                );

            $delta =
                -InventoryQuantity::toUnits(
                    $original->quantity,
                );

            $next =
                $onHand
                + $delta;

            $balance->on_hand =
                InventoryQuantity::fromUnits(
                    $next,
                );

            $balance->save();

            $reversal =
                StockMovement::create([
                    'warehouse_id' => $warehouse->id,

                    'product_id' => $product->id,

                    'created_by' => $actorId,

                    'type' => StockMovementType::Adjustment,

                    'quantity' => InventoryQuantity::fromUnits(
                        $delta,
                    ),

                    'balance_after' => $balance->on_hand,

                    'reference_type' => 'production_run_reversal',

                    'reference_id' => $run->id,

                    'production_run_output_id' => $original
                        ->production_run_output_id,

                    'production_run_material_id' => $original
                        ->production_run_material_id,

                    'reversal_of_movement_id' => $original->id,

                    'note' => $reason,
                ]);

            $this->dispatchMovement(
                $product,
                $warehouse,
                $reversal,
                $onHand
                    - $reserved,
                $next
                    - $reserved,
                $actorId,
            );
        }
    }

    /**
     * Ensure historical movements exactly match posted actual-consumption rows.
     *
     * @param  Collection<int, ProductionRunOutput>  $outputs
     * @param  Collection<int, StockMovement>  $movements
     */
    private function validateOriginalMovements(
        Collection $outputs,
        Collection $movements,
    ): void {
        $expected = [];

        foreach (
            $outputs as $output
        ) {
            $expected['output:'
                .$output->id] =
                InventoryQuantity::toUnits(
                    $output->quantity,
                );

            foreach (
                $output->materials as $material
            ) {
                $expected['material:'
                    .$material->id] =
                    -InventoryQuantity::toUnits(
                        $material->actual_quantity,
                    );
            }
        }

        $actual = [];

        foreach (
            $movements as $movement
        ) {
            if (
                $movement->type ===
                StockMovementType::ProductionIn
            ) {
                $key =
                    'output:'
                    .$movement
                        ->production_run_output_id;
            } else {
                if (
                    $movement
                        ->production_run_material_id ===
                        null
                ) {
                    throw SafeValidationException::forField(
                        'run',
                        'production_run_movements_missing',
                    );
                }

                $key =
                    'material:'
                    .$movement
                        ->production_run_material_id;
            }

            if (isset($actual[$key])) {
                throw SafeValidationException::forField(
                    'run',
                    'production_run_movements_missing',
                );
            }

            $actual[$key] =
                InventoryQuantity::toUnits(
                    $movement->quantity,
                );
        }

        ksort($expected);
        ksort($actual);

        if ($expected !== $actual) {
            throw SafeValidationException::forField(
                'run',
                'production_run_movements_missing',
            );
        }
    }

    /**
     * Ensure and lock all Product/Warehouse balances deterministically.
     *
     * @param  list<array{0:int,1:int}>  $pairs
     * @return array<string, InventoryBalance>
     */
    private function lockBalances(
        array $pairs,
    ): array {
        $pairs =
            collect(
                $pairs,
            )
                ->unique(
                    fn (
                        array $pair,
                    ): string => $this->pairKey(
                        (int) $pair[0],
                        (int) $pair[1],
                    ),
                )
                ->sortBy(
                    fn (
                        array $pair,
                    ): string => str_pad(
                        (string) $pair[1],
                        20,
                        '0',
                        STR_PAD_LEFT,
                    )
                        .':'
                        .str_pad(
                            (string) $pair[0],
                            20,
                            '0',
                            STR_PAD_LEFT,
                        ),
                )
                ->values();

        $balances = [];

        foreach (
            $pairs as [
                $productId,
                $warehouseId,
            ]
        ) {
            InventoryBalance::query()
                ->firstOrCreate(
                    [
                        'product_id' => (int) $productId,

                        'warehouse_id' => (int) $warehouseId,
                    ],
                    [
                        'on_hand' => '0.0000',

                        'reserved' => '0.0000',
                    ],
                );

            $balance =
                InventoryBalance::query()
                    ->where(
                        'product_id',
                        $productId,
                    )
                    ->where(
                        'warehouse_id',
                        $warehouseId,
                    )
                    ->lockForUpdate()
                    ->firstOrFail();

            $balances[$this->pairKey(
                (int) $productId,
                (int) $warehouseId,
            )] =
                $balance;
        }

        return $balances;
    }

    /**
     * Dispatch the standard Inventory balance event.
     */
    private function dispatchMovement(
        Product $product,
        Warehouse $warehouse,
        StockMovement $movement,
        int $previousAvailable,
        int $currentAvailable,
        int $actorId,
    ): void {
        StockMovementRecorded::dispatch(
            (int) $product->organization_id,
            $product->id,
            $warehouse->id,
            $movement->id,
            $movement->type->value,
            InventoryQuantity::fromUnits(
                $previousAvailable,
            ),
            InventoryQuantity::fromUnits(
                $currentAvailable,
            ),
            $product->low_stock_threshold,
            $actorId,
        );
    }

    /**
     * Build one deterministic Product/Warehouse balance key.
     */
    private function pairKey(
        int $productId,
        int $warehouseId,
    ): string {
        return $warehouseId
            .':'
            .$productId;
    }
}
