<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('approval_requests')) {
            Schema::create('approval_requests', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->string('subject_type', 40);
                $table->unsignedBigInteger('subject_id');
                $table->string('category', 40);
                $table->string('status', 20)->default('pending');
                $table->string('reason', 500);
                $table->json('snapshot')->nullable();
                $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('reviewed_at')->nullable();
                $table->timestamps();

                $table->index(
                    ['organization_id', 'status', 'category'],
                    'approval_org_status_category_idx',
                );
                $table->index(
                    ['organization_id', 'subject_type', 'subject_id'],
                    'approval_subject_lookup_idx',
                );
            });
        }

        if (! Schema::hasTable('inventory_transfer_requests')) {
            Schema::create('inventory_transfer_requests', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->foreignId('source_warehouse_id')->constrained('warehouses')->cascadeOnDelete();
                $table->foreignId('destination_warehouse_id')->constrained('warehouses')->cascadeOnDelete();
                $table->decimal('quantity', 18, 4);
                $table->string('status', 20)->default('requested');
                $table->string('note', 500)->nullable();
                $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('shipped_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('approved_at')->nullable();
                $table->timestamp('shipped_at')->nullable();
                $table->timestamp('received_at')->nullable();
                $table->timestamps();

                $table->index(
                    ['organization_id', 'status', 'created_at'],
                    'inv_transfer_org_status_idx',
                );
            });
        }

        if (! Schema::hasTable('purchase_requisitions')) {
            Schema::create('purchase_requisitions', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->string('number', 64);
                $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
                $table->string('description', 255);
                $table->decimal('quantity', 18, 4);
                $table->decimal('expected_unit_cost', 18, 4)->nullable();
                $table->foreignId('preferred_supplier_id')->nullable()->constrained('parties')->nullOnDelete();
                $table->date('needed_by')->nullable();
                $table->string('status', 20)->default('pending');
                $table->string('note', 1000)->nullable();
                $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('converted_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
                $table->timestamp('reviewed_at')->nullable();
                $table->timestamps();

                $table->unique(
                    ['organization_id', 'number'],
                    'purchase_req_org_number_uq',
                );
                $table->index(
                    ['organization_id', 'status', 'needed_by'],
                    'purchase_req_org_status_idx',
                );
            });
        }

        if (! Schema::hasTable('bank_statement_lines')) {
            Schema::create('bank_statement_lines', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->string('bank_account_label', 160)->nullable();
                $table->date('transaction_date');
                $table->string('description', 500);
                $table->string('reference', 160)->nullable();
                $table->decimal('amount', 18, 4);
                $table->string('currency', 3);
                $table->string('status', 20)->default('unmatched');
                $table->foreignId('matched_cash_movement_id')->nullable()->constrained('cash_movements')->nullOnDelete();
                $table->foreignId('imported_by')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->index(
                    ['organization_id', 'status', 'transaction_date'],
                    'bank_line_org_status_date_idx',
                );
                $table->index(
                    ['organization_id', 'amount', 'transaction_date'],
                    'bank_line_match_hint_idx',
                );
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_statement_lines');
        Schema::dropIfExists('purchase_requisitions');
        Schema::dropIfExists('inventory_transfer_requests');
        Schema::dropIfExists('approval_requests');
    }
};
