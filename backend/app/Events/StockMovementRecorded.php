<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class StockMovementRecorded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent one successfully committed balance-changing stock movement.
     *
     * Previous/current available quantities allow listeners to detect state
     * transitions without re-reading mutable stock state later.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $warehouseId,
        public int $movementId,
        public string $movementType,
        public string $previousAvailable,
        public string $currentAvailable,
        public ?string $lowStockThreshold,
        public int $actorId,
    ) {}
}
