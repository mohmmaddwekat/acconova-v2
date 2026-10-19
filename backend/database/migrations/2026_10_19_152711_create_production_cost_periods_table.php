<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('production_cost_periods', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->date('period');
            $table->decimal('quantity_produced', 18, 4);
            $table->decimal('material_unit_cost', 18, 4);
            $table->decimal('overhead_unit_cost', 18, 4);
            $table->decimal('unit_cost', 18, 4);
            $table->decimal('wages_pool', 18, 4)->default(0);
            $table->decimal('expenses_pool', 18, 4)->default(0);
            $table->timestamps();

            $table->unique(['organization_id', 'product_id', 'period'], 'production_cost_period_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_cost_periods');
    }
};
