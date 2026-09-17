<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add authoritative actual Raw Material consumption to Production Runs.
     *
     * Recipes remain planning/suggestion data. These rows are the physical
     * quantities that actually move Inventory when a run is Posted.
     */
    public function up(): void
    {
        Schema::create(
            'production_run_materials',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained('organizations')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('production_run_output_id')
                    ->constrained('production_run_outputs')
                    ->cascadeOnDelete();

                $table
                    ->unsignedSmallInteger('line_number');

                $table
                    ->foreignId('raw_material_id')
                    ->constrained('products')
                    ->restrictOnDelete();

                $table
                    ->foreignId('warehouse_id')
                    ->constrained('warehouses')
                    ->restrictOnDelete();

                /*
                 * This is the authoritative quantity consumed from Inventory.
                 * Recipe calculations never overwrite it after the Draft is
                 * saved.
                 */
                $table->decimal(
                    'actual_quantity',
                    18,
                    4,
                );

                $table
                    ->string('note', 500)
                    ->nullable();

                $table->timestamps();

                $table->unique(
                    [
                        'production_run_output_id',
                        'line_number',
                    ],
                    'prod_run_material_line_uq',
                );

                $table->index(
                    [
                        'organization_id',
                        'production_run_output_id',
                    ],
                    'prod_run_material_org_output_idx',
                );

                $table->index(
                    [
                        'raw_material_id',
                        'warehouse_id',
                    ],
                    'prod_run_material_raw_wh_idx',
                );
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table
                    ->foreignId('reversed_by')
                    ->nullable()
                    ->after('posted_movement_id')
                    ->constrained('users')
                    ->nullOnDelete();

                $table
                    ->timestamp('reversed_at')
                    ->nullable()
                    ->after('reversed_by');

                $table
                    ->text('reversal_reason')
                    ->nullable()
                    ->after('reversed_at');
            },
        );

        Schema::table(
            'stock_movements',
            function (Blueprint $table): void {
                $table
                    ->foreignId('production_run_material_id')
                    ->nullable()
                    ->after('production_run_output_id')
                    ->constrained('production_run_materials')
                    ->restrictOnDelete();

                $table->index(
                    [
                        'organization_id',
                        'production_run_material_id',
                    ],
                    'stock_move_org_prod_material_idx',
                );
            },
        );
    }

    /**
     * Remove actual-consumption structures.
     */
    public function down(): void
    {
        Schema::table(
            'stock_movements',
            function (Blueprint $table): void {
                $table->dropForeign([
                    'production_run_material_id',
                ]);

                $table->dropIndex(
                    'stock_move_org_prod_material_idx',
                );

                $table->dropColumn(
                    'production_run_material_id',
                );
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table->dropForeign([
                    'reversed_by',
                ]);

                $table->dropColumn([
                    'reversed_by',
                    'reversed_at',
                    'reversal_reason',
                ]);
            },
        );

        Schema::dropIfExists(
            'production_run_materials',
        );
    }
};
