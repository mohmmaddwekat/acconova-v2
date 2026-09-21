<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (
            ! Schema::hasColumn(
                'financial_document_lines',
                'cost_price_snapshot',
            )
        ) {
            Schema::table(
                'financial_document_lines',
                function (Blueprint $table): void {
                    $table
                        ->decimal(
                            'cost_price_snapshot',
                            18,
                            4,
                        )
                        ->nullable()
                        ->after('unit_price');
                },
            );
        }
    }

    public function down(): void
    {
        if (
            Schema::hasColumn(
                'financial_document_lines',
                'cost_price_snapshot',
            )
        ) {
            Schema::table(
                'financial_document_lines',
                function (Blueprint $table): void {
                    $table->dropColumn(
                        'cost_price_snapshot',
                    );
                },
            );
        }
    }
};
