<?php

use App\Http\Controllers\AI\AiAssistantController;
use App\Http\Controllers\AI\AiUsageController;
use App\Http\Controllers\AI\SmartImportDraftController;
use App\Http\Controllers\AI\SmartImportProgressController;
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
        Route::get('usage', AiUsageController::class);
        Route::get('conversations', [AiAssistantController::class, 'index']);
        Route::post('conversations', [AiAssistantController::class, 'store']);
        Route::get('conversations/{conversation}', [AiAssistantController::class, 'show'])
            ->whereNumber('conversation');
        Route::post('conversations/{conversation}/messages', [AiAssistantController::class, 'message'])
            ->whereNumber('conversation')
            ->middleware('throttle:20,1');
        Route::get('conversations/{conversation}/import-drafts', [SmartImportDraftController::class, 'index'])
            ->whereNumber('conversation');
        Route::post('import-drafts/{draft}/rollback', [SmartImportDraftController::class, 'rollback'])
            ->whereNumber('draft')
            ->middleware('throttle:10,1');
        Route::get('import-drafts/{draft}/progress', SmartImportProgressController::class)
            ->whereNumber('draft');
        Route::delete('conversations/{conversation}', [AiAssistantController::class, 'destroy'])
            ->whereNumber('conversation');
    });
