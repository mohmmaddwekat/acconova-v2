<?php

use App\Http\Controllers\ImportSourceController;
use App\Http\Controllers\Staff\StaffAutoAccrualController;
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

        /*
         * These routes replace the generic staff read routes registered in
         * web.php. Before returning payroll balances, fixed monthly salaries are
         * accrued automatically through the previous completed month. Hour/day/
         * piece salaries are already generated directly from attendance rows.
         */
        Route::get(
            'staff-overview',
            [
                StaffAutoAccrualController::class,
                'overview',
            ],
        );

        Route::get(
            'staff/{staff}/ledger',
            [
                StaffAutoAccrualController::class,
                'ledger',
            ],
        )->whereNumber('staff');
    });
