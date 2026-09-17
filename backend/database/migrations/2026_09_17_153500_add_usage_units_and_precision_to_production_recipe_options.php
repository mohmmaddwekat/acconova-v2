<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Preserve the preferred human usage unit and increase Recipe precision.
     *
     * Inventory remains decimal(18,4). Recipe rates need more precision because
     * a small gram-level consumption expressed against kg may require more than
     * four decimal places per finished unit.
     */
    public function up(): void
    {
        Schema::table(
            'production_recipe_options',
            function (Blueprint $table): void {
                $table
                    ->string(
                        'usage_unit',
                        32,
                    )
                    ->nullable()
                    ->after(
                        'raw_material_id',
                    );
            },
        );

        Schema::table(
            'production_recipe_options',
            function (Blueprint $table): void {
                $table
                    ->decimal(
                        'quantity_per_unit',
                        22,
                        8,
                    )
                    ->change();
            },
        );
    }

    /**
     * Restore the old precision only when doing so cannot silently destroy
     * high-precision Recipe information.
     */
    public function down(): void
    {
        $hasHighPrecision =
            DB::table(
                'production_recipe_options',
            )
                ->whereRaw(
                    'quantity_per_unit <> ROUND(quantity_per_unit, 4)',
                )
                ->exists();

        if ($hasHighPrecision) {
            throw new RuntimeException(
                'Cannot reduce Recipe precision because high-precision Recipe rates exist.',
            );
        }

        Schema::table(
            'production_recipe_options',
            function (Blueprint $table): void {
                $table
                    ->decimal(
                        'quantity_per_unit',
                        18,
                        4,
                    )
                    ->change();
            },
        );

        Schema::table(
            'production_recipe_options',
            function (Blueprint $table): void {
                $table->dropColumn(
                    'usage_unit',
                );
            },
        );
    }
};
