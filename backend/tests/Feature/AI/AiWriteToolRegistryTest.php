<?php

namespace Tests\Feature\AI;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\AiWriteToolRegistry;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiWriteToolRegistryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $employee;

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
        $this->employee = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Import Workspace']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);
        $this->organization->users()->attach($this->employee->id, ['role' => 'employee']);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    /**
     * `employee` is a base role with no `builtin` grant for
     * `ai.business_data.write` and no custom workspace role attached, so it
     * is a genuine denial (unlike `owner`/`admin`, which short-circuit to
     * true in `WorkspaceFeaturePermissions::allowsForRole()`).
     */
    public function test_definitions_are_empty_without_business_data_write(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $this->assertSame([], app(AiWriteToolRegistry::class)->definitionsFor($this->employee));
    }

    public function test_execute_dispatches_to_the_matching_tool(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);

        $conversation = AiConversation::factory()->for($this->user)->create();

        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::response([
                'model' => 'test-model',
                'choices' => [
                    [
                        'message' => [
                            'content' => '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
                        ],
                    ],
                ],
                'usage' => [
                    'prompt_tokens' => 20,
                    'completion_tokens' => 10,
                    'total_tokens' => 30,
                ],
            ]),
        ]);

        $result = app(AiWriteToolRegistry::class)->execute($this->user, 'smart_import_propose', ['draft_id' => $draft->id], $conversation);

        $this->assertArrayHasKey('draft_id', $result);
    }
}
