<?php

namespace Database\Seeders;

use App\Models\ServiceOperation;
use Illuminate\Database\Seeder;

class ServiceOperationSeeder extends Seeder
{
    /**
     * Seed sample operations only in a local, explicitly selected tenant context.
     */
    public function run(): void
    {
        if (app()->environment('local')) {
            ServiceOperation::factory()->count(3)->create();
        }
    }
}
