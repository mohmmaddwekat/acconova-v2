<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('party_adjustments', function (Blueprint $table): void {
            $table->foreignId('financial_document_id')->nullable()->after('party_id')->constrained('financial_documents')->nullOnDelete();
            $table->index(['financial_document_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('party_adjustments', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('financial_document_id');
        });
    }
};
