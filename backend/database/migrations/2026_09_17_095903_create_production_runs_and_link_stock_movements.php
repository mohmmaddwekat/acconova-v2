<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Upgrade the original Production Run schema with Draft revision control,
     * soft deletion, and stable output line numbering.
     *
     * The earlier 090903 migration already creates production_runs,
     * production_run_outputs, and the stock-movement production links.
     */
    public function up(): void
    {
        Schema::table(
            'production_runs',
            function (Blueprint $table): void {
                $table
                    ->unsignedInteger('revision')
                    ->default(1)
                    ->after('status');

                $table
                    ->softDeletes()
                    ->after('updated_at');
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                /*
                 * Keep this nullable while historical rows receive stable
                 * line numbers inside this same migration.
                 */
                $table
                    ->unsignedSmallInteger('line_number')
                    ->nullable()
                    ->after('production_run_id');
            },
        );

        /*
         * Existing output rows predate line_number. Number every output
         * deterministically inside its parent Production Run.
         */
        DB::table('production_run_outputs')
            ->orderBy('production_run_id')
            ->orderBy('id')
            ->get([
                'id',
                'production_run_id',
            ])
            ->groupBy('production_run_id')
            ->each(
                function ($outputs): void {
                    foreach (
                        $outputs->values() as $index => $output
                    ) {
                        DB::table('production_run_outputs')
                            ->where(
                                'id',
                                $output->id,
                            )
                            ->update([
                                'line_number' => $index + 1,
                            ]);
                    }
                },
            );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table
                    ->unsignedSmallInteger('line_number')
                    ->nullable(false)
                    ->change();

                $table->unique(
                    [
                        'production_run_id',
                        'line_number',
                    ],
                    'prod_run_output_line_uq',
                );
            },
        );
    }

    /**
     * Remove only the schema additions owned by this upgrade migration.
     */
    public function down(): void
    {
        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                /*
                 * MySQL can reuse the composite unique index as the supporting
                 * index for the production_run_id foreign key. Give that FK a
                 * dedicated index before removing the uniqueness constraint so
                 * migration rollbacks remain valid.
                 */
                $table->index(
                    'production_run_id',
                    'prod_run_output_run_fk_idx',
                );
            },
        );

        Schema::table(
            'production_run_outputs',
            function (Blueprint $table): void {
                $table->dropUnique(
                    'prod_run_output_line_uq',
                );

                $table->dropColumn(
                    'line_number',
                );
            },
        );

        Schema::table(
            'production_runs',
            function (Blueprint $table): void {
                $table->dropSoftDeletes();

                $table->dropColumn(
                    'revision',
                );
            },
        );
    }
};
