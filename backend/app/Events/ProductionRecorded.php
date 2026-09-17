<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ProductionRecorded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a successfully committed Production output.
     *
     * Recipe metadata is nullable because Actual Consumption can be recorded
     * without configuring a Recipe first.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $productionMovementId,
        public ?int $recipeId,
        public ?int $recipeVersion,
        public int $actorId,
    ) {}
}
