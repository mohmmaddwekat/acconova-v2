<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the organization-scoped Products and Services catalog.
     *
     * Prices use four decimal places so future invoice calculations are not
     * forced into floating-point arithmetic.
     */
    public function up(): void
    {
        Schema::create(
            'products',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->string('type', 20);

                $table
                    ->string('name');

                $table
                    ->string('sku', 100)
                    ->nullable();

                $table
                    ->text('description')
                    ->nullable();

                $table
                    ->string('unit', 50)
                    ->default('unit');

                $table
                    ->decimal(
                        'unit_price',
                        19,
                        4,
                    )
                    ->default(0);

                $table
                    ->decimal(
                        'cost_price',
                        19,
                        4,
                    )
                    ->nullable();

                $table
                    ->decimal(
                        'tax_rate',
                        5,
                        2,
                    )
                    ->default(0);

                $table->timestamps();
                $table->softDeletes();

                /*
                 * SKU identity is unique inside a workspace, including records
                 * that may later be archived.
                 */
                $table->unique([
                    'organization_id',
                    'sku',
                ]);

                $table->index([
                    'organization_id',
                    'type',
                ]);

                $table->index([
                    'organization_id',
                    'deleted_at',
                ]);
            },
        );
    }

    /**
     * Remove the Products catalog.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'products',
        );
    }
};
