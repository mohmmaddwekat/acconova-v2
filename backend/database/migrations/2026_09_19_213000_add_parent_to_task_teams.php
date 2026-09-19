<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('task_teams', function (Blueprint $table): void {
            $table
                ->foreignId('parent_task_team_id')
                ->nullable()
                ->after('department_id')
                ->constrained('task_teams')
                ->nullOnDelete();

            $table->index(
                ['organization_id', 'parent_task_team_id'],
                'task_teams_org_parent_index',
            );
        });
    }

    public function down(): void
    {
        Schema::table('task_teams', function (Blueprint $table): void {
            $table->dropIndex('task_teams_org_parent_index');
            $table->dropConstrainedForeignId('parent_task_team_id');
        });
    }
};
