<?php

namespace App\Actions\Parties;

use App\Events\PartyCreated;
use App\Models\Party;
use Illuminate\Support\Facades\DB;

class CreateParty
{
    /**
     * Create one Party for the current organization and attach all
     * validated customer/supplier roles in one atomic transaction.
     *
     * If any part of the operation fails, no partial Party data remains.
     *
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data): Party
    {
        return DB::transaction(function () use ($data): Party {
            $roles = $data['roles'];

            unset($data['roles']);

            $party = Party::create($data);

            foreach ($roles as $role) {
                $party->roles()->create([
                    'role' => $role,
                ]);
            }

            /*
             * Announce the business event only after the Party and all roles
             * have been prepared successfully. PartyCreated itself waits for
             * the database transaction to commit before it is dispatched.
             */
            PartyCreated::dispatch($party);

            return $party->load('roles');
        });
    }
}
