<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class MessageReplyTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_reply_carries_a_preview_of_the_original_message(): void
    {
        [$owner, $member, $group] = $this->workspace();
        $original = $this->send($group, 'Please confirm the invoice');

        $this->actingAs($member);
        $reply = $this->send($group, 'Confirmed', $original);

        $this->actingAs($owner);
        $messages = $this->getJson("/api/team-space/$group/messages")->assertOk()->json('messages');
        $replyMessage = collect($messages)->firstWhere('id', $reply);

        $this->assertSame($original, $replyMessage['reply_to']['id']);
        $this->assertSame('Please confirm the invoice', $replyMessage['reply_to']['body']);
        $this->assertSame($owner->name, $replyMessage['reply_to']['name']);
        $this->assertFalse($replyMessage['reply_to']['deleted']);
        $this->assertNull(collect($messages)->firstWhere('id', $original)['reply_to']);
    }

    public function test_a_reply_hides_the_text_of_a_message_that_was_removed_for_everyone(): void
    {
        [$owner, , $group] = $this->workspace();
        $original = $this->send($group, 'Secret figure');
        $reply = $this->send($group, 'Noted', $original);

        $this->deleteJson("/api/team-space/$group/messages/$original", ['mode' => 'everyone'])->assertOk();

        $preview = collect($this->getJson("/api/team-space/$group/messages")->json('messages'))->firstWhere('id', $reply)['reply_to'];

        $this->assertTrue($preview['deleted']);
        $this->assertSame('', $preview['body']);
    }

    public function test_a_reply_must_target_a_message_from_the_same_conversation(): void
    {
        [$owner, $member, $group, $organization] = $this->workspace();
        $otherGroup = $this->postJson('/api/team-space', ['kind' => 'group', 'name' => 'Other', 'members' => [$member->id]])->assertCreated()->json('id');
        $foreign = $this->send($otherGroup, 'Elsewhere');

        $this->postJson("/api/team-space/$group/messages", ['body' => 'Sneaky', 'request_id' => (string) Str::uuid(), 'reply_to_id' => $foreign])->assertUnprocessable();
        $this->postJson("/api/team-space/$group/messages", ['body' => 'Ghost', 'request_id' => (string) Str::uuid(), 'reply_to_id' => 999999])->assertUnprocessable();
    }

    private function send(int $conversation, string $body, ?int $replyTo = null): int
    {
        return $this->postJson("/api/team-space/$conversation/messages", array_filter([
            'body' => $body,
            'request_id' => (string) Str::uuid(),
            'reply_to_id' => $replyTo,
        ]))->assertCreated()->json('id');
    }

    /** @return array{User, User, int, Organization} */
    private function workspace(): array
    {
        $owner = User::factory()->create();
        $member = User::factory()->create();
        $organization = Organization::create(['name' => 'Reply workspace']);
        $organization->users()->attach($owner->id, ['role' => 'owner']);
        $organization->users()->attach($member->id, ['role' => 'employee']);
        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $this->actingAs($owner)->withSession([OrganizationAccess::SESSION_KEY => $organization->id]);
        $group = $this->postJson('/api/team-space', ['kind' => 'group', 'name' => 'Team', 'members' => [$member->id]])->assertCreated()->json('id');

        return [$owner, $member, $group, $organization];
    }
}
