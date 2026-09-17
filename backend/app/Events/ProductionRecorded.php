<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ProductionRecorded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a successfully committed production batch.
     *
     * This event is the future hook for notifications, activity feeds,
     * reporting, webhooks, and production analytics.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $productionMovementId,
        public int $recipeId,
        public int $recipeVersion,
        public int $actorId,
    ) {}
}
