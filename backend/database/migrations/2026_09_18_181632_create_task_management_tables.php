<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Create the tenant-isolated Task Management foundation.
     */
    public function up(): void
    {
        Schema::create(
            'task_projects',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('created_by')
                    ->constrained('users')
                    ->restrictOnDelete();

                $table->string('name', 160);

                $table
                    ->text('description')
                    ->nullable();

                $table
                    ->string('status', 30)
                    ->default('active');

                $table
                    ->string('accent', 30)
                    ->nullable();

                $table
                    ->date('starts_on')
                    ->nullable();

                $table
                    ->date('due_on')
                    ->nullable();

                $table->timestamps();
                $table->softDeletes();

                $table->index(
                    [
                        'organization_id',
                        'status',
                    ],
                    'task_projects_org_status_idx',
                );
            },
        );

        Schema::create(
            'tasks',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('task_project_id')
                    ->nullable()
                    ->constrained('task_projects')
                    ->nullOnDelete();

                $table
                    ->foreignId('department_id')
                    ->nullable()
                    ->constrained('departments')
                    ->nullOnDelete();

                $table
                    ->foreignId('primary_assignee_id')
                    ->nullable()
                    ->constrained('staff_members')
                    ->nullOnDelete();

                $table
                    ->foreignId('created_by')
                    ->constrained('users')
                    ->restrictOnDelete();

                $table->string('title', 220);

                $table
                    ->text('description')
                    ->nullable();

                $table
                    ->string('status', 30)
                    ->default('todo');

                $table
                    ->string('priority', 20)
                    ->default('normal');

                $table
                    ->unsignedTinyInteger('progress')
                    ->default(0);

                $table
                    ->date('starts_on')
                    ->nullable();

                $table
                    ->date('due_on')
                    ->nullable();

                $table
                    ->unsignedInteger('estimated_minutes')
                    ->nullable();

                $table
                    ->boolean('requires_approval')
                    ->default(false);

                $table
                    ->timestamp('completed_at')
                    ->nullable();

                $table
                    ->timestamp('archived_at')
                    ->nullable();

                $table->timestamps();
                $table->softDeletes();

                $table->index(
                    [
                        'organization_id',
                        'status',
                    ],
                    'tasks_org_status_idx',
                );

                $table->index(
                    [
                        'organization_id',
                        'due_on',
                    ],
                    'tasks_org_due_idx',
                );

                $table->index(
                    [
                        'organization_id',
                        'primary_assignee_id',
                    ],
                    'tasks_org_assignee_idx',
                );

                $table->index(
                    [
                        'organization_id',
                        'department_id',
                    ],
                    'tasks_org_department_idx',
                );
            },
        );

        Schema::create(
            'task_assignees',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('task_id')
                    ->constrained('tasks')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('staff_member_id')
                    ->constrained('staff_members')
                    ->cascadeOnDelete();

                $table->timestamps();

                $table->unique(
                    [
                        'task_id',
                        'staff_member_id',
                    ],
                    'task_assignees_unique',
                );
            },
        );

        Schema::create(
            'task_subtasks',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('task_id')
                    ->constrained('tasks')
                    ->cascadeOnDelete();

                $table->string('title', 220);

                $table
                    ->boolean('is_completed')
                    ->default(false);

                $table
                    ->unsignedInteger('position')
                    ->default(0);

                $table->timestamps();

                $table->index(
                    [
                        'task_id',
                        'position',
                    ],
                    'task_subtasks_task_position_idx',
                );
            },
        );

        Schema::create(
            'task_comments',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('task_id')
                    ->constrained('tasks')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('user_id')
                    ->constrained()
                    ->restrictOnDelete();

                $table->text('body');

                $table
                    ->timestamp('edited_at')
                    ->nullable();

                $table->timestamps();

                $table->index(
                    [
                        'task_id',
                        'created_at',
                    ],
                    'task_comments_task_created_idx',
                );
            },
        );

        Schema::create(
            'task_attachments',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('task_id')
                    ->constrained('tasks')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('uploaded_by')
                    ->constrained('users')
                    ->restrictOnDelete();

                $table->string('original_name');

                $table->string('path');

                $table
                    ->string('mime_type', 180)
                    ->nullable();

                $table
                    ->unsignedBigInteger('size');

                $table->timestamps();

                $table->index(
                    [
                        'task_id',
                        'created_at',
                    ],
                    'task_files_task_created_idx',
                );
            },
        );

        Schema::create(
            'task_activity_logs',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('task_id')
                    ->constrained('tasks')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('user_id')
                    ->nullable()
                    ->constrained()
                    ->nullOnDelete();

                $table->string('action', 80);

                $table
                    ->json('metadata')
                    ->nullable();

                $table->timestamps();

                $table->index(
                    [
                        'task_id',
                        'created_at',
                    ],
                    'task_activity_task_created_idx',
                );
            },
        );
    }

    /**
     * Remove the entire Task Management module.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'task_activity_logs',
        );

        Schema::dropIfExists(
            'task_attachments',
        );

        Schema::dropIfExists(
            'task_comments',
        );

        Schema::dropIfExists(
            'task_subtasks',
        );

        Schema::dropIfExists(
            'task_assignees',
        );

        Schema::dropIfExists(
            'tasks',
        );

        Schema::dropIfExists(
            'task_projects',
        );
    }
};
