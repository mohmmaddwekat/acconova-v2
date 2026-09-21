<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('financial_documents', function (Blueprint $table): void {
            if (! Schema::hasColumn('financial_documents', 'seller_tax_snapshot')) {
                $table->json('seller_tax_snapshot')
                    ->nullable()
                    ->after('external_number');
            }

            if (! Schema::hasColumn('financial_documents', 'buyer_tax_snapshot')) {
                $table->json('buyer_tax_snapshot')
                    ->nullable()
                    ->after('seller_tax_snapshot');
            }
        });
    }

    public function down(): void
    {
        Schema::table('financial_documents', function (Blueprint $table): void {
            if (Schema::hasColumn('financial_documents', 'buyer_tax_snapshot')) {
                $table->dropColumn('buyer_tax_snapshot');
            }

            if (Schema::hasColumn('financial_documents', 'seller_tax_snapshot')) {
                $table->dropColumn('seller_tax_snapshot');
            }
        });
    }
};
