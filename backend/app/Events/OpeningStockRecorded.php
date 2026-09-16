<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class OpeningStockRecorded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent committed opening stock for one Product and warehouse.
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
