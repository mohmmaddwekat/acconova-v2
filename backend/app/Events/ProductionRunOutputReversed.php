<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ProductionRunOutputReversed implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent one Product output being reversed independently.
     */
    public function __construct(
        public int $organizationId,
        public int $productionRunId,
        public int $productionRunOutputId,
        public int $productId,
        public string $reason,
        public int $actorId,
    ) {}
}
