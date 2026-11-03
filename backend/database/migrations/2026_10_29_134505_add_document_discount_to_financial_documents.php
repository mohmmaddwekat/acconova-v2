<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('financial_documents', function (Blueprint $table): void {
            $table->string('document_discount_type', 10)->default('percent')->after('discount_total');
            $table->decimal('document_discount_value', 18, 4)->default(0)->after('document_discount_type');
        });
    }

    public function down(): void
    {
        Schema::table('financial_documents', function (Blueprint $table): void {
            $table->dropColumn(['document_discount_type', 'document_discount_value']);
        });
    }
};
