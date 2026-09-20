<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name', 160);
            $table->string('code', 48);
            $table->string('tax_type', 40);
            $table->char('country_code', 2);
            $table->string('region_code', 80)->nullable();
            $table->string('applies_to', 20)->default('both');
            $table->decimal('rate', 9, 4);
            $table->boolean('inclusive')->default(false);
            $table->boolean('recoverable')->default(false);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->boolean('active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'code'], 'tax_rules_org_code_uq');
            $table->index(['organization_id', 'active', 'country_code'], 'tax_rules_org_active_country_idx');
        });

        Schema::create('government_obligations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tax_rule_id')->nullable()->constrained('tax_rules')->nullOnDelete();
            $table->string('authority_name', 200);
            $table->string('title', 200);
            $table->string('obligation_type', 48);
            $table->char('country_code', 2);
            $table->string('region_code', 80)->nullable();
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->date('due_date');
            $table->decimal('amount', 18, 4);
            $table->decimal('paid_total', 18, 4)->default(0);
            $table->decimal('balance_due', 18, 4)->default(0);
            $table->char('currency', 3);
            $table->string('status', 20)->default('open');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'status', 'due_date'], 'gov_obligation_org_status_due_idx');
        });

        Schema::create('financial_documents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('root_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->foreignId('corrected_from_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->foreignId('party_id')->nullable()->constrained('parties')->restrictOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->string('kind', 32);
            $table->string('number', 48);
            $table->string('external_number', 96)->nullable();
            $table->unsignedInteger('revision')->default(1);
            $table->string('status', 24)->default('draft');
            $table->date('issue_date');
            $table->date('due_date')->nullable();
            $table->string('activity_type', 40)->nullable();
            $table->string('market_type', 20)->nullable();
            $table->string('branch_label', 120)->nullable();
            $table->char('currency', 3);
            $table->decimal('exchange_rate', 18, 8)->default(1);
            $table->decimal('subtotal', 18, 4)->default(0);
            $table->decimal('discount_total', 18, 4)->default(0);
            $table->decimal('tax_total', 18, 4)->default(0);
            $table->decimal('shipping_total', 18, 4)->default(0);
            $table->decimal('total', 18, 4)->default(0);
            $table->decimal('paid_total', 18, 4)->default(0);
            $table->decimal('balance_due', 18, 4)->default(0);
            $table->decimal('credit_total', 18, 4)->default(0);
            $table->string('payment_terms', 120)->nullable();
            $table->text('notes')->nullable();
            $table->text('internal_notes')->nullable();
            $table->text('correction_reason')->nullable();
            $table->timestamp('warning_acknowledged_at')->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'number'], 'financial_docs_org_number_uq');
            $table->index(['organization_id', 'kind', 'status', 'issue_date'], 'financial_docs_org_kind_status_idx');
            $table->index(['organization_id', 'party_id', 'kind'], 'financial_docs_org_party_kind_idx');
        });

        Schema::create('financial_document_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('financial_document_id')->constrained('financial_documents')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->restrictOnDelete();
            $table->foreignId('warehouse_id')->nullable()->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('tax_rule_id')->nullable()->constrained('tax_rules')->nullOnDelete();
            $table->unsignedInteger('position')->default(1);
            $table->string('description', 255);
            $table->string('sku_snapshot', 120)->nullable();
            $table->string('unit_snapshot', 80)->nullable();
            $table->decimal('quantity', 18, 4);
            $table->decimal('unit_price', 18, 4);
            $table->decimal('discount_percent', 9, 4)->default(0);
            $table->string('tax_name_snapshot', 160)->nullable();
            $table->decimal('tax_rate', 9, 4)->default(0);
            $table->decimal('line_subtotal', 18, 4)->default(0);
            $table->decimal('line_discount', 18, 4)->default(0);
            $table->decimal('line_tax', 18, 4)->default(0);
            $table->decimal('line_total', 18, 4)->default(0);
            $table->boolean('affects_inventory')->default(false);
            $table->timestamps();

            $table->index(['organization_id', 'financial_document_id'], 'financial_lines_org_doc_idx');
            $table->index(['organization_id', 'product_id'], 'financial_lines_org_product_idx');
        });

        Schema::create('cash_movements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->nullable()->constrained('parties')->restrictOnDelete();
            $table->foreignId('government_obligation_id')->nullable()->constrained('government_obligations')->nullOnDelete();
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->foreignId('corrected_from_id')->nullable()->constrained('cash_movements')->nullOnDelete();
            $table->foreignId('reversal_of_id')->nullable()->constrained('cash_movements')->nullOnDelete();
            $table->string('number', 48);
            $table->string('direction', 12);
            $table->string('status', 20)->default('draft');
            $table->string('category', 48);
            $table->decimal('amount', 18, 4);
            $table->char('currency', 3);
            $table->date('movement_date');
            $table->string('method', 32);
            $table->string('account_label', 160)->nullable();
            $table->string('branch_label', 120)->nullable();
            $table->string('cost_center', 120)->nullable();
            $table->string('reference', 160)->nullable();
            $table->string('check_number', 120)->nullable();
            $table->string('check_bank', 160)->nullable();
            $table->date('check_due_date')->nullable();
            $table->string('check_status', 20)->nullable();
            $table->json('method_details')->nullable();
            $table->text('notes')->nullable();
            $table->text('correction_reason')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'number'], 'cash_movements_org_number_uq');
            $table->index(['organization_id', 'direction', 'status', 'movement_date'], 'cash_move_org_dir_status_idx');
            $table->index(['organization_id', 'party_id', 'direction'], 'cash_move_org_party_dir_idx');
        });

        Schema::create('cash_allocations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cash_movement_id')->constrained('cash_movements')->cascadeOnDelete();
            $table->foreignId('financial_document_id')->constrained('financial_documents')->restrictOnDelete();
            $table->decimal('amount', 18, 4);
            $table->timestamps();

            $table->unique(['cash_movement_id', 'financial_document_id'], 'cash_alloc_move_doc_uq');
            $table->index(['organization_id', 'financial_document_id'], 'cash_alloc_org_doc_idx');
        });

        Schema::create('finance_audit_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('auditable_type', 80);
            $table->unsignedBigInteger('auditable_id');
            $table->string('action', 48);
            $table->text('reason')->nullable();
            $table->json('before_payload')->nullable();
            $table->json('after_payload')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['organization_id', 'auditable_type', 'auditable_id'], 'finance_audit_org_target_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('finance_audit_events');
        Schema::dropIfExists('cash_allocations');
        Schema::dropIfExists('cash_movements');
        Schema::dropIfExists('financial_document_lines');
        Schema::dropIfExists('financial_documents');
        Schema::dropIfExists('government_obligations');
        Schema::dropIfExists('tax_rules');
    }
};
