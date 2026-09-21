<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (
            Schema::hasTable('payment_promises')
            && ! Schema::hasColumn(
                'payment_promises',
                'baseline_balance',
            )
        ) {
            Schema::table(
                'payment_promises',
                function (Blueprint $table): void {
                    $table
                        ->decimal(
                            'baseline_balance',
                            18,
                            4,
                        )
                        ->nullable()
                        ->after('amount');
                },
            );
        }

        if (
            Schema::hasTable('payment_promises')
            && ! Schema::hasColumn(
                'payment_promises',
                'baseline_received_total',
            )
        ) {
            Schema::table(
                'payment_promises',
                function (Blueprint $table): void {
                    $table
                        ->decimal(
                            'baseline_received_total',
                            18,
                            4,
                        )
                        ->nullable()
                        ->after('baseline_balance');
                },
            );
        }

        if (
            Schema::hasTable('trade_document_lines')
            && ! Schema::hasColumn(
                'trade_document_lines',
                'warehouse_id',
            )
        ) {
            Schema::table(
                'trade_document_lines',
                function (Blueprint $table): void {
                    $table
                        ->foreignId('warehouse_id')
                        ->nullable()
                        ->after('product_id')
                        ->constrained()
                        ->nullOnDelete();
                },
            );
        }

        if (
            Schema::hasTable('trade_document_lines')
            && ! Schema::hasColumn(
                'trade_document_lines',
                'invoiced_quantity',
            )
        ) {
            Schema::table(
                'trade_document_lines',
                function (Blueprint $table): void {
                    $table
                        ->decimal(
                            'invoiced_quantity',
                            18,
                            4,
                        )
                        ->default(0)
                        ->after('fulfilled_quantity');
                },
            );
        }

        if (
            ! Schema::hasTable(
                'trade_document_conversions',
            )
        ) {
            Schema::create(
                'trade_document_conversions',
                function (Blueprint $table): void {
                    $table->id();
                    $table
                        ->foreignId('organization_id')
                        ->constrained()
                        ->cascadeOnDelete();
                    $table
                        ->foreignId('trade_document_id')
                        ->constrained()
                        ->cascadeOnDelete();
                    $table
                        ->foreignId('financial_document_id')
                        ->constrained('financial_documents')
                        ->cascadeOnDelete();
                    $table
                        ->decimal(
                            'converted_quantity',
                            18,
                            4,
                        )
                        ->default(0);
                    $table->timestamps();

                    $table->unique([
                        'organization_id',
                        'financial_document_id',
                    ]);

                    $table->index([
                        'organization_id',
                        'trade_document_id',
                    ]);
                },
            );
        }

        if (
            Schema::hasTable('trade_documents')
            && Schema::hasTable(
                'trade_document_conversions',
            )
            && Schema::hasColumn(
                'trade_documents',
                'converted_financial_document_id',
            )
        ) {
            DB::table('trade_documents')
                ->whereNotNull(
                    'converted_financial_document_id',
                )
                ->orderBy('id')
                ->get([
                    'id',
                    'organization_id',
                    'converted_financial_document_id',
                    'updated_at',
                ])
                ->each(function ($document): void {
                    DB::table(
                        'trade_document_conversions',
                    )->insertOrIgnore([
                        'organization_id' =>
                            $document->organization_id,
                        'trade_document_id' =>
                            $document->id,
                        'financial_document_id' =>
                            $document->converted_financial_document_id,
                        'converted_quantity' => 0,
                        'created_at' =>
                            $document->updated_at
                            ?? now(),
                        'updated_at' =>
                            $document->updated_at
                            ?? now(),
                    ]);
                });
        }
    }

    public function down(): void
    {
        /*
         * This compatibility migration deliberately leaves the commercial
         * operations schema intact on rollback. The preceding creation
         * migration owns the tables and columns for fresh installations.
         */
    }
};
