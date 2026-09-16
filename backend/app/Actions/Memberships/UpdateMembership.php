<?php

namespace App\Actions\Memberships;

use App\Events\MembershipRoleChanged;
use App\Models\Membership;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class UpdateMembership
{
    /**
     * Change a membership role under a database lock and emit an event only
     * when the stored role actually changes.
     *
     * @param  array{role: string}  $data
     */
    public function execute(
        User $actor,
        Membership $membership,
        array $data,
    ): Membership {
        return DB::transaction(function () use (
            $actor,
            $membership,
            $data,
        ): Membership {
            $record = Membership::query()
                ->lockForUpdate()
                ->findOrFail($membership->id);

            $previousRole = $record->role;

            $record->workspace_role_id = null;
            $record->update($data);
            $record->refresh();

            if ($previousRole !== $record->role) {
                MembershipRoleChanged::dispatch(
                    (int) $record->organization_id,
                    $record->id,
                    $record->user_id,
                    $previousRole,
                    $record->role,
                    $actor->id,
                );
            }

            return $record->load(
                'user:id,name,email',
            );
        });
    }
}
