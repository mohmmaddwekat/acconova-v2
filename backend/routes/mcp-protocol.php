<?php

use App\Http\Controllers\McpProtocolController;
use App\Http\Middleware\McpProtocolCompatibility;
use App\Http\Middleware\ResolveMcpOAuthConnection;
use App\Http\Middleware\ResolveMcpToken;
use App\Http\Middleware\ValidateMcpProtocolRequest;
use Illuminate\Support\Facades\Route;
use Laravel\Mcp\Server\Middleware\AddWwwAuthenticateHeader;

Route::post('/mcp', McpProtocolController::class)
    ->middleware([
        ResolveMcpToken::class,
        ValidateMcpProtocolRequest::class,
        McpProtocolCompatibility::class,
        'throttle:120,1',
    ])
    ->name('mcp.protocol');

Route::post('/mcp/oauth/{connection}', McpProtocolController::class)
    ->whereUuid('connection')
    ->middleware([
        AddWwwAuthenticateHeader::class,
        'auth:api',
        ResolveMcpOAuthConnection::class,
        ValidateMcpProtocolRequest::class,
        McpProtocolCompatibility::class,
        'throttle:120,1',
    ])
    ->name('mcp.protocol.oauth');
