<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Make Recipe selection optional for Production Runs.
     *
     * Recipes are planning suggestions only. Actual material rows are the
     * authoritative source for physical Inventory consumption.
     */
    public function up(): void
    {
        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table->dropForeign([
                    'production_recipe_id',
                ]);
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table
                    ->unsignedBigInteger(
                        'production_recipe_id',
                    )
                    ->nullable()
                    ->change();
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table
                    ->foreign(
                        'production_recipe_id',
                    )
                    ->references('id')
                    ->on('production_recipes')
                    ->restrictOnDelete();
            },
        );
    }

    /**
     * Restore the previous required-Recipe schema only when doing so cannot
     * destroy Production Run information.
     */
    public function down(): void
    {
        if (
            DB::table(
                'production_run_outputs',
            )
                ->whereNull(
                    'production_recipe_id',
                )
                ->exists()
        ) {
            throw new RuntimeException(
                'Cannot make production_recipe_id required because recipe-less production outputs exist.',
            );
        }

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table->dropForeign([
                    'production_recipe_id',
                ]);
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table
                    ->unsignedBigInteger(
                        'production_recipe_id',
                    )
                    ->nullable(false)
                    ->change();
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table
                    ->foreign(
                        'production_recipe_id',
                    )
                    ->references('id')
                    ->on('production_recipes')
                    ->restrictOnDelete();
            },
        );
    }
};
