<?php

use App\Http\Controllers\Mcp\McpApprovalController;
use App\Http\Controllers\Mcp\McpManagementController;
use App\Http\Controllers\Mcp\McpOAuthConnectionController;
use App\Http\Controllers\Mcp\McpTokenController;
use App\Http\Middleware\EnsureMcpAdmin;
use App\Http\Middleware\RequireActiveSubscription;
use App\Http\Middleware\ResolveOrganization;
use Illuminate\Support\Facades\Route;

Route::middleware([
    'auth',
    'verified',
    RequireActiveSubscription::class,
    ResolveOrganization::class,
    EnsureMcpAdmin::class,
])->group(function (): void {
    Route::get('/app/mcp', [McpManagementController::class, 'page'])->name('app.mcp');

    Route::prefix('/api/mcp')->group(function (): void {
        Route::get('/dashboard', [McpManagementController::class, 'dashboard']);
        Route::put('/settings', [McpManagementController::class, 'updateSettings']);

        Route::post('/tokens', [McpTokenController::class, 'store']);
        Route::delete('/tokens/{token}', [McpTokenController::class, 'destroy']);

        Route::get('/oauth-connections', [McpOAuthConnectionController::class, 'index']);
        Route::post('/oauth-connections', [McpOAuthConnectionController::class, 'store']);
        Route::delete('/oauth-connections/{connection}', [McpOAuthConnectionController::class, 'destroy']);

        Route::post('/approvals/{approval}/approve', [McpApprovalController::class, 'approve']);
        Route::post('/approvals/{approval}/reject', [McpApprovalController::class, 'reject']);

        Route::post('/connections', [McpManagementController::class, 'saveConnection']);
        Route::put('/connections/{connection}', [McpManagementController::class, 'saveConnection']);
        Route::delete('/connections/{connection}', [McpManagementController::class, 'deleteConnection']);

        Route::post('/custom-tools', [McpManagementController::class, 'saveCustomTool']);
        Route::put('/custom-tools/{tool}', [McpManagementController::class, 'saveCustomTool']);
        Route::delete('/custom-tools/{tool}', [McpManagementController::class, 'deleteCustomTool']);

        Route::post('/workflows', [McpManagementController::class, 'saveWorkflow']);
        Route::put('/workflows/{workflow}', [McpManagementController::class, 'saveWorkflow']);
        Route::delete('/workflows/{workflow}', [McpManagementController::class, 'deleteWorkflow']);
        Route::post('/workflows/{workflow}/run', [McpManagementController::class, 'runWorkflow']);

        Route::post('/sandbox', [McpManagementController::class, 'sandbox']);
    });
});
