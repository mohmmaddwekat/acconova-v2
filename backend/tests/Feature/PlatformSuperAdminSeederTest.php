<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PlatformSuperAdminSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PlatformSuperAdminSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_a_verified_super_admin_from_secure_configuration(): void
    {
        config()->set('platform_admin.super_admin', [
            'email' => 'admin@acconova.com',
            'name' => 'AccoNova Super Admin',
            'password' => 'A-strong-test-password-2026!',
        ]);

        $this->seed(PlatformSuperAdminSeeder::class);

        $admin = User::query()->where('email', 'admin@acconova.com')->firstOrFail();

        $this->assertSame(User::PLATFORM_ROLE_SUPER_ADMIN, $admin->platform_role);
        $this->assertSame('AccoNova Super Admin', $admin->name);
        $this->assertNotNull($admin->email_verified_at);
        $this->assertTrue(Hash::check('A-strong-test-password-2026!', $admin->password));
        $this->assertFalse((bool) $admin->must_change_password);
    }

    public function test_it_promotes_an_existing_account_without_duplicating_or_rotating_its_password(): void
    {
        $existing = User::factory()->create([
            'name' => 'Existing Admin',
            'email' => 'admin@acconova.com',
            'password' => 'keep-this-password',
            'email_verified_at' => null,
        ]);

        config()->set('platform_admin.super_admin', [
            'email' => 'admin@acconova.com',
            'name' => 'AccoNova Super Admin',
            'password' => null,
        ]);

        $this->seed(PlatformSuperAdminSeeder::class);

        $existing->refresh();

        $this->assertSame(1, User::query()->where('email', 'admin@acconova.com')->count());
        $this->assertSame(User::PLATFORM_ROLE_SUPER_ADMIN, $existing->platform_role);
        $this->assertNotNull($existing->email_verified_at);
        $this->assertTrue(Hash::check('keep-this-password', $existing->password));
    }

    public function test_it_does_not_create_a_new_account_without_an_explicit_password(): void
    {
        config()->set('platform_admin.super_admin', [
            'email' => 'admin@acconova.com',
            'name' => 'AccoNova Super Admin',
            'password' => null,
        ]);

        $this->seed(PlatformSuperAdminSeeder::class);

        $this->assertDatabaseMissing('users', [
            'email' => 'admin@acconova.com',
        ]);
    }
}
