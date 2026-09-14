<?php

namespace App\Events;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrganizationUpdated implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    /**
     * Carry the updated organization and the user who performed the change.
     */
    public function __construct(
        public Organization $organization,
        public User $actor,
    ) {}
}
