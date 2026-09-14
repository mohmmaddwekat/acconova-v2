<?php

namespace App\Actions\Parties;

use App\Events\PartyDeleted;
use App\Models\Party;
use Illuminate\Support\Facades\DB;

class DeleteParty
{
    /**
     * Soft-delete one Party while preserving its roles and historical
     * business relationships for possible restoration.
     */
    public function execute(Party $party): void
    {
        DB::transaction(function () use ($party): void {
            $record = Party::query()
                ->lockForUpdate()
                ->findOrFail($party->id);

            $organizationId = (int) $record->organization_id;
            $partyId = $record->id;

            $record->delete();

            PartyDeleted::dispatch(
                $organizationId,
                $partyId,
            );
        });
    }
}
