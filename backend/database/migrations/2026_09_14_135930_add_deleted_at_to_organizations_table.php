<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the timestamp Laravel uses to hide soft-deleted organizations
     * without permanently removing their tenant data.
     */
    public function up(): void
    {
        Schema::table('organizations', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    /**
     * Remove soft-delete support if this migration is rolled back.
     */
    public function down(): void
    {
        Schema::table('organizations', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
