<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create immutable versioned production recipes and historical usage.
     */
    public function up(): void
    {
        Schema::create(
            'production_recipes',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId(
                        'organization_id',
                    )
                    ->constrained(
                        'organizations',
                    )
                    ->cascadeOnDelete();

                $table
                    ->foreignId(
                        'product_id',
                    )
                    ->constrained(
                        'products',
                    )
                    ->restrictOnDelete();

                $table
                    ->foreignId(
                        'created_by',
                    )
                    ->nullable()
                    ->constrained(
                        'users',
                    )
                    ->nullOnDelete();

                $table
                    ->unsignedInteger(
                        'version',
                    );

                $table
                    ->boolean(
                        'is_active',
                    )
                    ->default(
                        true,
                    );

                $table
                    ->text(
                        'notes',
                    )
                    ->nullable();

                $table->timestamps();

                $table->unique(
                    [
                        'organization_id',
                        'product_id',
                        'version',
                    ],
                    'prod_recipe_org_product_version_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'product_id',
                        'is_active',
                    ],
                    'prod_recipe_org_product_active_idx',
                );
            },
        );

        Schema::create(
            'production_recipe_components',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId(
                        'organization_id',
                    )
                    ->constrained(
                        'organizations',
                    )
                    ->cascadeOnDelete();

                $table
                    ->foreignId(
                        'production_recipe_id',
                    )
                    ->constrained(
                        'production_recipes',
                    )
                    ->cascadeOnDelete();

                $table
                    ->string(
                        'name',
                        120,
                    );

                $table
                    ->unsignedSmallInteger(
                        'position',
                    );

                $table->timestamps();

                $table->unique(
                    [
                        'production_recipe_id',
                        'position',
                    ],
                    'prod_recipe_component_position_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'production_recipe_id',
                    ],
                    'prod_recipe_component_org_recipe_idx',
                );
            },
        );

        Schema::create(
            'production_recipe_options',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId(
                        'organization_id',
                    )
                    ->constrained(
                        'organizations',
                    )
                    ->cascadeOnDelete();

                $table
                    ->foreignId(
                        'production_recipe_component_id',
                    )
                    ->constrained(
                        'production_recipe_components',
                    )
                    ->cascadeOnDelete();

                $table
                    ->foreignId(
                        'raw_material_id',
                    )
                    ->constrained(
                        'products',
                    )
                    ->restrictOnDelete();

                /*
                 * Quantity is raw-material consumption for exactly one unit of
                 * finished Product. decimal(18,4) supports examples such as
                 * 1 kg, 0.5 kg, 0.3 kg, and 0.02 kg without floats.
                 */
                $table
                    ->decimal(
                        'quantity_per_unit',
                        18,
                        4,
                    );

                $table
                    ->boolean(
                        'is_default',
                    )
                    ->default(
                        false,
                    );

                $table
                    ->unsignedSmallInteger(
                        'position',
                    );

                $table->timestamps();

                $table->unique(
                    [
                        'production_recipe_component_id',
                        'raw_material_id',
                    ],
                    'prod_recipe_option_component_raw_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'raw_material_id',
                    ],
                    'prod_recipe_option_org_raw_idx',
                );
            },
        );

        Schema::create(
            'production_recipe_usages',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId(
                        'organization_id',
                    )
                    ->constrained(
                        'organizations',
                    )
                    ->cascadeOnDelete();

                /*
                 * The positive ProductionIn movement is the permanent identity
                 * of the legacy single-output production batch.
                 */
                $table
                    ->foreignId(
                        'production_movement_id',
                    )
                    ->constrained(
                        'stock_movements',
                    )
                    ->restrictOnDelete();

                $table
                    ->foreignId(
                        'production_recipe_id',
                    )
                    ->constrained(
                        'production_recipes',
                    )
                    ->restrictOnDelete();

                /*
                 * Snapshot records the exact alternative chosen per component
                 * and planned consumption. Recipe edits can never rewrite it.
                 */
                $table->json(
                    'snapshot',
                );

                $table->timestamps();

                $table->unique(
                    'production_movement_id',
                    'prod_recipe_usage_movement_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'production_recipe_id',
                    ],
                    'prod_recipe_usage_org_recipe_idx',
                );
            },
        );
    }

    /**
     * Remove the production recipe engine in reverse dependency order.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'production_recipe_usages',
        );

        Schema::dropIfExists(
            'production_recipe_options',
        );

        Schema::dropIfExists(
            'production_recipe_components',
        );

        Schema::dropIfExists(
            'production_recipes',
        );
    }
};
