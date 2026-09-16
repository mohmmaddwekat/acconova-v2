<?php

namespace App\Http\Controllers;

use App\Actions\Products\BulkProductAction;
use App\Http\Requests\BulkProductActionRequest;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
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

        return response()->json([
            'data' => [
                'action' => $action,

                'affected' => $affected,
            ],
        ]);
    }
}
