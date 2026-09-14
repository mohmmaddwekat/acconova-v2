<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class OrganizationRoleMigrationTest extends TestCase
{
    use DatabaseMigrations;

    public function test_ownerless_legacy_organizations_are_rejected_before_protection_is_enabled(): void
    {
        $this->artisan('migrate:rollback', ['--step' => 1, '--force' => true, '--no-interaction' => true])->assertSuccessful();
        Organization::create(['name' => 'Invalid legacy organization']);
        $migration = require database_path('migrations/2026_09_14_091146_protect_organization_ownership.php');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Every existing organization must have exactly one owner');
        $migration->up();
    }

    public function test_existing_members_migrate_to_employees_and_rollback_preserves_memberships(): void
    {
        $this->artisan('migrate:rollback', ['--step' => 2, '--force' => true, '--no-interaction' => true])->assertSuccessful();
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $organization = Organization::create(['name' => 'Existing organization']);
        $organization->users()->attach($owner->id, ['role' => 'owner']);
        $organization->users()->attach($member->id, ['role' => 'member']);
        $membershipId = DB::table('memberships')->where('user_id', $member->id)->value('id');

        $this->artisan('migrate', ['--force' => true, '--no-interaction' => true])->assertSuccessful();
        $this->assertDatabaseHas('memberships', ['id' => $membershipId, 'user_id' => $member->id, 'organization_id' => $organization->id, 'role' => 'employee']);
        $this->assertDatabaseHas('memberships', ['user_id' => $owner->id, 'organization_id' => $organization->id, 'role' => 'owner']);
        foreach (['manager', 'accountant', 'admin'] as $role) {
            $organization->users()->attach(User::factory()->create()->id, ['role' => $role]);
        }

        $this->artisan('migrate:rollback', ['--step' => 2, '--force' => true, '--no-interaction' => true])->assertSuccessful();
        $this->assertSame(3, DB::table('memberships')->where('role', 'member')->count());
        $this->assertDatabaseCount('memberships', 5);
        $this->artisan('migrate', ['--force' => true, '--no-interaction' => true])->assertSuccessful();
        $this->assertSame(3, DB::table('memberships')->where('role', 'employee')->count());
        $this->assertSame(1, DB::table('memberships')->where('role', 'owner')->count());
    }
}
