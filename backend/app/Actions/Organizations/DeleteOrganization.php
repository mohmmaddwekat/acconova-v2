<?php

namespace App\Actions\Organizations;

use App\Events\OrganizationDeleted;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class DeleteOrganization
{
    /**
     * Soft-delete an organization while preserving all tenant-owned data
     * so it may be safely restored later.
     */
    public function execute(
        User $actor,
        Organization $organization,
    ): void {
        DB::transaction(function () use ($actor, $organization): void {
            $organization->delete();

            /*
             * The event is emitted only after the soft delete commits,
             * preventing downstream consumers from seeing rolled-back state.
             */
            OrganizationDeleted::dispatch($organization, $actor);
        });
    }
}
