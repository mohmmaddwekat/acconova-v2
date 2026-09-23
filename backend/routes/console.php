<?php

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Services\Billing\BillingGrowthLifecycleService;
use App\Services\Billing\BillingGrowthService;
use App\Services\Billing\StripeSubscriptionManager;
use App\Services\InvoiceAutomationService;
use App\Services\NotificationCenter;
use App\Services\ScheduledReportService;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('notifications:sync', function (): void {
    Organization::query()->chunkById(100, function ($organizations): void {
        foreach ($organizations as $organization) {
            app(NotificationCenter::class)->syncDue($organization->id);
        }
    });
})->purpose('Persist upcoming and overdue payment notifications');

Schedule::command('notifications:sync')->hourly()->withoutOverlapping();

Artisan::command('reports:sync-scheduled', function (): void {
    Organization::query()->chunkById(100, function ($organizations): void {
        foreach ($organizations as $organization) {
            app(ScheduledReportService::class)->runDue($organization->id);
        }
    });
})->purpose('Generate due scheduled report snapshots and notify recipients');

Schedule::command('reports:sync-scheduled')->hourly()->withoutOverlapping();

Artisan::command('invoices:sync-recurring', function (): void {
    $tenant = app(TenantContext::class);

    Organization::query()->chunkById(100, function ($organizations) use ($tenant): void {
        foreach ($organizations as $organization) {
            try {
                $tenant->set($organization, OrganizationRole::Owner);
                app(InvoiceAutomationService::class)->syncDue($organization->id);
            } finally {
                $tenant->clear();
            }
        }
    });
})->purpose('Create review-only drafts for due recurring invoice profiles');

Schedule::command('invoices:sync-recurring')->hourly()->withoutOverlapping();

Artisan::command('billing:growth-sync', function (): void {
    Organization::query()->chunkById(100, function ($organizations): void {
        foreach ($organizations as $organization) {
            app(BillingGrowthLifecycleService::class)->process($organization);
            app(BillingGrowthService::class)->syncOrganization($organization);
        }
    });
})->purpose('Refresh AccoNova billing health, grace, retention and recovery signals');

Schedule::command('billing:growth-sync')->hourly()->withoutOverlapping();

Artisan::command('billing:sync-addons', function (): void {
    $rows = [];

    foreach (app(StripeSubscriptionManager::class)->syncAddonCatalog() as $addon) {
        foreach ((array) ($addon['prices'] ?? []) as $interval => $price) {
            $rows[] = [
                (string) ($addon['key'] ?? '—'),
                (string) $interval,
                (string) ($price['price_id'] ?? '—'),
                (bool) ($price['created'] ?? false) ? 'created' : 'existing',
            ];
        }
    }

    $this->table(['Add-on', 'Interval', 'Stripe Price', 'Status'], $rows);
    $this->info('AccoNova Stripe add-on catalog is ready.');
})->purpose('Create or reuse recurring Stripe products and prices for capacity add-ons');

Artisan::command('billing:revenue-report', function (): void {
    $metrics = app(BillingGrowthService::class)->platformMetrics();
    $this->table(['Metric', 'Value'], collect($metrics)->map(
        fn ($value, $key): array => [(string) $key, (string) $value],
    )->values()->all());
})->purpose('Show internal AccoNova subscription revenue and recovery metrics');
