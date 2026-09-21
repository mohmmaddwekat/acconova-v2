<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('exchange_rate_history')) {
            Schema::create('exchange_rate_history', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('financial_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
                $table->string('base_currency', 3);
                $table->string('currency', 3);
                $table->decimal('exchange_rate', 18, 8);
                $table->string('source', 60)->default('document');
                $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('recorded_at');
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'currency',
                    'recorded_at',
                ], 'exchange_rate_history_org_currency_date_idx');
                $table->index([
                    'organization_id',
                    'financial_document_id',
                ], 'exchange_rate_history_org_document_idx');
            });

            $organizations = DB::table('organizations')
                ->get(['id', 'preferences'])
                ->keyBy('id');

            DB::table('financial_documents')
                ->orderBy('id')
                ->get([
                    'id',
                    'organization_id',
                    'currency',
                    'exchange_rate',
                    'issue_date',
                    'created_by',
                    'created_at',
                ])
                ->each(function ($document) use ($organizations): void {
                    $organization = $organizations->get(
                        $document->organization_id,
                    );

                    $preferences = [];

                    if ($organization?->preferences) {
                        $decoded = json_decode(
                            (string) $organization->preferences,
                            true,
                        );

                        if (is_array($decoded)) {
                            $preferences = $decoded;
                        }
                    }

                    DB::table('exchange_rate_history')->insert([
                        'organization_id' => $document->organization_id,
                        'financial_document_id' => $document->id,
                        'base_currency' => strtoupper(
                            (string) ($preferences['currency'] ?? 'ILS'),
                        ),
                        'currency' => strtoupper(
                            (string) $document->currency,
                        ),
                        'exchange_rate' => $document->exchange_rate ?: 1,
                        'source' => 'migration_backfill',
                        'changed_by' => $document->created_by,
                        'recorded_at' => $document->created_at
                            ?? $document->issue_date
                            ?? now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                });
        }

        if (! Schema::hasTable('department_budgets')) {
            Schema::create('department_budgets', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('department_id')->constrained()->cascadeOnDelete();
                $table->date('month');
                $table->decimal('amount', 18, 4);
                $table->string('currency', 3);
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'department_id',
                    'month',
                    'currency',
                ], 'department_budgets_unique_period');
            });
        }

        if (! Schema::hasTable('department_spending_limits')) {
            Schema::create('department_spending_limits', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('department_id')->constrained()->cascadeOnDelete();
                $table->decimal('monthly_limit', 18, 4);
                $table->string('currency', 3);
                $table->boolean('active')->default(true);
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'department_id',
                    'currency',
                ], 'department_spending_limits_unique');
            });
        }

        if (! Schema::hasTable('expense_claims')) {
            Schema::create('expense_claims', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('submitted_by')->constrained('users')->cascadeOnDelete();
                $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
                $table->string('title', 180);
                $table->decimal('amount', 18, 4);
                $table->string('currency', 3);
                $table->date('expense_date');
                $table->string('merchant', 180)->nullable();
                $table->string('reference', 180)->nullable();
                $table->text('notes')->nullable();
                $table->string('status', 30)->default('submitted');
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('reviewed_at')->nullable();
                $table->string('rejection_reason', 1000)->nullable();
                $table->string('payout_reference', 180)->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'status',
                    'expense_date',
                ], 'expense_claims_org_status_date_idx');
                $table->index([
                    'organization_id',
                    'submitted_by',
                ], 'expense_claims_org_submitter_idx');
            });
        }

        if (! Schema::hasTable('petty_cash_funds')) {
            Schema::create('petty_cash_funds', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('custodian_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('name', 160);
                $table->string('currency', 3);
                $table->decimal('limit_amount', 18, 4);
                $table->decimal('opening_balance', 18, 4)->default(0);
                $table->boolean('active')->default(true);
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'name',
                ], 'petty_cash_funds_org_name_unique');
            });
        }

        if (! Schema::hasTable('petty_cash_transactions')) {
            Schema::create('petty_cash_transactions', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('petty_cash_fund_id')->constrained('petty_cash_funds')->cascadeOnDelete();
                $table->string('direction', 12);
                $table->decimal('amount', 18, 4);
                $table->date('transaction_date');
                $table->string('category', 120)->nullable();
                $table->string('reference', 180)->nullable();
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'petty_cash_fund_id',
                    'transaction_date',
                ], 'petty_cash_transactions_fund_date_idx');
            });
        }

        if (! Schema::hasTable('recurring_expenses')) {
            Schema::create('recurring_expenses', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('department_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('party_id')->nullable()->constrained()->nullOnDelete();
                $table->string('title', 180);
                $table->decimal('amount', 18, 4);
                $table->string('currency', 3);
                $table->string('frequency', 30)->default('monthly');
                $table->date('next_due_on');
                $table->boolean('active')->default(true);
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'active',
                    'next_due_on',
                ], 'recurring_expenses_org_due_idx');
            });
        }

        if (! Schema::hasTable('party_contracts')) {
            Schema::create('party_contracts', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('party_id')->nullable()->constrained()->nullOnDelete();
                $table->string('title', 180);
                $table->string('contract_type', 40)->default('other');
                $table->date('starts_on');
                $table->date('ends_on');
                $table->decimal('value', 18, 4)->default(0);
                $table->string('currency', 3);
                $table->string('renewal_type', 30)->default('manual');
                $table->unsignedSmallInteger('reminder_days')->default(30);
                $table->string('status', 30)->default('active');
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'status',
                    'ends_on',
                ], 'party_contracts_org_expiry_idx');
            });
        }

        if (! Schema::hasTable('expiring_documents')) {
            Schema::create('expiring_documents', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->string('subject_type', 40);
                $table->unsignedBigInteger('subject_id')->nullable();
                $table->string('subject_label', 180)->nullable();
                $table->string('document_type', 120);
                $table->string('document_number', 180)->nullable();
                $table->date('issued_on')->nullable();
                $table->date('expires_on');
                $table->unsignedSmallInteger('reminder_days')->default(30);
                $table->string('status', 30)->default('active');
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'status',
                    'expires_on',
                ], 'expiring_documents_org_expiry_idx');
                $table->index([
                    'organization_id',
                    'subject_type',
                    'subject_id',
                ], 'expiring_documents_org_subject_idx');
            });
        }

        if (! Schema::hasTable('landed_costs')) {
            Schema::create('landed_costs', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('purchase_document_id')->constrained('financial_documents')->cascadeOnDelete();
                $table->string('cost_type', 40);
                $table->string('title', 180);
                $table->decimal('amount', 18, 4);
                $table->string('currency', 3);
                $table->string('allocation_method', 30)->default('value');
                $table->string('status', 30)->default('draft');
                $table->text('notes')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('allocated_at')->nullable();
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'purchase_document_id',
                    'status',
                ], 'landed_costs_org_document_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('landed_costs');
        Schema::dropIfExists('expiring_documents');
        Schema::dropIfExists('party_contracts');
        Schema::dropIfExists('recurring_expenses');
        Schema::dropIfExists('petty_cash_transactions');
        Schema::dropIfExists('petty_cash_funds');
        Schema::dropIfExists('expense_claims');
        Schema::dropIfExists('department_spending_limits');
        Schema::dropIfExists('department_budgets');
        Schema::dropIfExists('exchange_rate_history');
    }
};
