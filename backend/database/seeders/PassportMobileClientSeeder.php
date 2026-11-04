<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class PassportMobileClientSeeder extends Seeder
{
    /**
     * Ensure a personal-access Passport client exists for mobile auth.
     *
     * Safe to run multiple times — skips creation when a client already exists.
     */
    public function run(): void
    {
        $exists = DB::table('oauth_clients')
            ->whereJsonContains('grant_types', 'personal_access')
            ->where('revoked', false)
            ->exists();

        if ($exists) {
            $this->command->info('Passport personal-access client already exists — skipping.');

            return;
        }

        Artisan::call('passport:client', [
            '--personal' => true,
            '--name' => 'Acconova Mobile',
            '--no-interaction' => true,
        ]);

        $this->command->info('Passport personal-access client created.');
    }
}
