<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class InventoryTrackingChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a committed change to Product inventory-tracking settings.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public bool $enabled,
        public ?string $lowStockThreshold,
        public int $actorId,
    ) {}
}
