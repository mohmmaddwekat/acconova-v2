<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SecurityManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_issue_temporary_password_and_target_must_change_it(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$employee] = $this->workspaceUser(OrganizationRole::Employee, $organization);
        $membershipId = $this->membershipId($employee, $organization);

        $response = $this
            ->withSession([OrganizationAccess::SESSION_KEY => $organization->id])
            ->actingAs($owner)
            ->postJson(
                "/api/security/members/{$membershipId}/temporary-password",
                ['current_password' => 'Password!12345'],
            );

        $response->assertOk()->assertJsonStructure(['temporary_password', 'expires_at']);
        $temporary = $response->json('temporary_password');

        $employee->refresh();
        $this->assertTrue($employee->must_change_password);
        $this->assertTrue(Hash::check($temporary, $employee->password));
        $this->assertNotNull($employee->temporary_password_expires_at);
    }

    public function test_admin_cannot_reset_owner_or_another_admin(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$admin] = $this->workspaceUser(OrganizationRole::Admin, $organization);
        [$otherAdmin] = $this->workspaceUser(OrganizationRole::Admin, $organization);

        $ownerMembershipId = $this->membershipId($owner, $organization);
        $adminMembershipId = $this->membershipId($otherAdmin, $organization);

        $this
            ->withSession([OrganizationAccess::SESSION_KEY => $organization->id])
            ->actingAs($admin)
            ->postJson("/api/security/members/{$ownerMembershipId}/temporary-password", ['current_password' => 'Password!12345'])
            ->assertForbidden();

        $this
            ->withSession([OrganizationAccess::SESSION_KEY => $organization->id])
            ->actingAs($admin)
            ->postJson("/api/security/members/{$adminMembershipId}/temporary-password", ['current_password' => 'Password!12345'])
            ->assertForbidden();
    }

    public function test_owner_can_promote_member_to_admin_but_admin_cannot(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$employee] = $this->workspaceUser(OrganizationRole::Employee, $organization);
        [$admin] = $this->workspaceUser(OrganizationRole::Admin, $organization);
        $membershipId = $this->membershipId($employee, $organization);

        $this
            ->withSession([OrganizationAccess::SESSION_KEY => $organization->id])
            ->actingAs($admin)
            ->putJson("/api/security/members/{$membershipId}/role", ['role' => 'admin', 'current_password' => 'Password!12345'])
            ->assertForbidden();

        $this
            ->withSession([OrganizationAccess::SESSION_KEY => $organization->id])
            ->actingAs($owner)
            ->putJson("/api/security/members/{$membershipId}/role", ['role' => 'admin', 'current_password' => 'Password!12345'])
            ->assertOk();

        $this->assertDatabaseHas('memberships', [
            'id' => $membershipId,
            'role' => 'admin',
        ]);
    }

    public function test_flagged_user_is_forced_to_change_password_and_can_complete_flow(): void
    {
        [$user, $organization] = $this->workspaceUser(OrganizationRole::Employee);
        $user->forceFill([
            'must_change_password' => true,
            'temporary_password_expires_at' => now()->addHour(),
        ])->save();

        $this
            ->withSession([OrganizationAccess::SESSION_KEY => $organization->id])
            ->actingAs($user)
            ->get('/app')
            ->assertRedirect('/password-change-required');

        $this->actingAs($user)->postJson('/api/security/change-required-password', [
            'password' => 'NewSecure!Password123',
            'password_confirmation' => 'NewSecure!Password123',
        ])->assertOk();

        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertNull($user->temporary_password_expires_at);
        $this->assertTrue(Hash::check('NewSecure!Password123', $user->password));
    }

    public function test_expired_temporary_password_cannot_authenticate(): void
    {
        [$user] = $this->workspaceUser(OrganizationRole::Employee);
        $user->forceFill([
            'must_change_password' => true,
            'temporary_password_expires_at' => now()->subMinute(),
        ])->save();

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'Password!12345',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);

        $this->assertGuest();
    }

    private function workspaceUser(
        OrganizationRole $role,
        ?Organization $organization = null,
    ): array {
        $organization ??= Organization::create([
            'name' => 'Security Test '.uniqid('', true),
        ]);

        $user = User::factory()->create([
            'password' => 'Password!12345',
            'email_verified_at' => now(),
        ]);

        $hasOwner = $organization->users()
            ->wherePivot('role', OrganizationRole::Owner->value)
            ->exists();

        if (! $hasOwner && $role !== OrganizationRole::Owner) {
            $owner = User::factory()->create([
                'password' => 'Password!12345',
                'email_verified_at' => now(),
            ]);
            $organization->users()->attach($owner->id, [
                'role' => OrganizationRole::Owner->value,
            ]);
        }

        $organization->users()->attach($user->id, [
            'role' => $role->value,
        ]);

        return [$user, $organization];
    }

    private function membershipId(User $user, Organization $organization): int
    {
        return (int) DB::table('memberships')
            ->where('organization_id', $organization->id)
            ->where('user_id', $user->id)
            ->value('id');
    }
}
