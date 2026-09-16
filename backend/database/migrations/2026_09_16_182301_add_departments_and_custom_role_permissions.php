<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspace_roles', function (Blueprint $table): void {
            $table->boolean('is_custom')->default(false);
        });
        Schema::create('departments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->foreignId('manager_id')->nullable()->constrained('staff_members')->nullOnDelete();
            $table->timestamps();
            $table->unique(['organization_id', 'name']);
        });
        Schema::table('staff_members', function (Blueprint $table): void {
            $table->foreignId('department_id')->nullable()->constrained()->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('staff_members', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('department_id');
        });
        Schema::dropIfExists('departments');
        Schema::table('workspace_roles', function (Blueprint $table): void {
            $table->dropColumn('is_custom');
        });
    }
};
