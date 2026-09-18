<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConversationAdminsTest extends TestCase
{
    use RefreshDatabase;

    public function test_promoted_admin_can_manage_group_and_loses_permissions_on_demotion(): void
    {
        [$owner, $member, $admin, $group] = $this->workspace();
        $this->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => true])->assertOk();
        $this->getJson("/api/team-space/$group/people/$admin->id")->assertJsonPath('is_admin', true);
        $this->actingAs($admin)->getJson("/api/team-space/$group/messages")->assertJsonPath('can_manage', true);
        $this->postJson("/api/team-space/$group/settings", ['action' => 'name', 'name' => 'Managed by second admin'])->assertOk();
        $this->patchJson("/api/team-space/$group/members", ['members' => [$owner->id, $member->id, $admin->id]])->assertOk();
        $this->putJson("/api/team-space/$group/people/$member->id/restriction", ['scope' => 'group', 'enabled' => true])->assertOk();
        $this->actingAs($owner)->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => false])->assertOk();
        $this->actingAs($admin)->getJson("/api/team-space/$group/messages")->assertJsonPath('can_manage', false);
        $this->postJson("/api/team-space/$group/settings", ['action' => 'name', 'name' => 'Denied'])->assertForbidden();
        $this->putJson("/api/team-space/$group/people/$member->id/restriction", ['scope' => 'group', 'enabled' => false])->assertForbidden();
    }

    public function test_ordinary_members_cannot_assign_roles_and_creator_is_protected(): void
    {
        [$owner, $member, $admin, $group, $organization] = $this->workspace();
        $this->actingAs($member)->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => true])->assertForbidden();
        $this->actingAs($owner)->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => true])->assertOk();
        $this->actingAs($admin)->putJson("/api/team-space/$group/people/$owner->id/admin", ['is_admin' => false])->assertUnprocessable();
        $this->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => false])->assertUnprocessable();
        $this->putJson("/api/team-space/$group/people/$owner->id/restriction", ['scope' => 'group', 'enabled' => true])->assertUnprocessable();
        $outsider = User::factory()->create();
        $organization->users()->attach($outsider->id, ['role' => 'admin']);
        $this->putJson("/api/team-space/$group/people/$outsider->id/admin", ['is_admin' => true])->assertNotFound();
        $this->actingAs($outsider)->putJson("/api/team-space/$group/people/$member->id/admin", ['is_admin' => true])->assertNotFound();
        $direct = $this->actingAs($owner)->postJson('/api/team-space', ['kind' => 'direct', 'members' => [$member->id]])->assertCreated()->json('id');
        $this->putJson("/api/team-space/$direct/people/$member->id/admin", ['is_admin' => true])->assertForbidden();
    }

    public function test_reports_reach_all_admins_and_group_leave_prefers_existing_admin(): void
    {
        [$owner, $member, $admin, $group] = $this->workspace();
        $this->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => true])->assertOk();
        $this->actingAs($member)->postJson("/api/team-space/$group/settings", ['action' => 'report', 'reason' => 'Please review this conversation.'])->assertOk();
        foreach ([$owner->id, $admin->id] as $id) {
            $this->assertDatabaseHas('workspace_notifications', ['user_id' => $id, 'kind' => 'conversation_report']);
        }
        $this->actingAs($admin)->getJson("/api/team-space/$group/settings")->assertJsonCount(1, 'reports');
        $this->actingAs($owner)->postJson("/api/team-space/$group/settings", ['action' => 'leave'])->assertOk();
        $this->actingAs($admin)->getJson("/api/team-space/$group/messages")->assertJsonPath('conversation.created_by', $admin->id)->assertJsonPath('can_manage', true);
    }

    public function test_promotion_removes_group_mute_and_bulk_members_cannot_remove_admin(): void
    {
        [$owner, $member, $admin, $group] = $this->workspace();
        $this->putJson("/api/team-space/$group/people/$admin->id/restriction", ['scope' => 'group', 'enabled' => true])->assertOk();
        $this->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => true])->assertOk();
        $this->assertDatabaseMissing('workspace_message_restrictions', ['context_id' => $group, 'scope' => 'group', 'user_id' => $admin->id]);
        $this->patchJson("/api/team-space/$group/members", ['members' => [$owner->id, $member->id]])->assertUnprocessable();
        $this->assertDatabaseHas('workspace_conversation_members', ['conversation_id' => $group, 'user_id' => $admin->id, 'is_admin' => true]);
        $this->putJson("/api/team-space/$group/people/$admin->id/admin", ['is_admin' => false])->assertOk();
        $this->patchJson("/api/team-space/$group/members", ['members' => [$owner->id, $member->id]])->assertOk();
        $this->assertDatabaseMissing('workspace_conversation_members', ['conversation_id' => $group, 'user_id' => $admin->id]);
    }

    /** @return array{User, User, User, int, Organization} */
    private function workspace(): array
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $admin = User::factory()->create();
        $organization = Organization::create(['name' => 'Group admin workspace']);
        $organization->users()->attach($owner->id, ['role' => 'owner']);
        $organization->users()->attach($member->id, ['role' => 'admin']);
        $organization->users()->attach($admin->id, ['role' => 'employee']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
        $group = $this->postJson('/api/team-space', ['kind' => 'group', 'name' => 'Team', 'members' => [$member->id, $admin->id]])->assertCreated()->json('id');

        return [$owner, $member, $admin, $group, $organization];
    }
}
