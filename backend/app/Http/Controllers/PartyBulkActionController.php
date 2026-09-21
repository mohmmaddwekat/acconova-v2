<?php

namespace App\Http\Controllers;

use App\Actions\Parties\BulkPartyAction;
use App\Http\Requests\BulkPartyActionRequest;
use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
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

        DB::table('bulk_action_history')
            ->insert([
                'organization_id' =>
                    app(TenantContext::class)->id(),
                'user_id' =>
                    $request->user()->id,
                'entity_type' => 'party',
                'action' => 'bulk_'.$action,
                'record_count' => $affected,
                'record_ids' => json_encode(
                    $parties
                        ->pluck('id')
                        ->map(
                            fn ($id): int =>
                                (int) $id,
                        )
                        ->values()
                        ->all(),
                    JSON_THROW_ON_ERROR,
                ),
                'changes' => null,
                'created_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'action' => $action,

                'affected' => $affected,
            ],
        ]);
    }
}
