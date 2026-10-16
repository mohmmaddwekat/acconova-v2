<?php

namespace Tests\Feature\AI\Tools;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\Party;
use App\Models\Product;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\AI\AiWriteToolRegistry;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class RecordWriteToolsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Organization $organization;

    private AiConversation $conversation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Company A']);
        $this->organization->users()->attach($this->owner->id, ['role' => 'owner']);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);

        $this->conversation = AiConversation::factory()->for($this->owner)->create();
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    private function callTool(string $tool, array $arguments, ?User $user = null): array
    {
        return app(AiWriteToolRegistry::class)->execute($user ?? $this->owner, $tool, $arguments, $this->conversation);
    }

    private function person(string $name, ?string $email = null): array
    {
        return ['type' => 'person', 'name' => $name, 'email' => $email, 'roles' => ['customer']];
    }

    public function test_create_returns_the_real_record_and_an_audit_entry(): void
    {
        $result = $this->callTool('party_create', ['fields' => $this->person('Layla Haddad', 'Layla@X.test')]);

        $this->assertSame('created', $result['status']);
        $this->assertSame('layla@x.test', $result['record']['email']);
        $this->assertNull($result['audit']['before']);
        $this->assertDatabaseHas('parties', ['id' => $result['record']['id'], 'name' => 'Layla Haddad']);
    }

    public function test_invalid_or_unknown_data_changes_nothing(): void
    {
        $missing = $this->callTool('party_create', ['fields' => ['type' => 'person', 'roles' => ['customer']]]);
        $unknown = $this->callTool('party_create', ['fields' => [...$this->person('A'), 'credit_limit' => 99999]]);

        $this->assertSame('invalid', $missing['status']);
        $this->assertSame('invalid', $unknown['status']);
        $this->assertSame(0, Party::query()->count());
    }

    public function test_duplicates_are_reported_and_same_name_needs_confirmation(): void
    {
        $this->callTool('party_create', ['fields' => $this->person('Omar Saleh', 'omar@x.test')]);

        $sameEmail = $this->callTool('party_create', ['fields' => $this->person('Someone Else', 'omar@x.test'), 'allow_duplicate' => true]);
        $this->assertSame('duplicate', $sameEmail['status']);

        $sameName = $this->callTool('party_create', ['fields' => $this->person('omar saleh', 'other@x.test')]);
        $this->assertSame('duplicate', $sameName['status']);
        $this->assertSame(1, Party::query()->count());

        $confirmed = $this->callTool('party_create', ['fields' => $this->person('omar saleh', 'other@x.test'), 'allow_duplicate' => true]);
        $this->assertSame('created', $confirmed['status']);
        $this->assertSame(2, Party::query()->count());
    }

    public function test_update_by_exact_lookup_changes_only_that_record_and_audits_before_after(): void
    {
        $this->callTool('party_create', ['fields' => $this->person('Nour Aziz', 'nour@x.test')]);
        $this->callTool('party_create', ['fields' => $this->person('Sami Aziz', 'sami@x.test')]);

        $result = $this->callTool('party_update', ['lookup' => 'nour@x.test', 'changes' => ['phone' => '0599111222']]);

        $this->assertSame('updated', $result['status']);
        $this->assertNull($result['audit']['before']['phone']);
        $this->assertSame('0599111222', $result['audit']['after']['phone']);
        $this->assertNull(Party::query()->where('email', 'sami@x.test')->value('phone'));
    }

    public function test_an_ambiguous_lookup_asks_for_clarification_and_changes_nothing(): void
    {
        $this->callTool('party_create', ['fields' => $this->person('Nour Aziz', 'nour@x.test')]);
        $this->callTool('party_create', ['fields' => $this->person('Nour Khoury', 'nk@x.test')]);

        $update = $this->callTool('party_update', ['lookup' => 'Nour', 'changes' => ['phone' => '1']]);
        $archive = $this->callTool('party_archive', ['lookup' => 'Nour']);

        foreach ([$update, $archive] as $result) {
            $this->assertSame('needs_clarification', $result['status']);
            $this->assertCount(2, $result['candidates']);
        }

        $this->assertSame(2, Party::query()->count());
        $this->assertSame(0, Party::query()->whereNotNull('phone')->count());
        $this->assertSame('not_found', $this->callTool('party_archive', ['lookup' => 'Nobody'])['status']);
    }

    public function test_update_rejects_unknown_fields_and_taken_unique_values(): void
    {
        $this->callTool('party_create', ['fields' => $this->person('Nour Aziz', 'nour@x.test')]);
        $this->callTool('party_create', ['fields' => $this->person('Sami Aziz', 'sami@x.test')]);

        $this->assertSame('invalid', $this->callTool('party_update', ['lookup' => 'sami@x.test', 'changes' => ['organization_id' => 99]])['status']);
        $this->assertSame('duplicate', $this->callTool('party_update', ['lookup' => 'sami@x.test', 'changes' => ['email' => 'nour@x.test']])['status']);
        $this->assertSame('sami@x.test', Party::query()->where('name', 'Sami Aziz')->value('email'));
    }

    public function test_archive_is_a_soft_delete_that_can_be_restored(): void
    {
        $created = $this->callTool('party_create', ['fields' => $this->person('Rana Odeh', 'rana@x.test')]);
        $id = $created['record']['id'];

        $this->assertSame('archived', $this->callTool('party_archive', ['record_id' => $id])['status']);
        $this->assertSoftDeleted('parties', ['id' => $id]);

        $this->assertSame('restored', $this->callTool('party_restore', ['lookup' => 'rana@x.test'])['status']);
        $this->assertNotSoftDeleted('parties', ['id' => $id]);
    }

    public function test_there_is_no_permanent_delete_tool(): void
    {
        $created = $this->callTool('party_create', ['fields' => $this->person('Keep Me', 'keep@x.test')]);

        foreach (['party_delete', 'party_force_delete', 'product_delete', 'party_destroy'] as $name) {
            $this->assertFalse(app(AiWriteToolRegistry::class)->available($this->owner, $name));
        }

        try {
            $this->callTool('party_force_delete', ['record_id' => $created['record']['id']]);
            $this->fail('unknown tools must be refused');
        } catch (RuntimeException) {
            $this->assertDatabaseHas('parties', ['id' => $created['record']['id'], 'deleted_at' => null]);
        }
    }

    public function test_a_user_without_the_module_permission_is_refused_without_changes(): void
    {
        $member = User::factory()->create();
        $this->organization->users()->attach($member->id, ['role' => 'employee']);
        $role = WorkspaceRole::create([
            'name' => 'Writer only', 'base_role' => 'employee', 'is_custom' => true, 'permissions' => ['ai.business_data.write'],
        ]);
        Membership::query()->where('user_id', $member->id)->update(['workspace_role_id' => $role->id]);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $names = array_column(app(AiWriteToolRegistry::class)->definitionsFor($member), 'name');
        $this->assertNotContains('party_create', $names);
        $this->assertNotContains('product_archive', $names);

        $this->expectException(RuntimeException::class);

        try {
            $this->callTool('party_create', ['fields' => $this->person('Blocked')], $member);
        } finally {
            $this->assertSame(0, Party::query()->count());
        }
    }

    public function test_records_of_another_company_cannot_be_touched(): void
    {
        $this->callTool('party_create', ['fields' => $this->person('Company A client', 'a@x.test')]);
        $foreignId = Party::query()->value('id');

        $other = Organization::create(['name' => 'Company B']);
        $other->users()->attach($this->owner->id, ['role' => 'admin']);
        app(TenantContext::class)->set($other, OrganizationRole::Admin);

        $this->assertSame('not_found', $this->callTool('party_archive', ['record_id' => $foreignId])['status']);
        $this->assertSame('not_found', $this->callTool('party_update', ['lookup' => 'a@x.test', 'changes' => ['phone' => '1']])['status']);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $this->assertDatabaseHas('parties', ['id' => $foreignId, 'deleted_at' => null, 'phone' => null]);
    }

    public function test_products_support_create_update_archive_and_unique_sku(): void
    {
        $fields = ['type' => 'product', 'name' => 'Office Chair', 'sku' => 'CH-1', 'unit' => 'unit', 'unit_price' => '120', 'tax_rate' => '16'];

        $created = $this->callTool('product_create', ['fields' => $fields]);
        $this->assertSame('created', $created['status']);

        $this->assertSame('duplicate', $this->callTool('product_create', ['fields' => [...$fields, 'name' => 'Other chair']])['status']);
        $this->assertSame('invalid', $this->callTool('product_create', ['fields' => [...$fields, 'sku' => 'CH-2', 'unit_price' => '-5']])['status']);

        $updated = $this->callTool('product_update', ['lookup' => 'CH-1', 'changes' => ['unit_price' => '150']]);
        $this->assertSame('updated', $updated['status']);
        $this->assertEquals(150, Product::query()->where('sku', 'CH-1')->value('unit_price'));

        $this->assertSame('archived', $this->callTool('product_archive', ['lookup' => 'CH-1'])['status']);
        $this->assertSoftDeleted('products', ['sku' => 'CH-1']);
    }
}
