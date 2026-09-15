<?php

namespace App\Http\Controllers;

use App\Actions\Parties\BulkPartyAction;
use App\Http\Requests\BulkPartyActionRequest;
use App\Models\Party;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class PartyBulkActionController extends Controller
{
    /**
     * Authorize every selected Party and execute one atomic bulk lifecycle
     * operation.
     */
    public function __invoke(
        BulkPartyActionRequest $request,
        BulkPartyAction $bulkPartyAction,
    ): JsonResponse {
        $action =
            $request->validated(
                'action',
            );

        $parties =
            $request->parties();

        $ability =
            $action === 'restore'
            ? 'restore'
            : 'delete';

        $parties->each(
            /**
             * Authorize every selected record before mutating any of them.
             */
            function (
                Party $party,
            ) use (
                $ability,
            ): void {
                Gate::authorize(
                    $ability,
                    $party,
                );
            },
        );

        $affected =
            $bulkPartyAction->execute(
                $parties,
                $action,
            );

        return response()->json([
            'data' => [
                'action' => $action,

                'affected' => $affected,
            ],
        ]);
    }
}
