<?php

namespace Tests\Feature\AI\Tools;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\AI\Tools\SmartImportCancelTool;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class SmartImportCancelToolTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $otherUser;

    private Organization $organization;

    private AiConversation $conversation;

    protected function setUp(): void
    {
        parent::setUp();

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

        parent::tearDown();
    }

    public function test_cancel_marks_a_draft_as_cancelled(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        $result = app(SmartImportCancelTool::class)->execute($this->user, [
            'draft_id' => $draft->id,
        ], $this->conversation);

        $this->assertSame(AiImportDraft::STATUS_CANCELLED, $draft->fresh()->status);
        $this->assertSame($draft->id, $result['draft_id']);
        $this->assertSame(AiImportDraft::STATUS_CANCELLED, $result['status']);
        $this->assertSame(
            ['before' => ['status' => AiImportDraft::STATUS_DRAFT], 'after' => ['status' => AiImportDraft::STATUS_CANCELLED]],
            $result['audit'],
        );
    }

    public function test_cancel_rejects_a_committed_draft(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_COMMITTED,
        ]);

        $this->expectException(RuntimeException::class);

        try {
            app(SmartImportCancelTool::class)->execute($this->user, [
                'draft_id' => $draft->id,
            ], $this->conversation);
        } finally {
            $this->assertSame(AiImportDraft::STATUS_COMMITTED, $draft->fresh()->status);
        }
    }

    public function test_cancel_rejects_an_already_cancelled_draft(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $this->conversation->id,
            'status' => AiImportDraft::STATUS_CANCELLED,
        ]);

        $this->expectException(RuntimeException::class);

        try {
            app(SmartImportCancelTool::class)->execute($this->user, [
                'draft_id' => $draft->id,
            ], $this->conversation);
        } finally {
            $this->assertSame(AiImportDraft::STATUS_CANCELLED, $draft->fresh()->status);
        }
    }

    public function test_cancel_rejects_a_draft_owned_by_another_user(): void
    {
        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        $this->expectException(ModelNotFoundException::class);

        app(SmartImportCancelTool::class)->execute($this->user, [
            'draft_id' => $draft->id,
        ], $this->conversation);
    }

    /**
     * A draft created in one AI conversation must be unreachable from a
     * different conversation, even by the same user: the lookup is scoped
     * on `ai_conversation_id`, not just `user_id`.
     */
    public function test_cancel_rejects_a_draft_owned_by_a_different_conversation(): void
    {
        $otherConversation = AiConversation::factory()->for($this->user)->create();
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $otherConversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
        ]);

        $this->expectException(ModelNotFoundException::class);

        app(SmartImportCancelTool::class)->execute($this->user, [
            'draft_id' => $draft->id,
        ], $this->conversation);
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
            app(SmartImportCancelTool::class)->allowed($this->otherUser),
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
            app(SmartImportCancelTool::class)->allowed($this->otherUser),
        );
    }
}
