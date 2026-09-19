<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_teams', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('department_id')->constrained()->cascadeOnDelete();
            $table->foreignId('leader_staff_member_id')->nullable()->constrained('staff_members')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('capacity')->default(8);
            $table->string('priority', 20)->default('medium');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(
                ['organization_id', 'department_id', 'name'],
                'task_teams_org_department_name_unique',
            );
            $table->index(
                ['organization_id', 'department_id'],
                'task_teams_org_department_index',
            );
        });

        Schema::create('task_team_members', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('task_team_id')->constrained('task_teams')->cascadeOnDelete();
            $table->foreignId('staff_member_id')->constrained('staff_members')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(
                ['task_team_id', 'staff_member_id'],
                'task_team_members_team_staff_unique',
            );
            $table->index(
                ['organization_id', 'staff_member_id'],
                'task_team_members_org_staff_index',
            );
        });

        Schema::create('task_team_projects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('task_team_id')->constrained('task_teams')->cascadeOnDelete();
            $table->foreignId('task_project_id')->constrained('task_projects')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(
                ['task_team_id', 'task_project_id'],
                'task_team_projects_team_project_unique',
            );
            $table->index(
                ['organization_id', 'task_project_id'],
                'task_team_projects_org_project_index',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('task_team_projects');
        Schema::dropIfExists('task_team_members');
        Schema::dropIfExists('task_teams');
    }
};
