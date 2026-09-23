<?php

namespace App\Providers;

use App\Events\StockMovementRecorded;
use App\Models\PaymentPlan;
use App\Models\PaymentRecord;
use App\Models\ServiceOperation;
use App\Services\NotificationCenter;
use App\Services\WorkspacePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
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
        Route::middleware('web')->group(base_path('routes/billing-growth.php'));

        Gate::before([WorkspacePermissions::class, 'decide']);
        Event::listen(StockMovementRecorded::class, function (StockMovementRecorded $event): void {
            rescue(fn () => app(NotificationCenter::class)->stock($event));
        });
        ServiceOperation::created(function (ServiceOperation $operation): void {
            $snapshot = clone $operation;
            DB::afterCommit(fn () => rescue(fn () => app(NotificationCenter::class)->service($snapshot)));
        });
        PaymentRecord::created(function (PaymentRecord $record): void {
            $snapshot = clone $record;
            DB::afterCommit(fn () => rescue(fn () => app(NotificationCenter::class)->payment($snapshot)));
        });
        PaymentPlan::updated(function (PaymentPlan $plan): void {
            if (! $plan->active && $plan->wasChanged('active')) {
                $organizationId = (int) $plan->organization_id;
                $key = 'payment_due:'.$plan->id.':%';
                DB::afterCommit(fn () => rescue(fn () => app(NotificationCenter::class)->resolve($organizationId, $key)));
            }
        });
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
