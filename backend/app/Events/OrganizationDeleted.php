<?php

namespace App\Events;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrganizationDeleted implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    /**
     * Represent a successfully committed organization soft deletion.
     */
    public function __construct(
        public Organization $organization,
        public User $actor,
    ) {}
}
