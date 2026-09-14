<?php

namespace App\Providers;

use App\Enums\OrganizationRole;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(TenantContext::class, fn () => new TenantContext);
    }

    public function boot(): void
    {
        Gate::define('manage-organization', fn (User $user) => in_array(app(TenantContext::class)->role(), [OrganizationRole::Owner, OrganizationRole::Admin], true));
        Gate::define('manage-members', fn (User $user) => in_array(app(TenantContext::class)->role(), [OrganizationRole::Owner, OrganizationRole::Admin], true));

        RateLimiter::for('auth', fn (Request $request) => [
            Limit::perMinute(20)->by($request->ip()),
            Limit::perMinute(5)->by(strtolower((string) $request->input('email')).'|'.$request->ip()),
        ]);
    }
}
