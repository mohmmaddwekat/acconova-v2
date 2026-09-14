<?php

namespace App\Events;

use App\Enums\OrganizationRole;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class MembershipRemoved implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /**
     * Preserve a snapshot of the removed membership so future asynchronous
     * listeners never depend on a database row that no longer exists.
     */
    public function __construct(
        public int $organizationId,
        public int $membershipId,
        public int $memberUserId,
        public OrganizationRole $role,
        public int $actorUserId,
    ) {}
}
