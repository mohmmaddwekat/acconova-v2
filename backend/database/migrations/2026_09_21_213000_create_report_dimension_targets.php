<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('report_dimension_targets')) {
            Schema::create('report_dimension_targets', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->string('dimension_type', 40);
                $table->unsignedBigInteger('dimension_id')->nullable();
                $table->string('metric', 60);
                $table->date('period_start');
                $table->date('period_end');
                $table->decimal('target_value', 18, 4);
                $table->string('currency', 3)->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique(
                    [
                        'organization_id',
                        'dimension_type',
                        'dimension_id',
                        'metric',
                        'period_start',
                        'period_end',
                    ],
                    'report_dimension_targets_unique',
                );

                $table->index(
                    [
                        'organization_id',
                        'dimension_type',
                        'metric',
                        'period_start',
                        'period_end',
                    ],
                    'report_dimension_targets_lookup_idx',
                );
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('report_dimension_targets');
    }
};
