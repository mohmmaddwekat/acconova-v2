<?php

use App\Http\Controllers\ProductBulkActionController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProductDataTransferController;
use App\Http\Controllers\ProductionController;
use App\Http\Controllers\ProductionRecipeController;
use App\Http\Controllers\ProductPermanentDeletionController;
use App\Http\Controllers\ServiceOperationController;
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
        'products/{product}/production-recipe',
        [
            ProductionRecipeController::class,
            'show',
        ],
    )
        ->whereNumber(
            'product',
        )
        ->name(
            'production-recipe.show',
        );

    Route::post(
        'products/{product}/production-recipe',
        [
            ProductionRecipeController::class,
            'store',
        ],
    )
        ->whereNumber(
            'product',
        )
        ->name(
            'production-recipe.store',
        );

    /*
     * Product pages may display immutable historical production entries, but
     * new physical production is recorded only through Production Runs.
     */
    Route::get(
        'products/{product}/production',
        [
            ProductionController::class,
            'index',
        ],
    )
        ->whereNumber(
            'product',
        )
        ->name(
            'production.index',
        );

    Route::get(
        'products/{product}/service-operations',
        [
            ServiceOperationController::class,
            'index',
        ],
    )
        ->whereNumber(
            'product',
        )
        ->name(
            'service-operations.index',
        );

    Route::post(
        'products/{product}/service-operations',
        [
            ServiceOperationController::class,
            'store',
        ],
    )
        ->whereNumber(
            'product',
        )
        ->name(
            'service-operations.store',
        );

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

    /*
     * DELETE /products/{id} means archive. Permanent deletion has an explicit
     * route so accidental clients cannot confuse lifecycle operations.
     */
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

    Route::delete(
        'products/{product}/permanent',
        ProductPermanentDeletionController::class,
    )->whereNumber(
        'product',
    );
});
