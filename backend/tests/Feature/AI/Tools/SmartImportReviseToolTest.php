<?php

namespace Tests\Feature\AI\Tools;

use App\Enums\OrganizationRole;
use App\Models\AiImportDraft;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\AI\Tools\SmartImportReviseTool;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

/**
 * `AiGateway` sits on top of `AiProviderManager`, which is `final`, so it
 * cannot be mocked with `$this->mock()`. This test fakes the HTTP call the
 * configured provider makes, following the same convention established by
 * `SmartImportProposeToolTest` and `ImportClassifierTest`.
 */
class SmartImportReviseToolTest extends TestCase
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

    public function test_revise_rejects_a_committed_draft(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'status' => AiImportDraft::STATUS_COMMITTED,
        ]);

        $this->expectException(RuntimeException::class);

        app(SmartImportReviseTool::class)->execute($this->user, [
            'draft_id' => $draft->id,
            'instruction' => 'change x',
        ]);
    }

    public function test_revise_reclassifies_with_the_new_instruction(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        $this->mockClassifierToReturn(
            '{"target_entity":"product","field_mapping":{"name":"name"},"confidence":0.8,"notes":""}',
        );

        $result = app(SmartImportReviseTool::class)->execute($this->user, [
            'draft_id' => $draft->id,
            'instruction' => 'actually these are products',
        ]);

        $this->assertSame('product', $draft->fresh()->target_entity);
        $this->assertSame(['name' => 'name'], $draft->fresh()->field_mapping);
        $this->assertSame('product', $result['target_entity']);
        $this->assertSame($draft->id, $result['draft_id']);
        $this->assertSame(1, $result['row_count']);
        $this->assertSame([['name' => 'Acme Co']], $result['sample_rows']);
    }

    /**
     * Mirrors `SmartImportConfirmToolTest::
     * test_confirm_uses_the_field_mapping_as_of_the_locked_reload_not_the_earlier_unlocked_read`
     * for the opposite direction of the same race: a concurrent
     * `smart_import_confirm` commits this draft WHILE the slow
     * `classify()` call (outside any lock) is in flight. Without a
     * locked re-check immediately before the final save, `revise()`
     * would silently overwrite the now-committed draft's
     * `target_entity`/`field_mapping` with the new classification,
     * corrupting the audit record of what was actually committed. This
     * simulates that window with `DB::listen()`: the moment the initial
     * unlocked draft read completes, it commits the draft directly (as a
     * concurrent confirm would), and asserts `revise()` throws instead of
     * saving over it.
     */
    public function test_revise_rejects_when_a_concurrent_confirm_commits_the_draft_while_classify_is_in_flight(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'field_mapping' => ['name' => 'name'],
            'extracted_rows' => [['name' => 'Acme Co']],
        ]);

        $this->mockClassifierToReturn(
            '{"target_entity":"product","field_mapping":{"name":"name"},"confidence":0.8,"notes":""}',
        );

        $simulatedConcurrentConfirmHasRun = false;

        DB::listen(function ($query) use (&$simulatedConcurrentConfirmHasRun, $draft): void {
            if ($simulatedConcurrentConfirmHasRun) {
                return;
            }

            // Only the initial, unlocked draft read matches: the later
            // re-check uses `lockForUpdate()` ("for update" in the SQL).
            if (
                stripos($query->sql, 'ai_import_drafts') === false
                || stripos($query->sql, 'for update') !== false
            ) {
                return;
            }

            $simulatedConcurrentConfirmHasRun = true;

            DB::table('ai_import_drafts')
                ->where('id', $draft->id)
                ->update(['status' => AiImportDraft::STATUS_COMMITTED]);
        });

        try {
            app(SmartImportReviseTool::class)->execute($this->user, [
                'draft_id' => $draft->id,
                'instruction' => 'actually these are products',
            ]);
            $this->fail('Expected revise() to reject a draft committed while classify() was in flight.');
        } catch (RuntimeException) {
            // Expected.
        }

        $this->assertSame('party', $draft->fresh()->target_entity);
        $this->assertSame(['name' => 'name'], $draft->fresh()->field_mapping);
    }

    public function test_revise_rejects_a_draft_owned_by_another_user(): void
    {
        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        $this->expectException(ModelNotFoundException::class);

        app(SmartImportReviseTool::class)->execute($this->user, [
            'draft_id' => $draft->id,
            'instruction' => 'change x',
        ]);
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
            app(SmartImportReviseTool::class)->allowed($this->otherUser),
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
            app(SmartImportReviseTool::class)->allowed($this->otherUser),
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
