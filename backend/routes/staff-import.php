<?php

use App\Http\Controllers\ImportSourceController;
use App\Http\Controllers\Staff\StaffImportCommitController;
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
         * Staff imports intentionally accept only employee master data and
         * attendance. Payroll entitlement is calculated by AccoNova instead of
         * being uploaded as a second source of truth.
         */
        Route::post(
            'staff-import/commit',
            StaffImportCommitController::class,
        )->middleware('throttle:15,1');
    });
