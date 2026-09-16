<?php

use App\Http\Middleware\ClearTenantContext;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetUserLocale;
use App\Support\SafeErrorResponse;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
     * Clear tenant state before every request so organization context
     * can never leak between requests or long-lived processes.
     */
        $middleware->prepend(ClearTenantContext::class);
        $middleware->prepend(SetUserLocale::class);
        $middleware->encryptCookies(except: ['acconova_locale']);

        /*
     * Inertia is part of the web stack because the application UI uses
     * Laravel sessions, authentication, cookies, and CSRF protection.
     */
        $middleware->web(append: [
            HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->respond(SafeErrorResponse::render(...));
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
