<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collection_alert_rules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 24);
            $table->boolean('enabled')->default(true);
            $table->unsignedSmallInteger('threshold_days')->default(7);
            $table->decimal('min_amount', 18, 4)->default(0);
            $table->unsignedSmallInteger('repeat_after_days')->default(7);
            $table->json('approved_channels');
            $table->timestamps();

            $table->unique(['organization_id', 'kind'], 'collection_alert_rules_kind_unique');
        });

        Schema::create('collection_contacts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('channel', 16);
            $table->string('outcome', 16);
            $table->text('note')->nullable();
            $table->timestamp('contacted_at');
            $table->date('next_contact_on')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'party_id', 'contacted_at'], 'collection_contacts_party_idx');
        });

        Schema::create('collection_alerts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 24);
            $table->string('status', 12)->default('open');
            $table->string('severity', 8)->default('warning');
            $table->json('reason');
            $table->decimal('outstanding', 18, 4)->default(0);
            $table->decimal('overdue_amount', 18, 4)->default(0);
            $table->unsignedInteger('days_late')->default(0);
            $table->date('last_payment_on')->nullable();
            $table->string('next_action', 40);
            $table->unsignedSmallInteger('notified_count')->default(0);
            $table->timestamp('last_notified_at')->nullable();
            $table->unsignedInteger('last_notified_days_late')->default(0);
            $table->date('snoozed_until')->nullable();
            $table->timestamp('first_raised_at');
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'party_id', 'kind'], 'collection_alerts_party_kind_unique');
            $table->index(['organization_id', 'status'], 'collection_alerts_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collection_alerts');
        Schema::dropIfExists('collection_contacts');
        Schema::dropIfExists('collection_alert_rules');
    }
};
