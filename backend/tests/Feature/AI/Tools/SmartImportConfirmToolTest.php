<?php

namespace Tests\Feature\AI\Tools;

use App\Enums\OrganizationRole;
use App\Models\AiImportDraft;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\Party;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\AI\Tools\SmartImportConfirmTool;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

/**
 * `SmartImportConfirmTool` is the only AI write tool that commits real
 * business data, so these tests cover the permission gate, the
 * status/target-entity guards, and the source-column-to-target-field
 * remapping on top of the ownership check shared with
 * `SmartImportProposeToolTest`/`SmartImportReviseToolTest`.
 */
class SmartImportConfirmToolTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $otherUser;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

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

        parent::tearDown();
    }

    public function test_confirm_requires_business_data_write_permission(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'extracted_rows' => [['name' => 'Acme']],
            'field_mapping' => ['name' => 'name'],
        ]);

        $this->expectException(RuntimeException::class);

        try {
            app(SmartImportConfirmTool::class)->execute($this->otherUser, ['draft_id' => $draft->id]);
        } finally {
            $this->assertDatabaseMissing('parties', ['name' => 'Acme']);
        }
    }

    public function test_confirm_commits_through_the_catalog_entity_and_marks_draft_committed(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);
        $this->grantPermissions($this->otherUser, ['ai.business_data.write', 'parties.import.commit']);

        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'extracted_rows' => [
                ['Type' => 'person', 'Full Name' => 'Acme', 'Role' => 'customer'],
            ],
            'field_mapping' => ['Type' => 'type', 'Full Name' => 'name', 'Role' => 'roles'],
        ]);

        $result = app(SmartImportConfirmTool::class)->execute($this->otherUser, ['draft_id' => $draft->id]);

        $this->assertSame(AiImportDraft::STATUS_COMMITTED, $draft->fresh()->status);
        // MySQL's JSON column type normalizes key order on storage, so
        // compare contents rather than requiring an identical key order.
        $this->assertEqualsCanonicalizing($result, $draft->fresh()->commit_summary);
        $this->assertSame(1, $result['created']);
        $this->assertDatabaseHas('parties', ['name' => 'Acme']);
    }

    /**
     * The row's source column names ("Full Name", "Role") must never reach
     * the Party table literally — only the mapped target field names
     * ("name", "roles") should. This proves `field_mapping` is applied
     * before `commit()`, not just that a party happens to get created.
     */
    public function test_confirm_remaps_source_columns_to_target_fields_before_committing(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);
        $this->grantPermissions($this->otherUser, ['ai.business_data.write', 'parties.import.commit']);

        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'extracted_rows' => [
                ['Type' => 'person', 'Full Name' => 'Widget Traders', 'Role' => 'supplier'],
            ],
            'field_mapping' => ['Type' => 'type', 'Full Name' => 'name', 'Role' => 'roles'],
        ]);

        app(SmartImportConfirmTool::class)->execute($this->otherUser, ['draft_id' => $draft->id]);

        $party = Party::query()->where('name', 'Widget Traders')->firstOrFail();

        $this->assertDatabaseHas('party_roles', [
            'party_id' => $party->id,
            'role' => 'supplier',
        ]);
    }

    public function test_confirm_rejects_a_draft_with_no_resolved_target(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => null,
        ]);

        $this->expectException(RuntimeException::class);

        app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id]);
    }

    public function test_confirm_rejects_an_already_committed_draft(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'status' => AiImportDraft::STATUS_COMMITTED,
            'target_entity' => 'party',
        ]);

        $this->expectException(RuntimeException::class);

        app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id]);
    }

    public function test_confirm_rejects_a_draft_targeting_an_unknown_entity(): void
    {
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'not_a_real_entity',
        ]);

        $this->expectException(RuntimeException::class);

        app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id]);
    }

    public function test_confirm_rejects_a_draft_owned_by_another_user(): void
    {
        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
        ]);

        $this->expectException(ModelNotFoundException::class);

        app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id]);
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
            app(SmartImportConfirmTool::class)->allowed($this->otherUser),
        );
    }

    public function test_allowed_grants_a_user_with_the_write_permission(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);
        $this->grantPermissions($this->otherUser, ['ai.business_data.write']);

        $this->assertTrue(
            app(SmartImportConfirmTool::class)->allowed($this->otherUser),
        );
    }

    /**
     * Grants the given permissions through a custom workspace role, the same
     * mechanism real organizations use to opt an employee into granular
     * capabilities like `ai.business_data.write`.
     *
     * @param  list<string>  $permissions
     */
    private function grantPermissions(User $user, array $permissions): void
    {
        $role = WorkspaceRole::create([
            'name' => 'AI data writer '.uniqid(),
            'base_role' => 'employee',
            'is_custom' => true,
            'permissions' => $permissions,
        ]);

        $membership = Membership::query()
            ->where('user_id', $user->id)
            ->first();
        $membership->workspace_role_id = $role->id;
        $membership->save();
    }
}
