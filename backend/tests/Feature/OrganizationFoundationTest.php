<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Http\Middleware\ResolveOrganization;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use LogicException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OrganizationFoundationTest extends TestCase
{
    use RefreshDatabase;

    private function organization(User $user, string $role = 'owner'): Organization
    {
        $organization = Organization::create(['name' => 'Organization '.$user->id]);
        $organization->users()->attach($role === 'owner' ? $user->id : User::factory()->create()->id, ['role' => 'owner']);
        if ($role !== 'owner') {
            $organization->users()->attach($user->id, ['role' => $role]);
        }

        return $organization;
    }

    private function assertContextCleared(): void
    {
        foreach (['id', 'role'] as $method) {
            try {
                app(TenantContext::class)->{$method}();
                $this->fail('Tenant context leaked.');
            } catch (LogicException) {
                $this->assertTrue(true);
            }
        }
    }

    /** @return array<string, array{string}> */
    public static function roles(): array
    {
        return [
            'owner' => ['owner'], 'admin' => ['admin'], 'manager' => ['manager'],
            'accountant' => ['accountant'], 'employee' => ['employee'],
        ];
    }

    /** @return array<string, array{string}> */
    public static function normalRoles(): array
    {
        return ['manager' => ['manager'], 'accountant' => ['accountant'], 'employee' => ['employee']];
    }

    #[DataProvider('roles')]
    public function test_role_access_and_organization_update_permissions(string $role): void
    {
        $user = User::factory()->create();
        $organization = $this->organization($user, $role);
        $this->actingAs($user)->getJson("/api/organizations/{$organization->id}")
            ->assertOk()->assertJsonPath('role', $role);
        $this->patchJson("/api/organizations/{$organization->id}", ['name' => 'Updated'])
            ->assertStatus($role === 'owner' ? 200 : 403);
        $this->assertDatabaseHas('organizations', [
            'id' => $organization->id, 'name' => $role === 'owner' ? 'Updated' : $organization->name,
        ]);
        $this->assertContextCleared();
    }

    #[DataProvider('normalRoles')]
    public function test_normal_roles_cannot_manage_memberships_or_escalate(string $role): void
    {
        $user = User::factory()->create();
        $organization = $this->organization($user, $role);
        $id = DB::table('memberships')->where('user_id', $user->id)->value('id');
        $base = "/api/organizations/{$organization->id}/memberships";
        $this->actingAs($user)->getJson($base)->assertForbidden();
        $this->postJson($base, ['user_id' => User::factory()->create()->id, 'role' => 'employee'])->assertForbidden();
        $this->patchJson("$base/$id", ['role' => 'admin'])->assertForbidden();
        $this->patchJson("$base/$id", ['role' => 'owner'])->assertForbidden();
        $this->deleteJson("$base/$id")->assertForbidden();
        $this->assertDatabaseHas('memberships', ['id' => $id, 'role' => $role]);
        $this->assertContextCleared();
    }

    #[DataProvider('normalRoles')]
    public function test_admin_can_add_update_and_remove_normal_roles(string $role): void
    {
        $admin = User::factory()->create();
        $organization = $this->organization($admin, 'admin');
        $base = "/api/organizations/{$organization->id}/memberships";
        $this->actingAs($admin)->getJson($base)->assertOk();
        $response = $this->postJson($base, ['user_id' => User::factory()->create()->id, 'role' => $role])
            ->assertCreated()->assertJsonPath('data.role', $role);
        $id = $response->json('data.id');
        $newRole = $role === 'employee' ? 'manager' : 'employee';
        $this->patchJson("$base/$id", ['role' => $newRole])->assertOk()->assertJsonPath('data.role', $newRole);
        $this->patchJson("$base/$id", ['role' => 'admin'])->assertForbidden();
        $this->deleteJson("$base/$id")->assertNoContent();
        $this->assertDatabaseMissing('memberships', ['id' => $id]);
        $this->assertSame(1, DB::table('memberships')->where('organization_id', $organization->id)->where('role', 'owner')->count());
    }

    public function test_owner_can_assign_and_manage_all_non_owner_roles(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);
        $base = "/api/organizations/{$organization->id}/memberships";
        $this->actingAs($owner);

        foreach (['admin', 'manager', 'accountant', 'employee'] as $role) {
            $response = $this->postJson($base, ['user_id' => User::factory()->create()->id, 'role' => $role])
                ->assertCreated()->assertJsonPath('data.role', $role)->assertJsonMissingPath('data.owner_guard');
            $id = $response->json('data.id');
            foreach (['admin', 'manager', 'accountant', 'employee'] as $newRole) {
                $this->patchJson("$base/$id", ['role' => $newRole])->assertOk()->assertJsonPath('data.role', $newRole);
            }
            $this->deleteJson("$base/$id")->assertNoContent();
        }

        $this->assertSame(1, DB::table('memberships')->where('organization_id', $organization->id)->count());
    }

    #[DataProvider('roles')]
    public function test_nobody_can_remove_demote_or_replace_owner(string $role): void
    {
        $user = User::factory()->create();
        $organization = $this->organization($user, $role);
        $owner = DB::table('memberships')->where('organization_id', $organization->id)->where('role', 'owner')->first();
        $base = "/api/organizations/{$organization->id}/memberships";
        $this->actingAs($user)->patchJson("$base/{$owner->id}", ['role' => 'employee'])->assertForbidden();
        $this->deleteJson("$base/{$owner->id}")->assertForbidden();
        $this->postJson($base, ['user_id' => User::factory()->create()->id, 'role' => 'owner'])
            ->assertStatus(in_array($role, ['owner', 'admin'], true) ? 422 : 403);
        $this->assertDatabaseHas('memberships', [
            'id' => $owner->id, 'user_id' => $owner->user_id, 'organization_id' => $organization->id, 'role' => 'owner',
        ]);
    }

    public function test_admin_cannot_change_self_or_promote_anyone_to_owner(): void
    {
        $admin = User::factory()->create();
        $organization = $this->organization($admin, 'admin');
        $id = DB::table('memberships')->where('user_id', $admin->id)->value('id');
        $base = "/api/organizations/{$organization->id}/memberships";
        $this->actingAs($admin)->patchJson("$base/$id", ['role' => 'owner'])->assertUnprocessable();
        $this->patchJson("$base/$id", ['role' => 'employee'])->assertForbidden();
        $this->deleteJson("$base/$id")->assertForbidden();
        $this->assertDatabaseHas('memberships', ['id' => $id, 'role' => 'admin']);
    }

    public function test_owner_cannot_promote_existing_members_or_use_legacy_role(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);
        $user = User::factory()->create();
        $organization->users()->attach($user->id, ['role' => 'employee']);
        $id = DB::table('memberships')->where('user_id', $user->id)->value('id');
        $base = "/api/organizations/{$organization->id}/memberships";
        $this->actingAs($owner)->patchJson("$base/$id", ['role' => 'owner'])->assertUnprocessable();
        $this->patchJson("$base/$id", ['role' => 'member'])->assertUnprocessable();
        $this->postJson($base, ['user_id' => User::factory()->create()->id, 'role' => 'member'])->assertUnprocessable();
        $this->assertDatabaseHas('memberships', ['id' => $id, 'role' => 'employee']);
    }

    public function test_creation_has_exactly_one_owner_and_selects_the_organization(): void
    {
        $owner = User::factory()->create();
        $response = $this->actingAs($owner)->postJson('/api/organizations', [
            'name' => 'New organization', 'owner_id' => User::factory()->create()->id, 'role' => 'admin',
        ])->assertCreated();
        $id = $response->json('data.id');
        $this->assertSame(1, DB::table('memberships')->where('organization_id', $id)->count());
        $this->assertDatabaseHas('memberships', ['organization_id' => $id, 'user_id' => $owner->id, 'role' => 'owner']);
        $response->assertSessionHas(OrganizationAccess::SESSION_KEY, $id);
    }

    public function test_failed_owner_insert_rolls_back_organization_creation(): void
    {
        $missingUser = User::factory()->make();
        $missingUser->id = 999999;
        $this->withoutExceptionHandling();
        try {
            $this->actingAs($missingUser)->postJson('/api/organizations', ['name' => 'Must roll back']);
            $this->fail('Missing owner was accepted.');
        } catch (QueryException) {
            $this->assertDatabaseCount('organizations', 0);
            $this->assertDatabaseCount('memberships', 0);
            $this->assertContextCleared();
        }
    }

    /** @return array<string, array{string}> */
    public static function forbiddenOwnerWrites(): array
    {
        return ['delete' => ['delete'], 'demote' => ['role'], 'replace' => ['user_id'], 'move' => ['organization_id']];
    }

    #[DataProvider('forbiddenOwnerWrites')]
    public function test_database_protects_owner_even_for_bulk_writes(string $operation): void
    {
        $organization = $this->organization(User::factory()->create());
        $other = $this->organization(User::factory()->create());
        $replacement = User::factory()->create();
        $query = DB::table('memberships')->where('organization_id', $organization->id)->where('role', 'owner');
        $this->expectException(QueryException::class);
        if ($operation === 'delete') {
            $query->delete();
        } else {
            $query->update([$operation => match ($operation) {
                'role' => 'employee', 'user_id' => $replacement->id, 'organization_id' => $other->id,
            }]);
        }
    }

    #[DataProvider('roles')]
    public function test_user_can_switch_to_each_role_and_selection_survives_requests(string $role): void
    {
        $user = User::factory()->create();
        $first = $this->organization($user);
        $second = $this->organization($user, $role);
        $this->actingAs($user)->putJson('/api/current-organization', ['organization_id' => $first->id])->assertOk();
        $this->putJson('/api/current-organization', ['organization_id' => $second->id, 'role' => 'owner'])
            ->assertOk()->assertJsonPath('data.id', $second->id)->assertJsonPath('role', $role)
            ->assertSessionHas(OrganizationAccess::SESSION_KEY, $second->id);
        $this->getJson('/api/current-organization')->assertOk()->assertJsonPath('data.id', $second->id)->assertJsonPath('role', $role);
        $this->assertContextCleared();
    }

    public function test_switch_rejects_unrelated_missing_and_invalid_ids_without_changing_selection(): void
    {
        $user = User::factory()->create();
        $own = $this->organization($user);
        $other = $this->organization(User::factory()->create());
        $this->actingAs($user)->putJson('/api/current-organization', ['organization_id' => $own->id])->assertOk();
        foreach ([$other->id, 999999] as $id) {
            $this->putJson('/api/current-organization', ['organization_id' => $id])->assertNotFound()
                ->assertSessionHas(OrganizationAccess::SESSION_KEY, $own->id);
            $this->assertContextCleared();
        }
        foreach ([null, 0, -1, 'abc', [$own->id]] as $id) {
            $this->putJson('/api/current-organization', ['organization_id' => $id])->assertUnprocessable();
        }
        $this->getJson('/api/current-organization')->assertOk()->assertJsonPath('data.id', $own->id);
    }

    public function test_missing_selection_and_guest_switch_fail_closed(): void
    {
        $this->getJson('/api/current-organization')->assertUnauthorized();
        $this->putJson('/api/current-organization', ['organization_id' => 1])->assertUnauthorized();
        $this->actingAs(User::factory()->create())->getJson('/api/current-organization')->assertNotFound();
        $this->assertContextCleared();
    }

    public function test_invalidated_session_has_no_current_organization(): void
    {
        $user = User::factory()->create();
        $organization = $this->organization($user);
        $this->actingAs($user)->putJson('/api/current-organization', ['organization_id' => $organization->id])->assertOk();
        $this->app['session.store']->invalidate();
        $this->getJson('/api/current-organization')->assertNotFound();
        $this->assertContextCleared();
    }

    public function test_tampered_or_revoked_session_selection_never_creates_context(): void
    {
        $user = User::factory()->create();
        $other = $this->organization(User::factory()->create());
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $other->id])
            ->getJson('/api/current-organization')->assertNotFound()->assertSessionMissing(OrganizationAccess::SESSION_KEY);
        $organization = $this->organization($user, 'employee');
        $this->putJson('/api/current-organization', ['organization_id' => $organization->id])->assertOk();
        $organization->users()->detach($user->id);
        $this->getJson('/api/current-organization')->assertNotFound()->assertSessionMissing(OrganizationAccess::SESSION_KEY);
        $this->assertContextCleared();
    }

    public function test_roles_are_reloaded_after_demotion_and_switching_does_not_grant_permissions(): void
    {
        $user = User::factory()->create();
        $owned = $this->organization($user);
        $managed = $this->organization($user, 'admin');
        $this->actingAs($user)->putJson('/api/current-organization', ['organization_id' => $owned->id])->assertOk();
        $this->putJson('/api/current-organization', ['organization_id' => $managed->id])->assertOk();
        $managed->users()->updateExistingPivot($user->id, ['role' => 'employee']);
        $this->getJson('/api/current-organization')->assertOk()->assertJsonPath('role', 'employee');
        $this->getJson("/api/organizations/{$managed->id}/memberships")->assertForbidden();
        $this->postJson("/api/organizations/{$managed->id}/memberships", [
            'user_id' => User::factory()->create()->id, 'role' => 'employee',
        ])->assertForbidden();
    }

    public function test_switching_scopes_queries_and_foreign_ids_remain_inaccessible(): void
    {
        Route::middleware(['web', 'auth', ResolveOrganization::class])->get('/api/test-current-memberships', function () {
            return response()->json(['ids' => Membership::pluck('organization_id')->all()]);
        });
        $user = User::factory()->create();
        $first = $this->organization($user);
        $second = $this->organization($user);
        $second->users()->attach(User::factory()->create()->id, ['role' => 'employee']);
        $foreignMembership = DB::table('memberships')->where('organization_id', $first->id)->value('id');
        $this->actingAs($user)->putJson('/api/current-organization', ['organization_id' => $first->id])->assertOk();
        $this->getJson('/api/test-current-memberships')->assertOk()->assertExactJson(['ids' => [$first->id]]);
        $this->putJson('/api/current-organization', ['organization_id' => $second->id])->assertOk();
        $this->getJson('/api/test-current-memberships')->assertOk()->assertExactJson(['ids' => [$second->id, $second->id]]);
        $this->patchJson("/api/organizations/{$second->id}/memberships/{$foreignMembership}", ['role' => 'employee'])->assertNotFound();
        $this->deleteJson("/api/organizations/{$second->id}/memberships/{$foreignMembership}")->assertNotFound();
        $this->getJson('/api/current-organization')->assertOk()->assertJsonPath('data.id', $second->id);
        $this->assertContextCleared();
    }

    public function test_logout_clears_selection_context_and_authentication(): void
    {
        $user = User::factory()->create(['password' => 'long-password-123']);
        $organization = $this->organization($user);
        $this->actingAs($user)->putJson('/api/current-organization', ['organization_id' => $organization->id])->assertOk();
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->postJson('/api/logout')->assertNoContent()->assertSessionMissing(OrganizationAccess::SESSION_KEY);
        $this->assertGuest();
        $this->assertContextCleared();
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'long-password-123'])->assertOk();
        $this->getJson('/api/current-organization')->assertNotFound();
    }

    public function test_login_and_registration_discard_previous_tenant_selection(): void
    {
        $user = User::factory()->create(['password' => 'long-password-123']);
        $this->withSession([OrganizationAccess::SESSION_KEY => 999999])
            ->postJson('/api/login', ['email' => $user->email, 'password' => 'long-password-123'])
            ->assertOk()->assertSessionMissing(OrganizationAccess::SESSION_KEY);
        $this->postJson('/api/logout')->assertNoContent();
        $this->withSession([OrganizationAccess::SESSION_KEY => 999999])->postJson('/api/register', [
            'name' => 'New user', 'email' => 'new@example.com',
            'password' => 'long-password-123', 'password_confirmation' => 'long-password-123',
        ])->assertCreated()->assertSessionMissing(OrganizationAccess::SESSION_KEY);
    }

    public function test_context_is_cleared_on_non_tenant_requests_and_unhandled_exceptions(): void
    {
        $user = User::factory()->create();
        $organization = $this->organization($user);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->getJson('/')->assertOk();
        $this->assertContextCleared();

        Route::middleware(['web', 'auth', ResolveOrganization::class])->get('/api/test-tenant-failure', function () {
            throw new LogicException('Deliberate failure.');
        });
        $this->actingAs($user)->putJson('/api/current-organization', ['organization_id' => $organization->id])->assertOk();
        $this->withoutExceptionHandling();
        try {
            $this->getJson('/api/test-tenant-failure');
            $this->fail('The request should fail.');
        } catch (LogicException $exception) {
            $this->assertSame('Deliberate failure.', $exception->getMessage());
        }
        $this->assertContextCleared();
    }

    /**
     * Verify the complete HTTP lifecycle for deleting and restoring an
     * organization while preserving its ownership data.
     */
    public function test_owner_can_soft_delete_and_restore_organization(): void
    {
        $owner = User::factory()->create();
        $organization = $this->organization($owner);

        $this->actingAs($owner)
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->deleteJson("/api/organizations/{$organization->id}")
            ->assertNoContent()
            ->assertSessionMissing(
                OrganizationAccess::SESSION_KEY,
            );

        $this->assertSoftDeleted('organizations', [
            'id' => $organization->id,
        ]);

        $this->assertDatabaseHas('memberships', [
            'organization_id' => $organization->id,
            'user_id' => $owner->id,
            'role' => 'owner',
        ]);

        $this->getJson(
            "/api/organizations/{$organization->id}",
        )->assertNotFound();

        $this->postJson(
            "/api/organizations/{$organization->id}/restore",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.id',
                $organization->id,
            );

        $this->assertDatabaseHas('organizations', [
            'id' => $organization->id,
            'deleted_at' => null,
        ]);
    }

    /**
     * Verify that preserved organization membership does not allow a non-Owner
     * to restore a deleted tenant.
     */
    public function test_non_owner_cannot_restore_deleted_organization(): void
    {
        $admin = User::factory()->create();

        $organization = $this->organization(
            $admin,
            OrganizationRole::Admin->value,
        );

        $ownerMembership = DB::table('memberships')
            ->where('organization_id', $organization->id)
            ->where('role', 'owner')
            ->first();

        $owner = User::findOrFail(
            $ownerMembership->user_id,
        );

        $this->actingAs($owner)
            ->deleteJson(
                "/api/organizations/{$organization->id}",
            )
            ->assertNoContent();

        $this->actingAs($admin)
            ->postJson(
                "/api/organizations/{$organization->id}/restore",
            )
            ->assertNotFound();

        $this->assertSoftDeleted('organizations', [
            'id' => $organization->id,
        ]);
    }
}
