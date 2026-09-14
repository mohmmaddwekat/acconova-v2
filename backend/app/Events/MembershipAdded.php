<?php

namespace App\Events;

use App\Enums\OrganizationRole;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class MembershipAdded implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a member successfully added to an organization.
     */
    public function __construct(
        public int $organizationId,
        public int $membershipId,
        public int $memberUserId,
        public OrganizationRole $role,
        public int $actorUserId,
    ) {}
}
