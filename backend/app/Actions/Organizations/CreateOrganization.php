<?php

namespace App\Actions\Organizations;

use App\Enums\OrganizationRole;
use App\Events\OrganizationCreated;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CreateOrganization
{
    /**
     * Create an organization and its immutable owner membership atomically.
     *
     * Either both records are committed or neither record remains.
     *
     * @param  array{name: string}  $data
     */
    public function execute(User $owner, array $data): Organization
    {
        return DB::transaction(function () use ($owner, $data): Organization {
            $organization = Organization::create($data);

            $organization->users()->attach($owner->id, [
                'role' => OrganizationRole::Owner->value,
            ]);

            /*
             * The event implements ShouldDispatchAfterCommit, so listeners
             * never observe an organization whose transaction was rolled back.
             */
            OrganizationCreated::dispatch($organization, $owner);

            return $organization;
        });
    }
}
