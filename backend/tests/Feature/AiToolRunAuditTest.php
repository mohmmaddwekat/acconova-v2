<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\AiToolRun;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\AiAssistantOrchestrator;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Tools\SmartImportReviseTool;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Covers Task 4: generic plumbing for the `before_payload`/`after_payload`
 * columns on `ai_tool_runs`. No real tool populates the `'audit'` key yet
 * (that's Task 6/8's job) — this drives the convention end-to-end through a
 * synthetic `AiWriteTool` test double bound in place of
 * `SmartImportReviseTool`, following the same approach established by
 * `AiAssistantOrchestratorSmartImportTest`.
 */
class AiToolRunAuditTest extends TestCase
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
        $this->organization = Organization::create(['name' => 'Audit Workspace']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_a_tool_result_with_an_audit_key_is_recorded_on_the_tool_run(): void
    {
        $this->bindAuditingWriteToolDouble();

        $conversation = AiConversation::factory()->for($this->user)->create();

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::sequence()
                ->push($this->chatResponse(
                    '{"calls":[{"name":"audit_test_tool","arguments":{}}]}',
                ))
                ->push($this->chatResponse(
                    'Done.',
                )),
        ]);

        $result = app(AiAssistantOrchestrator::class)->chat(
            $conversation,
            $this->user,
            [['role' => 'user', 'content' => 'Please run the audit test tool.']],
        );

        $this->assertContains('audit_test_tool', $result['tool_calls']);

        $run = AiToolRun::where('ai_conversation_id', $conversation->id)
            ->where('tool_name', 'audit_test_tool')
            ->firstOrFail();

        $this->assertSame('success', $run->status);
        $this->assertSame(['balance' => 100], $run->before_payload);
        $this->assertSame(['balance' => 500], $run->after_payload);

        // The raw 'audit' key must never reach the LLM-facing context: only
        // the business-data part of the tool result ('status' and
        // 'balance') should appear in the trusted-tool-results system
        // message sent to the model. (The tool's own name,
        // 'audit_test_tool', legitimately contains the substring "audit",
        // so this decodes the JSON payload and checks the 'data' key
        // structurally rather than substring-matching the raw text.)
        Http::assertSent(function ($request): bool {
            $messages = (array) $request['messages'];

            foreach ($messages as $message) {
                if (
                    ($message['role'] ?? null) !== 'system'
                    || ! str_contains(
                        (string) ($message['content'] ?? ''),
                        'Trusted AccoNova business-tool results',
                    )
                ) {
                    continue;
                }

                $content = (string) $message['content'];
                $jsonStart = strpos($content, '[');

                if ($jsonStart === false) {
                    return false;
                }

                $toolResults = json_decode(
                    substr($content, $jsonStart),
                    true,
                );

                foreach ((array) $toolResults as $toolResult) {
                    if (($toolResult['tool'] ?? null) === 'audit_test_tool') {
                        return $toolResult['data'] === [
                            'status' => 'ok',
                            'balance' => 500,
                        ];
                    }
                }

                return false;
            }

            return false;
        });
    }

    public function test_a_tool_result_without_an_audit_key_records_null_payloads(): void
    {
        $conversation = AiConversation::factory()->for($this->user)->create();

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::sequence()
                ->push($this->chatResponse(
                    '{"calls":[{"name":"sales_summary","arguments":{"date_from":"2026-09-01","date_to":"2026-09-30"}}]}',
                ))
                ->push($this->chatResponse(
                    'No sales were recorded for September.',
                )),
        ]);

        $result = app(AiAssistantOrchestrator::class)->chat(
            $conversation,
            $this->user,
            [['role' => 'user', 'content' => 'How much did we sell in September?']],
        );

        $this->assertContains('sales_summary', $result['tool_calls']);

        $run = AiToolRun::where('ai_conversation_id', $conversation->id)
            ->where('tool_name', 'sales_summary')
            ->firstOrFail();

        $this->assertSame('success', $run->status);
        $this->assertNull($run->before_payload);
        $this->assertNull($run->after_payload);
    }

    /**
     * Binds a minimal `AiWriteTool` test-double, named `audit_test_tool`,
     * in place of `SmartImportReviseTool` in the container —
     * `AiWriteToolRegistry::tools()` resolves its fixed class list via
     * `app($class)`, so this is the only way to add a second write tool to
     * it without modifying the registry. Its result carries an `'audit'`
     * key shaped `{before, after}` alongside ordinary business data
     * (`status`, `balance`), exercising the Task 4 extraction convention
     * that real Task 6/8 tools will use.
     */
    private function bindAuditingWriteToolDouble(): void
    {
        $this->app->instance(SmartImportReviseTool::class, new class implements AiWriteTool
        {
            public function name(): string
            {
                return 'audit_test_tool';
            }

            public function description(): string
            {
                return 'Test-only write tool whose result carries an audit key.';
            }

            /** @return array<string,mixed> */
            public function inputSchema(): array
            {
                return [
                    'type' => 'object',
                    'properties' => [],
                    'additionalProperties' => false,
                ];
            }

            public function allowed(User $user): bool
            {
                return true;
            }

            public function severity(): WriteActionSeverity
            {
                return WriteActionSeverity::Standard;
            }

            /** @param array<string,mixed> $arguments
             * @return array<string,mixed>
             */
            public function execute(User $user, array $arguments, AiConversation $conversation): array
            {
                return [
                    'status' => 'ok',
                    'balance' => 500,
                    'audit' => [
                        'before' => ['balance' => 100],
                        'after' => ['balance' => 500],
                    ],
                ];
            }
        });
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
