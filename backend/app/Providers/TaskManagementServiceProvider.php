<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class TaskManagementServiceProvider extends ServiceProvider
{
    /**
     * Register Task Management browser and API routes.
     */
    public function boot(): void
    {
        require base_path(
            'routes/task-management.php',
        );
    }
}
