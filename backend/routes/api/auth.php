<?php

use App\Http\Controllers\AuthController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
 * Guest authentication endpoints are rate-limited independently from normal
 * authenticated application traffic.
 */

Route::get(
    'csrf-token',
    [AuthController::class, 'csrf'],
);

Route::middleware([
    'guest',
    'throttle:auth',
])->group(function (): void {
    Route::post(
        'register',
        [AuthController::class, 'register'],
    );

    Route::post(
        'login',
        [AuthController::class, 'login'],
    )->name('login');
});

/*
 * Authentication state and the current user are protected by Laravel's
 * session guard.
 */
Route::middleware('auth')->group(function (): void {
    Route::get(
        'user',
        fn (Request $request) => response()->json(
            (new UserResource($request->user()))
                ->resolve($request),
        ),
    );

    Route::post(
        'logout',
        [AuthController::class, 'logout'],
    );
});
