<?php

use App\Http\Controllers\ActiveOrganizationController;
use App\Http\Controllers\OrganizationController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])->group(function (): void {
    /*
     * Switch the tenant stored in the authenticated user's session.
     */
    Route::put(
        'current-organization',
        [ActiveOrganizationController::class, 'update'],
    );

    /*
     * Resolve the active tenant from the session when no organization ID is
     * supplied explicitly in the URL.
     */
    Route::get(
        'current-organization',
        [OrganizationController::class, 'show'],
    )->middleware(ResolveOrganization::class);

    Route::get(
        'organizations',
        [OrganizationController::class, 'index'],
    );

    Route::post(
        'organizations',
        [OrganizationController::class, 'store'],
    );

    /*
     * Restore intentionally does not use ResolveOrganization because normal
     * tenant resolution excludes soft-deleted organizations.
     */
    Route::post(
        'organizations/{organization}/restore',
        [OrganizationController::class, 'restore'],
    )->whereNumber('organization');

    /*
     * Normal organization operations must always resolve and verify the tenant
     * before controllers or domain Actions are reached.
     */
    Route::prefix('organizations/{organization}')
        ->whereNumber('organization')
        ->middleware(ResolveOrganization::class)
        ->group(function (): void {
            Route::get(
                '/',
                [OrganizationController::class, 'show'],
            );

            Route::patch(
                '/',
                [OrganizationController::class, 'update'],
            );

            Route::delete(
                '/',
                [OrganizationController::class, 'destroy'],
            );
        });
});
