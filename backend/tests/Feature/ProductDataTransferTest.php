<?php

namespace Tests\Feature;

use App\Actions\Products\DeleteProduct;
use App\Actions\Products\ImportProductsFromSpreadsheet;
use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductDataTransferTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify Product print exports contain every matching row even when an
     * interactive pagination parameter is supplied.
     */
    public function test_print_export_contains_all_filtered_products(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Product Export Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        foreach (
            [
                'Alpha Product',
                'Beta Product',
                'Gamma Product',
            ] as $index => $name
        ) {
            $this->postJson(
                '/api/products',
                [
                    'type' => 'product',

                    'name' => $name,

                    'sku' => "PRODUCT-{$index}",

                    'description' => null,

                    'unit' => 'unit',

                    'unit_price' => '20.0000',

                    'cost_price' => '10.0000',

                    'tax_rate' => '16',
                ],
            )->assertCreated();
        }

        $this->get(
            '/api/products/export/print?type=product&per_page=1',
        )
            ->assertOk()
            ->assertSee(
                'Alpha Product',
            )
            ->assertSee(
                'Beta Product',
            )
            ->assertSee(
                'Gamma Product',
            );
    }

    /**
     * Verify Arabic Product PDF exports return an actual PDF response.
     */
    public function test_product_pdf_export_returns_pdf_document(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Product PDF Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ])
            ->get(
                '/api/products/export/pdf?locale=ar',
            )
            ->assertOk()
            ->assertHeader(
                'content-type',
                'application/pdf',
            );
    }

    /**
     * Verify Product import analysis supports creation and duplicate updating.
     */
    public function test_product_import_previews_creates_and_updates_rows(): void
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Product Import Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        $context =
            app(
                TenantContext::class,
            );

        $context->set(
            $organization,
            OrganizationRole::Owner,
        );

        try {
            $rows = collect([
                [
                    'type' => 'product',

                    'name' => 'Imported Product',

                    'sku' => 'import-001',

                    'description' => 'Imported legacy product',

                    'unit' => 'unit',

                    'unit_price' => '30',

                    'cost_price' => '15',

                    'tax_rate' => '16',
                ],
                [
                    'type' => 'service',

                    'name' => 'Imported Service',

                    'sku' => 'service-001',

                    'description' => null,

                    'unit' => 'hour',

                    'unit_price' => '100',

                    'cost_price' => '40',

                    'tax_rate' => '0',
                ],
            ]);

            $action =
                app(
                    ImportProductsFromSpreadsheet::class,
                );

            $preview =
                $action->preview(
                    $rows,
                    'skip',
                );

            $this->assertSame(
                2,
                $preview['total_rows'],
            );

            $this->assertSame(
                0,
                $preview['error_rows'],
            );

            $result =
                $action->execute(
                    $rows,
                    'skip',
                );

            $this->assertSame(
                2,
                $result['created'],
            );

            $this->assertDatabaseHas(
                'products',
                [
                    'organization_id' => $organization->id,

                    'sku' => 'IMPORT-001',

                    'name' => 'Imported Product',
                ],
            );

            $updateRows = collect([
                [
                    'type' => 'product',

                    'name' => 'Updated Imported Product',

                    'sku' => 'import-001',

                    'description' => 'Updated description',

                    'unit' => 'unit',

                    'unit_price' => '45',

                    'cost_price' => '20',

                    'tax_rate' => '16',
                ],
            ]);

            $updatePreview =
                $action->preview(
                    $updateRows,
                    'update',
                );

            $this->assertSame(
                1,
                $updatePreview['duplicate_rows'],
            );

            $updateResult =
                $action->execute(
                    $updateRows,
                    'update',
                );

            $this->assertSame(
                1,
                $updateResult['updated'],
            );

            $this->assertDatabaseHas(
                'products',
                [
                    'organization_id' => $organization->id,

                    'sku' => 'IMPORT-001',

                    'name' => 'Updated Imported Product',

                    'unit_price' => '45.0000',
                ],
            );
        } finally {
            $context->clear();
        }
    }

    /**
     * Verify importing an archived SKU cannot silently create or overwrite a
     * historical Product.
     */
    public function test_product_import_flags_archived_sku_as_error(): void
    {
        $organization =
            Organization::create([
                'name' => 'Archived Import Workspace',
            ]);

        $context =
            app(
                TenantContext::class,
            );

        $context->set(
            $organization,
            OrganizationRole::Owner,
        );

        try {
            $product =
                Product::factory()
                    ->create([
                        'name' => 'Archived Product',

                        'sku' => 'ARCHIVED-001',
                    ]);

            app(
                DeleteProduct::class,
            )->execute(
                $product,
            );

            $rows = collect([
                [
                    'type' => 'product',

                    'name' => 'Replacement Product',

                    'sku' => 'archived-001',

                    'description' => null,

                    'unit' => 'unit',

                    'unit_price' => '50',

                    'cost_price' => null,

                    'tax_rate' => '0',
                ],
            ]);

            $preview =
                app(
                    ImportProductsFromSpreadsheet::class,
                )->preview(
                    $rows,
                    'update',
                );

            $this->assertSame(
                1,
                $preview['error_rows'],
            );

            $this->assertSame(
                0,
                $preview['valid_rows'],
            );

            $this->assertStringContainsString(
                'archived',
                strtolower(
                    $preview['errors'][0]['message'],
                ),
            );
        } finally {
            $context->clear();
        }
    }
}
