<?php

namespace App\Events;

use App\Models\Party;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class PartyCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    /**
     * Represent the fact that a Party was successfully created.
     *
     * The event is dispatched only after the surrounding database
     * transaction commits successfully.
     */
    public function __construct(
        public Party $party,
    ) {}
}
