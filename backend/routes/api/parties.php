<?php

use App\Http\Controllers\PartyController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

/*
 * Every Party operation requires an authenticated user and a verified active
 * tenant before Party validation, authorization, querying, or writes occur.
 */
Route::middleware([
    'auth',
    ResolveOrganization::class,
])->group(function (): void {
    Route::get(
        'parties',
        [PartyController::class, 'index'],
    );

    Route::post(
        'parties',
        [PartyController::class, 'store'],
    );

    Route::get(
        'parties/{party}',
        [PartyController::class, 'show'],
    )->whereNumber('party');

    Route::patch(
        'parties/{party}',
        [PartyController::class, 'update'],
    )->whereNumber('party');

    Route::delete(
        'parties/{party}',
        [PartyController::class, 'destroy'],
    )->whereNumber('party');

    Route::post(
        'parties/{party}/restore',
        [PartyController::class, 'restore'],
    )->whereNumber('party');
});
