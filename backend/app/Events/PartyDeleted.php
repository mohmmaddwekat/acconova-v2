<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class PartyDeleted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a Party successfully moved into soft-deleted state.
     */
    public function __construct(
        public int $organizationId,
        public int $partyId,
    ) {}
}
