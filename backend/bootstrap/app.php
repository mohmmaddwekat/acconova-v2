<?php

use App\Http\Middleware\ClearTenantContext;
use App\Http\Middleware\EnsurePlatformAdmin;
use App\Http\Middleware\ForcePasswordChange;
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
            Route::middleware([
                'web',
                TranslateMarketingResponse::class,
            ])->group(base_path('routes/marketing.php'));

            /*
             * OAuth discovery / dynamic registration must remain public so MCP
             * clients can discover Passport before they have an access token.
             */
            Route::group([], base_path('routes/ai.php'));

            /*
             * MCP deliberately has two protocol authentication paths: legacy
             * AccoNova bearer keys and standards-based OAuth. Neither protocol
             * endpoint inherits browser CSRF middleware.
             */
            Route::group([], base_path('routes/mcp-protocol.php'));
            Route::middleware('web')
                ->group(base_path('routes/mcp-management.php'));

            Route::middleware('web')
                ->group(base_path('routes/platform-admin.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(ClearTenantContext::class);
        $middleware->prepend(SetUserLocale::class);
        $middleware->encryptCookies(except: ['acconova_locale']);

        $middleware->alias([
            'platform.admin' => EnsurePlatformAdmin::class,
        ]);

        $middleware->redirectGuestsTo(function (Request $request): string {
            if ($request->is('admin') || $request->is('admin/*')) {
                return route('login', [
                    'redirect' => $request->getRequestUri(),
                ]);
            }

            return route('login');
        });

        $middleware->validateCsrfTokens(except: [
            'api/billing/webhook',
        ]);

        $middleware->web(append: [
            ForcePasswordChange::class,
            HandleInertiaRequests::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->respond(SafeErrorResponse::render(...));
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*')
                || $request->is('mcp')
                || $request->is('mcp/*')
                || $request->expectsJson(),
        );
    })->create();
