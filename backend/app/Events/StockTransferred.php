<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class StockTransferred implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent one committed warehouse-to-warehouse stock transfer.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $sourceWarehouseId,
        public int $destinationWarehouseId,
        public string $quantity,
        public string $transferGroupUuid,
        public int $actorId,
    ) {}
}
