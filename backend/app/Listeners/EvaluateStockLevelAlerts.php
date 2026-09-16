<?php

namespace App\Listeners;

use App\Events\LowStockReached;
use App\Events\OutOfStockReached;
use App\Events\StockMovementRecorded;
use App\Support\InventoryQuantity;

class EvaluateStockLevelAlerts
{
    /**
     * Turn committed stock-balance transitions into higher-level business
     * events suitable for notifications, automations, and webhooks.
     */
    public function handle(
        StockMovementRecorded $event,
    ): void {
        $previous =
            InventoryQuantity::toUnits(
                $event->previousAvailable,
            );

        $current =
            InventoryQuantity::toUnits(
                $event->currentAvailable,
            );

        if (
            $previous > 0
            && $current <= 0
        ) {
            OutOfStockReached::dispatch(
                $event->organizationId,
                $event->productId,
                $event->warehouseId,
            );

            return;
        }

        if (
            $event->lowStockThreshold ===
            null
        ) {
            return;
        }

        $threshold =
            InventoryQuantity::toUnits(
                $event->lowStockThreshold,
            );

        if (
            $threshold <= 0
            || $current <= 0
            || $current > $threshold
        ) {
            return;
        }

        /*
         * Fire only when entering the low-stock zone, including a restock from
         * zero into a quantity that is still below the configured threshold.
         */
        if (
            $previous <= 0
            || $previous > $threshold
        ) {
            LowStockReached::dispatch(
                $event->organizationId,
                $event->productId,
                $event->warehouseId,
                InventoryQuantity::fromUnits(
                    $current,
                ),
                InventoryQuantity::fromUnits(
                    $threshold,
                ),
            );
        }
    }
}
