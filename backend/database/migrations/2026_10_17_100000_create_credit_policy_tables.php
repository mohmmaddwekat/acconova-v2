<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credit_policies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete()->unique();
            $table->unsignedSmallInteger('min_history_invoices')->default(3);
            $table->unsignedSmallInteger('min_history_days')->default(60);
            $table->decimal('min_on_time_ratio', 4, 2)->default(0.80);
            $table->unsignedSmallInteger('max_avg_days_late')->default(10);
            $table->decimal('max_overdue_ratio', 4, 2)->default(0.25);
            $table->unsignedSmallInteger('stop_credit_overdue_days')->default(60);
            $table->unsignedSmallInteger('stop_credit_bounced_cheques')->default(2);
            $table->unsignedSmallInteger('stop_credit_missed_promises')->default(3);
            $table->unsignedSmallInteger('lookback_days')->default(180);
            $table->unsignedSmallInteger('credit_days')->default(30);
            $table->unsignedTinyInteger('advance_percent')->default(50);
            $table->decimal('limit_months_of_sales', 4, 1)->default(2.0);
            $table->decimal('max_credit_limit', 18, 4)->nullable();
            $table->string('new_customer_terms', 20)->default('advance_payment');
            $table->unsignedSmallInteger('cheque_max_postdated_days')->default(30);
            $table->decimal('cheque_exposure_ratio', 4, 2)->default(0.50);
            $table->timestamps();
        });

        Schema::create('credit_decisions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->string('recommended', 24);
            $table->string('decision', 24);
            $table->boolean('overrides_recommendation')->default(false);
            $table->decimal('credit_limit', 18, 4)->nullable();
            $table->unsignedSmallInteger('credit_days')->nullable();
            $table->unsignedTinyInteger('advance_percent')->nullable();
            $table->boolean('applied_credit_limit')->default(false);
            $table->text('notes')->nullable();
            $table->json('snapshot');
            $table->foreignId('decided_by')->constrained('users');
            $table->timestamp('decided_at');
            $table->timestamps();

            $table->index(['organization_id', 'party_id', 'decided_at'], 'credit_decisions_party_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_decisions');
        Schema::dropIfExists('credit_policies');
    }
};
