<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('party_settlements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 18, 4);
            $table->char('currency', 3);
            $table->date('settlement_date');
            $table->string('agreement_reference', 120);
            $table->date('agreement_date');
            $table->text('agreement_notes')->nullable();
            $table->string('status', 16)->default('pending');
            $table->foreignId('requested_by')->constrained('users');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->foreignId('reversed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reversed_at')->nullable();
            $table->text('reversal_reason')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'party_id', 'status'], 'party_settlements_party_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('party_settlements');
    }
};
