<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class OutOfStockReached implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a Product crossing from available stock into zero stock.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $warehouseId,
    ) {}
}
