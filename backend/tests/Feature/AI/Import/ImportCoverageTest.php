<?php

namespace Tests\Feature\AI\Import;

use App\Enums\OrganizationRole;
use App\Models\AiConversation;
use App\Models\AiImportDraft;
use App\Models\Membership;
use App\Models\Organization;
use App\Models\Party;
use App\Models\Product;
use App\Models\StaffMember;
use App\Models\User;
use App\Models\WorkspaceRole;
use App\Services\AI\Import\Contracts\ImportableEntity;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Services\AI\Tools\SmartImportConfirmTool;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;
use Throwable;

/**
 * Coverage matrix for the smart import engine: every entity the catalog can
 * import into is exercised with Arabic/English data, missing data,
 * duplicates, unknown relations, oversized files, permission bypass attempts
 * and cross-company isolation.
 */
class ImportCoverageTest extends TestCase
{
    use RefreshDatabase;

    private Organization $organization;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->organization = Organization::create(['name' => 'Company A']);
        $this->organization->users()->attach($this->user->id, ['role' => 'owner']);

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
    }

    protected function tearDown(): void
    {
        app(TenantContext::class)->clear();

        parent::tearDown();
    }

    /**
     * @return array<string, array{0:string}>
     */
    public static function entities(): array
    {
        return ['party' => ['party'], 'product' => ['product'], 'staff_member' => ['staff_member']];
    }

    /**
     * @return array<string, mixed>
     */
    private function row(string $entity, string $name = 'Acme', int $n = 1): array
    {
        return match ($entity) {
            'party' => ['type' => 'person', 'name' => $name, 'email' => "p{$n}@x.test", 'roles' => 'customer'],
            'product' => ['type' => 'product', 'name' => $name, 'sku' => "SKU-{$n}", 'unit' => 'unit', 'unit_price' => '10', 'tax_rate' => '0'],
            default => ['name' => $name, 'phone' => '059900'.str_pad((string) $n, 4, '0', STR_PAD_LEFT), 'basis' => 'month', 'rate' => '3500', 'started_on' => '2024-01-15'],
        };
    }

    private function rowCount(string $entity): int
    {
        return match ($entity) {
            'party' => Party::query()->count(),
            'product' => Product::query()->count(),
            default => StaffMember::query()->count(),
        };
    }

    private function entity(string $key): ImportableEntity
    {
        return app(ImportDestinationCatalog::class)->find($key);
    }

    public function test_every_import_permission_is_served_or_a_documented_exception(): void
    {
        $served = array_map(fn ($entity) => $entity->requiredPermission(), app(ImportDestinationCatalog::class)->all());
        $accounted = [...$served, ...array_keys(ImportDestinationCatalog::EXCEPTIONS)];

        $importKeys = array_filter(
            WorkspaceFeaturePermissions::keys(),
            fn (string $key): bool => str_contains($key, '.import') && ! str_ends_with($key, '.import.template'),
        );

        foreach ($importKeys as $key) {
            $this->assertContains($key, $accounted, "{$key} is neither imported by the catalog nor documented as an exception");
        }

        foreach (ImportDestinationCatalog::EXCEPTIONS as $reason) {
            $this->assertNotSame('', $reason);
        }
    }

    #[DataProvider('entities')]
    public function test_arabic_and_english_data_import_and_reimport_without_duplicates(string $key): void
    {
        $entity = $this->entity($key);
        $rows = collect([
            $this->row($key, 'شركة النور للتجارة', 1),
            $this->row($key, 'Acme Trading', 2),
        ]);

        $this->assertSame(2, $entity->commit($rows)['created']);

        $again = $entity->commit($rows);
        $this->assertSame(0, $again['created']);
        $this->assertSame(2, $again['skipped']);
        $this->assertSame(2, $this->rowCount($key));
    }

    public function test_staff_rate_accepts_arabic_indic_digits(): void
    {
        $row = [...$this->row('staff_member'), 'rate' => '٣٥٠٠'];

        $this->entity('staff_member')->commit(collect([$row]));

        $this->assertSame('3500.0000', (string) StaffMember::query()->first()->rate);
    }

    #[DataProvider('entities')]
    public function test_missing_required_data_is_reported_per_row_and_blocks_the_commit(string $key): void
    {
        $entity = $this->entity($key);
        $bad = $this->row($key, '', 2);
        $rows = collect([$this->row($key, 'Good', 1), [...$bad, 'name' => '', 'sku' => null, 'rate' => null, 'roles' => '']]);

        $preview = $entity->preview($rows);

        $this->assertSame(1, $preview['valid_rows']);
        $this->assertSame(1, $preview['error_rows']);
        $this->assertSame(3, $preview['errors'][0]['row']);
        $this->assertNotSame('', $preview['errors'][0]['message']);

        $this->assertCommitRejected($entity, $rows);
        $this->assertSame(0, $this->rowCount($key), 'a bad row must not leave a half-imported file');
    }

    #[DataProvider('entities')]
    public function test_oversized_files_are_rejected_before_any_work(string $key): void
    {
        $rows = collect(array_fill(0, 5001, $this->row($key)));

        $this->expectException(ValidationException::class);

        $this->entity($key)->preview($rows);
    }

    public function test_duplicate_keys_inside_one_file_are_reported(): void
    {
        $dup = collect([$this->row('party', 'A', 1), $this->row('party', 'B', 1)]);
        $this->assertSame(1, $this->entity('party')->preview($dup)['error_rows']);

        $dup = collect([$this->row('product', 'A', 1), $this->row('product', 'B', 1)]);
        $this->assertSame(1, $this->entity('product')->preview($dup)['error_rows']);
    }

    public function test_unknown_staff_department_is_an_explicit_error(): void
    {
        $rows = collect([[...$this->row('staff_member'), 'department' => 'Nowhere']]);

        $preview = $this->entity('staff_member')->preview($rows);

        $this->assertSame(1, $preview['error_rows']);
        $this->assertStringContainsString('Nowhere', $preview['errors'][0]['message']);
        $this->assertCommitRejected($this->entity('staff_member'), $rows);
        $this->assertSame(0, StaffMember::query()->count());
    }

    #[DataProvider('entities')]
    public function test_a_user_without_the_entity_permission_cannot_commit(string $key): void
    {
        $employee = User::factory()->create();
        $this->organization->users()->attach($employee->id, ['role' => 'employee']);

        $role = WorkspaceRole::create([
            'name' => 'Writer only',
            'base_role' => 'employee',
            'is_custom' => true,
            'permissions' => ['ai.business_data.write'],
        ]);
        Membership::query()->where('user_id', $employee->id)->update(['workspace_role_id' => $role->id]);
        app(TenantContext::class)->set($this->organization, OrganizationRole::Employee);

        $conversation = AiConversation::factory()->for($employee)->create();
        $row = $this->row($key);
        $draft = AiImportDraft::factory()->for($employee)->create([
            'ai_conversation_id' => $conversation->id,
            'status' => AiImportDraft::STATUS_DRAFT,
            'target_entity' => $key,
            'extracted_rows' => [$row],
            'field_mapping' => array_combine(array_keys($row), array_keys($row)),
        ]);

        try {
            app(SmartImportConfirmTool::class)->execute($employee, ['draft_id' => $draft->id], $conversation);
            $this->fail('commit should have been refused');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('permission', $exception->getMessage());
        }

        $this->assertSame(0, $this->rowCount($key));
        $this->assertNotContains($key, array_column(app(ImportDestinationCatalog::class)->definitionsFor($employee), 'key'));
    }

    #[DataProvider('entities')]
    public function test_imports_never_leak_or_match_across_companies(string $key): void
    {
        $this->entity($key)->commit(collect([$this->row($key, 'Company A record')]));
        $this->assertSame(1, $this->rowCount($key));

        $other = Organization::create(['name' => 'Company B']);
        $other->users()->attach($this->user->id, ['role' => 'admin']);
        app(TenantContext::class)->set($other, OrganizationRole::Admin);

        $this->assertSame(0, $this->rowCount($key), 'company B must not see company A rows');

        $result = $this->entity($key)->commit(collect([$this->row($key, 'Company B record')]));
        $this->assertSame(1, $result['created'], 'same key in company B is new, not a duplicate of company A');

        app(TenantContext::class)->set($this->organization, OrganizationRole::Owner);
        $this->assertSame(1, $this->rowCount($key));
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     */
    private function assertCommitRejected(object $entity, Collection $rows): void
    {
        try {
            $entity->commit($rows);
            $this->fail('commit should have been rejected');
        } catch (ValidationException|InvalidArgumentException|RuntimeException) {
            $this->addToAssertionCount(1);
        } catch (Throwable $exception) {
            $this->fail('unexpected '.$exception::class.': '.$exception->getMessage());
        }
    }
}
