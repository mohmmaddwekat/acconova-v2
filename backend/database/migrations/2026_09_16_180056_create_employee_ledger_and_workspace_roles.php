<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_roles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('base_role');
            $table->json('permissions');
            $table->timestamps();
            $table->unique(['organization_id', 'name']);
        });
        Schema::table('memberships', function (Blueprint $table): void {
            $table->foreignId('workspace_role_id')->nullable()->constrained()->nullOnDelete();
        });
        Schema::create('staff_members', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('job_title')->nullable();
            $table->string('phone')->nullable();
            $table->string('basis', 20);
            $table->string('unit', 50)->nullable();
            $table->decimal('rate', 14, 4);
            $table->decimal('monthly_allowance', 14, 4)->default(0);
            $table->char('currency', 3);
            $table->date('started_on');
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['organization_id', 'user_id']);
        });
        Schema::create('staff_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('staff_member_id')->constrained()->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->uuid('request_id');
            $table->string('kind', 20);
            $table->date('occurred_on');
            $table->decimal('quantity', 12, 4)->nullable();
            $table->decimal('rate', 14, 4)->nullable();
            $table->decimal('amount', 18, 4);
            $table->text('notes')->nullable();
            $table->json('terms')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'request_id']);
            $table->index(['organization_id', 'staff_member_id', 'occurred_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_entries');
        Schema::dropIfExists('staff_members');
        Schema::table('memberships', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('workspace_role_id');
        });
        Schema::dropIfExists('workspace_roles');
    }
};
