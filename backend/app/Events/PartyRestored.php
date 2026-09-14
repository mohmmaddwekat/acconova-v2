<?php

namespace App\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class PartyRestored implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a previously archived Party successfully restored.
     */
    public function __construct(
        public int $organizationId,
        public int $partyId,
    ) {}
}
