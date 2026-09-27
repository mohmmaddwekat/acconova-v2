<?php

use App\Http\Controllers\McpProtocolController;
use App\Http\Middleware\ResolveMcpToken;
use Illuminate\Support\Facades\Route;

Route::post('/mcp', McpProtocolController::class)
    ->middleware([
        ResolveMcpToken::class,
        'throttle:120,1',
    ])
    ->name('mcp.protocol');
