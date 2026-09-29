<?php

use App\Http\Controllers\ImportSourceController;
use App\Http\Controllers\Staff\StaffImportController;
use App\Http\Controllers\Staff\StaffImportTemplateController;
use App\Http\Controllers\Staff\StaffSalaryChangeController;
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

        Route::get(
            'staff/{staff}/salary-changes',
            [
                StaffSalaryChangeController::class,
                'index',
            ],
        )
            ->whereNumber('staff')
            ->middleware('throttle:60,1')
            ->name('staff.salary-changes.index');

        Route::post(
            'staff/{staff}/salary-changes',
            [
                StaffSalaryChangeController::class,
                'store',
            ],
        )
            ->whereNumber('staff')
            ->middleware('throttle:30,1')
            ->name('staff.salary-changes.store');

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
