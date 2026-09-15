<?php

use App\Http\Controllers\PartyController;
use App\Http\Controllers\PartyDataTransferController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * All Party operations require an authenticated, email-verified user and an
 * explicitly resolved active tenant before business data is accessed.
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
        'parties/{party}',
        [
            PartyController::class,
            'show',
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
});
