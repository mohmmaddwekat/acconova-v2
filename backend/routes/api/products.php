<?php

use App\Http\Controllers\ProductBulkActionController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProductDataTransferController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Catalog operations require an authenticated, verified workspace member and
 * an explicitly resolved organization.
 */

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
])->group(function (): void {
    Route::get(
        'products/import-template',
        [
            ProductDataTransferController::class,
            'template',
        ],
    );

    Route::post(
        'products/import/preview',
        [
            ProductDataTransferController::class,
            'previewImport',
        ],
    );

    Route::post(
        'products/import',
        [
            ProductDataTransferController::class,
            'import',
        ],
    );

    Route::get(
        'products/export/{format}',
        [
            ProductDataTransferController::class,
            'export',
        ],
    )->whereIn(
        'format',
        [
            'xlsx',
            'pdf',
            'print',
        ],
    );

    Route::post(
        'products/bulk-action',
        ProductBulkActionController::class,
    );

    Route::get(
        'products',
        [
            ProductController::class,
            'index',
        ],
    );

    Route::post(
        'products',
        [
            ProductController::class,
            'store',
        ],
    );

    Route::get(
        'products/{product}',
        [
            ProductController::class,
            'show',
        ],
    )->whereNumber(
        'product',
    );

    Route::patch(
        'products/{product}',
        [
            ProductController::class,
            'update',
        ],
    )->whereNumber(
        'product',
    );

    Route::delete(
        'products/{product}',
        [
            ProductController::class,
            'destroy',
        ],
    )->whereNumber(
        'product',
    );

    Route::post(
        'products/{product}/restore',
        [
            ProductController::class,
            'restore',
        ],
    )->whereNumber(
        'product',
    );
});
