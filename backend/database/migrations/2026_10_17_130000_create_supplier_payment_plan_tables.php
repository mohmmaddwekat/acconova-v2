<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_payment_policies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete()->unique();
            $table->decimal('operating_reserve', 18, 4)->default(0);
            $table->unsignedTinyInteger('min_partial_percent')->default(25);
            $table->unsignedSmallInteger('pay_days_before_due')->default(0);
            $table->boolean('overdue_first')->default(true);
            $table->json('party_priorities')->nullable();
            $table->timestamps();
        });

        Schema::create('supplier_payment_plans', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->date('as_of');
            $table->string('scenario', 24);
            $table->unsignedSmallInteger('horizon_days');
            $table->unsignedSmallInteger('delay_days')->default(0);
            $table->string('currency', 3);
            $table->string('status', 16)->default('draft');
            $table->decimal('planned_total', 18, 4)->default(0);
            $table->decimal('unfunded_total', 18, 4)->default(0);
            $table->json('payload');
            $table->foreignId('previous_plan_id')->nullable()->constrained('supplier_payment_plans')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'status']);
        });

        Schema::create('supplier_payment_plan_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('supplier_payment_plan_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('financial_document_id')->nullable();
            $table->string('item_key', 64);
            $table->string('kind', 12);
            $table->decimal('amount', 18, 4);
            $table->date('pay_on');
            $table->date('due_date')->nullable();
            $table->boolean('depends_on_expected')->default(false);
            $table->json('detail');
            $table->timestamps();
            $table->index(['supplier_payment_plan_id', 'pay_on'], 'sp_plan_items_plan_pay_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_payment_plan_items');
        Schema::dropIfExists('supplier_payment_plans');
        Schema::dropIfExists('supplier_payment_policies');
    }
};
