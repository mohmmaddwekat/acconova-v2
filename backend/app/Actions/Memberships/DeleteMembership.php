<?php

namespace App\Actions\Memberships;

use App\Events\MembershipRemoved;
use App\Models\Membership;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class DeleteMembership
{
    /**
     * Permanently remove a non-Owner membership while preserving an immutable
     * event snapshot of what was removed.
     */
    public function execute(
        User $actor,
        Membership $membership,
    ): void {
        DB::transaction(function () use ($actor, $membership): void {
            $record = Membership::query()
                ->lockForUpdate()
                ->findOrFail($membership->id);

            $organizationId = (int) $record->organization_id;
            $membershipId = $record->id;
            $memberUserId = $record->user_id;
            $role = $record->role;

            $record->delete();

            MembershipRemoved::dispatch(
                $organizationId,
                $membershipId,
                $memberUserId,
                $role,
                $actor->id,
            );
        });
    }
}
