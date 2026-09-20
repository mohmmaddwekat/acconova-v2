<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('financial_document_lines', function (Blueprint $table): void {
            $table->string('discount_type', 12)->default('percent')->after('discount_percent');
            $table->decimal('discount_value', 18, 4)->default(0)->after('discount_type');
        });

        DB::table('financial_document_lines')->update([
            'discount_type' => 'percent',
            'discount_value' => DB::raw('discount_percent'),
        ]);
    }

    public function down(): void
    {
        Schema::table('financial_document_lines', function (Blueprint $table): void {
            $table->dropColumn([
                'discount_type',
                'discount_value',
            ]);
        });
    }
};
