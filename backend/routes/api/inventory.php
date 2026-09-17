<?php

use App\Http\Controllers\InventoryOverviewController;
use App\Http\Controllers\ProductInventoryController;
use App\Http\Controllers\ProductionRunController;
use App\Http\Controllers\WarehouseController;
use App\Http\Controllers\WarehouseInventoryController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Inventory operations always resolve one explicit organization before stock
 * state, warehouse state, or permissions are accessed.
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
        'production-runs',
        [
            ProductionRunController::class,
            'index',
        ],
    );

    Route::post(
        'production-runs',
        [
            ProductionRunController::class,
            'store',
        ],
    );

    Route::get(
        'production-runs/{run}',
        [
            ProductionRunController::class,
            'show',
        ],
    )->whereNumber(
        'run',
    );

    Route::patch(
        'production-runs/{run}',
        [
            ProductionRunController::class,
            'update',
        ],
    )->whereNumber(
        'run',
    );

    Route::get(
        'production-runs/{run}/preview',
        [
            ProductionRunController::class,
            'preview',
        ],
    )->whereNumber(
        'run',
    );

    Route::delete(
        'production-runs/{run}',
        [
            ProductionRunController::class,
            'destroy',
        ],
    )->whereNumber(
        'run',
    );

    Route::post(
        'production-runs/{run}/post',
        [
            ProductionRunController::class,
            'post',
        ],
    )->whereNumber(
        'run',
    );

    Route::post(
        'production-runs/{run}/reverse',
        [
            ProductionRunController::class,
            'reverse',
        ],
    )->whereNumber(
        'run',
    );

    Route::post(
        'production-runs/{run}/outputs/{output}/reverse',
        [
            ProductionRunController::class,
            'reverseOutput',
        ],
    )
        ->whereNumber('run')
        ->whereNumber('output');

    Route::get(
        'inventory/products/{product}',
        [
            ProductInventoryController::class,
            'show',
        ],
    )->whereNumber(
        'product',
    );

    Route::patch(
        'inventory/products/{product}/settings',
        [
            ProductInventoryController::class,
            'updateSettings',
        ],
    )->whereNumber(
        'product',
    );

    Route::post(
        'inventory/products/{product}/opening-stock',
        [
            ProductInventoryController::class,
            'opening',
        ],
    )->whereNumber(
        'product',
    );

    Route::post(
        'inventory/products/{product}/adjust',
        [
            ProductInventoryController::class,
            'adjust',
        ],
    )->whereNumber(
        'product',
    );

    Route::post(
        'inventory/products/{product}/transfer',
        [
            ProductInventoryController::class,
            'transfer',
        ],
    )->whereNumber(
        'product',
    );

    Route::get(
        'warehouses',
        [
            WarehouseController::class,
            'index',
        ],
    );

    Route::get(
        'warehouses/{warehouse}/inventory-products',
        WarehouseInventoryController::class,
    )->whereNumber(
        'warehouse',
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
