<?php

use App\Models\Organization;
use App\Services\NotificationCenter;
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
