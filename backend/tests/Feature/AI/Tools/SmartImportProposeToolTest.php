<?php

namespace Tests\Feature\AI\Tools;

use App\Enums\OrganizationRole;
use App\Models\AiImportDraft;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\AI\Tools\SmartImportProposeTool;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * `AiGateway` sits on top of `AiProviderManager`, which is `final`, so it
 * cannot be mocked with `$this->mock()`. This test fakes the HTTP call the
 * configured provider makes, following the same convention established by
 * `ImportClassifierTest`.
 */
class SmartImportProposeToolTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $otherUser;

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
        $this->otherUser = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Import Workspace']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);
        $this->organization->users()->attach($this->otherUser->id, ['role' => 'employee']);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_propose_updates_the_draft_with_classification(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        $this->mockClassifierToReturn(
            '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
        );

        $result = app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id]);

        $this->assertSame('party', $draft->fresh()->target_entity);
        $this->assertSame(['name' => 'name'], $draft->fresh()->field_mapping);
        $this->assertSame('party', $result['target_entity']);
        $this->assertSame($draft->id, $result['draft_id']);
        $this->assertSame(1, $result['row_count']);
        $this->assertSame([['name' => 'Acme Co']], $result['sample_rows']);
    }

    public function test_propose_rejects_a_draft_owned_by_another_user(): void
    {
        $draft = AiImportDraft::factory()->for($this->otherUser)->create();

        $this->expectException(ModelNotFoundException::class);

        app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id]);
    }

    /**
     * `ai.business_data.write` has no `builtin` roles (opt-in only), and
     * `WorkspaceFeaturePermissions::allowsForRole()` short-circuits to true
     * for the `owner`/`admin` base roles regardless of the permission
     * catalog. So proving a real denial requires a non-owner/admin role
     * (`employee`) with no custom grant for this permission.
     */
    public function test_allowed_denies_a_user_without_the_write_permission(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $this->assertFalse(
            app(SmartImportProposeTool::class)->allowed($this->otherUser),
        );
    }

    /**
     * Granting the permission through a custom workspace role (the same
     * mechanism real organizations use to opt an employee into
     * `ai.business_data.write`) must make `allowed()` return true.
     */
    public function test_allowed_grants_a_user_with_the_write_permission(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $role = WorkspaceRole::create([
            'name' => 'AI data writer',
            'base_role' => 'employee',
            'is_custom' => true,
            'permissions' => ['ai.business_data.write'],
        ]);

        $membership = Membership::query()
            ->where('user_id', $this->otherUser->id)
            ->first();
        $membership->workspace_role_id = $role->id;
        $membership->save();

        $this->assertTrue(
            app(SmartImportProposeTool::class)->allowed($this->otherUser),
        );
    }

    private function mockClassifierToReturn(string $content): void
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
