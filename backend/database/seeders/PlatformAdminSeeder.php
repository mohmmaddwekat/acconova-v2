<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

final class PlatformAdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = strtolower(trim((string) env('PLATFORM_ADMIN_SEED_EMAIL', 'admin@acconova.com')));
        $password = (string) env('PLATFORM_ADMIN_SEED_PASSWORD', '');

        if ($password === '') {
            $this->command?->warn('PLATFORM_ADMIN_SEED_PASSWORD is empty; platform admin was not created.');
            return;
        }

        User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => 'AccoNova Platform Admin',
                'password' => Hash::make($password),
                'email_verified_at' => now(),
            ],
        );

        $this->command?->info("Platform admin ready: {$email}");
    }
}
