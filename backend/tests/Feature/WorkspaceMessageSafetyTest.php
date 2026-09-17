<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class WorkspaceMessageSafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_group_creator_can_mute_and_expiration_restores_sending(): void
    {
        [$owner, $member, $other, $group] = $this->workspace();
        $this->actingAs($member);
        $message = $this->send($group)->assertCreated()->json('id');
        $this->actingAs($other)->putJson("/api/team-space/$group/people/$member->id/restriction", ['scope' => 'group', 'enabled' => true])->assertForbidden();
        $this->actingAs($owner)->putJson("/api/team-space/$group/people/$member->id/restriction", ['scope' => 'group', 'enabled' => true, 'expires_at' => now()->addHour()->toIso8601String()])->assertOk();
        $this->actingAs($member)->getJson("/api/team-space/$group/messages")->assertOk()->assertJsonPath('restriction.by', $owner->name)->assertJsonPath('restriction.scope', 'group');
        $this->send($group)->assertForbidden();
        $this->patchJson("/api/team-space/$group/messages/$message", ['body' => 'Edited while muted'])->assertForbidden();
        $this->travel(61)->minutes();
        $this->send($group)->assertCreated();
        $this->getJson("/api/team-space/$group/messages")->assertJsonPath('restriction', null);
    }

    public function test_private_block_is_directional_and_does_not_block_groups_and_can_be_removed(): void
    {
        [$owner, $member, $other, $group] = $this->workspace();
        $this->actingAs($member)->putJson("/api/team-space/$group/people/$owner->id/restriction", ['scope' => 'direct', 'enabled' => true])->assertOk();
        $direct = $this->postJson('/api/team-space', ['kind' => 'direct', 'members' => [$owner->id]])->assertCreated()->json('id');
        $this->send($direct)->assertCreated();
        $this->actingAs($owner);
        $this->send($direct)->assertForbidden();
        $this->send($group)->assertCreated();
        $this->actingAs($member)->putJson("/api/team-space/$group/people/$owner->id/restriction", ['scope' => 'direct', 'enabled' => false])->assertOk();
        $this->actingAs($owner);
        $this->send($direct)->assertCreated();
    }

    public function test_restrictions_reject_self_past_dates_and_nonmembers_and_profiles_hide_private_fields(): void
    {
        [$owner, $member, $other, $group, $organization] = $this->workspace();
        $this->putJson("/api/team-space/$group/people/$owner->id/restriction", ['scope' => 'direct', 'enabled' => true])->assertUnprocessable();
        $this->putJson("/api/team-space/$group/people/$member->id/restriction", ['scope' => 'group', 'enabled' => true, 'expires_at' => now()->subMinute()->toIso8601String()])->assertUnprocessable();
        $this->getJson("/api/team-space/$group/people/$member->id")->assertOk()->assertJsonPath('can_mute_group', true)->assertJsonMissingPath('email')->assertJsonMissingPath('phone');
        $outsider = User::factory()->create();
        $organization->users()->attach($outsider->id, ['role' => 'employee']);
        $this->getJson("/api/team-space/$group/people/$outsider->id")->assertNotFound();
        $this->actingAs($outsider)->getJson("/api/team-space/$group/people/$member->id")->assertNotFound();
        $this->putJson("/api/team-space/$group/people/$member->id/restriction", ['scope' => 'direct', 'enabled' => true])->assertNotFound();
        $foreign = Organization::create(['name' => 'Other tenant']);
        $foreign->users()->attach($owner->id, ['role' => 'owner']);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $foreign->id]);
        $this->getJson("/api/team-space/$group/people/$member->id")->assertNotFound();
    }

    public function test_notifications_are_private_deduplicated_and_read_with_thread(): void
    {
        [$owner, $member, $other, $group, $organization] = $this->workspace();
        $outsider = User::factory()->create();
        $organization->users()->attach($outsider->id, ['role' => 'employee']);
        $payload = ['body' => 'Hello', 'request_id' => (string) Str::uuid()];
        $this->postJson("/api/team-space/$group/messages", $payload)->assertCreated();
        $this->postJson("/api/team-space/$group/messages", $payload)->assertSuccessful();
        $this->assertDatabaseCount('workspace_notifications', 2);
        $this->assertDatabaseMissing('workspace_notifications', ['user_id' => $owner->id]);
        $this->assertDatabaseMissing('workspace_notifications', ['user_id' => $outsider->id]);
        $this->actingAs($member)->getJson('/api/notifications?category=messages')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'message');
        $this->getJson("/api/team-space/$group/messages?mark_read=0")->assertOk();
        $this->getJson('/api/notifications?unread=1&category=messages')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/team-space/$group/messages")->assertOk();
        $this->getJson('/api/notifications?unread=1&category=messages')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_reactions_expose_member_names_and_support_removing_own_reaction(): void
    {
        [$owner, $member, $other, $group] = $this->workspace();
        $message = $this->send($group)->assertCreated()->json('id');
        $this->actingAs($member)->patchJson("/api/team-space/$group/messages/$message", ['reaction' => '❤️'])->assertOk();
        $this->getJson("/api/team-space/$group/messages")->assertOk()
            ->assertJsonPath('messages.0.reactions.0.users.0.id', $member->id)
            ->assertJsonPath('messages.0.reactions.0.people.0', $member->name)
            ->assertJsonPath('messages.0.reactions.0.reacted_by_me', true);
        $this->patchJson("/api/team-space/$group/messages/$message", ['reaction' => '❤️'])->assertOk();
        $this->getJson("/api/team-space/$group/messages")->assertOk()->assertJsonCount(0, 'messages.0.reactions');
    }

    private function send(int $conversation): TestResponse
    {
        return $this->postJson("/api/team-space/$conversation/messages", ['body' => 'Hello', 'request_id' => (string) Str::uuid()]);
    }

    /** @return array{User, User, User, int, Organization} */
    private function workspace(): array
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $other = User::factory()->create();
        $organization = Organization::create(['name' => 'Messaging workspace']);
        $organization->users()->attach($owner->id, ['role' => 'owner']);
        $organization->users()->attach($member->id, ['role' => 'employee']);
        $organization->users()->attach($other->id, ['role' => 'admin']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
        $group = $this->postJson('/api/team-space', ['kind' => 'group', 'name' => 'Team', 'members' => [$member->id, $other->id]])->assertCreated()->json('id');

        return [$owner, $member, $other, $group, $organization];
    }
}
