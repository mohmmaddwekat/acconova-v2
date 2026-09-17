<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ProductionRunReversed implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a committed compensating reversal of a production run.
     */
    public function __construct(
        public int $organizationId,
        public int $productionRunId,
        public string $runNumber,
        public string $reason,
        public int $actorId,
    ) {}
}
