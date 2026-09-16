<?php

namespace App\Http\Controllers;

use App\Enums\ProductType;
use App\Http\Resources\StockMovementResource;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryOverviewController extends Controller
{
    /**
     * Return a tenant-scoped Inventory operating summary.
     */
    public function __invoke(
        Request $request,
    ): JsonResponse {
        abort_unless(
            $request->user()?->can(
                'viewAny',
                Warehouse::class,
            ) ?? false,
            403,
        );

        $organizationId =
            app(
                TenantContext::class,
            )->id();

        /*
         * Available stock is deliberately calculated from persisted warehouse
         * balances rather than a duplicated Product.quantity column.
         */
        $availableStockSql =
            '(SELECT COALESCE(SUM(inventory_balances.on_hand - inventory_balances.reserved), 0)
              FROM inventory_balances
              WHERE inventory_balances.organization_id = products.organization_id
                AND inventory_balances.product_id = products.id)';

        $trackedProducts =
            Product::query()
                ->where(
                    'type',
                    ProductType::Product->value,
                )
                ->where(
                    'track_inventory',
                    true,
                );

        $trackedCount =
            (clone $trackedProducts)
                ->count();

        $outOfStockCount =
            (clone $trackedProducts)
                ->whereRaw(
                    $availableStockSql
                        .' <= 0',
                )
                ->count();

        $lowStockCount =
            (clone $trackedProducts)
                ->whereNotNull(
                    'low_stock_threshold',
                )
                ->where(
                    'low_stock_threshold',
                    '>',
                    0,
                )
                ->whereRaw(
                    $availableStockSql
                        .' > 0 AND '
                        .$availableStockSql
                        .' <= products.low_stock_threshold',
                )
                ->count();

        $inventoryValue =
            DB::table(
                'inventory_balances as balances',
            )
                ->join(
                    'products',
                    'products.id',
                    '=',
                    'balances.product_id',
                )
                ->where(
                    'balances.organization_id',
                    $organizationId,
                )
                ->where(
                    'products.organization_id',
                    $organizationId,
                )
                ->whereNull(
                    'products.deleted_at',
                )
                ->where(
                    'products.track_inventory',
                    true,
                )
                ->selectRaw(
                    'COALESCE(SUM(balances.on_hand * COALESCE(products.cost_price, 0)), 0) AS inventory_value',
                )
                ->value(
                    'inventory_value',
                );

        $recentMovements =
            StockMovement::query()
                ->with([
                    'product:id,name,sku',
                    'warehouse:id,code,name',
                ])
                ->latest()
                ->limit(
                    10,
                )
                ->get();

        return response()->json([
            'data' => [
                'metrics' => [
                    'active_warehouses' => Warehouse::query()
                        ->count(),

                    'archived_warehouses' => Warehouse::query()
                        ->onlyTrashed()
                        ->count(),

                    'tracked_products' => $trackedCount,

                    'low_stock_products' => $lowStockCount,

                    'out_of_stock_products' => $outOfStockCount,

                    'inventory_value' => number_format(
                        (float) (
                            $inventoryValue
                            ?? 0
                        ),
                        4,
                        '.',
                        '',
                    ),
                ],

                'recent_movements' => StockMovementResource::collection(
                    $recentMovements,
                )->resolve(),
            ],
        ]);
    }
}
