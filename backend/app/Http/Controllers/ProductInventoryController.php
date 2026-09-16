<?php

namespace App\Http\Controllers;

use App\Http\Requests\AdjustStockRequest;
use App\Http\Requests\RecordOpeningStockRequest;
use App\Http\Requests\ShowInventoryProductRequest;
use App\Http\Requests\TransferStockRequest;
use App\Http\Requests\UpdateInventorySettingsRequest;
use App\Http\Resources\StockMovementResource;
use App\Models\InventoryBalance;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Services\InventoryStockService;
use App\Support\InventoryQuantity;
use Illuminate\Http\JsonResponse;

class ProductInventoryController extends Controller
{
    /**
     * Return one Product's live warehouse balances and stock history.
     */
    public function show(
        ShowInventoryProductRequest $request,
    ): JsonResponse {
        return response()->json([
            'data' => $this->detail(
                $request->product(),
            ),
        ]);
    }

    /**
     * Update Product inventory tracking and low-stock configuration.
     */
    public function updateSettings(
        UpdateInventorySettingsRequest $request,
        InventoryStockService $inventory,
    ): JsonResponse {
        $data =
            $request->validated();

        $product =
            $inventory->updateSettings(
                $request->product(),
                (bool) $data['track_inventory'],
                $data['low_stock_threshold'] ?? null,
                $request->user()->id,
            );

        return response()->json([
            'data' => $this->detail(
                $product,
            ),
        ]);
    }

    /**
     * Record opening stock for one Product/warehouse.
     */
    public function opening(
        RecordOpeningStockRequest $request,
        InventoryStockService $inventory,
    ): JsonResponse {
        $data =
            $request->validated();

        $inventory->recordOpeningStock(
            $request->product(),
            (int) $data['warehouse_id'],
            (string) $data['quantity'],
            $data['note'] ?? null,
            $request->user()->id,
        );

        return response()->json([
            'data' => $this->detail(
                $request->product(),
            ),
        ]);
    }

    /**
     * Apply one signed manual stock adjustment.
     */
    public function adjust(
        AdjustStockRequest $request,
        InventoryStockService $inventory,
    ): JsonResponse {
        $data =
            $request->validated();

        $inventory->adjustStock(
            $request->product(),
            (int) $data['warehouse_id'],
            (string) $data['quantity'],
            $data['note'] ?? null,
            $request->user()->id,
        );

        return response()->json([
            'data' => $this->detail(
                $request->product(),
            ),
        ]);
    }

    /**
     * Transfer stock between two active warehouses atomically.
     */
    public function transfer(
        TransferStockRequest $request,
        InventoryStockService $inventory,
    ): JsonResponse {
        $data =
            $request->validated();

        $inventory->transferStock(
            $request->product(),
            (int) $data['source_warehouse_id'],
            (int) $data['destination_warehouse_id'],
            (string) $data['quantity'],
            $data['note'] ?? null,
            $request->user()->id,
        );

        return response()->json([
            'data' => $this->detail(
                $request->product(),
            ),
        ]);
    }

    /**
     * Build the complete Product Inventory read model used by the drawer.
     *
     * @return array<string, mixed>
     */
    private function detail(
        Product $product,
    ): array {
        $product =
            $product->fresh();

        $balances =
            InventoryBalance::query()
                ->where(
                    'product_id',
                    $product->id,
                )
                ->with(
                    'warehouse',
                )
                ->get()
                ->sortBy(
                    fn (
                        InventoryBalance $balance,
                    ) => $balance
                        ->warehouse
                        ?->name
                        ?? '',
                )
                ->values();

        $onHandUnits =
            0;

        $reservedUnits =
            0;

        $balanceRows =
            $balances->map(
                function (
                    InventoryBalance $balance,
                ) use (
                    &$onHandUnits,
                    &$reservedUnits,
                ): array {
                    $onHand =
                        InventoryQuantity::toUnits(
                            $balance->on_hand,
                        );

                    $reserved =
                        InventoryQuantity::toUnits(
                            $balance->reserved,
                        );

                    $onHandUnits +=
                        $onHand;

                    $reservedUnits +=
                        $reserved;

                    return [
                        'warehouse' => [
                            'id' => $balance
                                ->warehouse
                                ->id,

                            'code' => $balance
                                ->warehouse
                                ->code,

                            'name' => $balance
                                ->warehouse
                                ->name,

                            'is_default' => (bool) $balance
                                ->warehouse
                                ->is_default,

                            'deleted_at' => $balance
                                ->warehouse
                                ->deleted_at,
                        ],

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
                ->all();

        $warehouses =
            Warehouse::query()
                ->orderByDesc(
                    'is_default',
                )
                ->orderBy(
                    'name',
                )
                ->get([
                    'id',
                    'code',
                    'name',
                    'is_default',
                ])
                ->map(
                    fn (
                        Warehouse $warehouse,
                    ): array => [
                        'id' => $warehouse->id,

                        'code' => $warehouse->code,

                        'name' => $warehouse->name,

                        'is_default' => (bool) $warehouse->is_default,
                    ],
                )
                ->all();

        $movements =
            StockMovement::query()
                ->where(
                    'product_id',
                    $product->id,
                )
                ->with([
                    'product:id,name,sku',
                    'warehouse:id,code,name',
                ])
                ->latest()
                ->limit(
                    25,
                )
                ->get();

        return [
            'id' => $product->id,

            'name' => $product->name,

            'sku' => $product->sku,

            'unit' => $product->unit,

            'cost_price' => $product->cost_price,

            'track_inventory' => (bool) $product->track_inventory,

            'low_stock_threshold' => $product->low_stock_threshold,

            'on_hand' => InventoryQuantity::fromUnits(
                $onHandUnits,
            ),

            'reserved' => InventoryQuantity::fromUnits(
                $reservedUnits,
            ),

            'available' => InventoryQuantity::fromUnits(
                $onHandUnits
                    - $reservedUnits,
            ),

            'balances' => $balanceRows,

            'warehouses' => $warehouses,

            'recent_movements' => StockMovementResource::collection(
                $movements,
            )->resolve(),
        ];
    }
}
