<?php

namespace App\Http\Controllers;

use App\Enums\ProductType;
use App\Http\Requests\ShowWarehouseInventoryRequest;
use App\Models\InventoryBalance;
use App\Models\Product;
use App\Support\InventoryQuantity;
use Illuminate\Http\JsonResponse;

class WarehouseInventoryController extends Controller
{
    /**
     * Return physical Products and their balance inside one warehouse.
     *
     * Search remains server-side and results are bounded so a large catalog
     * does not turn the Show drawer into an unbounded payload.
     */
    public function __invoke(
        ShowWarehouseInventoryRequest $request,
    ): JsonResponse {
        $warehouse =
            $request->warehouse();

        $search =
            $request->validated()['search'] ?? null;

        $query =
            Product::query()
                ->where(
                    'type',
                    ProductType::Product->value,
                );

        if ($search) {
            $terms =
                preg_split(
                    '/\s+/u',
                    trim(
                        $search,
                    ),
                ) ?: [];

            foreach (
                $terms as $term
            ) {
                $query->where(
                    function (
                        $termQuery,
                    ) use (
                        $term,
                    ): void {
                        $like =
                            '%'.$term.'%';

                        $termQuery
                            ->where(
                                'name',
                                'like',
                                $like,
                            )
                            ->orWhere(
                                'sku',
                                'like',
                                $like,
                            );
                    },
                );
            }
        }

        $total =
            (clone $query)
                ->count();

        $products =
            $query
                ->orderBy(
                    'name',
                )
                ->limit(
                    100,
                )
                ->get();

        $balances =
            InventoryBalance::query()
                ->where(
                    'warehouse_id',
                    $warehouse->id,
                )
                ->whereIn(
                    'product_id',
                    $products->pluck(
                        'id',
                    ),
                )
                ->get()
                ->keyBy(
                    'product_id',
                );

        $rows =
            $products->map(
                function (
                    Product $product,
                ) use (
                    $balances,
                ): array {
                    /** @var InventoryBalance|null $balance */
                    $balance =
                        $balances->get(
                            $product->id,
                        );

                    $onHand =
                        $balance
                        ? InventoryQuantity::toUnits(
                            $balance->on_hand,
                        )
                        : 0;

                    $reserved =
                        $balance
                        ? InventoryQuantity::toUnits(
                            $balance->reserved,
                        )
                        : 0;

                    return [
                        'id' => $product->id,

                        'name' => $product->name,

                        'sku' => $product->sku,

                        'unit' => $product->unit,

                        'track_inventory' => (bool) $product->track_inventory,

                        'low_stock_threshold' => $product->low_stock_threshold,

                        'on_hand' => InventoryQuantity::fromUnits(
                            $onHand,
                        ),

                        'reserved' => InventoryQuantity::fromUnits(
                            $reserved,
                        ),

                        'available' => InventoryQuantity::fromUnits(
                            $onHand
                                - $reserved,
                        ),
                    ];
                },
            )
                ->values();

        return response()->json([
            'data' => [
                'warehouse' => [
                    'id' => $warehouse->id,

                    'code' => $warehouse->code,

                    'name' => $warehouse->name,

                    'is_default' => (bool) $warehouse->is_default,

                    'deleted_at' => $warehouse->deleted_at,
                ],

                'products' => $rows,

                'total' => $total,
            ],
        ]);
    }
}
