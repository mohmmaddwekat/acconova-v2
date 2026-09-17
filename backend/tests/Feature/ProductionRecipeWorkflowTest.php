<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductionRecipeWorkflowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify fractional recipe quantities are calculated and consumed exactly.
     */
    public function test_recipe_calculates_fractional_raw_material_consumption(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $finished =
            $this->createCatalogItem(
                'product',
                'Yellow Bottle',
                'piece',
            );

        $raw =
            $this->createCatalogItem(
                'raw_material',
                'Plastic',
                'kg',
            );

        $warehouse =
            $this->createWarehouse();

        $this->enableTracking(
            $finished,
        );

        $this->enableTracking(
            $raw,
        );

        $this->postJson(
            "/api/inventory/products/{$raw}/opening-stock",
            [
                'warehouse_id' => $warehouse,

                'quantity' => '10',
            ],
        )->assertOk();

        $recipe =
            $this->postJson(
                "/api/products/{$finished}/production-recipe",
                [
                    'components' => [
                        [
                            'name' => 'Plastic',

                            'options' => [
                                [
                                    'raw_material_id' => $raw,

                                    'quantity_per_unit' => '0.3000',

                                    'is_default' => true,
                                ],
                            ],
                        ],
                    ],
                ],
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.version',
                    1,
                );

        $recipeId =
            (int) $recipe->json(
                'data.id',
            );

        $this->postJson(
            "/api/products/{$finished}/production",
            [
                'warehouse_id' => $warehouse,

                'quantity' => '2',

                'recipe_id' => $recipeId,
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.recipe_version',
                1,
            )
            ->assertJsonPath(
                'data.materials.0.quantity',
                '0.6000',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $raw,

                'warehouse_id' => $warehouse,

                'on_hand' => '9.4000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $finished,

                'warehouse_id' => $warehouse,

                'on_hand' => '2.0000',
            ],
        );
    }

    /**
     * Verify an improved Raw Material may replace the default with its own
     * consumption ratio.
     */
    public function test_recipe_supports_material_substitutes_with_different_rates(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $finished =
            $this->createCatalogItem(
                'product',
                'Finished Item',
                'piece',
            );

        $standard =
            $this->createCatalogItem(
                'raw_material',
                'Standard Resin',
                'kg',
            );

        $premium =
            $this->createCatalogItem(
                'raw_material',
                'Premium Resin',
                'kg',
            );

        $warehouse =
            $this->createWarehouse();

        foreach (
            [
                $finished,
                $standard,
                $premium,
            ] as $id
        ) {
            $this->enableTracking(
                $id,
            );
        }

        foreach (
            [
                $standard,
                $premium,
            ] as $id
        ) {
            $this->postJson(
                "/api/inventory/products/{$id}/opening-stock",
                [
                    'warehouse_id' => $warehouse,

                    'quantity' => '10',
                ],
            )->assertOk();
        }

        $recipe =
            $this->postJson(
                "/api/products/{$finished}/production-recipe",
                [
                    'components' => [
                        [
                            'name' => 'Resin',

                            'options' => [
                                [
                                    'raw_material_id' => $standard,

                                    'quantity_per_unit' => '1.0000',

                                    'is_default' => true,
                                ],

                                [
                                    'raw_material_id' => $premium,

                                    'quantity_per_unit' => '0.5000',

                                    'is_default' => false,
                                ],
                            ],
                        ],
                    ],
                ],
            )->assertCreated();

        $componentId =
            (int) $recipe->json(
                'data.components.0.id',
            );

        $premiumOptionId =
            (int) collect(
                $recipe->json(
                    'data.components.0.options',
                ),
            )
                ->firstWhere(
                    'raw_material.id',
                    $premium,
                )['id'];

        $this->postJson(
            "/api/products/{$finished}/production",
            [
                'warehouse_id' => $warehouse,

                'quantity' => '2',

                'recipe_id' => (int) $recipe->json(
                    'data.id',
                ),

                'selections' => [
                    (string) $componentId => $premiumOptionId,
                ],
            ],
        )
            ->assertCreated()
            ->assertJsonPath(
                'data.materials.0.quantity',
                '1.0000',
            );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $premium,

                'warehouse_id' => $warehouse,

                'on_hand' => '9.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $standard,

                'warehouse_id' => $warehouse,

                'on_hand' => '10.0000',
            ],
        );
    }

    /**
     * Verify recipe changes create a new version without rewriting historical
     * production usage.
     */
    public function test_recipe_changes_do_not_change_old_production_history(): void
    {
        [
            $owner,
            $organization,
        ] =
            $this->workspace();

        $this->actingInWorkspace(
            $owner,
            $organization,
        );

        $finished =
            $this->createCatalogItem(
                'product',
                'Versioned Product',
                'piece',
            );

        $raw =
            $this->createCatalogItem(
                'raw_material',
                'Raw Material',
                'kg',
            );

        $warehouse =
            $this->createWarehouse();

        $this->enableTracking(
            $finished,
        );

        $this->enableTracking(
            $raw,
        );

        $this->postJson(
            "/api/inventory/products/{$raw}/opening-stock",
            [
                'warehouse_id' => $warehouse,

                'quantity' => '20',
            ],
        )->assertOk();

        $versionOne =
            $this->createRecipe(
                $finished,
                $raw,
                '1.0000',
            );

        $firstBatch =
            $this->postJson(
                "/api/products/{$finished}/production",
                [
                    'warehouse_id' => $warehouse,

                    'quantity' => '1',

                    'recipe_id' => $versionOne,
                ],
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.recipe_version',
                    1,
                );

        $versionTwo =
            $this->createRecipe(
                $finished,
                $raw,
                '0.5000',
            );

        $this->assertNotSame(
            $versionOne,
            $versionTwo,
        );

        $this->getJson(
            "/api/products/{$finished}/production",
        )
            ->assertOk()
            ->assertJsonPath(
                'data.0.id',
                $firstBatch->json(
                    'data.id',
                ),
            )
            ->assertJsonPath(
                'data.0.recipe_version',
                1,
            )
            ->assertJsonPath(
                'data.0.materials.0.quantity',
                '1.0000',
            );

        $this->assertDatabaseHas(
            'production_recipes',
            [
                'id' => $versionOne,

                'version' => 1,

                'is_active' => false,
            ],
        );

        $this->assertDatabaseHas(
            'production_recipes',
            [
                'id' => $versionTwo,

                'version' => 2,

                'is_active' => true,
            ],
        );
    }

    /**
     * Create one complete single-component recipe and return its ID.
     */
    private function createRecipe(
        int $finishedProductId,
        int $rawMaterialId,
        string $quantityPerUnit,
    ): int {
        $response =
            $this->postJson(
                "/api/products/{$finishedProductId}/production-recipe",
                [
                    'components' => [
                        [
                            'name' => 'Primary material',

                            'options' => [
                                [
                                    'raw_material_id' => $rawMaterialId,

                                    'quantity_per_unit' => $quantityPerUnit,

                                    'is_default' => true,
                                ],
                            ],
                        ],
                    ],
                ],
            )->assertCreated();

        return (int) $response->json(
            'data.id',
        );
    }

    /**
     * Create one Product or Raw Material through the real Catalog API.
     */
    private function createCatalogItem(
        string $type,
        string $name,
        string $unit,
    ): int {
        $response =
            $this->postJson(
                '/api/products',
                [
                    'type' => $type,

                    'name' => $name,

                    'sku' => null,

                    'description' => null,

                    'unit' => $unit,

                    'unit_price' => '0',

                    'cost_price' => null,

                    'tax_rate' => '0',
                ],
            )->assertCreated();

        return (int) $response->json(
            'data.id',
        );
    }

    /**
     * Enable physical Inventory for one Product or Raw Material.
     */
    private function enableTracking(
        int $productId,
    ): void {
        $this->patchJson(
            "/api/inventory/products/{$productId}/settings",
            [
                'track_inventory' => true,

                'low_stock_threshold' => null,
            ],
        )->assertOk();
    }

    /**
     * Create the workspace default warehouse.
     */
    private function createWarehouse(): int
    {
        $response =
            $this->postJson(
                '/api/warehouses',
                [
                    'name' => 'Production Warehouse',
                ],
            )->assertCreated();

        return (int) $response->json(
            'data.id',
        );
    }

    /**
     * Create an Owner workspace.
     *
     * @return array{0: User, 1: Organization}
     */
    private function workspace(): array
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Production Recipe Workspace',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => 'owner',
                ],
            );

        return [
            $user,
            $organization,
        ];
    }

    /**
     * Authenticate one user inside the selected workspace.
     */
    private function actingInWorkspace(
        User $user,
        Organization $organization,
    ): void {
        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);
    }
}
