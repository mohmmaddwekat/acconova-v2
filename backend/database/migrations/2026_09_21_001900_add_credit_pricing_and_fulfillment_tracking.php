<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('parties', function (Blueprint $table): void {
            $table
                ->decimal('credit_limit', 18, 4)
                ->nullable()
                ->after('tax_number');
        });

        Schema::create('party_product_prices', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->decimal('unit_price', 18, 4);
            $table->string('currency', 3)->nullable();
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(
                ['organization_id', 'party_id', 'product_id'],
                'party_product_prices_unique',
            );
        });

        Schema::create('financial_line_fulfillments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table
                ->foreignId('financial_document_line_id')
                ->constrained('financial_document_lines')
                ->cascadeOnDelete();
            $table->decimal('quantity', 18, 4);
            $table->date('occurred_on');
            $table->string('note', 255)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(
                ['organization_id', 'financial_document_line_id', 'occurred_on'],
                'line_fulfillment_lookup',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_line_fulfillments');
        Schema::dropIfExists('party_product_prices');

        Schema::table('parties', function (Blueprint $table): void {
            $table->dropColumn('credit_limit');
        });
    }
};
