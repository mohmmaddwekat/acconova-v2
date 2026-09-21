<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_promises')) {
            Schema::create('payment_promises', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('party_id')->constrained()->cascadeOnDelete();
                $table->foreignId('financial_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
                $table->decimal('amount', 18, 4);
                $table->decimal('baseline_balance', 18, 4)->nullable();
                $table->decimal('baseline_received_total', 18, 4)->nullable();
                $table->date('promised_on');
                $table->string('status', 24)->default('open');
                $table->text('note')->nullable();
                $table->timestamp('fulfilled_at')->nullable();
                $table->timestamps();

                $table->index(
                    ['organization_id', 'status', 'promised_on'],
                    'pay_prom_org_status_date_idx',
                );
                $table->index(
                    ['organization_id', 'party_id'],
                    'pay_prom_org_party_idx',
                );
            });
        }

        if (! Schema::hasTable('sales_opportunities')) {
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

                $table->index(
                    ['organization_id', 'stage'],
                    'sales_opp_org_stage_idx',
                );
                $table->index(
                    ['organization_id', 'next_action_on'],
                    'sales_opp_org_next_action_idx',
                );
            });
        }

        if (! Schema::hasTable('trade_documents')) {
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

                $table->unique(
                    ['organization_id', 'number'],
                    'trade_doc_org_number_uq',
                );
                $table->index(
                    ['organization_id', 'kind', 'status'],
                    'trade_doc_org_kind_status_idx',
                );
                $table->index(
                    ['organization_id', 'party_id'],
                    'trade_doc_org_party_idx',
                );
            });
        }

        if (! Schema::hasTable('trade_document_lines')) {
            Schema::create('trade_document_lines', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('trade_document_id')->constrained()->cascadeOnDelete();
                $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('warehouse_id')->nullable()->constrained()->nullOnDelete();
                $table->string('description', 255);
                $table->decimal('quantity', 18, 4);
                $table->decimal('unit_price', 18, 4);
                $table->decimal('fulfilled_quantity', 18, 4)->default(0);
                $table->decimal('invoiced_quantity', 18, 4)->default(0);
                $table->boolean('affects_inventory')->default(true);
                $table->timestamps();

                $table->index(
                    ['organization_id', 'product_id'],
                    'trade_line_org_product_idx',
                );
            });
        }

        if (! Schema::hasTable('trade_document_conversions')) {
            Schema::create('trade_document_conversions', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('trade_document_id')->constrained()->cascadeOnDelete();
                $table->foreignId('financial_document_id')->constrained('financial_documents')->cascadeOnDelete();
                $table->decimal('converted_quantity', 18, 4)->default(0);
                $table->timestamps();

                $table->unique(
                    ['organization_id', 'financial_document_id'],
                    'trade_conv_org_fin_doc_uq',
                );
                $table->index(
                    ['organization_id', 'trade_document_id'],
                    'trade_conv_org_trade_doc_idx',
                );
            });
        } else {
            /*
             * Recovery for MySQL partial DDL:
             * the old migration created this table, then failed while trying
             * to add Laravel's auto-generated >64-character unique index.
             */
            if (! $this->indexExists(
                'trade_document_conversions',
                'trade_conv_org_fin_doc_uq',
            )) {
                Schema::table('trade_document_conversions', function (Blueprint $table): void {
                    $table->unique(
                        ['organization_id', 'financial_document_id'],
                        'trade_conv_org_fin_doc_uq',
                    );
                });
            }

            if (! $this->indexExists(
                'trade_document_conversions',
                'trade_conv_org_trade_doc_idx',
            )) {
                Schema::table('trade_document_conversions', function (Blueprint $table): void {
                    $table->index(
                        ['organization_id', 'trade_document_id'],
                        'trade_conv_org_trade_doc_idx',
                    );
                });
            }
        }

        if (! Schema::hasTable('return_requests')) {
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

                $table->index(
                    ['organization_id', 'kind', 'status'],
                    'return_req_org_kind_status_idx',
                );
            });
        }

        if (! Schema::hasTable('warranty_records')) {
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

                $table->index(
                    ['organization_id', 'party_id', 'status'],
                    'warranty_rec_org_party_status_idx',
                );
                $table->index(
                    ['organization_id', 'product_id'],
                    'warranty_rec_org_product_idx',
                );
            });
        }

        if (! Schema::hasTable('warranty_claims')) {
            Schema::create('warranty_claims', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('warranty_record_id')->constrained()->cascadeOnDelete();
                $table->date('claimed_on');
                $table->string('status', 24)->default('open');
                $table->string('reason', 180);
                $table->text('resolution')->nullable();
                $table->timestamps();

                $table->index(
                    ['organization_id', 'status'],
                    'warranty_claim_org_status_idx',
                );
            });
        }

        if (! Schema::hasTable('inventory_serials')) {
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

                $table->unique(
                    ['organization_id', 'serial_number'],
                    'inv_serial_org_number_uq',
                );
                $table->index(
                    ['organization_id', 'product_id', 'status'],
                    'inv_serial_org_product_status_idx',
                );
            });
        }

        if (! Schema::hasTable('inventory_batches')) {
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

                $table->unique(
                    ['organization_id', 'product_id', 'lot_code'],
                    'inv_batch_org_product_lot_uq',
                );
                $table->index(
                    ['organization_id', 'status', 'expiry_date'],
                    'inv_batch_org_status_expiry_idx',
                );
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_batches');
        Schema::dropIfExists('inventory_serials');
        Schema::dropIfExists('warranty_claims');
        Schema::dropIfExists('warranty_records');
        Schema::dropIfExists('return_requests');
        Schema::dropIfExists('trade_document_conversions');
        Schema::dropIfExists('trade_document_lines');
        Schema::dropIfExists('trade_documents');
        Schema::dropIfExists('sales_opportunities');
        Schema::dropIfExists('payment_promises');
    }

    private function indexExists(
        string $table,
        string $index,
    ): bool {
        $result = DB::selectOne(
            <<<'SQL'
                SELECT 1 AS found
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = ?
                  AND index_name = ?
                LIMIT 1
            SQL,
            [
                $table,
                $index,
            ],
        );

        return $result !== null;
    }
};
