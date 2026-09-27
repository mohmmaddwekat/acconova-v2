<?php

use App\Http\Controllers\Workspace\WorkspaceSecurityController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware('auth')->group(function (): void {
    Route::get('/password-change-required', function (Request $request) {
        if (! $request->user()->must_change_password) {
            return redirect('/app');
        }

        return Inertia::render('Auth/ChangeRequiredPassword', [
            'expiresAt' => $request->user()->temporary_password_expires_at?->toIso8601String(),
        ]);
    })->name('password.change-required');

    Route::post(
        '/api/security/change-required-password',
        [WorkspaceSecurityController::class, 'changeRequiredPassword'],
    )->middleware('throttle:10,1');

    Route::post(
        '/api/security/send-recovery-link',
        [WorkspaceSecurityController::class, 'sendRecoveryLink'],
    )->middleware('throttle:6,1');
});

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
])->group(function (): void {
    Route::get('/app/security', fn () => Inertia::render('SecurityCenter'))
        ->name('app.security');

    Route::get(
        '/api/security/overview',
        [WorkspaceSecurityController::class, 'overview'],
    );

    Route::post(
        '/api/security/members/{membership}/temporary-password',
        [WorkspaceSecurityController::class, 'issueTemporaryPassword'],
    )->whereNumber('membership')->middleware('throttle:12,1');

    Route::put(
        '/api/security/members/{membership}/role',
        [WorkspaceSecurityController::class, 'updateRole'],
    )->whereNumber('membership')->middleware('throttle:12,1');
});
