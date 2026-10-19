<?php

use App\Http\Controllers\Parties\CreditController;
use App\Http\Controllers\Parties\PartyAccountController;
use App\Http\Controllers\Parties\PartyAdjustmentController;
use App\Http\Controllers\Parties\PartyBulkActionController;
use App\Http\Controllers\Parties\PartyBulkEditController;
use App\Http\Controllers\Parties\PartyCollectionsController;
use App\Http\Controllers\Parties\PartyController;
use App\Http\Controllers\Parties\PartyDataTransferController;
use App\Http\Controllers\Parties\PartyInsightsController;
use App\Http\Controllers\Parties\PartyPermanentDeletionController;
use App\Http\Controllers\Parties\PartySettlementController;
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

    Route::get(
        'parties/overview',
        [
            PartyController::class,
            'overview',
        ],
    );

    Route::post(
        'parties',
        [
            PartyController::class,
            'store',
        ],
    );

    Route::get('parties/{party}/collections', PartyCollectionsController::class)->whereNumber('party');
    Route::get('credit-policy', [CreditController::class, 'policy']);
    Route::put('credit-policy', [CreditController::class, 'updatePolicy'])->middleware('throttle:30,1');
    Route::get('parties/{party}/credit-assessment', [CreditController::class, 'assessment'])->whereNumber('party');
    Route::get('parties/{party}/credit-decisions', [CreditController::class, 'decisions'])->whereNumber('party');
    Route::post('parties/{party}/credit-decisions', [CreditController::class, 'decide'])->whereNumber('party')->middleware('throttle:30,1');
    Route::get('parties/{party}/settlements', [PartySettlementController::class, 'index'])->whereNumber('party');
    Route::post('parties/{party}/settlements', [PartySettlementController::class, 'store'])->whereNumber('party')->middleware('throttle:20,1');
    foreach (['approve', 'reject', 'reverse'] as $action) {
        Route::post('parties/{party}/settlements/{settlement}/'.$action, [PartySettlementController::class, $action])
            ->whereNumber(['party', 'settlement'])
            ->middleware('throttle:20,1');
    }
    Route::post('parties/{party}/adjustments', [PartyAdjustmentController::class, 'store'])->whereNumber('party')->middleware('throttle:30,1');
    Route::post('parties/{party}/adjustments/{adjustment}/void', [PartyAdjustmentController::class, 'void'])
        ->whereNumber(['party', 'adjustment'])
        ->middleware('throttle:30,1');

    Route::get(
        'parties/{party}/account',
        [
            PartyAccountController::class,
            'show',
        ],
    )->whereNumber(
        'party',
    );

    Route::patch(
        'parties/{party}/opening-balances',
        [
            PartyAccountController::class,
            'updateOpeningBalances',
        ],
    )->whereNumber(
        'party',
    );

    Route::delete(
        'parties/{party}/opening-balances/{side}',
        [
            PartyAccountController::class,
            'deleteOpeningBalance',
        ],
    )
        ->whereNumber(
            'party',
        )
        ->whereIn(
            'side',
            [
                'customer',
                'supplier',
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
