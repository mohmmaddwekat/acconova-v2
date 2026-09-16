<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class StockAdjusted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent one committed manual stock correction.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $warehouseId,
        public int $movementId,
        public string $quantity,
        public int $actorId,
    ) {}
}
