<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billing_accounts', function (Blueprint $table): void {
            $table->string('billing_source', 20)->default('stripe')->after('organization_id');
            $table->timestamp('last_manual_payment_at')->nullable()->after('canceled_at');
        });

        Schema::create('billing_manual_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('billing_account_id')->nullable()->constrained('billing_accounts')->nullOnDelete();
            $table->foreignId('recorded_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('receipt_number', 40)->unique();
            $table->string('method', 40)->default('cash');
            $table->string('reference', 120)->nullable();
            $table->string('status', 30)->default('confirmed');
            $table->string('plan_key', 80);
            $table->string('billing_interval', 20);
            $table->unsignedSmallInteger('period_count')->default(1);
            $table->unsignedBigInteger('amount_minor');
            $table->string('currency', 3)->default('USD');
            $table->timestamp('service_period_start');
            $table->timestamp('service_period_end');
            $table->timestamp('paid_at');
            $table->timestamp('confirmed_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status', 'paid_at']);
            $table->unique(['organization_id', 'reference']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_manual_payments');

        Schema::table('billing_accounts', function (Blueprint $table): void {
            $table->dropColumn(['billing_source', 'last_manual_payment_at']);
        });
    }
};
