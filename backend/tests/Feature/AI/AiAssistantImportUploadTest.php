<?php

namespace Tests\Feature\AI;

use App\Enums\OrganizationRole;
use App\Models\AiImportDraft;
use App\Models\AiMessage;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiAssistantImportUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_uploading_a_csv_creates_a_draft_and_tags_the_message(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import upload');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/*' => Http::sequence()
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => json_encode(['calls' => []], JSON_THROW_ON_ERROR),
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 10,
                        'completion_tokens' => 5,
                        'total_tokens' => 15,
                    ],
                ])
                ->push([
                    'model' => 'tool-test-model',
                    'choices' => [[
                        'message' => [
                            'content' => 'I can help you import these rows.',
                        ],
                    ]],
                    'usage' => [
                        'prompt_tokens' => 20,
                        'completion_tokens' => 10,
                        'total_tokens' => 30,
                    ],
                ]),
        ]);

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $response = $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import these',
                'import_file' => [
                    'data_url' => $this->csvDataUrl("name\nJane\n"),
                    'name' => 'x.csv',
                    'mime' => 'text/csv',
                ],
            ],
        );

        $response->assertOk();

        $this->assertDatabaseHas('ai_import_drafts', [
            'ai_conversation_id' => $conversationId,
            'user_id' => $user->id,
            'source_file_name' => 'x.csv',
            'source_file_type' => 'spreadsheet',
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        app(TenantContext::class)->set($organization, OrganizationRole::Owner);
        $draft = AiImportDraft::query()->latest('id')->first();
        $this->assertNotNull($draft);
        $this->assertSame([['name' => 'Jane']], $draft->extracted_rows);

        $userMessage = AiMessage::where('role', 'user')->latest('id')->first();
        $this->assertNotNull($userMessage);
        $this->assertStringContainsString('ACCONOVA_IMPORT_DRAFT_V1', $userMessage->content);
        $this->assertStringContainsString("Draft-Id: {$draft->id}", $userMessage->content);
    }

    public function test_an_unsupported_import_file_mime_is_rejected(): void
    {
        [$user, $organization] = $this->workspace('owner', 'Smart import rejection');
        $this->actingInWorkspace($user, $organization);
        $this->configureProvider();

        $conversationId = (int) $this->postJson('/api/ai/conversations', [
            'title' => 'Import question',
        ])->assertCreated()->json('data.id');

        $this->postJson(
            "/api/ai/conversations/{$conversationId}/messages",
            [
                'message' => 'import these',
                'import_file' => [
                    'data_url' => 'data:application/pdf;base64,JVBERi0xLjQK',
                    'name' => 'x.pdf',
                    'mime' => 'application/pdf',
                ],
            ],
        )
            ->assertStatus(422)
            ->assertJsonValidationErrors(['import_file.mime']);
    }

    private function csvDataUrl(string $csv): string
    {
        return 'data:text/csv;base64,'.base64_encode($csv);
    }

    private function configureProvider(): void
    {
        config([
            'billing.enabled' => false,
            'ai.enabled' => true,
            'ai.default_provider' => 'openai',
            'ai.fallback_providers' => [],
            'ai.tools.enabled' => true,
            'ai.tools.max_calls' => 4,
            'ai.tools.planner_max_output_tokens' => 450,
            'ai.tools.max_result_chars' => 30000,
            'ai.providers' => [
                'openai' => [
                    'driver' => 'openai_compatible',
                    'label' => 'OpenAI',
                    'base_url' => 'https://ai.example.test',
                    'chat_path' => '/v1/chat/completions',
                    'model' => 'tool-test-model',
                    'max_tokens_field' => 'max_tokens',
                    'max_output_tokens' => 1200,
                    'auth' => [
                        'mode' => 'api_key',
                        'api_key' => 'server-only-key',
                    ],
                ],
            ],
        ]);
    }

    /** @return array{0:User,1:Organization} */
    private function workspace(string $role, string $name): array
    {
        $user = User::factory()->create();
        $organization = Organization::create(['name' => $name]);
        $organization->users()->attach($user->id, ['role' => $role]);

        return [$user, $organization];
    }

    private function actingInWorkspace(User $user, Organization $organization): void
    {
        $this->actingAs($user)->withSession([
            OrganizationAccess::SESSION_KEY => $organization->id,
        ]);
    }
}
