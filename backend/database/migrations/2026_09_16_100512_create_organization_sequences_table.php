<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Store monotonic organization-scoped counters.
     *
     * Sequence values are never decremented after deletion so identifiers such
     * as SKU-004 are never silently reused after historical activity.
     */
    public function up(): void
    {
        Schema::create(
            'organization_sequences',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->string('name', 100);

                $table
                    ->unsignedBigInteger('current_value')
                    ->default(0);

                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'name',
                ]);
            },
        );
    }

    /**
     * Remove organization sequence storage.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'organization_sequences',
        );
    }
};
