<?php

namespace App\Providers;

use App\Tenancy\TenantContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register TenantContext as a request-scoped dependency so tenant state
     * is isolated between requests and jobs.
     */
    public function register(): void
    {
        $this->app->scoped(
            TenantContext::class,
            fn () => new TenantContext,
        );
    }

    /**
     * Configure application-wide request rate limiting.
     */
    public function boot(): void
    {
        RateLimiter::for(
            'auth',
            fn (Request $request): array => [
                Limit::perMinute(20)
                    ->by($request->ip()),

                Limit::perMinute(5)
                    ->by(
                        strtolower(
                            (string) $request->input('email'),
                        ).'|'.$request->ip(),
                    ),
            ],
        );
    }
}
