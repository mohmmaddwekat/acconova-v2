<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_attendances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('staff_member_id')->constrained()->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->date('occurred_on');
            $table->string('status', 20);
            $table->decimal('quantity', 12, 4)->default(0);
            $table->decimal('overtime_hours', 8, 4)->default(0);
            $table->decimal('overtime_rate', 14, 4)->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['staff_member_id', 'occurred_on']);
        });
        Schema::create('staff_adjustments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('staff_member_id')->constrained()->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('label');
            $table->string('kind', 20);
            $table->decimal('amount', 18, 4);
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_adjustments');
        Schema::dropIfExists('staff_attendances');
    }
};
