<?php

use App\Http\Controllers\ActiveOrganizationController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\MembershipController;
use App\Http\Controllers\OrganizationController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json(['name' => 'AccoNova', 'phase' => 0]));
// Session-based JSON endpoints intentionally use the web stack, including CSRF.
Route::prefix('api')->group(function () {
    Route::get('csrf-token', [AuthController::class, 'csrf']);
    Route::middleware(['guest', 'throttle:auth'])->group(function () {
        Route::post('register', [AuthController::class, 'register']);
        Route::post('login', [AuthController::class, 'login'])->name('login');
    });
    Route::middleware('auth')->group(function () {
        Route::get('user', fn (Request $request) => $request->user());
        Route::post('logout', [AuthController::class, 'logout']);
        Route::put('current-organization', [ActiveOrganizationController::class, 'update']);
        Route::get('current-organization', [OrganizationController::class, 'show'])->middleware(ResolveOrganization::class);
        Route::get('organizations', [OrganizationController::class, 'index']);
        Route::post('organizations', [OrganizationController::class, 'store']);
        Route::prefix('organizations/{organization}')->whereNumber('organization')->middleware(ResolveOrganization::class)->group(function () {
            Route::get('/', [OrganizationController::class, 'show']);
            Route::patch('/', [OrganizationController::class, 'update']);
            Route::get('memberships', [MembershipController::class, 'index']);
            Route::post('memberships', [MembershipController::class, 'store']);
            Route::patch('memberships/{membership}', [MembershipController::class, 'update'])->whereNumber('membership');
            Route::delete('memberships/{membership}', [MembershipController::class, 'destroy'])->whereNumber('membership');
        });
    });
});
