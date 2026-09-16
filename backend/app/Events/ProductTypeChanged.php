<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ProductTypeChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a committed catalog type transition.
     *
     * Primitive identifiers keep future notification, activity, webhook, and
     * analytics listeners independent from mutable Eloquent model state.
     */
    public function __construct(
        public int $organizationId,
        public int $productId,
        public string $previousType,
        public string $currentType,
        public ?int $actorId,
    ) {}
}
