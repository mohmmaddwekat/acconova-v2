<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_accounts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')
                ->unique()
                ->constrained()
                ->cascadeOnDelete();
            $table->string('provider_customer_id', 120)->nullable()->unique();
            $table->string('provider_subscription_id', 120)->nullable()->unique();
            $table->string('plan_key', 80)->nullable();
            $table->string('billing_interval', 20)->nullable();
            $table->string('status', 40)->nullable();
            $table->string('price_id', 120)->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->unsignedBigInteger('amount_minor')->nullable();
            $table->string('currency', 3)->nullable();
            $table->timestamp('current_period_start')->nullable();
            $table->timestamp('current_period_end')->nullable();
            $table->boolean('cancel_at_period_end')->default(false);
            $table->timestamp('trial_ends_at')->nullable();
            $table->timestamp('canceled_at')->nullable();
            $table->string('payment_brand', 40)->nullable();
            $table->string('payment_last4', 4)->nullable();
            $table->unsignedTinyInteger('payment_exp_month')->nullable();
            $table->unsignedSmallInteger('payment_exp_year')->nullable();
            $table->timestamps();
        });

        Schema::create('billing_invoices', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->string('provider_invoice_id', 120)->unique();
            $table->string('number', 100)->nullable();
            $table->string('status', 40)->nullable();
            $table->unsignedBigInteger('amount_due_minor')->default(0);
            $table->unsignedBigInteger('amount_paid_minor')->default(0);
            $table->string('currency', 3)->nullable();
            $table->text('hosted_invoice_url')->nullable();
            $table->text('invoice_pdf_url')->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'issued_at']);
        });

        Schema::create('billing_webhook_events', function (Blueprint $table): void {
            $table->id();
            $table->string('provider_event_id', 140)->unique();
            $table->string('type', 120);
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamp('processed_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_webhook_events');
        Schema::dropIfExists('billing_invoices');
        Schema::dropIfExists('billing_accounts');
    }
};
