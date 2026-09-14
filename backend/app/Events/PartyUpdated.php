<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class PartyUpdated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a previously archived Party successfully updated.
     */
    public function __construct(
        public int $organizationId,
        public int $partyId,
    ) {}
}
