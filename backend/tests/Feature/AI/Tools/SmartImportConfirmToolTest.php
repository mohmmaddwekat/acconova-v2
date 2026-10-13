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
use Illuminate\Support\Facades\DB;
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

    /**
     * `test_confirm_requires_business_data_write_permission` above denies a
     * user missing BOTH permissions, which would stay green even if the
     * entity-specific check were deleted from the code. This test isolates
     * the other half: a user who HAS `ai.business_data.write` but lacks the
     * target entity's own `requiredPermission()` (`parties.import.commit`)
     * must still be rejected, proving spec §4.5's dual check can't silently
     * regress to checking only the generic permission.
     */
    public function test_confirm_rejects_a_user_missing_the_entity_specific_permission(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);
        $this->grantPermissions($this->otherUser, ['ai.business_data.write']);

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

    /**
     * Two concurrent confirms of the same draft could otherwise both pass
     * the status/target guard before either writes, and a failed `save()`
     * after a successful `commit()` could leave the draft re-confirmable
     * even though the business rows already exist. The final
     * reload+commit+save sequence is wrapped in a transaction that locks
     * the draft row with `lockForUpdate()` to serialize that window. True
     * concurrency isn't practical in this single-process test suite, so
     * this instead asserts the locking SQL is actually issued against
     * `ai_import_drafts` specifically, and that it happens before the
     * target entity's own writes (the `parties` insert).
     */
    public function test_confirm_locks_the_draft_row_before_committing(): void
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

        $executedSql = [];
        DB::listen(function ($query) use (&$executedSql): void {
            $executedSql[] = $query->sql;
        });

        app(SmartImportConfirmTool::class)->execute($this->otherUser, ['draft_id' => $draft->id]);

        $lockDraftIndex = null;
        $insertPartyIndex = null;

        foreach ($executedSql as $index => $sql) {
            if (
                $lockDraftIndex === null
                && stripos($sql, 'ai_import_drafts') !== false
                && stripos($sql, 'for update') !== false
            ) {
                $lockDraftIndex = $index;
            }

            if (
                $insertPartyIndex === null
                && stripos($sql, 'insert') !== false
                && stripos($sql, '`parties`') !== false
            ) {
                $insertPartyIndex = $index;
            }
        }

        $this->assertNotNull(
            $lockDraftIndex,
            'Expected a "for update" query against ai_import_drafts before commit().',
        );
        $this->assertNotNull($insertPartyIndex, 'Expected commit() to insert into parties.');
        $this->assertLessThan(
            $insertPartyIndex,
            $lockDraftIndex,
            'Expected the ai_import_drafts lock to be acquired before the parties insert.',
        );
    }

    /**
     * The residual gap from review round 2: before this fix, `$entity`,
     * both permission checks, and `$fieldMapping` were all still derived
     * from the earlier UNLOCKED read, so a concurrent
     * `smart_import_revise` landing in the window between that read and
     * the locked reload would have its new `field_mapping` written to the
     * draft row, while `commit()` still used the stale mapping captured
     * before the lock. This simulates that window with `DB::listen()`:
     * the moment the initial unlocked draft read completes, it writes a
     * new `field_mapping` directly to the row (as a concurrent revise
     * would), and asserts the committed Party reflects the NEW mapping,
     * not the one in memory from before the lock.
     */
    public function test_confirm_uses_the_field_mapping_as_of_the_locked_reload_not_the_earlier_unlocked_read(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);
        $this->grantPermissions($this->otherUser, ['ai.business_data.write', 'parties.import.commit']);

        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'extracted_rows' => [
                [
                    'Type' => 'person',
                    'ColumnA' => 'Stale Value',
                    'ColumnB' => 'Fresh Value',
                    'Role' => 'customer',
                ],
            ],
            'field_mapping' => ['Type' => 'type', 'ColumnA' => 'name', 'Role' => 'roles'],
        ]);

        $simulatedConcurrentReviseHasRun = false;

        DB::listen(function ($query) use (&$simulatedConcurrentReviseHasRun, $draft): void {
            if ($simulatedConcurrentReviseHasRun) {
                return;
            }

            // Only the initial, unlocked draft read matches: later reads
            // of this table use `lockForUpdate()` ("for update" in the SQL).
            if (
                stripos($query->sql, 'ai_import_drafts') === false
                || stripos($query->sql, 'for update') !== false
            ) {
                return;
            }

            $simulatedConcurrentReviseHasRun = true;

            DB::table('ai_import_drafts')
                ->where('id', $draft->id)
                ->update([
                    'field_mapping' => json_encode(['Type' => 'type', 'ColumnB' => 'name', 'Role' => 'roles']),
                ]);
        });

        app(SmartImportConfirmTool::class)->execute($this->otherUser, ['draft_id' => $draft->id]);

        $this->assertDatabaseHas('parties', ['name' => 'Fresh Value']);
        $this->assertDatabaseMissing('parties', ['name' => 'Stale Value']);
    }

    /**
     * Forces `AiImportDraft::save()` to fail immediately after a
     * successful `commit()` (simulating any post-commit save failure, not
     * just a DB error) and asserts the entity's write is rolled back with
     * it: the draft must stay `draft` and the Party must never exist,
     * proving the lock transaction's rollback covers the commit, not just
     * the draft's own status update.
     */
    public function test_confirm_rolls_back_the_commit_if_saving_the_draft_afterward_fails(): void
    {
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);
        $this->grantPermissions($this->otherUser, ['ai.business_data.write', 'parties.import.commit']);

        $draft = AiImportDraft::factory()->for($this->otherUser)->create([
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'extracted_rows' => [
                ['Type' => 'person', 'Full Name' => 'Should Roll Back', 'Role' => 'customer'],
            ],
            'field_mapping' => ['Type' => 'type', 'Full Name' => 'name', 'Role' => 'roles'],
        ]);

        AiImportDraft::saving(function (AiImportDraft $model) use ($draft): bool {
            if ($model->id === $draft->id && $model->status === AiImportDraft::STATUS_COMMITTED) {
                throw new RuntimeException('Simulated save failure after a successful commit.');
            }

            return true;
        });

        try {
            app(SmartImportConfirmTool::class)->execute($this->otherUser, ['draft_id' => $draft->id]);
            $this->fail('Expected the forced save failure to propagate.');
        } catch (RuntimeException $e) {
            $this->assertSame('Simulated save failure after a successful commit.', $e->getMessage());
        }

        $this->assertSame(AiImportDraft::STATUS_DRAFT, $draft->fresh()->status);
        $this->assertDatabaseMissing('parties', ['name' => 'Should Roll Back']);
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
