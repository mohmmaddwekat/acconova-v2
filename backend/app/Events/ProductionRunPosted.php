<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ProductionRunPosted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent one production run committed successfully to Inventory.
     */
    public function __construct(
        public int $organizationId,
        public int $productionRunId,
        public string $runNumber,
        public int $outputCount,
        public int $actorId,
    ) {}
}
