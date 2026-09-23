<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('billing_growth_profiles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('health_score')->default(100);
            $table->unsignedSmallInteger('failed_payment_count')->default(0);
            $table->timestamp('last_payment_failed_at')->nullable();
            $table->timestamp('last_payment_recovered_at')->nullable();
            $table->timestamp('grace_ends_at')->nullable();
            $table->timestamp('paused_until')->nullable();
            $table->timestamp('preserve_until')->nullable();
            $table->timestamp('trial_extended_at')->nullable();
            $table->string('cancel_reason', 80)->nullable();
            $table->text('cancel_feedback')->nullable();
            $table->unsignedBigInteger('monthly_spend_cap_minor')->nullable();
            $table->string('spend_cap_currency', 3)->nullable();
            $table->boolean('read_only')->default(false);
            $table->timestamps();
        });

        Schema::create('billing_growth_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('type', 80);
            $table->string('title', 180);
            $table->json('meta')->nullable();
            $table->string('fingerprint', 191)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();
            $table->index(['organization_id', 'occurred_at']);
            $table->unique(['organization_id', 'fingerprint']);
        });

        Schema::create('billing_growth_notifications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 80);
            $table->string('title_ar', 220);
            $table->string('title_en', 220);
            $table->text('body_ar')->nullable();
            $table->text('body_en')->nullable();
            $table->string('action_url')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->string('fingerprint', 191)->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'read_at']);
            $table->unique(['organization_id', 'fingerprint']);
        });

        Schema::create('billing_growth_ledger', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('bucket', 40);
            $table->bigInteger('amount_minor');
            $table->string('currency', 3)->default('USD');
            $table->string('reason', 120);
            $table->string('reference', 191)->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'bucket']);
            $table->unique(['organization_id', 'reference']);
        });

        Schema::create('billing_growth_addons', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('addon_key', 80);
            $table->unsignedInteger('quantity')->default(1);
            $table->string('status', 30)->default('active');
            $table->unsignedBigInteger('amount_minor')->default(0);
            $table->string('currency', 3)->default('USD');
            $table->timestamps();
            $table->unique(['organization_id', 'addon_key']);
        });

        Schema::create('billing_growth_referrals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('code', 40)->unique();
            $table->string('referred_email')->nullable();
            $table->string('status', 30)->default('invited');
            $table->timestamp('converted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('billing_growth_offers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 50);
            $table->string('code', 80)->nullable();
            $table->unsignedBigInteger('value_minor')->default(0);
            $table->string('currency', 3)->default('USD');
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('redeemed_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_growth_offers');
        Schema::dropIfExists('billing_growth_referrals');
        Schema::dropIfExists('billing_growth_addons');
        Schema::dropIfExists('billing_growth_ledger');
        Schema::dropIfExists('billing_growth_notifications');
        Schema::dropIfExists('billing_growth_events');
        Schema::dropIfExists('billing_growth_profiles');
    }
};
