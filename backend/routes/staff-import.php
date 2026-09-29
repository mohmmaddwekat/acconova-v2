<?php

use App\Http\Controllers\ImportSourceController;
use App\Http\Controllers\Staff\StaffImportController;
use App\Http\Controllers\Staff\StaffImportTemplateController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::prefix('api')
    ->middleware([
        'auth',
        'verified',
        ResolveOrganization::class,
    ])
    ->group(function (): void {
        Route::post(
            'import-source/google',
            ImportSourceController::class,
        )
            ->middleware('throttle:10,1')
            ->name('import-source.google');

        Route::get(
            'staff-import/template',
            StaffImportTemplateController::class,
        )->name('staff-import.template');

        /*
         * This route intentionally replaces the legacy 6/min registration from
         * web.php. A staff import is a user-driven administrative workflow and
         * repeated corrections/previews should not lock the user out so quickly.
         */
        Route::post(
            'staff-import/commit',
            [
                StaffImportController::class,
                'commit',
            ],
        )->middleware('throttle:15,1');
    });
