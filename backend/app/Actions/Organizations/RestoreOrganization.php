<?php

namespace App\Actions\Organizations;

use App\Events\OrganizationRestored;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class RestoreOrganization
{
    /**
     * Restore a previously soft-deleted organization and all of its preserved
     * tenant relationships without recreating business data.
     */
    public function execute(
        User $actor,
        Organization $organization,
    ): Organization {
        return DB::transaction(function () use ($actor, $organization): Organization {
            $organization->restore();
            $organization->refresh();

            OrganizationRestored::dispatch($organization, $actor);

            return $organization;
        });
    }
}
