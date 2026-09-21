<?php

use App\Http\Controllers\PartyBulkActionController;
use App\Http\Controllers\PartyBulkEditController;
use App\Http\Controllers\PartyController;
use App\Http\Controllers\PartyDataTransferController;
use App\Http\Controllers\PartyInsightsController;
use App\Http\Controllers\PartyPermanentDeletionController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Party operations require authentication, verified email, and an explicitly
 * resolved active organization before tenant business data is accessed.
 */

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
])->group(function (): void {
    Route::get(
        'parties/import-template',
        [
            PartyDataTransferController::class,
            'template',
        ],
    );

    Route::post(
        'parties/import/preview',
        [
            PartyDataTransferController::class,
            'previewImport',
        ],
    );

    Route::post(
        'parties/import',
        [
            PartyDataTransferController::class,
            'import',
        ],
    );

    Route::get(
        'parties/export/{format}',
        [
            PartyDataTransferController::class,
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
        'parties/bulk',
        PartyBulkActionController::class,
    );

    Route::post(
        'parties/bulk-edit',
        PartyBulkEditController::class,
    );

    Route::get(
        'parties',
        [
            PartyController::class,
            'index',
        ],
    );

    Route::post(
        'parties',
        [
            PartyController::class,
            'store',
        ],
    );

    Route::get(
        'parties/{party}/360',
        PartyInsightsController::class,
    )->whereNumber(
        'party',
    );

    Route::get(
        'parties/{party}',
        [
            PartyController::class,
            'show',
        ],
    )->whereNumber(
        'party',
    );

    Route::patch(
        'parties/{party}/notes',
        [
            PartyController::class,
            'updateNotes',
        ],
    )->whereNumber(
        'party',
    );

    Route::patch(
        'parties/{party}',
        [
            PartyController::class,
            'update',
        ],
    )->whereNumber(
        'party',
    );

    /*
     * Normal DELETE archives the Party. Permanent deletion is intentionally a
     * separate explicit operation.
     */
    Route::delete(
        'parties/{party}',
        [
            PartyController::class,
            'destroy',
        ],
    )->whereNumber(
        'party',
    );

    Route::post(
        'parties/{party}/restore',
        [
            PartyController::class,
            'restore',
        ],
    )->whereNumber(
        'party',
    );

    Route::delete(
        'parties/{party}/permanent',
        PartyPermanentDeletionController::class,
    )->whereNumber(
        'party',
    );
});
