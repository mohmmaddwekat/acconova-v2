<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\InventoryBalance;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\ProductionConsumption;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ProductionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify one recipe-driven production batch consumes several Raw Materials
     * and links every stock movement to the same production history.
     */
    public function test_production_consumes_multiple_materials_and_records_linked_history(): void
    {
        [
            $product,
            $raw,
            $other,
            $warehouse,
        ] = $this->workspace();

        $recipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '1.6250',
                ],
                [
                    'material' => $other,
                    'rate' => '0.7500',
                ],
            ],
        );

        $response = $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $recipeId,
                '2',
            ),
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.quantity',
                '2.0000',
            )
            ->assertJsonPath(
                'data.recipe_version',
                1,
            )
            ->assertJsonCount(
                2,
                'data.materials',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $raw->id,
                'warehouse_id' => $warehouse->id,
                'on_hand' => '6.7500',
                'reserved' => '2.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $other->id,
                'warehouse_id' => $warehouse->id,
                'on_hand' => '3.5000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $product->id,
                'warehouse_id' => $warehouse->id,
                'on_hand' => '2.0000',
            ],
        );

        $this->assertDatabaseCount(
            'stock_movements',
            3,
        );

        $this->assertDatabaseHas(
            'stock_movements',
            [
                'product_id' => $raw->id,
                'type' => 'production_out',
                'quantity' => '-3.2500',
                'reference_type' => 'production',
                'reference_id' => $response->json(
                    'data.id',
                ),
            ],
        );

        $this->assertDatabaseHas(
            'production_recipe_usages',
            [
                'production_movement_id' => $response->json(
                    'data.id',
                ),
                'production_recipe_id' => $recipeId,
            ],
        );

        $this->getJson(
            $this->endpoint($product),
        )
            ->assertOk()
            ->assertJsonCount(
                1,
                'data',
            )
            ->assertJsonPath(
                'data.0.recipe_version',
                1,
            )
            ->assertJsonCount(
                2,
                'data.0.materials',
            );
    }

    /**
     * Verify unavailable or reserved Raw Material rolls back the complete
     * production batch rather than partially producing finished goods.
     */
    public function test_insufficient_or_reserved_material_rolls_back_the_whole_batch(): void
    {
        [
            $product,
            $raw,
            $other,
            $warehouse,
        ] = $this->workspace();

        $recipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '1.0000',
                ],
                [
                    'material' => $other,
                    'rate' => '3.0000',
                ],
            ],
        );

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $recipeId,
                '2',
            ),
        )->assertUnprocessable();

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $raw->id,
                'on_hand' => '10.0000',
                'reserved' => '2.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $other->id,
                'on_hand' => '5.0000',
            ],
        );

        $this->assertDatabaseMissing(
            'inventory_balances',
            [
                'product_id' => $product->id,
            ],
        );

        $this->assertDatabaseCount(
            'stock_movements',
            0,
        );

        $secondRecipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '4.5000',
                ],
                [
                    'material' => $other,
                    'rate' => '0.5000',
                ],
            ],
        );

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $secondRecipeId,
                '2',
            ),
        )->assertUnprocessable();

        $this->assertDatabaseCount(
            'stock_movements',
            0,
        );
    }

    /**
     * Verify invalid output quantities, invalid recipe definitions, and
     * non-Product production targets are rejected.
     */
    public function test_invalid_quantities_duplicates_and_wrong_types_are_rejected(): void
    {
        [
            $product,
            $raw,
            ,
            $warehouse,
        ] = $this->workspace();

        $recipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '1.0000',
                ],
            ],
        );

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $recipeId,
                '0',
            ),
        )->assertUnprocessable();

        $this->postJson(
            $this->recipeEndpoint($product),
            [
                'components' => [
                    [
                        'name' => 'Plastic',
                        'options' => [
                            [
                                'raw_material_id' => $raw->id,
                                'quantity_per_unit' => '1.0000',
                                'is_default' => true,
                            ],
                            [
                                'raw_material_id' => $raw->id,
                                'quantity_per_unit' => '0.5000',
                            ],
                        ],
                    ],
                ],
            ],
        )->assertUnprocessable();

        $this->postJson(
            $this->recipeEndpoint($product),
            [
                'components' => [
                    [
                        'name' => 'Invalid component',
                        'options' => [
                            [
                                'raw_material_id' => $product->id,
                                'quantity_per_unit' => '1.0000',
                                'is_default' => true,
                            ],
                        ],
                    ],
                ],
            ],
        )->assertUnprocessable();

        /*
         * Every request passes through ResolveOrganization, which deliberately
         * clears TenantContext afterwards. Re-enter the tenant before direct
         * Eloquent creation in the test itself.
         */
        $this->restoreTenantContext(
            $product,
        );

        $service = Product::factory()
            ->create([
                'type' => 'service',
            ]);

        $this->postJson(
            $this->endpoint($service),
            [
                'warehouse_id' => $warehouse->id,
                'quantity' => '1',
                'recipe_id' => $recipeId,
            ],
        )->assertNotFound();

        $this->postJson(
            $this->endpoint($raw),
            [
                'warehouse_id' => $warehouse->id,
                'quantity' => '1',
                'recipe_id' => $recipeId,
            ],
        )->assertNotFound();

        $this->assertDatabaseCount(
            'stock_movements',
            0,
        );
    }

    /**
     * Verify Accountants cannot manufacture stock and cross-tenant recipe or
     * warehouse identifiers remain inaccessible.
     */
    public function test_accountants_cannot_produce_and_foreign_tenant_inputs_are_hidden(): void
    {
        [
            $product,
            $raw,
            ,
            $warehouse,
        ] = $this->workspace();

        $recipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '1.0000',
                ],
            ],
        );

        $organization = Organization::query()
            ->findOrFail(
                $product->organization_id,
            );

        $accountant = User::factory()
            ->create();

        $organization
            ->users()
            ->attach(
                $accountant->id,
                [
                    'role' => OrganizationRole::Accountant->value,
                ],
            );

        app(
            TenantContext::class,
        )->set(
            $organization,
            OrganizationRole::Accountant,
        );

        $this
            ->actingAs(
                $accountant,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $recipeId,
                '1',
            ),
        )->assertForbidden();

        [
            $foreignProduct,
            $foreignRaw,
            ,
            $foreignWarehouse,
        ] = $this->workspace();

        $foreignRecipeId = $this->createRecipe(
            $foreignProduct,
            [
                [
                    'material' => $foreignRaw,
                    'rate' => '1.0000',
                ],
            ],
        );

        app(
            TenantContext::class,
        )->set(
            $organization,
            OrganizationRole::Owner,
        );

        $ownerId = $organization
            ->users()
            ->wherePivot(
                'role',
                OrganizationRole::Owner->value,
            )
            ->value(
                'users.id',
            );

        abort_if(
            $ownerId === null,
            500,
            'Owner membership missing from test workspace.',
        );

        $owner = User::query()
            ->findOrFail(
                (int) $ownerId,
            );

        $this
            ->actingAs(
                $owner,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $this->getJson(
            $this->endpoint($foreignProduct),
        )->assertNotFound();

        $this->postJson(
            $this->endpoint($product),
            [
                'warehouse_id' => $warehouse->id,
                'quantity' => '1',
                'recipe_id' => $foreignRecipeId,
            ],
        )->assertNotFound();

        $this->postJson(
            $this->endpoint($product),
            [
                'warehouse_id' => $foreignWarehouse->id,
                'quantity' => '1',
                'recipe_id' => $recipeId,
            ],
        )->assertNotFound();

        $this->assertDatabaseCount(
            'stock_movements',
            0,
        );
    }

    /**
     * Verify untracked or archived Raw Materials cannot be consumed even when
     * an older active recipe still references them.
     */
    public function test_untracked_and_archived_materials_cannot_be_consumed(): void
    {
        [
            $product,
            $raw,
            $other,
            $warehouse,
        ] = $this->workspace();

        $untrackedRecipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '1.0000',
                ],
            ],
        );

        /*
         * createRecipe() was an HTTP request, so restore tenant context before
         * mutating the Raw Material directly in this test.
         */
        $this->restoreTenantContext(
            $product,
        );

        $raw->update([
            'track_inventory' => false,
        ]);

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $untrackedRecipeId,
                '1',
            ),
        )->assertUnprocessable();

        /*
         * The production request cleared TenantContext again.
         */
        $this->restoreTenantContext(
            $product,
        );

        $raw->update([
            'track_inventory' => true,
        ]);

        $archivedRecipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $other,
                    'rate' => '1.0000',
                ],
            ],
        );

        /*
         * Recipe creation also clears request-scoped tenant state before the
         * test regains control.
         */
        $this->restoreTenantContext(
            $product,
        );

        $other->delete();

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $archivedRecipeId,
                '1',
            ),
        )->assertUnprocessable();

        $this->assertDatabaseCount(
            'stock_movements',
            0,
        );
    }

    /**
     * Verify Raw Materials remain available through Catalog and Inventory
     * workflows but cannot be converted after stock history exists.
     */
    public function test_raw_material_catalog_and_inventory_workflows_are_available(): void
    {
        [
            ,
            ,
            ,
            $warehouse,
        ] = $this->workspace();

        $payload = [
            'type' => 'raw_material',
            'name' => 'Flour',
            'unit' => 'kg',
            'unit_price' => '2',
            'tax_rate' => '0',
        ];

        $rawId = $this->postJson(
            '/api/products',
            $payload,
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.inventory_eligible',
                true,
            )
            ->json(
                'data.id',
            );

        $this->patchJson(
            '/api/inventory/products/'
                .$rawId
                .'/settings',
            [
                'track_inventory' => true,
            ],
        )->assertOk();

        $this->postJson(
            '/api/inventory/products/'
                .$rawId
                .'/opening-stock',
            [
                'warehouse_id' => $warehouse->id,
                'quantity' => '20',
            ],
        )->assertOk();

        $this->getJson(
            '/api/inventory/products/'
                .$rawId,
        )->assertOk();

        $this->getJson(
            '/api/products?type=raw_material',
        )
            ->assertOk()
            ->assertJsonCount(
                3,
                'data',
            );

        $this->patchJson(
            '/api/products/'
                .$rawId,
            [
                ...$payload,
                'type' => 'service',
            ],
        )->assertUnprocessable();

        $this->patchJson(
            '/api/products/'
                .$rawId,
            [
                ...$payload,
                'type' => 'product',
            ],
        )->assertUnprocessable();

        $this->getJson(
            '/api/warehouses/'
                .$warehouse->id
                .'/inventory-products',
        )->assertOk();
    }

    /**
     * Verify saved recipe rates compute actual material totals and available
     * stock is checked against those calculated quantities.
     */
    public function test_material_rates_compute_totals_and_reject_insufficient_stock(): void
    {
        [
            $product,
            $raw,
            $other,
            $warehouse,
        ] = $this->workspace();

        $recipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '0.5000',
                ],
                [
                    'material' => $other,
                    'rate' => '0.2500',
                ],
            ],
        );

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $recipeId,
                '4',
            ),
        )->assertCreated();

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $raw->id,
                'on_hand' => '8.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $other->id,
                'on_hand' => '4.0000',
            ],
        );

        $insufficientRecipeId = $this->createRecipe(
            $product,
            [
                [
                    'material' => $raw,
                    'rate' => '3.0000',
                ],
            ],
        );

        $this->postJson(
            $this->endpoint($product),
            $this->productionPayload(
                $warehouse,
                $insufficientRecipeId,
                '4',
            ),
        )->assertUnprocessable();

        $this->assertDatabaseCount(
            'stock_movements',
            3,
        );

        $this->postJson(
            $this->recipeEndpoint($product),
            [
                'components' => [
                    [
                        'name' => 'Invalid rate',
                        'options' => [
                            [
                                'raw_material_id' => $raw->id,
                                'quantity_per_unit' => '0',
                            ],
                        ],
                    ],
                ],
            ],
        )->assertUnprocessable();
    }

    /**
     * Verify representable fractional consumption uses four-decimal half-up
     * precision instead of the old always-round-up behavior.
     */
    public function test_consumption_precision_uses_half_up_rounding(): void
    {
        $this->assertSame(
            '0.0200',
            ProductionConsumption::calculate(
                '0.1',
                '0.2',
            ),
        );

        $this->assertSame(
            '0.3000',
            ProductionConsumption::calculate(
                '1',
                '0.3',
            ),
        );

        $this->assertSame(
            '0.5000',
            ProductionConsumption::calculate(
                '1',
                '0.5',
            ),
        );

        $this->assertSame(
            '0.0200',
            ProductionConsumption::calculate(
                '1',
                '0.02',
            ),
        );

        try {
            ProductionConsumption::calculate(
                '0.0001',
                '0.0001',
            );

            $this->fail(
                'Below-precision material consumption should be rejected.',
            );
        } catch (
            ValidationException
        ) {
            $this->assertTrue(
                true,
            );
        }
    }

    /**
     * Verify calculated production consumption cannot overflow the supported
     * decimal(18,4) Inventory range.
     */
    public function test_consumption_overflow_is_rejected(): void
    {
        $this->expectException(
            ValidationException::class,
        );

        ProductionConsumption::calculate(
            '99999999999999',
            '99999999999999',
        );
    }

    /**
     * Return the Production API endpoint for one finished Product.
     */
    private function endpoint(
        Product $product,
    ): string {
        return '/api/products/'
            .$product->id
            .'/production';
    }

    /**
     * Return the Production Recipe API endpoint for one finished Product.
     */
    private function recipeEndpoint(
        Product $product,
    ): string {
        return '/api/products/'
            .$product->id
            .'/production-recipe';
    }

    /**
     * Build one recipe-driven production request payload.
     *
     * @return array{
     *     warehouse_id: int,
     *     quantity: string,
     *     recipe_id: int
     * }
     */
    private function productionPayload(
        Warehouse $warehouse,
        int $recipeId,
        string $quantity = '2',
    ): array {
        return [
            'warehouse_id' => $warehouse->id,
            'quantity' => $quantity,
            'recipe_id' => $recipeId,
        ];
    }

    /**
     * Create and activate one production recipe.
     *
     * Each supplied Raw Material becomes a logical component with one default
     * option.
     *
     * @param  list<array{
     *     material: Product,
     *     rate: string
     * }>  $materials
     */
    private function createRecipe(
        Product $product,
        array $materials,
    ): int {
        $components = [];

        foreach (
            $materials as $index => $material
        ) {
            $components[] = [
                'name' => 'Material '
                    .($index + 1),

                'options' => [
                    [
                        'raw_material_id' => $material[
                            'material'
                        ]->id,

                        'quantity_per_unit' => $material[
                            'rate'
                        ],

                        'is_default' => true,
                    ],
                ],
            ];
        }

        $response = $this->postJson(
            $this->recipeEndpoint(
                $product,
            ),
            [
                'components' => $components,
            ],
        )->assertCreated();

        return (int) $response->json(
            'data.id',
        );
    }

    /**
     * Re-enter the tenant context after a completed HTTP request.
     *
     * ResolveOrganization intentionally clears request-scoped tenant state in
     * its finally block. Direct model mutations performed by a test therefore
     * need to explicitly restore the workspace before using tenant-scoped
     * Eloquent models.
     */
    private function restoreTenantContext(
        Product $product,
        OrganizationRole $role = OrganizationRole::Owner,
    ): void {
        $organizationId = (int) $product->getRawOriginal(
            'organization_id',
        );

        $organization = Organization::query()
            ->findOrFail(
                $organizationId,
            );

        app(
            TenantContext::class,
        )->set(
            $organization,
            $role,
        );
    }

    /**
     * Create one tenant with a finished Product, two Raw Materials, their stock
     * balances, and one warehouse.
     *
     * @return array{Product, Product, Product, Warehouse}
     */
    private function workspace(
        OrganizationRole $role = OrganizationRole::Owner,
    ): array {
        $user = User::factory()
            ->create();

        $organization = Organization::create([
            'name' => 'Production workspace',
        ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => $role->value,
                ],
            );

        app(
            TenantContext::class,
        )->set(
            $organization,
            $role,
        );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $product = Product::factory()
            ->create([
                'type' => 'product',
                'track_inventory' => true,
            ]);

        $raw = Product::factory()
            ->create([
                'type' => 'raw_material',
                'track_inventory' => true,
                'unit' => 'kg',
            ]);

        $other = Product::factory()
            ->create([
                'type' => 'raw_material',
                'track_inventory' => true,
                'unit' => 'liter',
            ]);

        $warehouse = Warehouse::create([
            'code' => 'WH-001',
            'name' => 'Factory',
        ]);

        InventoryBalance::create([
            'product_id' => $raw->id,
            'warehouse_id' => $warehouse->id,
            'on_hand' => '10',
            'reserved' => '2',
        ]);

        InventoryBalance::create([
            'product_id' => $other->id,
            'warehouse_id' => $warehouse->id,
            'on_hand' => '5',
            'reserved' => '0',
        ]);

        return [
            $product,
            $raw,
            $other,
            $warehouse,
        ];
    }
}
