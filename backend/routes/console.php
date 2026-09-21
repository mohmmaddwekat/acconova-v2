<?php

use App\Models\Organization;
use App\Services\NotificationCenter;
use App\Services\ScheduledReportService;
use App\Services\InvoiceAutomationService;
use App\Tenancy\TenantContext;
use App\Enums\OrganizationRole;
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

Schedule::command('reports:sync-scheduled')
    ->hourly()
    ->withoutOverlapping();


Artisan::command('invoices:sync-recurring', function (): void {
    $tenant = app(TenantContext::class);

    Organization::query()->chunkById(100, function ($organizations) use ($tenant): void {
        foreach ($organizations as $organization) {
            try {
                $tenant->set(
                    $organization,
                    OrganizationRole::Owner,
                );

                app(InvoiceAutomationService::class)
                    ->syncDue(
                        $organization->id,
                    );
            } finally {
                $tenant->clear();
            }
        }
    });
})->purpose('Create review-only drafts for due recurring invoice profiles');

Schedule::command('invoices:sync-recurring')
    ->hourly()
    ->withoutOverlapping();
