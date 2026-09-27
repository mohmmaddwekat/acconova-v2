<?php

use App\Http\Controllers\Platform\PlatformAdminAccessController;
use App\Http\Controllers\Platform\PlatformAdminController;
use App\Http\Controllers\Platform\PlatformFeatureAdminController;
use App\Http\Controllers\Platform\PlatformUserSecurityController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'platform.admin'])
    ->prefix('admin')
    ->name('platform-admin.')
    ->group(function (): void {
        Route::put(
            '/contacts/{message}/status',
            [PlatformAdminController::class, 'updateContactStatus'],
        )
            ->whereNumber('message')
            ->name('contacts.status');

        Route::post(
            '/users/{user}/temporary-password',
            [PlatformUserSecurityController::class, 'issueTemporaryPassword'],
        )->whereNumber('user')->middleware('throttle:12,1')->name('users.temporary-password');

        Route::get('/admins', [PlatformAdminAccessController::class, 'index'])
            ->name('admins.index');
        Route::post('/admins', [PlatformAdminAccessController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('admins.store');
        Route::delete('/admins/{user}', [PlatformAdminAccessController::class, 'destroy'])
            ->whereNumber('user')
            ->middleware('throttle:20,1')
            ->name('admins.destroy');

        Route::get(
            '/features',
            PlatformFeatureAdminController::class,
        )->name('features');

        Route::get(
            '/{section?}',
            [PlatformAdminController::class, 'show'],
        )
            ->where('section', 'overview|organizations|users|subscriptions|plans|website|seo|contacts|system|settings')
            ->name('show');
    });
