<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add an internal-notes field to Party records.
     *
     * Notes belong to the business workspace and are not intended to become
     * customer-facing portal content.
     */
    public function up(): void
    {
        Schema::table(
            'parties',
            function (Blueprint $table): void {
                $table
                    ->text('notes')
                    ->nullable();
            },
        );
    }

    /**
     * Remove internal Party notes when rolling this migration back.
     */
    public function down(): void
    {
        Schema::table(
            'parties',
            function (Blueprint $table): void {
                $table->dropColumn(
                    'notes',
                );
            },
        );
    }
};
