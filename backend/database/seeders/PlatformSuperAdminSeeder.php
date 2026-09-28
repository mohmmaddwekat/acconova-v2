<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class PlatformSuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        $email = strtolower(trim((string) config(
            'platform_admin.super_admin.email',
            'admin@acconova.com',
        )));
        $name = trim((string) config(
            'platform_admin.super_admin.name',
            'AccoNova Super Admin',
        ));
        $password = (string) config('platform_admin.super_admin.password', '');

        if ($email === '') {
            $this->command?->warn(
                'Platform Super Admin seeding skipped: PLATFORM_SUPER_ADMIN_EMAIL is empty.',
            );

            return;
        }

        $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();

        if (! $user && $password === '') {
            $this->command?->warn(
                'Platform Super Admin seeding skipped: set PLATFORM_SUPER_ADMIN_PASSWORD in .env before seeding a fresh database.',
            );

            return;
        }

        if (! $user) {
            $user = new User();
            $user->email = $email;
        }

        $user->name = $name !== ''
            ? $name
            : ($user->name ?: 'AccoNova Super Admin');
        $user->platform_role = User::PLATFORM_ROLE_SUPER_ADMIN;
        $user->email_verified_at ??= now();
        $user->must_change_password = false;
        $user->temporary_password_expires_at = null;

        // Only rotate the password when an explicit secret is configured.
        // This keeps repeated seeding idempotent and avoids silently changing
        // an existing administrator's password.
        if ($password !== '') {
            $user->password = $password;
            $user->password_changed_at = now();
        }

        $user->save();

        $this->command?->info("Platform Super Admin ready: {$email}");
    }
}
