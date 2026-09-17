<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ProductionRecipeActivated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a committed production recipe version becoming active.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public int $recipeId,
        public int $version,
        public int $actorId,
    ) {}
}
