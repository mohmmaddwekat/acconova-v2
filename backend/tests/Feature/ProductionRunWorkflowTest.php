<?php

namespace Tests\Feature;

use App\Enums\OrganizationRole;
use App\Models\InventoryBalance;
use App\Models\Organization;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductionRunWorkflowTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Verify actual consumption overrides Recipe suggestions.
     */
    public function test_actual_consumption_not_recipe_suggestion_moves_inventory(): void
    {
        $workspace =
            $this->workspace();

        $recipe =
            $this->recipe(
                $workspace['red_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                    [
                        'material' => $workspace['red_dye'],

                        'rate' => '0.0080',
                    ],
                ],
            );

        $run =
            $this->postJson(
                '/api/production-runs',
                [
                    'occurred_on' => today()->toDateString(),

                    'outputs' => [
                        [
                            'product_id' => $workspace['red_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '100',

                            'recipe_id' => $recipe['id'],

                            /*
                             * Recipe suggests 25kg + 0.8kg.
                             * Actual factory consumption was 26.4kg + 0.9kg.
                             */
                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '26.4000',
                                ],
                                [
                                    'raw_material_id' => $workspace['red_dye']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '0.9000',
                                ],
                            ],
                        ],
                    ],
                ],
            )
                ->assertCreated()
                ->assertJsonPath(
                    'data.status',
                    'draft',
                );

        $runId =
            (int) $run->json(
                'data.id',
            );

        $preview =
            $this->getJson(
                "/api/production-runs/{$runId}/preview",
            )
                ->assertOk()
                ->assertJsonPath(
                    'data.all_sufficient',
                    true,
                );

        $plasticComparison =
            collect(
                $preview->json(
                    'data.outputs.0.comparison',
                ),
            )->firstWhere(
                'raw_material_id',
                $workspace['plastic']->id,
            );

        $this->assertSame(
            '25.0000',
            $plasticComparison['suggested'],
        );

        $this->assertSame(
            '26.4000',
            $plasticComparison['actual'],
        );

        $this->assertSame(
            '1.4000',
            $plasticComparison['deviation'],
        );

        $this->postJson(
            "/api/production-runs/{$runId}/post",
            [
                'expected_revision' => 1,
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'posted',
            );

        /*
         * Actual 26.4kg is deducted. The 25kg Recipe estimate is not.
         */
        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['plastic']->id,

                'warehouse_id' => $workspace['raw']->id,

                'on_hand' => '973.6000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['red_box']->id,

                'warehouse_id' => $workspace['finished']->id,

                'on_hand' => '100.0000',
            ],
        );
    }

    /**
     * Verify multiple finished Products can be Posted together and shared Raw
     * Material is checked using the actual quantities entered by the factory.
     */
    public function test_multiple_products_share_actual_material_consumption_in_one_run(): void
    {
        $workspace =
            $this->workspace();

        $redRecipe =
            $this->recipe(
                $workspace['red_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                    [
                        'material' => $workspace['red_dye'],

                        'rate' => '0.0080',
                    ],
                ],
            );

        $yellowRecipe =
            $this->recipe(
                $workspace['yellow_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                    [
                        'material' => $workspace['yellow_dye'],

                        'rate' => '0.0060',
                    ],
                ],
            );

        $runId =
            (int) $this->postJson(
                '/api/production-runs',
                [
                    'occurred_on' => today()->toDateString(),

                    'outputs' => [
                        [
                            'product_id' => $workspace['red_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '100',

                            'recipe_id' => $redRecipe['id'],

                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '26',
                                ],
                                [
                                    'raw_material_id' => $workspace['red_dye']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '0.8',
                                ],
                            ],
                        ],
                        [
                            'product_id' => $workspace['yellow_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '1000',

                            'recipe_id' => $yellowRecipe['id'],

                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '241',
                                ],
                                [
                                    'raw_material_id' => $workspace['yellow_dye']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '6',
                                ],
                            ],
                        ],
                    ],
                ],
            )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $preview =
            $this->getJson(
                "/api/production-runs/{$runId}/preview",
            )->assertOk();

        $plastic =
            collect(
                $preview->json(
                    'data.materials',
                ),
            )->firstWhere(
                'raw_material.id',
                $workspace['plastic']->id,
            );

        /*
         * 26 + 241 = 267 actual kg.
         */
        $this->assertSame(
            '267.0000',
            $plastic['actual_required'],
        );

        $this->postJson(
            "/api/production-runs/{$runId}/post",
            [
                'expected_revision' => 1,
            ],
        )->assertOk();

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['plastic']->id,

                'warehouse_id' => $workspace['raw']->id,

                'on_hand' => '733.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['red_box']->id,

                'warehouse_id' => $workspace['finished']->id,

                'on_hand' => '100.0000',
            ],
        );

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['yellow_box']->id,

                'warehouse_id' => $workspace['finished']->id,

                'on_hand' => '1000.0000',
            ],
        );
    }

    /**
     * Verify a factory may record an extra Raw Material not present in the
     * Recipe without silently changing the Product Recipe.
     */
    public function test_actual_production_can_include_manual_extra_material(): void
    {
        $workspace =
            $this->workspace();

        $recipe =
            $this->recipe(
                $workspace['red_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                ],
            );

        $runId =
            (int) $this->postJson(
                '/api/production-runs',
                [
                    'occurred_on' => today()->toDateString(),

                    'outputs' => [
                        [
                            'product_id' => $workspace['red_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '100',

                            'recipe_id' => $recipe['id'],

                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '25',
                                ],
                                [
                                    'raw_material_id' => $workspace['red_dye']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '1.2',
                                ],
                            ],
                        ],
                    ],
                ],
            )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $this->postJson(
            "/api/production-runs/{$runId}/post",
            [
                'expected_revision' => 1,
            ],
        )->assertOk();

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['red_dye']->id,

                'warehouse_id' => $workspace['raw']->id,

                'on_hand' => '98.8000',
            ],
        );

        /*
         * Recipe itself still contains only its original component.
         */
        $this->assertDatabaseCount(
            'production_recipe_components',
            1,
        );
    }

    /**
     * Verify a later Recipe version does not rewrite or block already-entered
     * actual Production Draft quantities.
     */
    public function test_recipe_change_after_draft_does_not_change_actual_consumption(): void
    {
        $workspace =
            $this->workspace();

        $versionOne =
            $this->recipe(
                $workspace['red_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                ],
            );

        $runId =
            (int) $this->postJson(
                '/api/production-runs',
                [
                    'occurred_on' => today()->toDateString(),

                    'outputs' => [
                        [
                            'product_id' => $workspace['red_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '10',

                            'recipe_id' => $versionOne['id'],

                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '2.7000',
                                ],
                            ],
                        ],
                    ],
                ],
            )
                ->assertCreated()
                ->json(
                    'data.id',
                );

        $versionTwo =
            $this->recipe(
                $workspace['red_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.5000',
                    ],
                ],
            );

        $this->assertNotSame(
            $versionOne['id'],
            $versionTwo['id'],
        );

        /*
         * Unlike the old design, the Draft remains valid. The entered 2.7kg
         * actual quantity is historical truth for this run.
         */
        $this->postJson(
            "/api/production-runs/{$runId}/post",
            [
                'expected_revision' => 1,
            ],
        )->assertOk();

        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['plastic']->id,

                'warehouse_id' => $workspace['raw']->id,

                'on_hand' => '997.3000',
            ],
        );
    }

    /**
     * Verify one incorrect Product may be reversed without undoing every
     * Product manufactured in the same Production Run.
     */
    public function test_one_output_can_be_reversed_independently(): void
    {
        $workspace =
            $this->workspace();

        $redRecipe =
            $this->recipe(
                $workspace['red_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                ],
            );

        $yellowRecipe =
            $this->recipe(
                $workspace['yellow_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                ],
            );

        $run =
            $this->postJson(
                '/api/production-runs',
                [
                    'occurred_on' => today()->toDateString(),

                    'outputs' => [
                        [
                            'product_id' => $workspace['red_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '100',

                            'recipe_id' => $redRecipe['id'],

                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '26',
                                ],
                            ],
                        ],
                        [
                            'product_id' => $workspace['yellow_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '1000',

                            'recipe_id' => $yellowRecipe['id'],

                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '241',
                                ],
                            ],
                        ],
                    ],
                ],
            )->assertCreated();

        $runId =
            (int) $run->json(
                'data.id',
            );

        $redOutputId =
            (int) $run->json(
                'data.outputs.0.id',
            );

        $this->postJson(
            "/api/production-runs/{$runId}/post",
            [
                'expected_revision' => 1,
            ],
        )->assertOk();

        $this->postJson(
            "/api/production-runs/{$runId}/outputs/{$redOutputId}/reverse",
            [
                'expected_revision' => 2,

                'reason' => 'Red boxes were counted incorrectly.',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'partially_reversed',
            )
            ->assertJsonPath(
                'data.revision',
                3,
            );

        /*
         * Red output is removed.
         */
        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['red_box']->id,

                'warehouse_id' => $workspace['finished']->id,

                'on_hand' => '0.0000',
            ],
        );

        /*
         * Yellow output remains Posted.
         */
        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['yellow_box']->id,

                'warehouse_id' => $workspace['finished']->id,

                'on_hand' => '1000.0000',
            ],
        );

        /*
         * Only Yellow's 241kg remains consumed.
         */
        $this->assertDatabaseHas(
            'inventory_balances',
            [
                'product_id' => $workspace['plastic']->id,

                'warehouse_id' => $workspace['raw']->id,

                'on_hand' => '759.0000',
            ],
        );
    }

    /**
     * Verify transferring produced stock away blocks reversal until it returns
     * to the original output warehouse.
     */
    public function test_transfer_away_blocks_output_reversal_until_stock_returns(): void
    {
        $workspace =
            $this->workspace();

        $recipe =
            $this->recipe(
                $workspace['red_box'],
                [
                    [
                        'material' => $workspace['plastic'],

                        'rate' => '0.2500',
                    ],
                ],
            );

        $run =
            $this->postJson(
                '/api/production-runs',
                [
                    'occurred_on' => today()->toDateString(),

                    'outputs' => [
                        [
                            'product_id' => $workspace['red_box']->id,

                            'warehouse_id' => $workspace['finished']->id,

                            'quantity' => '100',

                            'recipe_id' => $recipe['id'],

                            'materials' => [
                                [
                                    'raw_material_id' => $workspace['plastic']->id,

                                    'warehouse_id' => $workspace['raw']->id,

                                    'actual_quantity' => '26',
                                ],
                            ],
                        ],
                    ],
                ],
            )->assertCreated();

        $runId =
            (int) $run->json(
                'data.id',
            );

        $outputId =
            (int) $run->json(
                'data.outputs.0.id',
            );

        $this->postJson(
            "/api/production-runs/{$runId}/post",
            [
                'expected_revision' => 1,
            ],
        )->assertOk();

        $this->postJson(
            '/api/inventory/products/'
                .$workspace['red_box']->id
                .'/transfer',
            [
                'source_warehouse_id' => $workspace['finished']->id,

                'destination_warehouse_id' => $workspace['secondary']->id,

                'quantity' => '60',
            ],
        )->assertOk();

        $this->postJson(
            "/api/production-runs/{$runId}/outputs/{$outputId}/reverse",
            [
                'expected_revision' => 2,

                'reason' => 'Incorrect production.',
            ],
        )->assertUnprocessable();

        $this->postJson(
            '/api/inventory/products/'
                .$workspace['red_box']->id
                .'/transfer',
            [
                'source_warehouse_id' => $workspace['secondary']->id,

                'destination_warehouse_id' => $workspace['finished']->id,

                'quantity' => '60',
            ],
        )->assertOk();

        $this->postJson(
            "/api/production-runs/{$runId}/outputs/{$outputId}/reverse",
            [
                'expected_revision' => 2,

                'reason' => 'Incorrect production.',
            ],
        )
            ->assertOk()
            ->assertJsonPath(
                'data.status',
                'reversed',
            );
    }

    /**
     * Create one active Recipe for suggestion calculations.
     *
     * @param  list<array{material:Product,rate:string}>  $materials
     * @return array<string,mixed>
     */
    private function recipe(
        Product $product,
        array $materials,
    ): array {
        $components = [];

        foreach (
            $materials as $index => $material
        ) {
            $components[] = [
                'name' => 'Material '
                    .($index + 1),

                'options' => [
                    [
                        'raw_material_id' => $material['material']->id,

                        'quantity_per_unit' => $material['rate'],

                        'is_default' => true,
                    ],
                ],
            ];
        }

        return $this->postJson(
            '/api/products/'
                .$product->id
                .'/production-recipe',
            [
                'components' => $components,
            ],
        )
            ->assertCreated()
            ->json(
                'data',
            );
    }

    /**
     * Build one representative plastics factory workspace.
     *
     * @return array<string,mixed>
     */
    private function workspace(): array
    {
        $user =
            User::factory()
                ->create();

        $organization =
            Organization::create([
                'name' => 'Plastic Factory',
            ]);

        $organization
            ->users()
            ->attach(
                $user->id,
                [
                    'role' => OrganizationRole::Owner
                        ->value,
                ],
            );

        app(
            TenantContext::class,
        )->set(
            $organization,
            OrganizationRole::Owner,
        );

        $this
            ->actingAs(
                $user,
            )
            ->withSession([
                OrganizationAccess::SESSION_KEY => $organization->id,
            ]);

        $redBox =
            Product::factory()
                ->create([
                    'type' => 'product',
                    'name' => 'Red Box',
                    'unit' => 'piece',
                    'track_inventory' => true,
                ]);

        $yellowBox =
            Product::factory()
                ->create([
                    'type' => 'product',
                    'name' => 'Yellow Box',
                    'unit' => 'piece',
                    'track_inventory' => true,
                ]);

        $plastic =
            Product::factory()
                ->create([
                    'type' => 'raw_material',
                    'name' => 'Plastic Raw Material',
                    'unit' => 'kg',
                    'track_inventory' => true,
                ]);

        $redDye =
            Product::factory()
                ->create([
                    'type' => 'raw_material',
                    'name' => 'Red Dye',
                    'unit' => 'kg',
                    'track_inventory' => true,
                ]);

        $yellowDye =
            Product::factory()
                ->create([
                    'type' => 'raw_material',
                    'name' => 'Yellow Dye',
                    'unit' => 'kg',
                    'track_inventory' => true,
                ]);

        $raw =
            Warehouse::create([
                'code' => 'RAW',
                'name' => 'Raw Materials',
            ]);

        $finished =
            Warehouse::create([
                'code' => 'FIN',
                'name' => 'Finished Goods',
            ]);

        $secondary =
            Warehouse::create([
                'code' => 'SEC',
                'name' => 'Secondary Warehouse',
            ]);

        foreach (
            [
                $plastic => '1000.0000',
                $redDye => '100.0000',
                $yellowDye => '100.0000',
            ] as $material => $quantity
        ) {
            /*
             * PHP objects cannot be array keys, so this loop is intentionally
             * replaced immediately below with explicit rows.
             */
        }

        InventoryBalance::create([
            'product_id' => $plastic->id,
            'warehouse_id' => $raw->id,
            'on_hand' => '1000.0000',
            'reserved' => '0.0000',
        ]);

        InventoryBalance::create([
            'product_id' => $redDye->id,
            'warehouse_id' => $raw->id,
            'on_hand' => '100.0000',
            'reserved' => '0.0000',
        ]);

        InventoryBalance::create([
            'product_id' => $yellowDye->id,
            'warehouse_id' => $raw->id,
            'on_hand' => '100.0000',
            'reserved' => '0.0000',
        ]);

        return [
            'user' => $user,
            'organization' => $organization,
            'red_box' => $redBox,
            'yellow_box' => $yellowBox,
            'plastic' => $plastic,
            'red_dye' => $redDye,
            'yellow_dye' => $yellowDye,
            'raw' => $raw,
            'finished' => $finished,
            'secondary' => $secondary,
        ];
    }
}
