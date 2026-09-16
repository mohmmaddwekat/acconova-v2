<?php

namespace App\Http\Controllers;

use App\Http\Requests\DeleteWarehouseRequest;
use App\Http\Requests\ForceDeleteWarehouseRequest;
use App\Http\Requests\IndexWarehouseRequest;
use App\Http\Requests\RestoreWarehouseRequest;
use App\Http\Requests\SetDefaultWarehouseRequest;
use App\Http\Requests\StoreWarehouseRequest;
use App\Http\Requests\UpdateWarehouseRequest;
use App\Http\Resources\WarehouseResource;
use App\Models\Warehouse;
use App\Services\WarehouseService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class WarehouseController extends Controller
{
    /**
     * Return current-organization warehouse locations by lifecycle state.
     */
    public function index(
        IndexWarehouseRequest $request,
    ): AnonymousResourceCollection {
        $status =
            $request->string(
                'status',
                'active',
            )->toString();

        $query =
            Warehouse::query();

        if (
            $status ===
            'deleted'
        ) {
            $query->onlyTrashed();
        } elseif (
            $status ===
            'all'
        ) {
            $query->withTrashed();
        }

        $this->applyInventoryCounts(
            $query,
        );

        $query
            ->orderByDesc(
                'is_default',
            )
            ->orderBy(
                'name',
            );

        return WarehouseResource::collection(
            $query->get(),
        );
    }

    /**
     * Create one warehouse.
     */
    public function store(
        StoreWarehouseRequest $request,
        WarehouseService $warehouses,
    ): JsonResponse {
        $warehouse =
            $warehouses->create(
                $request->validated(),
            );

        $this->loadInventoryCounts(
            $warehouse,
        );

        return (
            new WarehouseResource(
                $warehouse,
            )
        )
            ->response()
            ->setStatusCode(
                201,
            );
    }

    /**
     * Rename one active warehouse.
     */
    public function update(
        UpdateWarehouseRequest $request,
        WarehouseService $warehouses,
    ): JsonResponse {
        $warehouse =
            $warehouses->update(
                $request->warehouse(),
                $request->validated(),
            );

        $this->loadInventoryCounts(
            $warehouse,
        );

        return (
            new WarehouseResource(
                $warehouse,
            )
        )->response();
    }

    /**
     * Promote one active warehouse to workspace default.
     */
    public function makeDefault(
        SetDefaultWarehouseRequest $request,
        WarehouseService $warehouses,
    ): JsonResponse {
        $warehouse =
            $warehouses->makeDefault(
                $request->warehouse(),
            );

        $this->loadInventoryCounts(
            $warehouse,
        );

        return (
            new WarehouseResource(
                $warehouse,
            )
        )->response();
    }

    /**
     * Archive one warehouse when its stock lifecycle allows it.
     */
    public function destroy(
        DeleteWarehouseRequest $request,
        WarehouseService $warehouses,
    ): Response {
        $warehouses->archive(
            $request->warehouse(),
        );

        return response()
            ->noContent();
    }

    /**
     * Restore one archived warehouse.
     */
    public function restore(
        RestoreWarehouseRequest $request,
        WarehouseService $warehouses,
    ): JsonResponse {
        $warehouse =
            $warehouses->restore(
                $request->warehouse(),
            );

        $this->loadInventoryCounts(
            $warehouse,
        );

        return (
            new WarehouseResource(
                $warehouse,
            )
        )->response();
    }

    /**
     * Permanently delete one archived, empty, history-free warehouse.
     */
    public function forceDestroy(
        ForceDeleteWarehouseRequest $request,
        WarehouseService $warehouses,
    ): Response {
        $warehouses->forceDelete(
            $request->warehouse(),
        );

        return response()
            ->noContent();
    }

    /**
     * Add stock and history counters to a Warehouse query.
     */
    private function applyInventoryCounts(
        Builder $query,
    ): void {
        $query->withCount([
            'balances as stocked_products_count' =>
            /**
             * Count balances with physical or reserved stock.
             */
            function (
                Builder $balanceQuery,
            ): void {
                $balanceQuery->where(
                    function (
                        Builder $stockQuery,
                    ): void {
                        $stockQuery
                            ->where(
                                'on_hand',
                                '!=',
                                0,
                            )
                            ->orWhere(
                                'reserved',
                                '!=',
                                0,
                            );
                    },
                );
            },

            'stockMovements as stock_movements_count',
        ]);
    }

    /**
     * Attach Inventory counters to one already loaded Warehouse.
     */
    private function loadInventoryCounts(
        Warehouse $warehouse,
    ): void {
        $warehouse->loadCount([
            'balances as stocked_products_count' =>
            /**
             * Count balances with physical or reserved stock.
             */
            function (
                Builder $balanceQuery,
            ): void {
                $balanceQuery->where(
                    function (
                        Builder $stockQuery,
                    ): void {
                        $stockQuery
                            ->where(
                                'on_hand',
                                '!=',
                                0,
                            )
                            ->orWhere(
                                'reserved',
                                '!=',
                                0,
                            );
                    },
                );
            },

            'stockMovements as stock_movements_count',
        ]);
    }
}
