<?php

namespace App\Events;

use App\Enums\OrganizationRole;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class MembershipRoleChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Represent a committed membership role change with both the previous
     * and new role preserved for future audit or automation use.
     */
    public function __construct(
        public int $organizationId,
        public int $membershipId,
        public int $memberUserId,
        public OrganizationRole $previousRole,
        public OrganizationRole $newRole,
        public int $actorUserId,
    ) {}
}
