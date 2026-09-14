<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class OrganizationRoleMigrationTest extends TestCase
{
    use DatabaseMigrations;

    /**
     * Verify that ownership protection refuses to activate when a legacy
     * organization does not have exactly one Owner.
     */
    public function test_ownerless_legacy_organizations_are_rejected_before_protection_is_enabled(): void
    {
        $protectionMigration = $this->ownershipProtectionMigration();

        /*
         * Disable only the ownership-protection migration being tested.
         * Using rollback step counts would become unreliable whenever a new
         * unrelated migration is added later.
         */
        $protectionMigration->down();

        $organization = Organization::create([
            'name' => 'Invalid legacy organization',
        ]);

        try {
            $protectionMigration->up();

            $this->fail(
                'Ownership protection accepted an ownerless organization.',
            );
        } catch (RuntimeException $exception) {
            $this->assertSame(
                'Every existing organization must have exactly one owner before enabling ownership protection.',
                $exception->getMessage(),
            );
        } finally {
            /*
             * Remove the deliberately invalid fixture with a direct database
             * delete so protection can be restored for the remaining tests.
             */
            DB::table('organizations')
                ->where('id', $organization->id)
                ->delete();

            $protectionMigration->up();
        }
    }

    /**
     * Verify that the role-expansion migration converts legacy members to
     * employees and that its rollback restores legacy membership roles
     * without deleting membership records.
     */
    public function test_existing_members_migrate_to_employees_and_rollback_preserves_memberships(): void
    {
        $roleMigration = $this->roleExpansionMigration();
        $protectionMigration = $this->ownershipProtectionMigration();

        /*
         * Roll back the exact migrations under test in reverse dependency
         * order instead of relying on the current global migration count.
         */
        $protectionMigration->down();
        $roleMigration->down();

        $owner = User::factory()->create();
        $member = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Existing organization',
        ]);

        $organization->users()->attach($owner->id, [
            'role' => 'owner',
        ]);

        $organization->users()->attach($member->id, [
            'role' => 'member',
        ]);

        $membershipId = DB::table('memberships')
            ->where('user_id', $member->id)
            ->value('id');

        $roleMigration->up();
        $protectionMigration->up();

        $this->assertDatabaseHas('memberships', [
            'id' => $membershipId,
            'user_id' => $member->id,
            'organization_id' => $organization->id,
            'role' => 'employee',
        ]);

        $this->assertDatabaseHas('memberships', [
            'user_id' => $owner->id,
            'organization_id' => $organization->id,
            'role' => 'owner',
        ]);

        foreach (['manager', 'accountant', 'admin'] as $role) {
            $organization->users()->attach(
                User::factory()->create()->id,
                ['role' => $role],
            );
        }

        $protectionMigration->down();
        $roleMigration->down();

        $this->assertSame(
            3,
            DB::table('memberships')
                ->where('role', 'member')
                ->count(),
        );

        $this->assertDatabaseCount('memberships', 5);

        $roleMigration->up();
        $protectionMigration->up();

        $this->assertSame(
            3,
            DB::table('memberships')
                ->where('role', 'employee')
                ->count(),
        );

        $this->assertSame(
            1,
            DB::table('memberships')
                ->where('role', 'owner')
                ->count(),
        );
    }

    /**
     * Load the exact migration responsible for expanding organization roles.
     */
    private function roleExpansionMigration(): Migration
    {
        return require database_path(
            'migrations/2026_09_14_090811_expand_organization_roles.php',
        );
    }

    /**
     * Load the exact migration responsible for database-level Owner
     * protection.
     */
    private function ownershipProtectionMigration(): Migration
    {
        return require database_path(
            'migrations/2026_09_14_091146_protect_organization_ownership.php',
        );
    }
}
