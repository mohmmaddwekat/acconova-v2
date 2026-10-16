<?php

namespace Tests\Feature\AI\Tools;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
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
use RuntimeException;
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

    private AiConversation $conversation;

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

        $this->conversation = AiConversation::factory()->for($this->user)->create();
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    /**
     * Finding 2 (important, final whole-branch review): unlike
     * `SmartImportReviseTool`, `execute()` had no status guard at all - a
     * concurrent/sequential call landing on an already-committed draft
     * would silently overwrite its `target_entity`/`field_mapping`,
     * corrupting the audit record of what was actually committed. Mirrors
     * `SmartImportReviseToolTest::test_revise_rejects_a_committed_draft`.
     */
    public function test_propose_rejects_a_committed_draft(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_COMMITTED,
            'target_entity' => 'party',
            'field_mapping' => ['name' => 'name'],
        ]);

        // Faked so that, without the status guard, the classifier call
        // would succeed and the (buggy) code would go on to overwrite the
        // committed draft - proving the guard, not an unrelated network
        // failure, is what rejects this call.
        $this->mockClassifierToReturn(
            '{"target_entity":"product","field_mapping":{"name":"name"},"confidence":0.8,"notes":""}',
        );

        $this->expectException(RuntimeException::class);

        try {
            app(SmartImportProposeTool::class)->execute($this->user, [
                'draft_id' => $draft->id,
            ], $this->conversation);
        } finally {
            $this->assertSame('party', $draft->fresh()->target_entity);
            $this->assertSame(['name' => 'name'], $draft->fresh()->field_mapping);
        }
    }

    public function test_propose_updates_the_draft_with_classification(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        $this->mockClassifierToReturn(
            '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
        );

        $result = app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id], $this->conversation);

        $this->assertSame('party', $draft->fresh()->target_entity);
        $this->assertSame(['name' => 'name'], $draft->fresh()->field_mapping);
        $this->assertSame('party', $result['target_entity']);
        $this->assertSame($draft->id, $result['draft_id']);
        $this->assertSame(1, $result['row_count']);
        $this->assertSame([['name' => 'Acme Co']], $result['sample_rows']);
    }

    public function test_propose_returns_the_classifiers_confidence(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        $this->mockClassifierToReturn(
            '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.73,"notes":""}',
        );

        $result = app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id], $this->conversation);

        $this->assertSame(0.73, $result['confidence']);
    }

    /**
     * Task 6: the tool's result must surface the classifier's field_mapping
     * verbatim, plus validation counts computed by remapping extracted_rows
     * through that mapping and running the resolved target entity's
     * `preview()` — here the row is missing Party's required `type`/`roles`
     * fields (the mapping only supplies `name`), so preview() must report it
     * as an error row rather than valid.
     */
    public function test_propose_returns_field_mapping_and_validation_counts(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => null,
            'field_mapping' => null,
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        $this->mockClassifierToReturn(
            '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
        );

        $result = app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id], $this->conversation);

        $this->assertSame(['name' => 'name'], $result['field_mapping']);
        $this->assertSame(0, $result['valid_rows']);
        $this->assertSame(1, $result['error_rows']);
        $this->assertNotEmpty($result['errors']);
        $this->assertLessThanOrEqual(10, count($result['errors']));
        $this->assertSame(
            ['before' => ['target_entity' => null, 'field_mapping' => null], 'after' => ['target_entity' => 'party', 'field_mapping' => ['name' => 'name']]],
            $result['audit'],
        );
    }

    /**
     * Final whole-branch review (important finding): when a draft's
     * extracted rows exceed the target entity's row limit (5000, see
     * `ImportPartiesFromSpreadsheet::analyze()`), `preview()` throws a
     * `ValidationException` instead of returning per-row errors. Before the
     * fix, that exception escaped `validateAgainstTargetEntity()` uncaught,
     * propagated out of the `DB::transaction()` closure in execute(), and
     * rolled back the classification save that had already happened
     * earlier in the same closure - losing the classification entirely and
     * surfacing to the orchestrator as a generic failure rather than a
     * reportable validation outcome. This proves both halves of the fix:
     * the classification is persisted (the transaction committed) AND the
     * tool returns normally with a non-empty error report.
     */
    public function test_propose_reports_errors_without_losing_classification_when_row_limit_exceeded(): void
    {
        $tooManyRows = array_fill(0, 5001, ['name' => 'Acme Co']);

        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => null,
            'field_mapping' => null,
            'extracted_rows' => $tooManyRows,
        ]);

        $this->mockClassifierToReturn(
            '{"target_entity":"party","field_mapping":{"name":"name"},"confidence":0.9,"notes":""}',
        );

        $result = app(SmartImportProposeTool::class)->execute($this->user, [
            'draft_id' => $draft->id,
        ], $this->conversation);

        // The classification save inside the transaction must have
        // committed, even though preview() threw mid-transaction.
        $this->assertSame('party', $draft->fresh()->target_entity);
        $this->assertSame(['name' => 'name'], $draft->fresh()->field_mapping);

        // The tool must return a normal result shape, not throw.
        $this->assertSame(0, $result['valid_rows']);
        $this->assertSame(5001, $result['error_rows']);
        $this->assertNotEmpty($result['errors']);
        $this->assertLessThanOrEqual(10, count($result['errors']));
        $this->assertIsString($result['errors'][0]['message']);
    }

    public function test_propose_rejects_a_draft_owned_by_another_user(): void
    {
        $draft = AiImportDraft::factory()->for($this->otherUser)->create();

        $this->expectException(ModelNotFoundException::class);

        app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id], $this->conversation);
    }

    /**
     * A draft created in one AI conversation must be unreachable from a
     * different conversation, even by the same user: the lookup is scoped
     * on `ai_conversation_id`, not just `user_id`.
     */
    public function test_propose_rejects_a_draft_owned_by_a_different_conversation(): void
    {
        $otherConversation = AiConversation::factory()->for($this->user)->create();
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $otherConversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        $this->expectException(ModelNotFoundException::class);
        app(SmartImportProposeTool::class)->execute($this->user, ['draft_id' => $draft->id], $this->conversation);
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
