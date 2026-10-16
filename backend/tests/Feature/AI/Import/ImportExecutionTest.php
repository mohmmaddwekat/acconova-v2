<?php

namespace Tests\Feature\AI\Import;

use App\Actions\Parties\ImportPartiesFromSpreadsheet;
use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\Organization;
use App\Models\Party;
use App\Models\Product;
use App\Models\StaffMember;
use App\Models\User;
use App\Services\AI\Import\Entities\PartyImportable;
use App\Services\AI\Import\Entities\ProductImportable;
use App\Services\AI\Import\Entities\StaffMemberImportable;
use App\Services\AI\Tools\SmartImportConfirmTool;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use RuntimeException;
use Tests\TestCase;

class ImportExecutionTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Organization $organization;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Import Workspace']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * @return array<string, mixed>
     */
    private function staffRow(string $name = 'Jane Doe'): array
    {
        return ['name' => $name, 'phone' => '0599123456', 'basis' => 'month', 'rate' => '3500', 'started_on' => '2024-01-15'];
    }

    public function test_staff_preview_counts_duplicates_and_update_mode_is_reversible(): void
    {
        $staff = app(StaffMemberImportable::class);
        $staff->commit(collect([$this->staffRow()]));

        $this->assertSame(1, $staff->preview(collect([$this->staffRow()]))['duplicate_rows']);

        $result = $staff->commit(collect([[...$this->staffRow('Jane Renamed')]]), 'update');
        $this->assertSame(1, $result['updated']);
        $this->assertSame('Jane Renamed', StaffMember::query()->first()->name);

        $staff->rollback($staff->lastChanges());
        $this->assertSame('Jane Doe', StaffMember::query()->first()->name);
    }

    public function test_product_rollback_archives_created_and_restores_updated(): void
    {
        $products = app(ProductImportable::class);
        $row = ['type' => 'product', 'name' => 'Chair', 'sku' => 'CH-1', 'unit' => 'unit', 'unit_price' => '10', 'tax_rate' => '0'];

        $products->commit(collect([$row]));
        $products->commit(collect([[...$row, 'name' => 'Chair v2']]), 'update');
        $this->assertSame('Chair v2', Product::query()->first()->name);

        $this->assertSame(1, $products->rollback($products->lastChanges())['restored']);
        $this->assertSame('Chair', Product::query()->first()->name);

        $created = app(ProductImportable::class);
        $created->commit(collect([[...$row, 'sku' => 'CH-2']]));
        $this->assertSame(1, $created->rollback($created->lastChanges())['removed']);
        $this->assertSame(1, Product::query()->count());
    }

    public function test_commit_reports_progress_for_every_row(): void
    {
        $seen = [];
        $staff = app(StaffMemberImportable::class);
        $staff->onProgress(function (int $done, int $total) use (&$seen): void {
            $seen[] = [$done, $total];
        });

        $staff->commit(collect([$this->staffRow('A'), [...$this->staffRow('B'), 'phone' => '0599000000']]));

        $this->assertSame([[1, 2], [2, 2]], $seen);
    }

    public function test_confirm_stores_progress_and_progress_endpoint_reports_it(): void
    {
        $conversation = AiConversation::factory()->for($this->user)->create();
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'staff_member',
            'extracted_rows' => [$this->staffRow()],
            'field_mapping' => array_combine(array_keys($this->staffRow()), array_keys($this->staffRow())),
        ]);

        app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id], $conversation);

        $this->assertSame(
            ['processed' => 1, 'total' => 1],
            Cache::store('file')->get(SmartImportConfirmTool::progressKey($this->organization->id, $draft->id)),
        );

        config(['billing.enforce_subscription' => false]);
        $session = [OrganizationAccess::SESSION_KEY => $this->organization->id];

        $this->actingAs($this->user)->withSession($session)
            ->getJson("/api/ai/import-drafts/{$draft->id}/progress")
            ->assertOk()
            ->assertJsonPath('data.processed', 1)
            ->assertJsonPath('data.status', AiImportDraft::STATUS_COMMITTED);

        $other = User::factory()->create();
        $this->organization->users()->attach($other->id, ['role' => 'admin']);
        $this->actingAs($other)->withSession($session)->getJson("/api/ai/import-drafts/{$draft->id}/progress")->assertNotFound();
    }

    public function test_draft_list_and_rollback_endpoints_undo_a_committed_import(): void
    {
        config(['billing.enforce_subscription' => false]);

        $conversation = AiConversation::factory()->for($this->user)->create();
        $mapping = array_combine(array_keys($this->staffRow()), array_keys($this->staffRow()));
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'staff_member',
            'extracted_rows' => [$this->staffRow()],
            'field_mapping' => $mapping,
        ]);
        app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id], $conversation);

        $session = [OrganizationAccess::SESSION_KEY => $this->organization->id];
        $client = $this->actingAs($this->user)->withSession($session);

        $client->getJson("/api/ai/conversations/{$conversation->id}/import-drafts")
            ->assertOk()
            ->assertJsonPath('data.0.status', AiImportDraft::STATUS_COMMITTED)
            ->assertJsonPath('data.0.summary.created', 1);

        $client->postJson("/api/ai/import-drafts/{$draft->id}/rollback")
            ->assertOk()
            ->assertJsonPath('data.removed', 1);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $this->assertSame(0, StaffMember::query()->count());
        $client->postJson("/api/ai/import-drafts/{$draft->id}/rollback")->assertStatus(422);
    }

    public function test_staff_without_a_phone_are_not_duplicated_on_reupload(): void
    {
        $staff = app(StaffMemberImportable::class);
        $rows = collect([
            ['name' => 'Huda Nasser', 'basis' => 'month', 'rate' => '3000', 'started_on' => '2024-02-01'],
            ['name' => 'Huda Nasser', 'basis' => 'month', 'rate' => '3000', 'started_on' => '2025-06-01'],
        ]);

        $this->assertSame(2, $staff->commit($rows)['created']);
        $this->assertSame(2, $staff->preview($rows)['duplicate_rows']);

        $again = $staff->commit($rows);

        $this->assertSame(0, $again['created']);
        $this->assertSame(2, $again['skipped']);
        $this->assertSame(2, StaffMember::query()->count());
    }

    public function test_customers_without_email_are_matched_by_phone_then_name_on_reupload(): void
    {
        $parties = app(PartyImportable::class);
        $rows = collect([
            ['type' => 'person', 'name' => 'Khaled Younis', 'phone' => '0599000111', 'roles' => 'customer'],
            ['type' => 'person', 'name' => 'Maha Zeidan', 'roles' => 'customer'],
            ['type' => 'company', 'company_name' => 'Zeidan Trading', 'roles' => 'supplier'],
        ]);

        $this->assertSame(3, $parties->commit($rows)['created']);
        $this->assertSame(3, $parties->preview($rows)['duplicate_rows']);

        $again = $parties->commit($rows);

        $this->assertSame(0, $again['created']);
        $this->assertSame(3, $again['skipped']);
        $this->assertSame(3, Party::query()->count());
    }

    public function test_an_ambiguous_customer_row_is_reported_instead_of_guessing(): void
    {
        $parties = app(PartyImportable::class);
        $parties->commit(collect([
            ['type' => 'person', 'name' => 'Sara Taha', 'email' => 'sara1@x.test', 'roles' => 'customer'],
            ['type' => 'person', 'name' => 'Sara Taha', 'email' => 'sara2@x.test', 'roles' => 'customer'],
        ]));

        $preview = $parties->preview(collect([['type' => 'person', 'name' => 'Sara Taha', 'roles' => 'customer']]));

        $this->assertSame(1, $preview['error_rows']);
        $this->assertStringContainsString('email', $preview['errors'][0]['message']);
    }

    public function test_products_without_sku_are_matched_by_name_and_unit_on_reupload(): void
    {
        $products = app(ProductImportable::class);
        $rows = collect([
            ['type' => 'product', 'name' => 'Notebook A4', 'unit' => 'unit', 'unit_price' => '3', 'tax_rate' => '16'],
            ['type' => 'product', 'name' => 'Notebook A4', 'unit' => 'box', 'unit_price' => '30', 'tax_rate' => '16'],
        ]);

        $this->assertSame(2, $products->commit($rows)['created']);

        $again = $products->commit($rows);

        $this->assertSame(0, $again['created']);
        $this->assertSame(2, $again['skipped']);
        $this->assertSame(2, Product::query()->count());
    }

    public function test_financial_entities_require_finance_approval_permission(): void
    {
        $this->app->bind(PartyImportable::class, fn () => new class(app(ImportPartiesFromSpreadsheet::class)) extends PartyImportable
        {
            public function isFinancial(): bool
            {
                return true;
            }
        });

        $conversation = AiConversation::factory()->for($this->user)->create();
        $draft = AiImportDraft::factory()->for($this->user)->create([
            'ai_conversation_id' => $conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => 'party',
            'extracted_rows' => [['type' => 'person', 'name' => 'Acme', 'roles' => 'customer']],
            'field_mapping' => ['type' => 'type', 'name' => 'name', 'roles' => 'roles'],
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('finance approval');

        app(SmartImportConfirmTool::class)->execute($this->user, ['draft_id' => $draft->id], $conversation);
    }
}
