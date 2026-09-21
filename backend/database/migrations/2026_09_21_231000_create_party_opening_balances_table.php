<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('party_opening_balances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('party_id')->constrained('parties')->cascadeOnDelete();
            $table->string('side', 16);
            $table->decimal('amount', 18, 4)->default(0);
            $table->date('as_of_date');
            $table->text('notes')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(
                ['organization_id', 'party_id', 'side'],
                'party_opening_balance_org_party_side_uq',
            );
            $table->index(
                ['organization_id', 'party_id', 'as_of_date'],
                'party_opening_balance_org_party_date_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('party_opening_balances');
    }
};
