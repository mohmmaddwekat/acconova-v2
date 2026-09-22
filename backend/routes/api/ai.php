<?php

use App\Http\Controllers\AiAssistantController;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'auth',
    'verified',
    ResolveOrganization::class,
    'throttle:30,1',
])
    ->prefix('api/ai')
    ->group(function (): void {
        Route::get('status', [AiAssistantController::class, 'status']);
        Route::get('conversations', [AiAssistantController::class, 'index']);
        Route::post('conversations', [AiAssistantController::class, 'store']);
        Route::get('conversations/{conversation}', [AiAssistantController::class, 'show'])
            ->whereNumber('conversation');
        Route::post('conversations/{conversation}/messages', [AiAssistantController::class, 'message'])
            ->whereNumber('conversation')
            ->middleware('throttle:20,1');
        Route::delete('conversations/{conversation}', [AiAssistantController::class, 'destroy'])
            ->whereNumber('conversation');
    });
