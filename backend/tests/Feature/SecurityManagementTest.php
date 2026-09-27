<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SecurityManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_issue_temporary_password_and_target_must_change_it(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$employee] = $this->workspaceUser(OrganizationRole::Employee, $organization);
        $membership = Membership::query()->where('user_id', $employee->id)->firstOrFail();

        $response = $this->actingAs($owner)->postJson(
            "/api/security/members/{$membership->id}/temporary-password",
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

        $ownerMembership = Membership::query()->where('user_id', $owner->id)->firstOrFail();
        $adminMembership = Membership::query()->where('user_id', $otherAdmin->id)->firstOrFail();

        $this->actingAs($admin)
            ->postJson("/api/security/members/{$ownerMembership->id}/temporary-password", ['current_password' => 'Password!12345'])
            ->assertForbidden();

        $this->actingAs($admin)
            ->postJson("/api/security/members/{$adminMembership->id}/temporary-password", ['current_password' => 'Password!12345'])
            ->assertForbidden();
    }

    public function test_owner_can_promote_member_to_admin_but_admin_cannot(): void
    {
        [$owner, $organization] = $this->workspaceUser(OrganizationRole::Owner);
        [$employee] = $this->workspaceUser(OrganizationRole::Employee, $organization);
        [$admin] = $this->workspaceUser(OrganizationRole::Admin, $organization);
        $membership = Membership::query()->where('user_id', $employee->id)->firstOrFail();

        $this->actingAs($admin)
            ->putJson("/api/security/members/{$membership->id}/role", ['role' => 'admin', 'current_password' => 'Password!12345'])
            ->assertForbidden();

        $this->actingAs($owner)
            ->putJson("/api/security/members/{$membership->id}/role", ['role' => 'admin', 'current_password' => 'Password!12345'])
            ->assertOk();

        $this->assertSame('admin', $membership->fresh()->role->value);
    }

    public function test_flagged_user_is_forced_to_change_password_and_can_complete_flow(): void
    {
        [$user] = $this->workspaceUser(OrganizationRole::Employee);
        $user->forceFill([
            'must_change_password' => true,
            'temporary_password_expires_at' => now()->addHour(),
        ])->save();

        $this->actingAs($user)->get('/app')->assertRedirect('/password-change-required');

        $this->actingAs($user)->postJson('/api/security/change-required-password', [
            'password' => 'NewSecure!Password123',
            'password_confirmation' => 'NewSecure!Password123',
        ])->assertOk();

        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('NewSecure!Password123', $user->password));
    }

    private function workspaceUser(
        OrganizationRole $role,
        ?Organization $organization = null,
    ): array {
        $organization ??= Organization::factory()->create();
        $user = User::factory()->create([
            'password' => Hash::make('Password!12345'),
            'email_verified_at' => now(),
        ]);

        Membership::factory()->create([
            'organization_id' => $organization->id,
            'user_id' => $user->id,
            'role' => $role->value,
        ]);

        return [$user, $organization];
    }
}
