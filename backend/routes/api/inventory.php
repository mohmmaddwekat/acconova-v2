<?php

use App\Http\Controllers\InventoryOverviewController;
use App\Http\Controllers\WarehouseController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Inventory operations always resolve one explicit active organization before
 * models, permissions, balances, or movements are accessed.
 */

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
])->group(function (): void {
    Route::get(
        'inventory/overview',
        InventoryOverviewController::class,
    );

    Route::get(
        'warehouses',
        [
            WarehouseController::class,
            'index',
        ],
    );

    Route::post(
        'warehouses',
        [
            WarehouseController::class,
            'store',
        ],
    );

    Route::patch(
        'warehouses/{warehouse}',
        [
            WarehouseController::class,
            'update',
        ],
    )->whereNumber(
        'warehouse',
    );

    Route::post(
        'warehouses/{warehouse}/default',
        [
            WarehouseController::class,
            'makeDefault',
        ],
    )->whereNumber(
        'warehouse',
    );

    Route::delete(
        'warehouses/{warehouse}',
        [
            WarehouseController::class,
            'destroy',
        ],
    )->whereNumber(
        'warehouse',
    );

    Route::post(
        'warehouses/{warehouse}/restore',
        [
            WarehouseController::class,
            'restore',
        ],
    )->whereNumber(
        'warehouse',
    );

    /*
     * Permanent deletion intentionally requires an already archived warehouse.
     * The domain service then verifies that no stock or audit history exists.
     */
    Route::delete(
        'warehouses/{warehouse}/permanent',
        [
            WarehouseController::class,
            'forceDestroy',
        ],
    )->whereNumber(
        'warehouse',
    );
});
