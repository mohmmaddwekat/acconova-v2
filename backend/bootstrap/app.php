<?php

use App\Http\Middleware\ClearTenantContext;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetUserLocale;
use App\Http\Middleware\TranslateMarketingResponse;
use App\Support\SafeErrorResponse;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            /*
             * Marketing routes are registered after the application routes so
             * the public website owns the guest root. The translation layer is
             * scoped to marketing HTML only; authenticated Inertia responses
             * keep using the normal client-side i18n system.
             */
            Route::middleware([
                'web',
                TranslateMarketingResponse::class,
            ])->group(base_path('routes/marketing.php'));

            /*
             * Platform administration is intentionally separate from tenant
             * subscription middleware. A SaaS operator must still be able to
             * inspect billing or recovery state when one customer subscription
             * is unhealthy.
             */
            Route::middleware('web')
                ->group(base_path('routes/platform-admin.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * Clear tenant state before every request so organization context can
         * never leak between requests or long-lived processes.
         */
        $middleware->prepend(ClearTenantContext::class);
        $middleware->prepend(SetUserLocale::class);
        $middleware->encryptCookies(except: ['acconova_locale']);

        /*
         * The billing provider signs webhook bodies independently of Laravel
         * sessions, so this endpoint uses signature verification rather than
         * browser CSRF protection.
         */
        $middleware->validateCsrfTokens(except: [
            'api/billing/webhook',
        ]);

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
