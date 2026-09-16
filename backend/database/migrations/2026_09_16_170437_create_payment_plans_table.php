<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_plans', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->string('title');
            $table->string('direction', 12);
            $table->decimal('amount', 18, 4);
            $table->string('currency', 3);
            $table->string('frequency', 12);
            $table->date('next_due_on');
            $table->unsignedTinyInteger('anchor_day');
            $table->unsignedTinyInteger('reminder_days')->default(3);
            $table->string('counterparty')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->index(['organization_id', 'active', 'next_due_on']);
        });
        Schema::create('payment_records', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->restrictOnDelete();
            $table->foreignId('payment_plan_id')->constrained()->restrictOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title');
            $table->string('direction', 12);
            $table->string('currency', 3);
            $table->decimal('amount', 18, 4);
            $table->date('due_on');
            $table->date('paid_on');
            $table->string('counterparty')->nullable();
            $table->string('method', 12);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['payment_plan_id', 'due_on']);
            $table->index(['organization_id', 'paid_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_records');
        Schema::dropIfExists('payment_plans');
    }
};
