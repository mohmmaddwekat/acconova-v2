<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\AiBusinessToolRegistry;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AiUsageTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Usage Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        $this->as($this->owner);
    }

    private function as(User $user, ?Organization $organization = null): void
    {
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => ($organization ?? $this->organization)->id]);
    }

    private function message(User $user, int $tokens, ?string $createdAt = null, ?int $conversationId = null, ?Organization $organization = null): void
    {
        $conversation = $conversationId ?? DB::table('ai_conversations')->insertGetId([
            'organization_id' => ($organization ?? $this->organization)->id, 'user_id' => $user->id, 'title' => 'T',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        DB::table('ai_messages')->insert([
            'organization_id' => ($organization ?? $this->organization)->id, 'ai_conversation_id' => $conversation, 'user_id' => $user->id,
            'role' => 'assistant', 'content' => 'x', 'provider' => 'openai', 'model' => 'test-model',
            'input_tokens' => $tokens - 10, 'output_tokens' => 10, 'total_tokens' => $tokens,
            'created_at' => $createdAt ?? now(), 'updated_at' => $createdAt ?? now(),
        ]);
    }

    private function plan(string $key): void
    {
        DB::table('billing_accounts')->insert([
            'organization_id' => $this->organization->id, 'plan_key' => $key, 'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function usage(string $query = ''): array
    {
        return $this->getJson('/api/ai/usage'.$query)->assertOk()->json('data');
    }

    public function test_usage_shows_the_month_so_far_and_ignores_older_months_and_other_companies(): void
    {
        $this->message($this->owner, 1000);
        $this->message($this->owner, 400);
        $this->message($this->owner, 9999, now()->subMonths(2)->toDateTimeString());

        $other = Organization::create(['name' => 'Other Co']);
        $this->message($this->owner, 5555, null, null, $other);

        $data = $this->usage();

        $this->assertSame(1400, $data['allowance']['used_tokens']);
        $this->assertSame(1400, $data['me']['tokens']);
        $this->assertSame(2, $data['me']['messages']);
        $this->assertSame(1400, $data['me']['today_tokens']);
        $this->assertSame(now()->startOfMonth()->toDateString(), $data['period']['start']);
        $this->assertSame(now()->endOfMonth()->addDay()->toDateString(), $data['period']['resets_on']);
        $this->assertSame([['date' => now()->toDateString(), 'tokens' => 1400, 'messages' => 2]], $data['me']['daily']);
        $this->assertSame([['model' => 'test-model', 'tokens' => 1400]], $data['by_model']);
    }

    public function test_the_allowance_comes_from_the_plan_and_reports_remaining_percent_and_overage(): void
    {
        $this->plan('starter');
        $limit = (int) config('billing.plans.starter.limits.ai_tokens');
        $this->message($this->owner, (int) ($limit * 0.4));

        $data = $this->usage()['allowance'];

        $this->assertSame($limit, $data['included_tokens']);
        $this->assertSame(40, $data['percent_used']);
        $this->assertSame($limit - (int) ($limit * 0.4), $data['remaining_included_tokens']);
        $this->assertSame(0, $data['overage_tokens']);

        $this->message($this->owner, $limit);
        $over = $this->usage()['allowance'];
        $this->assertSame(100, $over['percent_used']);
        $this->assertSame(0, $over['remaining_included_tokens']);
        $this->assertSame((int) ($limit * 0.4) + $limit - $limit, $over['overage_tokens']);
    }

    public function test_a_workspace_without_a_plan_allowance_has_no_percentage(): void
    {
        $this->message($this->owner, 700);

        $data = $this->usage()['allowance'];

        $this->assertNull($data['included_tokens']);
        $this->assertNull($data['percent_used']);
        $this->assertNull($data['remaining_included_tokens']);
        $this->assertSame(700, $data['used_tokens']);
    }

    public function test_members_see_their_own_usage_and_only_administrators_see_the_workspace(): void
    {
        $member = User::factory()->create();
        $this->organization->users()->attach($member->id, ['role' => 'accountant']);
        $this->message($this->owner, 900);
        $this->message($member, 300);

        $this->as($member);
        $mine = $this->usage();
        $this->assertSame(300, $mine['me']['tokens']);
        $this->assertNull($mine['workspace']);
        $this->assertSame(1200, $mine['allowance']['used_tokens'], 'the shared allowance is the workspace total');

        $this->as($this->owner);
        $admin = $this->usage();
        $this->assertSame(900, $admin['me']['tokens']);
        $this->assertSame(1200, $admin['workspace']['tokens']);
        $this->assertSame([$this->owner->id, $member->id], array_column($admin['workspace']['top_users'], 'user_id'));
    }

    public function test_a_conversation_reports_its_own_tokens_and_never_another_companys(): void
    {
        $conversationId = DB::table('ai_conversations')->insertGetId([
            'organization_id' => $this->organization->id, 'user_id' => $this->owner->id, 'title' => 'Chat',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->message($this->owner, 250, null, $conversationId);
        $this->message($this->owner, 750);

        $this->assertSame(250, $this->usage('?conversation='.$conversationId)['conversation']['tokens']);
        $this->getJson('/api/ai/usage?conversation=abc')->assertUnprocessable();

        $other = Organization::create(['name' => 'Elsewhere']);
        $stranger = User::factory()->create();
        $other->users()->attach($stranger->id, ['role' => 'owner']);
        $this->as($stranger, $other);
        $this->assertSame(0, $this->usage()['allowance']['used_tokens']);
        $this->assertSame(0, $this->usage('?conversation='.$conversationId)['conversation']['tokens']);
    }

    public function test_the_chat_can_report_the_usage(): void
    {
        $this->message($this->owner, 1500);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $registry = app(AiBusinessToolRegistry::class);

        $this->assertTrue($registry->available($this->owner, 'ai_usage'));
        $result = $registry->execute($this->owner, 'ai_usage', [], AiConversation::factory()->for($this->owner)->create());

        $this->assertSame(1500, $result['allowance']['used_tokens']);
        $this->assertSame(1500, $result['my_usage']['tokens']);
        $this->assertSame(1500, $result['workspace_total_tokens']);
    }
}
