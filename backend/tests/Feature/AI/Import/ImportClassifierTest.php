<?php

namespace Tests\Feature\AI\Import;

use App\Enums\OrganizationRole;
use App\Models\AiImportDraft;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\Import\ImportClassifier;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * `AiGateway` sits on top of `AiProviderManager`, which is `final`, so it
 * cannot be mocked with `$this->mock()`. Every existing test that exercises
 * `AiGateway::chat()` (e.g. `AiGatewayTest`, `ImageRowExtractorTest`)
 * instead fakes the HTTP call the configured provider makes, so this test
 * follows that same established convention.
 */
class ImportClassifierTest extends TestCase
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

    public function test_classify_returns_null_target_when_model_is_unsure(): void
    {
        $this->mockGatewayToReturn(
            '{"target_entity":null,"field_mapping":null,"confidence":0.2,"notes":"Unclear what this data represents."}',
        );

        $draft = $this->makeDraft([['col_a' => 'foo', 'col_b' => 'bar']]);

        $result = app(ImportClassifier::class)->classify($this->user, $draft, null);

        $this->assertNull($result['target_entity']);
        $this->assertNull($result['field_mapping']);
        $this->assertSame(0.2, $result['confidence']);
        $this->assertSame('Unclear what this data represents.', $result['notes']);
    }

    public function test_classify_maps_rows_to_a_catalog_entity(): void
    {
        $this->mockGatewayToReturn(
            '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
        );

        $draft = $this->makeDraft([['name' => 'Acme Co']]);

        $result = app(ImportClassifier::class)->classify($this->user, $draft, 'these are customers');

        $this->assertSame('party', $result['target_entity']);
        $this->assertSame(['name' => 'name'], $result['field_mapping']);
        $this->assertSame(0.9, $result['confidence']);

        Http::assertSent(
            fn ($request): bool => str_contains($request['messages'][1]['content'], 'these are customers')
                && str_contains($request['messages'][1]['content'], '"party"'),
        );
    }

    /**
     * A target_entity the model invents that isn't in the permitted catalog
     * must be treated the same as an unconfident response: null, not
     * passed through as if it were a real destination.
     */
    public function test_classify_nulls_out_a_target_entity_not_in_the_catalog(): void
    {
        $this->mockGatewayToReturn(
            '{"target_entity":"not_a_real_entity","field_mapping":{"a":"b"},"confidence":0.8,"notes":""}',
        );

        $draft = $this->makeDraft([['a' => '1']]);

        $result = app(ImportClassifier::class)->classify($this->user, $draft, null);

        $this->assertNull($result['target_entity']);
        $this->assertNull($result['field_mapping']);
    }

    public function test_classify_throws_on_genuinely_unparsable_response(): void
    {
        $this->mockGatewayToReturn('The rows look like customer records.');

        $draft = $this->makeDraft([['name' => 'Acme Co']]);

        $this->expectException(\RuntimeException::class);

        app(ImportClassifier::class)->classify($this->user, $draft, null);
    }

    public function test_classify_returns_usage(): void
    {
        $this->mockGatewayToReturn(
            '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
        );

        $draft = $this->makeDraft([['name' => 'Acme Co']]);

        $result = app(ImportClassifier::class)->classify($this->user, $draft, null);

        $this->assertArrayHasKey('usage', $result);
        $this->assertSame(20, $result['usage']['input_tokens']);
        $this->assertSame(10, $result['usage']['output_tokens']);
        $this->assertSame(30, $result['usage']['total_tokens']);
    }

    public function test_classify_parses_a_response_wrapped_in_a_markdown_code_fence(): void
    {
        $fence = chr(96).chr(96).chr(96);
        $this->mockGatewayToReturn(
            "{$fence}json\n{\"target_entity\":\"product\",\"field_mapping\":{\"sku\":\"sku\"},\"confidence\":0.7,\"notes\":\"\"}\n{$fence}",
        );

        $draft = $this->makeDraft([['sku' => 'ABC-1']]);

        $result = app(ImportClassifier::class)->classify($this->user, $draft, null);

        $this->assertSame('product', $result['target_entity']);
    }

    public function test_notes_containing_a_clarifying_question_round_trips_unchanged(): void
    {
        $question = 'The department column has a value "المبيعات" that does not match any existing department — which one did you mean?';

        $this->mockGatewayToReturn(json_encode([
            'target_entity' => 'party',
            'field_mapping' => ['name' => 'name'],
            'confidence' => 0.6,
            'notes' => $question,
        ]));

        $draft = $this->makeDraft([['name' => 'Acme Co', 'department' => 'المبيعات']]);

        $result = app(ImportClassifier::class)->classify($this->user, $draft, null);

        $this->assertSame($question, $result['notes']);
    }

    /** @param  list<array<string,mixed>>  $rows */
    private function makeDraft(array $rows): AiImportDraft
    {
        return AiImportDraft::factory()->create([
            'user_id' => $this->user->id,
            'extracted_rows' => $rows,
        ]);
    }

    private function mockGatewayToReturn(string $content): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::response([
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
            ]),
        ]);
    }
}
