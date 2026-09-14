<?php

namespace App\Events;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrganizationCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    /**
     * Carry the newly created organization and the user who became its owner.
     */
    public function __construct(
        public Organization $organization,
        public User $owner,
    ) {}
}
