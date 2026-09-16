<?php

namespace App\Http\Controllers;

use App\Actions\Parties\ForceDeleteParty;
use App\Http\Requests\ForceDeletePartyRequest;
use Illuminate\Http\Response;

class PartyPermanentDeletionController extends Controller
{
    /**
     * Permanently remove one authorized archived Party.
     */
    public function __invoke(
        ForceDeletePartyRequest $request,
        ForceDeleteParty $forceDeleteParty,
    ): Response {
        $forceDeleteParty->execute(
            $request->party(),
        );

        return response()
            ->noContent();
    }
}
