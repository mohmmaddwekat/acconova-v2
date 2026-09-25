<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_ai_wallets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('balance_tokens')->default(0);
            $table->unsignedBigInteger('total_purchased_tokens')->default(0);
            $table->unsignedBigInteger('total_consumed_tokens')->default(0);
            $table->boolean('auto_recharge_enabled')->default(false);
            $table->unsignedBigInteger('auto_recharge_threshold_tokens')->default(100000);
            $table->unsignedBigInteger('auto_recharge_tokens')->default(0);
            $table->unsignedBigInteger('auto_recharge_amount_minor')->default(0);
            $table->string('auto_recharge_currency', 3)->default('USD');
            $table->timestamp('last_topup_at')->nullable();
            $table->timestamp('last_auto_recharge_at')->nullable();
            $table->timestamps();
        });

        Schema::create('billing_ai_credit_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 40);
            $table->string('status', 30)->default('succeeded');
            $table->bigInteger('tokens');
            $table->unsignedBigInteger('balance_after_tokens')->default(0);
            $table->unsignedBigInteger('amount_minor')->default(0);
            $table->string('currency', 3)->default('USD');
            $table->string('provider_checkout_session_id', 140)->nullable()->unique();
            $table->string('provider_payment_intent_id', 140)->nullable()->unique();
            $table->string('reference', 191)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'created_at']);
            $table->index(['organization_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_ai_credit_transactions');
        Schema::dropIfExists('billing_ai_wallets');
    }
};
