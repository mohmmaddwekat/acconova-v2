<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

class FoundationTest extends TestCase
{
    use RefreshDatabase;

    private function organization(User $user, string $role = 'owner'): Organization
    {
        $organization = Organization::create(['name' => 'Organization '.$user->id]);
        if ($role !== 'owner') {
            $organization->users()->attach(User::factory()->create()->id, ['role' => 'owner']);
        }
        $organization->users()->attach($user->id, ['role' => $role]);

        return $organization;
    }

    private function context(Organization $organization): void
    {
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
    }

    public function test_registration_authenticates_and_hides_password(): void
    {
        $this->postJson('/api/register', [
            'name' => 'Alice', 'email' => 'ALICE@example.com',
            'password' => 'long-password-123', 'password_confirmation' => 'long-password-123',
            'role' => 'owner',
        ])->assertCreated()->assertJsonPath('user.email', 'alice@example.com')->assertJsonMissingPath('user.password');
        $this->assertAuthenticated();
        $this->assertDatabaseCount('memberships', 0);
        $this->assertNotEquals('long-password-123', User::first()->password);
    }

    public function test_registration_rejects_weak_passwords_and_duplicate_email(): void
    {
        User::factory()->create(['email' => 'alice@example.com']);
        $this->postJson('/api/register', [
            'name' => 'Alice', 'email' => 'ALICE@example.com',
            'password' => 'short', 'password_confirmation' => 'short',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_login_and_logout(): void
    {
        $user = User::factory()->create(['password' => 'long-password-123']);
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])->assertUnprocessable();
        $this->assertGuest();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'long-password-123'])->assertOk();
        $this->getJson('/api/user')->assertOk()->assertJsonPath('id', $user->id);
        $this->postJson('/api/logout')->assertNoContent();
        $this->assertGuest();
        $this->getJson('/api/user')->assertUnauthorized();
    }

    public function test_login_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['email' => 'unknown@example.com', 'password' => 'wrong'])->assertUnprocessable();
        }
        $this->postJson('/api/login', ['email' => 'unknown@example.com', 'password' => 'wrong'])->assertStatus(429);
    }

    public function test_csrf_is_enforced_outside_the_test_bypass(): void
    {
        $this->app['env'] = 'local';
        $this->postJson('/api/register', [])->assertStatus(419);
        $token = $this->getJson('/api/csrf-token')->assertOk()->json('csrf_token');
        $this->withHeader('X-CSRF-TOKEN', $token)->postJson('/api/login', [])->assertUnprocessable();
    }

    public function test_anonymous_requests_cannot_access_organizations(): void
    {
        $this->getJson('/api/organizations')->assertUnauthorized();
        $this->postJson('/api/organizations', ['name' => 'Forbidden'])->assertUnauthorized();
        $this->getJson('/api/organizations/1/memberships')->assertUnauthorized();
    }

    public function test_creation_assigns_owner_and_listing_only_includes_memberships(): void
    {
        $user = User::factory()->create();
        $other = $this->organization(User::factory()->create());
        $response = $this->actingAs($user)->postJson('/api/organizations', ['name' => 'AccoNova', 'role' => 'employee'])->assertCreated();
        $this->assertDatabaseHas('memberships', ['organization_id' => $response->json('data.id'), 'user_id' => $user->id, 'role' => 'owner']);
        $this->getJson('/api/organizations')->assertJsonCount(1, 'data')->assertJsonMissing(['id' => $other->id, 'name' => $other->name]);
    }

    public function test_foreign_organization_identifiers_cannot_be_read_or_written(): void
    {
        $user = User::factory()->create();
        $other = $this->organization(User::factory()->create());
        $this->actingAs($user)->getJson("/api/organizations/{$other->id}")->assertNotFound();
        $this->patchJson("/api/organizations/{$other->id}", ['name' => 'Hijacked'])->assertNotFound();
        $this->getJson("/api/organizations/{$other->id}/memberships")->assertNotFound();
        $this->assertDatabaseHas('organizations', ['id' => $other->id, 'name' => $other->name]);
    }

    public function test_roles_are_organization_specific(): void
    {
        $user = User::factory()->create();
        $owned = $this->organization($user);
        $memberOf = $this->organization($user, 'employee');
        $this->actingAs($user)->patchJson("/api/organizations/{$owned->id}", ['name' => 'Updated'])->assertOk();
        $this->patchJson("/api/organizations/{$memberOf->id}", ['name' => 'Forbidden'])->assertForbidden();
        $this->getJson("/api/organizations/{$memberOf->id}")->assertOk()->assertJsonPath('role', 'employee');
        $this->getJson("/api/organizations/{$memberOf->id}/memberships")->assertForbidden();
    }

    public function test_owner_can_manage_members_without_accepting_tenant_override(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);
        $other = $this->organization(User::factory()->create());
        $user = User::factory()->create();
        $response = $this->actingAs($owner)->postJson("/api/organizations/{$organization->id}/memberships", [
            'user_id' => $user->id, 'role' => 'employee', 'organization_id' => $other->id,
        ])->assertCreated()->assertJsonPath('data.organization_id', $organization->id);
        $id = $response->json('data.id');
        $this->patchJson("/api/organizations/{$organization->id}/memberships/{$id}", ['role' => 'admin'])->assertOk();
        $this->deleteJson("/api/organizations/{$organization->id}/memberships/{$id}")->assertNoContent();
        $this->assertDatabaseMissing('memberships', ['id' => $id]);
    }

    public function test_membership_validation_and_owner_protection(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);
        $id = DB::table('memberships')->where('organization_id', $organization->id)->value('id');
        $this->actingAs($owner)->postJson("/api/organizations/{$organization->id}/memberships", ['user_id' => $owner->id, 'role' => 'employee'])->assertUnprocessable();
        $this->postJson("/api/organizations/{$organization->id}/memberships", ['user_id' => User::factory()->create()->id, 'role' => 'owner'])->assertUnprocessable();
        $this->patchJson("/api/organizations/{$organization->id}/memberships/{$id}", ['role' => 'admin'])->assertForbidden();
        $this->deleteJson("/api/organizations/{$organization->id}/memberships/{$id}")->assertForbidden();
    }

    public function test_admin_cannot_promote_self_or_manage_other_admins(): void
    {
        $admin = User::factory()->create();
        $organization = $this->organization($admin, 'admin');
        $otherAdmin = User::factory()->create();
        $organization->users()->attach($otherAdmin->id, ['role' => 'admin']);
        $id = DB::table('memberships')->where('user_id', $otherAdmin->id)->value('id');
        $this->actingAs($admin)->postJson("/api/organizations/{$organization->id}/memberships", [
            'user_id' => User::factory()->create()->id, 'role' => 'admin',
        ])->assertForbidden();
        $this->patchJson("/api/organizations/{$organization->id}/memberships/{$id}", ['role' => 'employee'])->assertForbidden();
        $this->deleteJson("/api/organizations/{$organization->id}/memberships/{$id}")->assertForbidden();
        $this->postJson("/api/organizations/{$organization->id}/memberships", [
            'user_id' => User::factory()->create()->id, 'role' => 'employee',
        ])->assertCreated();
    }

    public function test_foreign_memberships_cannot_be_updated_or_deleted(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);
        $other = $this->organization(User::factory()->create());
        $other->users()->attach(User::factory()->create()->id, ['role' => 'employee']);
        $id = DB::table('memberships')->where('organization_id', $other->id)->where('role', 'employee')->value('id');
        $this->actingAs($owner)->patchJson("/api/organizations/{$organization->id}/memberships/{$id}", ['role' => 'admin'])->assertNotFound();
        $this->deleteJson("/api/organizations/{$organization->id}/memberships/{$id}")->assertNotFound();
        $this->assertDatabaseHas('memberships', ['id' => $id, 'role' => 'employee']);
    }

    public function test_tenant_context_is_cleared_after_success_and_exception(): void
    {
        $user = User::factory()->create();
        $organization = $this->organization($user);
        $this->actingAs($user)->getJson("/api/organizations/{$organization->id}")->assertOk();
        try {
            app(TenantContext::class)->id();
            $this->fail('Context leaked after successful request.');
        } catch (LogicException) {
            $this->assertTrue(true);
        }
        $this->patchJson("/api/organizations/{$organization->id}", [])->assertUnprocessable();
        $this->expectException(LogicException::class);
        app(TenantContext::class)->id();
    }

    public function test_tenant_queries_fail_closed_without_context(): void
    {
        $this->expectException(LogicException::class);
        Membership::count();
    }

    public function test_tenant_creates_fail_closed_without_context(): void
    {
        $this->expectException(LogicException::class);
        Membership::create(['user_id' => User::factory()->create()->id, 'role' => 'employee']);
    }

    public function test_scope_filters_reads_and_bulk_updates_and_deletes(): void
    {
        $first = $this->organization(User::factory()->create());
        $second = $this->organization(User::factory()->create());
        $first->users()->attach(User::factory()->create()->id, ['role' => 'employee']);
        $second->users()->attach(User::factory()->create()->id, ['role' => 'employee']);
        $this->context($first);
        $this->assertSame(2, Membership::count());
        Membership::where('role', 'employee')->update(['role' => 'admin']);
        $this->assertDatabaseHas('memberships', ['organization_id' => $first->id, 'role' => 'admin']);
        Membership::where('role', 'admin')->delete();
        $this->assertDatabaseMissing('memberships', ['organization_id' => $first->id, 'role' => 'admin']);
        $this->assertDatabaseHas('memberships', ['organization_id' => $first->id, 'role' => 'owner']);
        $this->assertDatabaseHas('memberships', ['organization_id' => $second->id, 'role' => 'employee']);
        $this->assertDatabaseHas('memberships', ['organization_id' => $second->id, 'role' => 'owner']);
    }

    public function test_stale_model_cannot_be_saved_under_another_context(): void
    {
        $first = $this->organization(User::factory()->create());
        $second = $this->organization(User::factory()->create());
        $this->context($first);
        $record = Membership::firstOrFail();
        $this->context($second);
        $this->expectException(LogicException::class);
        $record->save();
    }

    public function test_stale_model_cannot_be_deleted_under_another_context(): void
    {
        $first = $this->organization(User::factory()->create());
        $second = $this->organization(User::factory()->create());
        $this->context($first);
        $record = Membership::firstOrFail();
        $this->context($second);
        $this->expectException(LogicException::class);
        $record->delete();
    }

    public function test_model_rejects_explicit_foreign_tenant_assignment(): void
    {
        $first = $this->organization(User::factory()->create());
        $second = $this->organization(User::factory()->create());
        $this->context($first);
        $record = new Membership(['user_id' => User::factory()->create()->id, 'role' => 'employee']);
        $record->organization_id = $second->id;
        $this->expectException(LogicException::class);
        $record->save();
    }

    public function test_database_allows_multiple_admins_and_members_in_one_organization(): void
    {
        $organization = $this->organization(User::factory()->create());
        foreach (['admin', 'admin', 'employee', 'employee'] as $role) {
            $organization->users()->attach(User::factory()->create()->id, ['role' => $role]);
        }

        $this->assertSame(5, $organization->users()->count());
    }

    public function test_database_rejects_promoting_a_second_owner(): void
    {
        $organization = $this->organization(User::factory()->create());
        $member = User::factory()->create();
        $organization->users()->attach($member->id, ['role' => 'employee']);

        $this->expectException(QueryException::class);
        $organization->users()->updateExistingPivot($member->id, ['role' => 'owner']);
    }

    public function test_database_rejects_membership_for_missing_user(): void
    {
        $organization = $this->organization(User::factory()->create());

        $this->expectException(QueryException::class);
        $organization->users()->attach(999999, ['role' => 'employee']);
    }

    public function test_database_rejects_membership_for_missing_organization(): void
    {
        $user = User::factory()->create();

        $this->expectException(QueryException::class);
        DB::table('memberships')->insert(['organization_id' => 999999, 'user_id' => $user->id, 'role' => 'employee']);
    }

    public function test_deleting_an_organization_removes_only_its_memberships(): void
    {
        $first = $this->organization(User::factory()->create());
        $second = $this->organization(User::factory()->create());

        $first->delete();

        $this->assertDatabaseMissing('memberships', ['organization_id' => $first->id]);
        $this->assertDatabaseHas('memberships', ['organization_id' => $second->id]);
        $this->assertDatabaseCount('users', 2);
    }

    public function test_deleting_a_user_with_membership_is_restricted(): void
    {
        $user = User::factory()->create();
        $this->organization($user);

        $this->expectException(QueryException::class);
        $user->delete();
    }

    public function test_database_rejects_duplicate_memberships(): void
    {
        $user = User::factory()->create();
        $organization = $this->organization($user);
        $this->expectException(QueryException::class);
        $organization->users()->attach($user->id, ['role' => 'employee']);
    }

    public function test_database_rejects_invalid_roles(): void
    {
        $organization = $this->organization(User::factory()->create());
        $user = User::factory()->create();
        $this->expectException(QueryException::class);
        $organization->users()->attach($user->id, ['role' => 'superadmin']);
    }

    public function test_database_rejects_multiple_owners(): void
    {
        $organization = $this->organization(User::factory()->create());
        $user = User::factory()->create();
        $this->expectException(QueryException::class);
        $organization->users()->attach($user->id, ['role' => 'owner']);
    }
}
