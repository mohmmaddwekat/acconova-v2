<?php

namespace Tests\Feature\AI;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiWorkSessionTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $owner;

    /** @var list<string> */
    private array $modelReplies = [];

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'ai.enabled' => true,
            'ai.default_provider' => 'openai',
            'ai.fallback_providers' => [],
            'ai.max_output_tokens' => 500,
            'ai.timeout_seconds' => 5,
            'ai.providers' => ['openai' => [
                'driver' => 'openai_compatible', 'label' => 'OpenAI', 'base_url' => 'https://ai.example.test',
                'chat_path' => '/v1/chat/completions', 'model' => 'test-model', 'max_tokens_field' => 'max_completion_tokens',
                'auth' => ['mode' => 'api_key', 'api_key' => 'server-only-key'],
            ]],
        ]);

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Work Co']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        $this->as($this->owner);

        Http::preventStrayRequests();
        Http::fake(fn () => Http::response([
            'model' => 'test-model',
            'choices' => [['message' => ['content' => array_shift($this->modelReplies) ?? 'Done.']]],
            'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 10, 'total_tokens' => 30],
        ]));
    }

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    private function as(User $user): void
    {
        $this->actingAs($user)->withSession([OrganizationAccess::SESSION_KEY => $this->organization->id]);
    }

    private function openSession(string $mode = 'work'): int
    {
        return $this->postJson('/api/ai/conversations', ['mode' => $mode])->assertCreated()->assertJsonPath('data.mode', $mode)->json('data.id');
    }

    /**
     * Each step costs a planner reply then an answer; a new plan costs one reply first.
     *
     * @param  list<string>  $replies
     * @return array<string, mixed>
     */
    private function say(int $conversation, string $message, array $replies): array
    {
        $this->modelReplies = $replies;

        return $this->postJson("/api/ai/conversations/{$conversation}/messages", ['message' => $message])->assertOk()->json('data');
    }

    private function noCalls(): string
    {
        return '{"calls":[]}';
    }

    /**
     * @return list<string>
     */
    private function statuses(int $conversation): array
    {
        return array_column($this->getJson("/api/ai/conversations/{$conversation}/tasks")->assertOk()->json('data'), 'status');
    }

    public function test_a_work_session_plans_and_runs_the_steps_with_the_real_tools(): void
    {
        $id = $this->openSession();

        $data = $this->say($id, 'Add customer Dana and show overdue invoices', [
            '{"steps":["Add customer Dana","Show overdue invoices"]}',
            json_encode(['calls' => [['name' => 'party_create', 'arguments' => ['fields' => ['type' => 'person', 'name' => 'Dana', 'roles' => ['customer']]]]]]),
            'Dana was added.',
            $this->noCalls(),
            'No overdue invoices.',
        ]);

        $this->assertSame(['done', 'done'], array_column($data['tasks'], 'status'));
        $this->assertSame(['Add customer Dana', 'Show overdue invoices'], array_column($data['tasks'], 'title'));
        $this->assertStringContainsString("1. Add customer Dana\nDana was added.", $data['message']['content']);
        $this->assertStringContainsString('2. Show overdue invoices', $data['message']['content']);
        $this->assertSame(150, $data['usage']['total_tokens'], 'plan + two steps, planner and answer each');
        $this->assertSame(1, DB::table('parties')->where('name', 'Dana')->count());
    }

    public function test_a_step_that_needs_approval_stops_the_run_and_resumes_after_the_users_yes(): void
    {
        $party = $this->postJson('/api/parties', ['type' => 'person', 'name' => 'Dana', 'roles' => ['customer']])->assertCreated()->json('data.id');
        $id = $this->openSession();
        $archive = fn (array $extra = []): string => json_encode(['calls' => [['name' => 'party_archive', 'arguments' => ['record_id' => $party, ...$extra]]]]);

        $first = $this->say($id, 'Archive Dana then summarize', ['{"steps":["Archive customer Dana","Summarize what was done"]}', $archive(), 'I will archive Dana. Please confirm.']);

        $this->assertSame(['blocked', 'pending'], array_column($first['tasks'], 'status'));
        $this->assertStringStartsWith('[[ACCONOVA_PENDING_V1]]', $first['message']['content']);
        $this->assertNotNull(DB::table('parties')->where('id', $party)->value('id'));
        $this->assertNull(DB::table('parties')->where('id', $party)->value('deleted_at'));

        $token = DB::table('ai_pending_actions')->latest('id')->value('token');
        $second = $this->say($id, 'yes', [$archive(['confirm_token' => $token]), 'Dana was archived.', $this->noCalls(), 'All done.']);

        $this->assertSame(['done', 'done'], array_column($second['tasks'], 'status'));
        $this->assertNotNull(DB::table('parties')->where('id', $party)->value('deleted_at'));
    }

    public function test_long_plans_continue_on_the_next_message_and_can_be_cancelled(): void
    {
        $id = $this->openSession();
        $steps = '{"steps":["one","two","three","four","five","six"]}';

        $first = $this->say($id, 'Do six things', [$steps, ...array_fill(0, 8, $this->noCalls())]);

        $this->assertSame(['done', 'done', 'done', 'done', 'pending', 'pending'], array_column($first['tasks'], 'status'));
        $this->assertStringContainsString('continue', $first['message']['content']);

        $second = $this->say($id, 'continue', array_fill(0, 4, $this->noCalls()));
        $this->assertSame(array_fill(0, 6, 'done'), array_column($second['tasks'], 'status'));

    }

    public function test_cancelling_a_blocked_plan_lets_the_next_request_start_fresh(): void
    {
        $party = $this->postJson('/api/parties', ['type' => 'person', 'name' => 'Rami', 'roles' => ['customer']])->assertCreated()->json('data.id');
        $id = $this->openSession();
        $archive = json_encode(['calls' => [['name' => 'party_archive', 'arguments' => ['record_id' => $party]]]]);

        $this->say($id, 'Archive Rami and report', ['{"steps":["Archive Rami","Report"]}', $archive, 'Please confirm.']);
        $this->assertSame(['blocked', 'pending'], $this->statuses($id));

        $this->postJson("/api/ai/conversations/{$id}/tasks/cancel")->assertOk()->assertJsonPath('data.cancelled', 2);
        $this->assertSame(['cancelled', 'cancelled'], $this->statuses($id));

        $fresh = $this->say($id, 'Never mind, just say hi', ['{"steps":["Say hi"]}', $this->noCalls(), 'Hi!']);
        $this->assertSame(['done'], array_column($fresh['tasks'], 'status'), 'the cancelled plan is replaced');
        $this->assertNull(DB::table('parties')->where('id', $party)->value('deleted_at'), 'the cancelled plan never archived anyone');
    }

    public function test_an_unreadable_plan_falls_back_to_one_step_with_the_request(): void
    {
        $id = $this->openSession();

        $data = $this->say($id, 'Just tell me the date', ['not json at all', $this->noCalls(), 'It is today.']);

        $this->assertSame(['Just tell me the date'], array_column($data['tasks'], 'title'));
        $this->assertSame(['done'], array_column($data['tasks'], 'status'));
    }

    public function test_a_normal_chat_has_no_plan_and_one_users_tasks_are_private(): void
    {
        $chat = $this->openSession('chat');
        $data = $this->say($chat, 'Hello', [$this->noCalls(), 'Hi there.']);

        $this->assertSame([], $data['tasks']);
        $this->assertSame(60, $data['usage']['total_tokens'], 'a chat turn is planner plus answer');
        $this->assertSame('Hi there.', $data['message']['content']);
        $this->assertDatabaseCount('ai_work_tasks', 0);

        $work = $this->openSession();
        $this->say($work, 'Do one thing', ['{"steps":["one"]}', $this->noCalls(), 'ok']);

        $other = User::factory()->create();
        $this->organization->users()->attach($other->id, ['role' => 'accountant']);
        $this->as($other);
        $this->getJson("/api/ai/conversations/{$work}/tasks")->assertNotFound();
        $this->postJson("/api/ai/conversations/{$work}/tasks/cancel")->assertNotFound();
    }
}
