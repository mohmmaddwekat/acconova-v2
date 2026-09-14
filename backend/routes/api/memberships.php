<?php

use App\Http\Controllers\MembershipController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Membership routes are tenant routes even though they live in their own
 * module file. ResolveOrganization guarantees organization isolation before
 * membership Requests, Policies, Controllers, or Actions execute.
 */
Route::middleware(['auth', ResolveOrganization::class])
    ->prefix('organizations/{organization}')
    ->whereNumber('organization')
    ->group(function (): void {
        Route::get(
            'memberships',
            [MembershipController::class, 'index'],
        );

        Route::post(
            'memberships',
            [MembershipController::class, 'store'],
        );

        Route::patch(
            'memberships/{membership}',
            [MembershipController::class, 'update'],
        )->whereNumber('membership');

        Route::delete(
            'memberships/{membership}',
            [MembershipController::class, 'destroy'],
        )->whereNumber('membership');
    });
