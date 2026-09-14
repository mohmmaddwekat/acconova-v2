<?php

namespace App\Actions\Organizations;

use App\Events\OrganizationUpdated;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class UpdateOrganization
{
    /**
     * Update an organization atomically and announce the committed change.
     *
     * @param  array{name: string}  $data
     */
    public function execute(
        User $actor,
        Organization $organization,
        array $data,
    ): Organization {
        return DB::transaction(function () use ($actor, $organization, $data): Organization {
            $organization->update($data);
            $organization->refresh();

            /*
             * ShouldDispatchAfterCommit prevents downstream listeners from
             * reacting until the database change is safely committed.
             */
            OrganizationUpdated::dispatch($organization, $actor);

            return $organization;
        });
    }
}
