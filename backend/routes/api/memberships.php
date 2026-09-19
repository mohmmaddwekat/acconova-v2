<?php

use App\Http\Controllers\MembershipController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
])
    ->prefix(
        'organizations/{organization}',
    )
    ->whereNumber(
        'organization',
    )
    ->group(function (): void {
        Route::get(
            'memberships',
            [
                MembershipController::class,
                'index',
            ],
        );

        Route::post(
            'memberships',
            [
                MembershipController::class,
                'store',
            ],
        );

        Route::patch(
            'memberships/{membership}',
            [
                MembershipController::class,
                'update',
            ],
        )->whereNumber(
            'membership',
        );

        Route::delete(
            'memberships/{membership}',
            [
                MembershipController::class,
                'destroy',
            ],
        )->whereNumber(
            'membership',
        );
    });
