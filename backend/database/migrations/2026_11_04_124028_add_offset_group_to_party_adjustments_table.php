<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('party_adjustments', function (Blueprint $table): void {
            $table->string('offset_group', 36)->nullable()->after('financial_document_id');
            $table->index(['organization_id', 'offset_group'], 'party_adjustments_offset_group_idx');
        });
    }

    public function down(): void
    {
        Schema::table('party_adjustments', function (Blueprint $table): void {
            $table->dropIndex('party_adjustments_offset_group_idx');
            $table->dropColumn('offset_group');
        });
    }
};
