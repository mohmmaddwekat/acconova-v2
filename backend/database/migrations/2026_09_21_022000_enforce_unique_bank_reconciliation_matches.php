<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table(
            'bank_statement_lines',
            function (Blueprint $table): void {
                /*
                 * MySQL permits multiple NULL values in a unique index, so
                 * unreconciled statement lines remain unlimited while a posted
                 * cash movement can be matched to at most one statement line.
                 */
                $table->unique(
                    'matched_cash_movement_id',
                    'bank_line_cash_match_uq',
                );
            },
        );
    }

    public function down(): void
    {
        Schema::table(
            'bank_statement_lines',
            function (Blueprint $table): void {
                /*
                 * MySQL may reuse the unique index as the supporting index for
                 * the matched_cash_movement_id foreign key. Create a normal
                 * index first so dropping the uniqueness constraint remains
                 * rollback-safe while preserving the foreign key.
                 */
                $table->index(
                    'matched_cash_movement_id',
                    'bank_line_cash_match_fk_idx',
                );
            },
        );

        Schema::table(
            'bank_statement_lines',
            function (Blueprint $table): void {
                $table->dropUnique(
                    'bank_line_cash_match_uq',
                );
            },
        );
    }
};
