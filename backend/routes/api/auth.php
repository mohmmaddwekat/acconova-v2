<?php

use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\Auth\NewPasswordController;
use App\Http\Controllers\Auth\PasswordResetLinkController;
use App\Http\Controllers\AuthController;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
 * Return a session CSRF token for browser JSON requests.
 */

Route::get(
    'csrf-token',
    [AuthController::class, 'csrf'],
);

/*
 * Guest account authentication endpoints.
 */
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
    )->name('api.login');

    Route::post(
        'reset-password',
        [NewPasswordController::class, 'store'],
    );
});

/*
 * Password recovery requests have their own tighter delivery throttle.
 */
Route::post(
    'forgot-password',
    [PasswordResetLinkController::class, 'store'],
)->middleware([
    'guest',
    'throttle:6,1',
]);

/*
 * Authentication state and account-level actions.
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
        'email/verification-notification',
        [EmailVerificationController::class, 'send'],
    )->middleware('throttle:6,1');

    Route::post(
        'logout',
        [AuthController::class, 'logout'],
    );
});
