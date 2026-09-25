<?php

use App\Http\Controllers\PlatformAdminController;
use App\Http\Controllers\PlatformFeatureAdminController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified'])
    ->prefix('admin')
    ->name('platform-admin.')
    ->group(function (): void {
        Route::put(
            '/contacts/{message}/status',
            [PlatformAdminController::class, 'updateContactStatus'],
        )
            ->whereNumber('message')
            ->name('contacts.status');

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
