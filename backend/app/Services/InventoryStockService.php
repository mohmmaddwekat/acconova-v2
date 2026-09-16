<?php

namespace App\Services;

use App\Enums\ProductType;
use App\Enums\StockMovementType;
use App\Events\InventoryTrackingChanged;
use App\Events\OpeningStockRecorded;
use App\Events\ProductUpdated;
use App\Events\StockAdjusted;
use App\Events\StockMovementRecorded;
use App\Events\StockTransferred;
use App\Exceptions\SafeValidationException;
use App\Models\InventoryBalance;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Support\InventoryQuantity;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class InventoryStockService
{
    /**
     * Consume actual raw-material quantities and receive finished goods atomically.
     * All products are locked in ID order before the warehouse, matching stock workflows.
     *
     * @param  list<array{product_id: int, quantity: string}>  $materials
     */
    public function recordProduction(Product $product, int $warehouseId, string $quantity, array $materials, ?string $note, int $actorId): StockMovement
    {
        return DB::transaction(function () use ($product, $warehouseId, $quantity, $materials, $note, $actorId): StockMovement {
            $ids = array_merge([$product->id], array_column($materials, 'product_id'));
            $products = Product::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $output = $products->get($product->id);
            abort_unless($output && $output->type === ProductType::Product, 404);
            $warehouse = Warehouse::query()->lockForUpdate()->findOrFail($warehouseId);
            $consumptions = [];

            foreach ($materials as $material) {
                $raw = $products->get($material['product_id']);
                abort_unless($raw && $raw->type === ProductType::RawMaterial, 404);
                if (! $raw->tracksInventory() || ! $output->tracksInventory()) {
                    throw SafeValidationException::forField('inventory', 'inventory_not_tracked');
                }
                $balance = $this->lockBalance($raw->id, $warehouse->id);
                $units = InventoryQuantity::toUnits($material['quantity']);
                $onHand = InventoryQuantity::toUnits($balance->on_hand);
                $reserved = InventoryQuantity::toUnits($balance->reserved);
                if ($units <= 0 || $onHand - $reserved < $units) {
                    throw SafeValidationException::forField('inventory', 'inventory_insufficient_stock');
                }
                $consumptions[] = [$raw, $balance, $units, $onHand, $reserved];
            }

            $balance = $this->lockBalance($output->id, $warehouse->id);
            $units = InventoryQuantity::toUnits($quantity);
            $previous = InventoryQuantity::toUnits($balance->on_hand);
            $reserved = InventoryQuantity::toUnits($balance->reserved);
            $next = $previous + $units;
            if ($units <= 0 || $next > 999999999999999999) {
                throw ValidationException::withMessages(['quantity' => [__('validation.max.numeric', ['attribute' => 'quantity', 'max' => '99999999999999.9999'])]]);
            }
            $balance->on_hand = InventoryQuantity::fromUnits($next);
            $balance->save();
            $movement = $this->createMovement($output, $warehouse, StockMovementType::ProductionIn, InventoryQuantity::fromUnits($units), $balance->on_hand, $note, $actorId);
            $movement->update(['reference_type' => 'production', 'reference_id' => $movement->id]);

            foreach ($consumptions as [$raw, $rawBalance, $consumed, $onHand, $rawReserved]) {
                $rawBalance->on_hand = InventoryQuantity::fromUnits($onHand - $consumed);
                $rawBalance->save();
                $consumption = $this->createMovement($raw, $warehouse, StockMovementType::ProductionOut, InventoryQuantity::fromUnits(-$consumed), $rawBalance->on_hand, $note, $actorId);
                $consumption->update(['reference_type' => 'production', 'reference_id' => $movement->id]);
                $this->dispatchBalanceChanged($raw, $warehouse, $consumption, InventoryQuantity::fromUnits($onHand - $rawReserved), InventoryQuantity::fromUnits($onHand - $consumed - $rawReserved), $actorId);
            }
            $this->dispatchBalanceChanged($output, $warehouse, $movement, InventoryQuantity::fromUnits($previous - $reserved), InventoryQuantity::fromUnits($next - $reserved), $actorId);

            return $movement;
        }, 3);
    }

    /**
     * Enable or disable inventory tracking for one physical Product.
     *
     * Tracking cannot be disabled while any warehouse still holds physical or
     * reserved stock. Historical movements remain preserved even after
     * tracking is disabled.
     */
    public function updateSettings(
        Product $product,
        bool $enabled,
        ?string $lowStockThreshold,
        int $actorId,
    ): Product {
        return DB::transaction(
            function () use (
                $product,
                $enabled,
                $lowStockThreshold,
                $actorId,
            ): Product {
                $locked =
                    Product::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $product->id,
                        );

                if (
                    $enabled
                    && ! $locked->isInventoryEligible()
                ) {
                    throw SafeValidationException::forField(
                        'inventory',
                        'inventory_tracking_products_only',
                    );
                }

                if (
                    ! $enabled
                    && $this->hasPhysicalStock(
                        $locked->id,
                    )
                ) {
                    throw SafeValidationException::forField(
                        'inventory',
                        'inventory_tracking_disable_stock_blocked',
                    );
                }

                $threshold =
                    $enabled
                    && $lowStockThreshold !==
                    null
                    ? InventoryQuantity::fromUnits(
                        InventoryQuantity::toUnits(
                            $lowStockThreshold,
                        ),
                    )
                    : null;

                $locked->track_inventory =
                    $enabled;

                $locked->low_stock_threshold =
                    $threshold;

                if ($locked->isDirty()) {
                    $locked->save();

                    ProductUpdated::dispatch(
                        $locked,
                    );

                    InventoryTrackingChanged::dispatch(
                        (int) $locked->organization_id,
                        $locked->id,
                        $enabled,
                        $threshold,
                        $actorId,
                    );
                }

                return $locked->refresh();
            },
            3,
        );
    }

    /**
     * Record initial stock for one Product/warehouse combination.
     *
     * Opening stock must be the first movement for that location so historical
     * meaning cannot later be rewritten.
     */
    public function recordOpeningStock(
        Product $product,
        int $warehouseId,
        string $quantity,
        ?string $note,
        int $actorId,
    ): InventoryBalance {
        $quantityUnits =
            InventoryQuantity::toUnits(
                $quantity,
            );

        if (
            $quantityUnits <= 0
        ) {
            throw SafeValidationException::forField(
                'inventory',
                'inventory_quantity_positive',
            );
        }

        return DB::transaction(
            function () use (
                $product,
                $warehouseId,
                $quantityUnits,
                $note,
                $actorId,
            ): InventoryBalance {
                $lockedProduct =
                    $this->lockTrackedProduct(
                        $product,
                    );

                $warehouse =
                    Warehouse::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $warehouseId,
                        );

                $hasHistory =
                    StockMovement::query()
                        ->where(
                            'product_id',
                            $lockedProduct->id,
                        )
                        ->where(
                            'warehouse_id',
                            $warehouse->id,
                        )
                        ->exists();

                if ($hasHistory) {
                    throw SafeValidationException::forField(
                        'inventory',
                        'opening_stock_history_blocked',
                    );
                }

                $balance =
                    $this->lockBalance(
                        $lockedProduct->id,
                        $warehouse->id,
                    );

                if (
                    InventoryQuantity::toUnits(
                        $balance->on_hand,
                    ) !== 0
                    || InventoryQuantity::toUnits(
                        $balance->reserved,
                    ) !== 0
                ) {
                    throw SafeValidationException::forField(
                        'inventory',
                        'opening_stock_history_blocked',
                    );
                }

                $formatted =
                    InventoryQuantity::fromUnits(
                        $quantityUnits,
                    );

                $balance->on_hand =
                    $formatted;

                $balance->save();

                $movement =
                    $this->createMovement(
                        $lockedProduct,
                        $warehouse,
                        StockMovementType::Opening,
                        $formatted,
                        $formatted,
                        $note,
                        $actorId,
                    );

                $this->dispatchBalanceChanged(
                    $lockedProduct,
                    $warehouse,
                    $movement,
                    '0.0000',
                    $formatted,
                    $actorId,
                );

                OpeningStockRecorded::dispatch(
                    (int) $lockedProduct->organization_id,
                    $lockedProduct->id,
                    $warehouse->id,
                    $movement->id,
                    $formatted,
                    $actorId,
                );

                return $balance->refresh();
            },
            3,
        );
    }

    /**
     * Apply a signed manual stock correction.
     *
     * Negative adjustments can never take on-hand stock below zero or below
     * already-reserved stock.
     */
    public function adjustStock(
        Product $product,
        int $warehouseId,
        string $quantity,
        ?string $note,
        int $actorId,
    ): InventoryBalance {
        $deltaUnits =
            InventoryQuantity::toUnits(
                $quantity,
            );

        if (
            $deltaUnits === 0
        ) {
            throw SafeValidationException::forField(
                'inventory',
                'inventory_adjustment_non_zero',
            );
        }

        return DB::transaction(
            function () use (
                $product,
                $warehouseId,
                $deltaUnits,
                $note,
                $actorId,
            ): InventoryBalance {
                $lockedProduct =
                    $this->lockTrackedProduct(
                        $product,
                    );

                $warehouse =
                    Warehouse::query()
                        ->lockForUpdate()
                        ->findOrFail(
                            $warehouseId,
                        );

                $balance =
                    $this->lockBalance(
                        $lockedProduct->id,
                        $warehouse->id,
                    );

                $onHand =
                    InventoryQuantity::toUnits(
                        $balance->on_hand,
                    );

                $reserved =
                    InventoryQuantity::toUnits(
                        $balance->reserved,
                    );

                $previousAvailable =
                    $onHand
                    - $reserved;

                $newOnHand =
                    $onHand
                    + $deltaUnits;

                if (
                    $newOnHand < 0
                ) {
                    throw SafeValidationException::forField(
                        'inventory',
                        'inventory_insufficient_stock',
                    );
                }

                if (
                    $newOnHand < $reserved
                ) {
                    throw SafeValidationException::forField(
                        'inventory',
                        'inventory_reserved_stock_blocked',
                    );
                }

                $balance->on_hand =
                    InventoryQuantity::fromUnits(
                        $newOnHand,
                    );

                $balance->save();

                $movement =
                    $this->createMovement(
                        $lockedProduct,
                        $warehouse,
                        StockMovementType::Adjustment,
                        InventoryQuantity::fromUnits(
                            $deltaUnits,
                        ),
                        InventoryQuantity::fromUnits(
                            $newOnHand,
                        ),
                        $note,
                        $actorId,
                    );

                $currentAvailable =
                    $newOnHand
                    - $reserved;

                $this->dispatchBalanceChanged(
                    $lockedProduct,
                    $warehouse,
                    $movement,
                    InventoryQuantity::fromUnits(
                        $previousAvailable,
                    ),
                    InventoryQuantity::fromUnits(
                        $currentAvailable,
                    ),
                    $actorId,
                );

                StockAdjusted::dispatch(
                    (int) $lockedProduct->organization_id,
                    $lockedProduct->id,
                    $warehouse->id,
                    $movement->id,
                    InventoryQuantity::fromUnits(
                        $deltaUnits,
                    ),
                    $actorId,
                );

                return $balance->refresh();
            },
            3,
        );
    }

    /**
     * Transfer physical stock atomically between two active warehouses.
     *
     * Both balance mutations and both audit movements live in one transaction,
     * so a transfer can never leave stock removed from one side only.
     */
    public function transferStock(
        Product $product,
        int $sourceWarehouseId,
        int $destinationWarehouseId,
        string $quantity,
        ?string $note,
        int $actorId,
    ): void {
        if (
            $sourceWarehouseId ===
            $destinationWarehouseId
        ) {
            throw SafeValidationException::forField(
                'inventory',
                'inventory_transfer_same_warehouse',
            );
        }

        $quantityUnits =
            InventoryQuantity::toUnits(
                $quantity,
            );

        if (
            $quantityUnits <= 0
        ) {
            throw SafeValidationException::forField(
                'inventory',
                'inventory_quantity_positive',
            );
        }

        DB::transaction(
            function () use (
                $product,
                $sourceWarehouseId,
                $destinationWarehouseId,
                $quantityUnits,
                $note,
                $actorId,
            ): void {
                $lockedProduct =
                    $this->lockTrackedProduct(
                        $product,
                    );

                $warehouses =
                    Warehouse::query()
                        ->whereIn(
                            'id',
                            [
                                $sourceWarehouseId,
                                $destinationWarehouseId,
                            ],
                        )
                        ->orderBy(
                            'id',
                        )
                        ->lockForUpdate()
                        ->get()
                        ->keyBy(
                            'id',
                        );

                if (
                    $warehouses->count() !==
                    2
                ) {
                    throw (
                        new ModelNotFoundException
                    )->setModel(
                        Warehouse::class,
                        [
                            $sourceWarehouseId,
                            $destinationWarehouseId,
                        ],
                    );
                }

                /** @var Warehouse $source */
                $source =
                    $warehouses[$sourceWarehouseId];

                /** @var Warehouse $destination */
                $destination =
                    $warehouses[$destinationWarehouseId];

                $sourceBalance =
                    $this->lockBalance(
                        $lockedProduct->id,
                        $source->id,
                    );

                $destinationBalance =
                    $this->lockBalance(
                        $lockedProduct->id,
                        $destination->id,
                    );

                $sourceOnHand =
                    InventoryQuantity::toUnits(
                        $sourceBalance->on_hand,
                    );

                $sourceReserved =
                    InventoryQuantity::toUnits(
                        $sourceBalance->reserved,
                    );

                $sourceAvailable =
                    $sourceOnHand
                    - $sourceReserved;

                if (
                    $sourceAvailable <
                    $quantityUnits
                ) {
                    throw SafeValidationException::forField(
                        'inventory',
                        'inventory_insufficient_stock',
                    );
                }

                $destinationOnHand =
                    InventoryQuantity::toUnits(
                        $destinationBalance->on_hand,
                    );

                $destinationReserved =
                    InventoryQuantity::toUnits(
                        $destinationBalance->reserved,
                    );

                $destinationAvailable =
                    $destinationOnHand
                    - $destinationReserved;

                $newSourceOnHand =
                    $sourceOnHand
                    - $quantityUnits;

                $newDestinationOnHand =
                    $destinationOnHand
                    + $quantityUnits;

                $sourceBalance->on_hand =
                    InventoryQuantity::fromUnits(
                        $newSourceOnHand,
                    );

                $destinationBalance->on_hand =
                    InventoryQuantity::fromUnits(
                        $newDestinationOnHand,
                    );

                $sourceBalance->save();

                $destinationBalance->save();

                $transferGroup =
                    (string) Str::uuid();

                $sourceMovement =
                    $this->createMovement(
                        $lockedProduct,
                        $source,
                        StockMovementType::TransferOut,
                        InventoryQuantity::fromUnits(
                            -$quantityUnits,
                        ),
                        InventoryQuantity::fromUnits(
                            $newSourceOnHand,
                        ),
                        $note,
                        $actorId,
                        $transferGroup,
                    );

                $destinationMovement =
                    $this->createMovement(
                        $lockedProduct,
                        $destination,
                        StockMovementType::TransferIn,
                        InventoryQuantity::fromUnits(
                            $quantityUnits,
                        ),
                        InventoryQuantity::fromUnits(
                            $newDestinationOnHand,
                        ),
                        $note,
                        $actorId,
                        $transferGroup,
                    );

                $this->dispatchBalanceChanged(
                    $lockedProduct,
                    $source,
                    $sourceMovement,
                    InventoryQuantity::fromUnits(
                        $sourceAvailable,
                    ),
                    InventoryQuantity::fromUnits(
                        $newSourceOnHand
                            - $sourceReserved,
                    ),
                    $actorId,
                );

                $this->dispatchBalanceChanged(
                    $lockedProduct,
                    $destination,
                    $destinationMovement,
                    InventoryQuantity::fromUnits(
                        $destinationAvailable,
                    ),
                    InventoryQuantity::fromUnits(
                        $newDestinationOnHand
                            - $destinationReserved,
                    ),
                    $actorId,
                );

                StockTransferred::dispatch(
                    (int) $lockedProduct->organization_id,
                    $lockedProduct->id,
                    $source->id,
                    $destination->id,
                    InventoryQuantity::fromUnits(
                        $quantityUnits,
                    ),
                    $transferGroup,
                    $actorId,
                );
            },
            3,
        );
    }

    /**
     * Return an active Product locked for stock mutation and verify tracking.
     */
    private function lockTrackedProduct(
        Product $product,
    ): Product {
        $locked =
            Product::query()
                ->lockForUpdate()
                ->findOrFail(
                    $product->id,
                );

        if (
            ! $locked->tracksInventory()
        ) {
            throw SafeValidationException::forField(
                'inventory',
                'inventory_not_tracked',
            );
        }

        return $locked;
    }

    /**
     * Return or create one Product/warehouse balance.
     *
     * Product-level locking serializes stock mutations for the same Product,
     * preventing duplicate balance creation races.
     */
    private function lockBalance(
        int $productId,
        int $warehouseId,
    ): InventoryBalance {
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
                ->first();

        if ($balance) {
            return $balance;
        }

        return InventoryBalance::create([
            'product_id' => $productId,

            'warehouse_id' => $warehouseId,

            'on_hand' => '0.0000',

            'reserved' => '0.0000',
        ]);
    }

    /**
     * Persist one immutable stock movement.
     */
    private function createMovement(
        Product $product,
        Warehouse $warehouse,
        StockMovementType $type,
        string $quantity,
        string $balanceAfter,
        ?string $note,
        int $actorId,
        ?string $transferGroupUuid = null,
    ): StockMovement {
        return StockMovement::create([
            'warehouse_id' => $warehouse->id,

            'product_id' => $product->id,

            'created_by' => $actorId,

            'type' => $type,

            'quantity' => $quantity,

            'balance_after' => $balanceAfter,

            'transfer_group_uuid' => $transferGroupUuid,

            'note' => $note,
        ]);
    }

    /**
     * Dispatch the generic committed balance-change event consumed by stock
     * alert listeners.
     */
    private function dispatchBalanceChanged(
        Product $product,
        Warehouse $warehouse,
        StockMovement $movement,
        string $previousAvailable,
        string $currentAvailable,
        int $actorId,
    ): void {
        StockMovementRecorded::dispatch(
            (int) $product->organization_id,
            $product->id,
            $warehouse->id,
            $movement->id,
            $movement->type->value,
            $previousAvailable,
            $currentAvailable,
            $product->low_stock_threshold,
            $actorId,
        );
    }

    /**
     * Determine whether a Product still carries physical or reserved stock.
     */
    private function hasPhysicalStock(
        int $productId,
    ): bool {
        return InventoryBalance::query()
            ->where(
                'product_id',
                $productId,
            )
            ->where(
                function (
                    $query,
                ): void {
                    $query
                        ->where(
                            'on_hand',
                            '!=',
                            0,
                        )
                        ->orWhere(
                            'reserved',
                            '!=',
                            0,
                        );
                },
            )
            ->exists();
    }
}
