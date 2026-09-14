<?php

namespace App\Actions\Parties;

use App\Events\PartyRestored;
use App\Models\Party;
use Illuminate\Support\Facades\DB;

class RestoreParty
{
    /**
     * Restore one soft-deleted Party and return its preserved customer or
     * supplier roles.
     */
    public function execute(Party $party): Party
    {
        return DB::transaction(function () use ($party): Party {
            $record = Party::onlyTrashed()
                ->lockForUpdate()
                ->findOrFail($party->id);

            $record->restore();

            PartyRestored::dispatch(
                (int) $record->organization_id,
                $record->id,
            );

            return $record
                ->refresh()
                ->load('roles');
        });
    }
}
