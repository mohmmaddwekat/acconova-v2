<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class LowStockReached implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a Product crossing into its configured low-stock range.
     *
     * Future notification, webhook, and business-signal listeners can attach
     * here without changing stock transaction code.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $warehouseId,
        public string $available,
        public string $threshold,
    ) {}
}
