<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_promises', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->foreignId('financial_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->decimal('amount', 18, 4);
            $table->date('promised_on');
            $table->string('status', 24)->default('open');
            $table->text('note')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status', 'promised_on']);
            $table->index(['organization_id', 'party_id']);
        });

        Schema::create('sales_opportunities', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title', 180);
            $table->string('stage', 32)->default('prospect');
            $table->decimal('expected_value', 18, 4)->default(0);
            $table->unsignedTinyInteger('probability')->default(10);
            $table->date('expected_close_on')->nullable();
            $table->date('next_action_on')->nullable();
            $table->text('notes')->nullable();
            $table->text('lost_reason')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'stage']);
            $table->index(['organization_id', 'next_action_on']);
        });

        Schema::create('trade_documents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->restrictOnDelete();
            $table->string('kind', 32);
            $table->string('number', 80);
            $table->string('status', 32)->default('draft');
            $table->date('issue_date');
            $table->date('valid_until')->nullable();
            $table->date('expected_on')->nullable();
            $table->string('currency', 3);
            $table->decimal('total', 18, 4)->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('converted_financial_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'number']);
            $table->index(['organization_id', 'kind', 'status']);
            $table->index(['organization_id', 'party_id']);
        });

        Schema::create('trade_document_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('trade_document_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->string('description', 255);
            $table->decimal('quantity', 18, 4);
            $table->decimal('unit_price', 18, 4);
            $table->decimal('fulfilled_quantity', 18, 4)->default(0);
            $table->boolean('affects_inventory')->default(true);
            $table->timestamps();

            $table->index(['organization_id', 'product_id']);
        });

        Schema::create('return_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('financial_document_id')->constrained('financial_documents')->restrictOnDelete();
            $table->foreignId('party_id')->nullable()->constrained()->nullOnDelete();
            $table->string('kind', 24);
            $table->string('status', 24)->default('requested');
            $table->string('reason', 160);
            $table->decimal('total_quantity', 18, 4)->default(0);
            $table->json('items')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'kind', 'status']);
        });

        Schema::create('warranty_records', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('financial_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->string('serial_number', 160)->nullable();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('status', 24)->default('active');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'party_id', 'status']);
            $table->index(['organization_id', 'product_id']);
        });

        Schema::create('warranty_claims', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warranty_record_id')->constrained()->cascadeOnDelete();
            $table->date('claimed_on');
            $table->string('status', 24)->default('open');
            $table->string('reason', 180);
            $table->text('resolution')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status']);
        });

        Schema::create('inventory_serials', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_party_id')->nullable()->constrained('parties')->nullOnDelete();
            $table->foreignId('customer_party_id')->nullable()->constrained('parties')->nullOnDelete();
            $table->foreignId('source_purchase_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->foreignId('source_sale_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->string('serial_number', 180);
            $table->string('status', 24)->default('in_stock');
            $table->date('received_on')->nullable();
            $table->date('sold_on')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'serial_number']);
            $table->index(['organization_id', 'product_id', 'status']);
        });

        Schema::create('inventory_batches', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('supplier_party_id')->nullable()->constrained('parties')->nullOnDelete();
            $table->string('lot_code', 160);
            $table->decimal('quantity', 18, 4);
            $table->date('manufactured_on')->nullable();
            $table->date('expiry_date')->nullable();
            $table->string('status', 24)->default('available');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'product_id', 'lot_code']);
            $table->index(['organization_id', 'status', 'expiry_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_batches');
        Schema::dropIfExists('inventory_serials');
        Schema::dropIfExists('warranty_claims');
        Schema::dropIfExists('warranty_records');
        Schema::dropIfExists('return_requests');
        Schema::dropIfExists('trade_document_lines');
        Schema::dropIfExists('trade_documents');
        Schema::dropIfExists('sales_opportunities');
        Schema::dropIfExists('payment_promises');
    }
};
