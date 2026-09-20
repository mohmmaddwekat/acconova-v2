<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('financial_document_lines', function (Blueprint $table): void {
            $table
                ->string('price_status', 16)
                ->default('final')
                ->after('unit_price')
                ->index();
        });
    }

    public function down(): void
    {
        Schema::table('financial_document_lines', function (Blueprint $table): void {
            $table->dropIndex(['price_status']);
            $table->dropColumn('price_status');
        });
    }
};
