<?php

use App\Http\Controllers\McpProtocolController;
use App\Http\Middleware\ResolveMcpToken;
use App\Http\Middleware\ValidateMcpProtocolRequest;
use Illuminate\Support\Facades\Route;

Route::post('/mcp', McpProtocolController::class)
    ->middleware([
        ResolveMcpToken::class,
        ValidateMcpProtocolRequest::class,
        'throttle:120,1',
    ])
    ->name('mcp.protocol');
