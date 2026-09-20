<?php

namespace App\Services;

use App\Enums\StockMovementType;
use App\Events\StockMovementRecorded;
use App\Exceptions\SafeValidationException;
use App\Models\FinancialDocument;
use App\Models\InventoryBalance;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Support\InventoryQuantity;
use Illuminate\Support\Facades\DB;

class FinanceInventoryService
{
    public function applyDocumentDelta(
        ?FinancialDocument $previous,
        ?FinancialDocument $next,
        int $actorId,
        int $referenceDocumentId,
    ): void {
        $previousMap = $this->effectMap($previous);
        $nextMap = $this->effectMap($next);
        $keys = array_values(array_unique(array_merge(array_keys($previousMap), array_keys($nextMap))));

        if ($keys === []) {
            return;
        }

        $productIds = [];
        $warehouseIds = [];

        foreach ($keys as $key) {
            [$productId, $warehouseId] = array_map('intval', explode(':', $key));
            $productIds[] = $productId;
            $warehouseIds[] = $warehouseId;
        }

        $products = Product::query()
            ->whereIn('id', array_values(array_unique($productIds)))
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        $warehouses = Warehouse::query()
            ->whereIn('id', array_values(array_unique($warehouseIds)))
            ->orderBy('id')
            ->lockForUpdate()
            ->get()
            ->keyBy('id');

        foreach ($keys as $key) {
            [$productId, $warehouseId] = array_map('intval', explode(':', $key));
            $delta = ($nextMap[$key] ?? 0) - ($previousMap[$key] ?? 0);

            if ($delta === 0) {
                continue;
            }

            /** @var Product|null $product */
            $product = $products->get($productId);
            /** @var Warehouse|null $warehouse */
            $warehouse = $warehouses->get($warehouseId);

            abort_unless($product && $warehouse, 404);

            if (! $product->tracksInventory()) {
                throw SafeValidationException::forField('inventory', 'inventory_not_tracked');
            }

            $balance = InventoryBalance::query()
                ->where('product_id', $product->id)
                ->where('warehouse_id', $warehouse->id)
                ->lockForUpdate()
                ->first();

            if (! $balance) {
                $balance = InventoryBalance::create([
                    'product_id' => $product->id,
                    'warehouse_id' => $warehouse->id,
                    'on_hand' => '0.0000',
                    'reserved' => '0.0000',
                ]);
            }

            $onHand = InventoryQuantity::toUnits($balance->on_hand);
            $reserved = InventoryQuantity::toUnits($balance->reserved);
            $availableBefore = $onHand - $reserved;
            $newOnHand = $onHand + $delta;

            if ($newOnHand < 0 || $newOnHand < $reserved) {
                throw SafeValidationException::forField('inventory', 'inventory_insufficient_stock');
            }

            $balance->on_hand = InventoryQuantity::fromUnits($newOnHand);
            $balance->save();

            $type = $this->movementType($previous, $next, $delta);

            $movement = StockMovement::create([
                'warehouse_id' => $warehouse->id,
                'product_id' => $product->id,
                'created_by' => $actorId,
                'type' => $type,
                'quantity' => InventoryQuantity::fromUnits($delta),
                'balance_after' => InventoryQuantity::fromUnits($newOnHand),
                'reference_type' => 'financial_document',
                'reference_id' => $referenceDocumentId,
                'note' => 'Finance document inventory effect',
            ]);

            StockMovementRecorded::dispatch(
                (int) $product->organization_id,
                $product->id,
                $warehouse->id,
                $movement->id,
                $type->value,
                InventoryQuantity::fromUnits($availableBefore),
                InventoryQuantity::fromUnits($newOnHand - $reserved),
                $product->low_stock_threshold,
                $actorId,
            );
        }
    }

    /** @return array<string, int> */
    private function effectMap(?FinancialDocument $document): array
    {
        if (! $document || ! in_array($document->status, ['draft', 'issued', 'partially_paid', 'paid', 'overpaid'], true)) {
            return [];
        }

        $document->loadMissing('lines');
        $multiplier = $document->isSale() ? -1 : 1;
        $map = [];

        foreach ($document->lines as $line) {
            if (! $line->affects_inventory || ! $line->product_id || ! $line->warehouse_id) {
                continue;
            }

            $key = $line->product_id.':'.$line->warehouse_id;
            $map[$key] = ($map[$key] ?? 0)
                + ($multiplier * InventoryQuantity::toUnits($line->quantity));
        }

        return $map;
    }

    private function movementType(
        ?FinancialDocument $previous,
        ?FinancialDocument $next,
        int $delta,
    ): StockMovementType {
        $kind = $next?->kind ?? $previous?->kind;

        if ($kind === 'sale_invoice') {
            return $delta < 0
                ? StockMovementType::Sale
                : StockMovementType::CustomerReturn;
        }

        return $delta > 0
            ? StockMovementType::Purchase
            : StockMovementType::SupplierReturn;
    }
}
