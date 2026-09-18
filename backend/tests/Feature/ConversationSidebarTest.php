<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class ConversationSidebarTest extends TestCase
{
    use RefreshDatabase;

    public function test_customization_is_persisted_and_only_group_admin_can_change_name_and_photo(): void
    {
        [$owner, $member, $group] = $this->workspace();
        Storage::fake('local');
        $this->postJson("/api/team-space/$group/settings", ['action' => 'name', 'name' => 'Renamed team'])->assertOk();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'avatar', 'avatar' => UploadedFile::fake()->image('team.png')])->assertOk();
        $avatar = $this->getJson("/api/team-space/$group/settings")->assertOk()->json('avatar_url');
        $this->get($avatar)->assertOk();
        $this->actingAs($member)->postJson("/api/team-space/$group/settings", ['action' => 'name', 'name' => 'Not allowed'])->assertForbidden();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'avatar', 'avatar' => UploadedFile::fake()->image('other.png')])->assertForbidden();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'theme', 'value' => 'purple'])->assertOk();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'emoji', 'value' => '❤️'])->assertOk();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'nickname', 'user_id' => $member->id, 'nickname' => 'Designer'])->assertOk();
        $this->getJson("/api/team-space/$group/settings")->assertOk()->assertJsonPath('theme', 'purple')->assertJsonPath('quick_reaction', '❤️')->assertJsonPath('nicknames.'.$member->id, 'Designer');
        $this->getJson("/api/team-space/$group/messages")->assertJsonPath('conversation.name', 'Renamed team')->assertJsonPath('conversation.avatar_url', fn (string $url): bool => str_contains($url, "/team-space/$group/avatar"));
        $this->postJson("/api/team-space/$group/settings", ['action' => 'theme', 'value' => 'invalid'])->assertUnprocessable();
    }

    public function test_muting_alerts_is_personal_and_expires(): void
    {
        [$owner, $member, $group] = $this->workspace();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'notifications', 'muted' => true, 'until' => now()->addHour()->toIso8601String()])->assertOk();
        $this->actingAs($member);
        $this->send($group);
        $this->assertDatabaseMissing('workspace_notifications', ['user_id' => $owner->id, 'kind' => 'message']);
        $this->travel(61)->minutes();
        $this->send($group);
        $this->assertDatabaseHas('workspace_notifications', ['user_id' => $owner->id, 'kind' => 'message']);
        $this->actingAs($owner)->getJson("/api/team-space/$group/settings")->assertJsonPath('notifications_muted', false);
    }

    public function test_read_receipts_can_be_hidden_without_marking_old_hidden_reads_as_seen(): void
    {
        [$owner, $member, $group] = $this->workspace();
        $message = $this->send($group);
        $this->actingAs($member)->postJson("/api/team-space/$group/settings", ['action' => 'receipts', 'enabled' => false])->assertOk();
        $this->getJson("/api/team-space/$group/messages")->assertOk();
        $this->actingAs($owner)->getJson("/api/team-space/$group/messages")->assertJsonCount(0, 'messages.0.read_by');
        $this->actingAs($member)->postJson("/api/team-space/$group/settings", ['action' => 'receipts', 'enabled' => true])->assertOk();
        $this->actingAs($owner)->getJson("/api/team-space/$group/messages")->assertJsonCount(0, 'messages.0.read_by');
        $this->actingAs($member)->getJson("/api/team-space/$group/messages")->assertOk();
        $this->actingAs($owner)->getJson("/api/team-space/$group/messages")->assertJsonPath('messages.0.read_by.0', $member->name);
    }

    public function test_pins_and_library_respect_deleted_and_personally_hidden_messages(): void
    {
        [$owner, $member, $group] = $this->workspace();
        $message = $this->send($group, 'Read https://example.com/docs');
        $this->postJson("/api/team-space/$group/settings", ['action' => 'pin', 'message_id' => $message, 'pinned' => true])->assertOk();
        $this->getJson("/api/team-space/$group/settings")->assertJsonCount(1, 'pins');
        $this->getJson("/api/team-space/$group/library?kind=links")->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($member)->deleteJson("/api/team-space/$group/messages/$message", ['mode' => 'for_me'])->assertOk();
        $this->getJson("/api/team-space/$group/library?kind=links")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/team-space/$group/settings")->assertJsonCount(0, 'pins');
        $this->actingAs($owner)->getJson("/api/team-space/$group/settings")->assertJsonCount(1, 'pins');
        $this->deleteJson("/api/team-space/$group/messages/$message", ['mode' => 'everyone'])->assertOk();
        $this->getJson("/api/team-space/$group/settings")->assertJsonCount(0, 'pins');
    }

    public function test_reports_are_delivered_and_visible_only_to_group_admin(): void
    {
        [$owner, $member, $group] = $this->workspace();
        $this->actingAs($member)->postJson("/api/team-space/$group/settings", ['action' => 'report', 'reason' => 'Please review inappropriate messages.'])->assertOk();
        $this->assertDatabaseHas('workspace_notifications', ['user_id' => $owner->id, 'kind' => 'conversation_report']);
        $this->assertDatabaseMissing('workspace_notifications', ['user_id' => $member->id, 'kind' => 'conversation_report']);
        $this->getJson("/api/team-space/$group/settings")->assertJsonCount(0, 'reports');
        $this->actingAs($owner)->getJson("/api/team-space/$group/settings")->assertJsonCount(1, 'reports');
        $direct = $this->postJson('/api/team-space', ['kind' => 'direct', 'members' => [$member->id]])->assertCreated()->json('id');
        $this->actingAs($member)->postJson("/api/team-space/$direct/settings", ['action' => 'report', 'reason' => 'Not a group'])->assertUnprocessable();
    }

    public function test_leaving_transfers_admin_and_revokes_access(): void
    {
        [$owner, $member, $group] = $this->workspace();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'leave'])->assertOk();
        $this->getJson("/api/team-space/$group/settings")->assertNotFound();
        $this->getJson("/api/team-space/$group/messages")->assertNotFound();
        $this->actingAs($member)->getJson("/api/team-space/$group/messages")->assertJsonPath('can_manage', true)->assertJsonPath('conversation.created_by', $member->id);
        $this->postJson("/api/team-space/$group/settings", ['action' => 'name', 'name' => 'New admin'])->assertOk();
        $this->patchJson("/api/team-space/$group/members", ['members' => [$owner->id, $member->id]])->assertOk();
    }

    public function test_nonmembers_cannot_inspect_or_modify_sidebar(): void
    {
        [$owner, $member, $group, $organization] = $this->workspace();
        $outsider = User::factory()->create();
        $organization->users()->attach($outsider->id, ['role' => 'admin']);
        $this->actingAs($outsider)->getJson("/api/team-space/$group/settings")->assertNotFound();
        $this->getJson("/api/team-space/$group/library?kind=files")->assertNotFound();
        $this->postJson("/api/team-space/$group/settings", ['action' => 'theme', 'value' => 'blue'])->assertNotFound();
    }

    private function send(int $conversation, string $body = 'Hello'): int
    {
        return $this->postJson("/api/team-space/$conversation/messages", ['body' => $body, 'request_id' => (string) Str::uuid()])->assertCreated()->json('id');
    }

    /** @return array{User, User, int, Organization} */
    private function workspace(): array
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $organization = Organization::create(['name' => 'Sidebar workspace']);
        $organization->users()->attach($owner->id, ['role' => 'owner']);
        $organization->users()->attach($member->id, ['role' => 'employee']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
        $group = $this->postJson('/api/team-space', ['kind' => 'group', 'name' => 'Team', 'members' => [$member->id]])->assertCreated()->json('id');

        return [$owner, $member, $group, $organization];
    }
}
