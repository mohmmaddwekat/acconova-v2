<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('party_adjustments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained()->cascadeOnDelete();
            $table->string('number', 40);
            $table->string('side', 16);
            $table->string('direction', 16);
            $table->decimal('amount', 18, 4);
            $table->char('currency', 3);
            $table->date('adjustment_date');
            $table->string('reason', 160);
            $table->text('notes')->nullable();
            $table->string('status', 16)->default('posted');
            $table->foreignId('created_by')->constrained('users');
            $table->foreignId('voided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('voided_at')->nullable();
            $table->text('void_reason')->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'number'], 'party_adjustments_org_number_uq');
            $table->index(['organization_id', 'party_id', 'status', 'adjustment_date'], 'party_adjustments_party_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('party_adjustments');
    }
};
