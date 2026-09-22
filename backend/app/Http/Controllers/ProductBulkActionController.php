<?php

namespace App\Http\Controllers;

use App\Actions\Products\BulkProductAction;
use App\Http\Requests\BulkProductActionRequest;
use App\Models\Product;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ProductBulkActionController extends Controller
{
    /**
     * Authorize every selected Product before applying one atomic lifecycle
     * operation.
     */
    public function __invoke(
        BulkProductActionRequest $request,
        BulkProductAction $bulkProductAction,
    ): JsonResponse {
        $action =
            $request->validated(
                'action',
            );

        $products =
            $request->products();

        $ability =
            $action === 'restore'
            ? 'restore'
            : 'delete';

        $products->each(
            /**
             * Authorize the entire selection before mutating the first record.
             */
            function (
                Product $product,
            ) use (
                $ability,
            ): void {
                Gate::authorize(
                    $ability,
                    $product,
                );
            },
        );

        $affected =
            $bulkProductAction->execute(
                $products,
                $action,
            );

        DB::table('bulk_action_history')
            ->insert([
                'organization_id' => app(TenantContext::class)->id(),
                'user_id' => $request->user()->id,
                'entity_type' => 'product',
                'action' => 'bulk_'.$action,
                'record_count' => $affected,
                'record_ids' => json_encode(
                    $products
                        ->pluck('id')
                        ->map(
                            fn ($id): int => (int) $id,
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
