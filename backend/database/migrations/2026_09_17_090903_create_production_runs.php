<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create production-run lifecycle records and link stock movements to the
     * exact output that caused them.
     */
    public function up(): void
    {
        Schema::create(
            'production_runs',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained('organizations')
                    ->cascadeOnDelete();

                $table
                    ->string(
                        'run_number',
                        32,
                    );

                $table
                    ->date(
                        'occurred_on',
                    );

                $table
                    ->string(
                        'status',
                        20,
                    )
                    ->default('draft');

                $table
                    ->text('note')
                    ->nullable();

                $table
                    ->foreignId('created_by')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();

                $table
                    ->foreignId('posted_by')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();

                $table
                    ->timestamp('posted_at')
                    ->nullable();

                $table
                    ->foreignId('reversed_by')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();

                $table
                    ->timestamp('reversed_at')
                    ->nullable();

                $table
                    ->text('reversal_reason')
                    ->nullable();

                $table->timestamps();

                $table->unique(
                    [
                        'organization_id',
                        'run_number',
                    ],
                    'prod_runs_org_number_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'status',
                        'occurred_on',
                    ],
                    'prod_runs_org_status_date_idx',
                );
            },
        );

        Schema::create(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained('organizations')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('production_run_id')
                    ->constrained('production_runs')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('product_id')
                    ->constrained('products')
                    ->restrictOnDelete();

                $table
                    ->foreignId('warehouse_id')
                    ->constrained('warehouses')
                    ->restrictOnDelete();

                $table
                    ->foreignId('production_recipe_id')
                    ->constrained('production_recipes')
                    ->restrictOnDelete();

                $table->decimal(
                    'quantity',
                    18,
                    4,
                );

                /*
                 * selections:
                 * {
                 *   "recipe_component_id": recipe_option_id
                 * }
                 */
                $table
                    ->json('selections')
                    ->nullable();

                /*
                 * material_sources:
                 * {
                 *   "recipe_component_id": source_warehouse_id
                 * }
                 *
                 * This lets one finished Product be received in Warehouse B
                 * while its Raw Materials are consumed from Warehouses A/C.
                 */
                $table
                    ->json('material_sources')
                    ->nullable();

                /*
                 * Filled only at posting time. It permanently records the
                 * recipe, selected alternatives, exact quantities, and source
                 * warehouses used by this historical production output.
                 */
                $table
                    ->json('recipe_snapshot')
                    ->nullable();

                $table
                    ->foreignId('posted_movement_id')
                    ->nullable()
                    ->constrained('stock_movements')
                    ->restrictOnDelete();

                $table->timestamps();

                $table->index(
                    [
                        'organization_id',
                        'production_run_id',
                    ],
                    'prod_run_outputs_org_run_idx',
                );

                $table->index(
                    [
                        'product_id',
                        'warehouse_id',
                    ],
                    'prod_run_outputs_product_wh_idx',
                );
            },
        );

        Schema::table(
            'stock_movements',
            function (Blueprint $table): void {
                $table
                    ->foreignId('production_run_output_id')
                    ->nullable()
                    ->after('reference_id')
                    ->constrained('production_run_outputs')
                    ->restrictOnDelete();

                /*
                 * Reversal movements never destroy or mutate the original
                 * ledger entry. They point back to exactly what they reverse.
                 */
                $table
                    ->foreignId('reversal_of_movement_id')
                    ->nullable()
                    ->after('production_run_output_id')
                    ->constrained(
                        'stock_movements',
                    )
                    ->restrictOnDelete();

                $table->index(
                    [
                        'organization_id',
                        'production_run_output_id',
                    ],
                    'stock_move_org_prod_output_idx',
                );
            },
        );
    }

    /**
     * Remove production-run linkage in reverse dependency order.
     */
    public function down(): void
    {
        Schema::table(
            'stock_movements',
            function (Blueprint $table): void {
                $table->dropForeign([
                    'reversal_of_movement_id',
                ]);

                $table->dropForeign([
                    'production_run_output_id',
                ]);

                $table->dropIndex(
                    'stock_move_org_prod_output_idx',
                );

                $table->dropColumn([
                    'reversal_of_movement_id',
                    'production_run_output_id',
                ]);
            },
        );

        Schema::dropIfExists(
            'production_run_outputs',
        );

        Schema::dropIfExists(
            'production_runs',
        );
    }
};
