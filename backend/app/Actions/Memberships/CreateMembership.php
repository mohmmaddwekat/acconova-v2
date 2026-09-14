<?php

namespace App\Actions\Memberships;

use App\Events\MembershipAdded;
use App\Models\Membership;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CreateMembership
{
    /**
     * Add one user to the active organization and announce the committed
     * membership creation.
     *
     * @param  array{user_id: int, role: string}  $data
     */
    public function execute(User $actor, array $data): Membership
    {
        return DB::transaction(function () use ($actor, $data): Membership {
            $membership = Membership::create($data);

            MembershipAdded::dispatch(
                (int) $membership->organization_id,
                $membership->id,
                $membership->user_id,
                $membership->role,
                $actor->id,
            );

            return $membership->load(
                'user:id,name,email',
            );
        });
    }
}
