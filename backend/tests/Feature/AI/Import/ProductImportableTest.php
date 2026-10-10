<?php

namespace Tests\Feature\AI\Import;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Services\AI\Import\Entities\ProductImportable;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductImportableTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify the Product wrapper commits rows through the existing import
     * action rather than writing to the database directly.
     */
    public function test_product_importable_commits_via_existing_import_action(): void
    {
        $user = User::factory()->create();

        $organization = Organization::create([
            'name' => 'Import Workspace',
        ]);

        $organization->users()->attach(
            $user->id,
            ['role' => 'owner'],
        );

        $context = app(TenantContext::class);

        $context->set($organization, OrganizationRole::Owner);

        try {
            $rows = collect([
                [
                    'type' => 'product',

                    'name' => 'Office Chair',

                    'sku' => 'CHAIR-001',

                    'unit' => 'unit',

                    'unit_price' => '199.99',

                    'tax_rate' => '16.00',
                ],
            ]);

            $result = app(ProductImportable::class)->commit($rows);

            $this->assertSame(
                ['created' => 1, 'updated' => 0, 'skipped' => 0, 'total' => 1],
                $result,
            );

            $this->assertDatabaseHas('products', ['name' => 'Office Chair']);
        } finally {
            $context->clear();
        }
    }

    /**
     * Verify the catalog filters out entities the user lacks permission to
     * import into, rather than exposing every registered destination.
     */
    public function test_catalog_hides_entries_the_user_cannot_import_to(): void
    {
        $user = User::factory()->create(); // no products.import.commit permission

        $definitions = app(ImportDestinationCatalog::class)->definitionsFor($user);

        $this->assertNotContains('product', array_column($definitions, 'key'));
    }
}
