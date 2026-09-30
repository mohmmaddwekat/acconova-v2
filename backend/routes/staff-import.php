<?php

use App\Http\Controllers\ImportSourceController;
use App\Http\Controllers\Staff\StaffAttendanceSyncController;
use App\Http\Controllers\Staff\StaffAutoAccrualController;
use App\Http\Controllers\Staff\StaffImportCommitController;
use App\Http\Controllers\Staff\StaffImportTemplateController;
use App\Http\Controllers\Staff\StaffSalaryChangeController;
use App\Http\Middleware\RequireActiveSubscription;
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
         * Employee imports accept employee master data, attendance, and old
         * manual transactions. Salary entitlement itself remains derived data.
         */
        Route::post(
            'staff-import/commit',
            StaffImportCommitController::class,
        )->middleware('throttle:15,1');

        /*
         * These later registrations replace the generic Staff routes in web.php.
         * Attendance is the source of truth for salary entitlement, so every
         * create/edit/delete synchronizes the employee ledger immediately.
         */
        Route::post(
            'staff/{staff}/attendance',
            [
                StaffAttendanceSyncController::class,
                'store',
            ],
        )
            ->whereNumber('staff')
            ->middleware(RequireActiveSubscription::class);

        Route::match(
            ['PATCH', 'DELETE'],
            'staff/{staff}/attendance/{attendance}',
            [
                StaffAttendanceSyncController::class,
                'correct',
            ],
        )
            ->whereNumber(['staff', 'attendance'])
            ->middleware(RequireActiveSubscription::class);

        Route::get(
            'staff-overview',
            [
                StaffAutoAccrualController::class,
                'overview',
            ],
        )->middleware(RequireActiveSubscription::class);

        Route::get(
            'staff/{staff}/ledger',
            [
                StaffAutoAccrualController::class,
                'ledger',
            ],
        )
            ->whereNumber('staff')
            ->middleware(RequireActiveSubscription::class);
    });
