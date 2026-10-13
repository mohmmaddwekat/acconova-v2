<?php

namespace Tests\Feature\AI;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\AiAssistantOrchestrator;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Covers Task 14: `AiAssistantOrchestrator` must be able to dispatch a
 * planner-selected call to `AiWriteToolRegistry` (not just the read-only
 * `AiBusinessToolRegistry`), and still record it through the normal
 * `AiToolRun` audit trail.
 *
 * `AiToolPlanner` and `AiGateway`'s underlying `AiProviderManager` are both
 * `final`, so they cannot be mocked with `$this->mock()`. This test instead
 * drives the real planner and fakes the three sequential HTTP calls it and
 * the write tool make, following the same convention established by
 * `AiWriteToolRegistryTest` and `SmartImportProposeToolTest`:
 *   1. the planner's own call, which selects `smart_import_propose`;
 *   2. the import classifier call made by `SmartImportProposeTool`;
 *   3. the orchestrator's final answer call.
 */
class AiAssistantOrchestratorSmartImportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'ai.enabled' => true,
            'ai.default_provider' => 'openai',
            'ai.fallback_providers' => [],
            'ai.max_output_tokens' => 500,
            'ai.timeout_seconds' => 5,
            'ai.providers' => [
                'openai' => [
                    'driver' => 'openai_compatible',
                    'label' => 'OpenAI',
                    'base_url' => 'https://ai.example.test',
                    'chat_path' => '/v1/chat/completions',
                    'model' => 'test-model',
                    'max_tokens_field' => 'max_completion_tokens',
                    'auth' => [
                        'mode' => 'api_key',
                        'api_key' => 'server-only-key',
                    ],
                ],
            ],
        ]);

        $this->user = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Import Workspace']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_orchestrator_can_execute_a_write_tool_the_planner_selected(): void
    {
        $conversation = AiConversation::factory()->for($this->user)->create();

        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::sequence()
                ->push($this->chatResponse(
                    '{"calls":[{"name":"smart_import_propose","arguments":{"draft_id":'.$draft->id.'}}]}',
                ))
                ->push($this->chatResponse(
                    '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
                ))
                ->push($this->chatResponse(
                    'The uploaded rows look like party records.',
                )),
        ]);

        $result = app(AiAssistantOrchestrator::class)->chat(
            $conversation,
            $this->user,
            [['role' => 'user', 'content' => 'Please import the attached file.']],
        );

        $this->assertContains('smart_import_propose', $result['tool_calls']);
        $this->assertSame('party', $draft->fresh()->target_entity);

        $this->assertDatabaseHas('ai_tool_runs', [
            'ai_conversation_id' => $conversation->id,
            'user_id' => $this->user->id,
            'tool_name' => 'smart_import_propose',
            'status' => 'success',
        ]);
    }

    /**
     * Finding 1 (critical, final whole-branch review): nothing previously
     * stopped the AI planner from selecting `smart_import_propose` and
     * `smart_import_confirm` in the SAME plan, with no human-visible
     * preview step actually occurring in between - directly contradicting
     * the design spec's "the user always sees a preview... before giving
     * an explicit final confirmation" guarantee
     * (`docs/superpowers/specs/2026-10-10-smart-import-engine-design.md`,
     * §1). `AiToolPlanner::plan()` now drops any `smart_import_confirm`
     * call that rides along with `smart_import_propose`/`_revise` in the
     * same plan. This drives that scenario through the real planner (via
     * a faked HTTP response that returns both calls) and proves the
     * confirm call never reaches `execute()`: no row is written to the
     * target entity table, and the draft's status stays `draft`.
     */
    public function test_orchestrator_never_executes_a_confirm_call_planned_alongside_propose_in_the_same_turn(): void
    {
        $conversation = AiConversation::factory()->for($this->user)->create();

        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => null,
            'field_mapping' => null,
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::sequence()
                ->push($this->chatResponse(
                    '{"calls":[{"name":"smart_import_propose","arguments":{"draft_id":'.$draft->id.'}},'.
                    '{"name":"smart_import_confirm","arguments":{"draft_id":'.$draft->id.'}}]}',
                ))
                ->push($this->chatResponse(
                    '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
                ))
                ->push($this->chatResponse(
                    'The uploaded rows look like party records.',
                )),
        ]);

        $result = app(AiAssistantOrchestrator::class)->chat(
            $conversation,
            $this->user,
            [['role' => 'user', 'content' => 'Please import the attached file and confirm it.']],
        );

        $this->assertContains('smart_import_propose', $result['tool_calls']);
        $this->assertNotContains('smart_import_confirm', $result['tool_calls']);

        $draft->refresh();
        $this->assertSame(AiImportDraft::STATUS_DRAFT, $draft->status);
        $this->assertSame('party', $draft->target_entity);

        $this->assertDatabaseMissing('ai_tool_runs', [
            'ai_conversation_id' => $conversation->id,
            'tool_name' => 'smart_import_confirm',
        ]);

        $this->assertDatabaseCount('parties', 0);
    }

    /** @return array<string,mixed> */
    private function chatResponse(string $content): array
    {
        return [
            'model' => 'test-model',
            'choices' => [
                [
                    'message' => [
                        'content' => $content,
                    ],
                ],
            ],
            'usage' => [
                'prompt_tokens' => 20,
                'completion_tokens' => 10,
                'total_tokens' => 30,
            ],
        ];
    }
}
