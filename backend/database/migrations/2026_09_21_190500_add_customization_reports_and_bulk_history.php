<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create(
            'custom_field_definitions',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table->string('entity_type', 40);
                $table->string('key', 80);
                $table->string('label', 160);
                $table->string('field_type', 30);
                $table->json('options')->nullable();
                $table->boolean('required')->default(false);
                $table->boolean('active')->default(true);
                $table->unsignedSmallInteger('position')->default(0);
                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'entity_type',
                    'key',
                ], 'custom_fields_org_entity_key_unique');
            },
        );

        Schema::create(
            'custom_field_values',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table
                    ->foreignId('custom_field_definition_id')
                    ->constrained('custom_field_definitions')
                    ->cascadeOnDelete();
                $table->string('entity_type', 40);
                $table->unsignedBigInteger('entity_id');
                $table->text('value')->nullable();
                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'custom_field_definition_id',
                    'entity_type',
                    'entity_id',
                ], 'custom_field_values_record_unique');

                $table->index([
                    'organization_id',
                    'entity_type',
                    'entity_id',
                ], 'custom_field_values_record_idx');
            },
        );

        Schema::create(
            'custom_status_definitions',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table->string('entity_type', 40);
                $table->string('key', 80);
                $table->string('label', 160);
                $table->string('color', 32)->nullable();
                $table->boolean('is_closed')->default(false);
                $table->boolean('active')->default(true);
                $table->unsignedSmallInteger('position')->default(0);
                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'entity_type',
                    'key',
                ], 'custom_statuses_org_entity_key_unique');
            },
        );

        Schema::create(
            'custom_status_assignments',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table->string('entity_type', 40);
                $table->unsignedBigInteger('entity_id');
                $table
                    ->foreignId('custom_status_definition_id')
                    ->nullable()
                    ->constrained('custom_status_definitions')
                    ->nullOnDelete();
                $table->timestamps();

                $table->unique([
                    'organization_id',
                    'entity_type',
                    'entity_id',
                ], 'custom_status_assignments_record_unique');
            },
        );

        Schema::create(
            'approval_rules',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table->string('name', 160);
                $table->string('subject_type', 40);
                $table->string('condition_field', 60);
                $table->string('operator', 20);
                $table->string('threshold', 255);
                $table
                    ->unsignedTinyInteger('required_approvals')
                    ->default(1);
                $table->boolean('active')->default(true);
                $table->unsignedSmallInteger('priority')->default(100);
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'subject_type',
                    'active',
                    'priority',
                ], 'approval_rules_org_subject_idx');
            },
        );

        Schema::create(
            'scheduled_reports',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table->string('name', 160);
                $table->string('report_type', 50);
                $table->string('cadence', 20);
                $table->unsignedTinyInteger('run_hour')->default(8);
                $table->unsignedTinyInteger('day_of_week')->nullable();
                $table->unsignedTinyInteger('day_of_month')->nullable();
                $table->json('recipient_user_ids')->nullable();
                $table->boolean('active')->default(true);
                $table->timestamp('last_run_at')->nullable();
                $table->timestamp('next_run_at')->nullable();
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'active',
                    'next_run_at',
                ], 'scheduled_reports_org_due_idx');
            },
        );

        Schema::create(
            'scheduled_report_runs',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table
                    ->foreignId('scheduled_report_id')
                    ->nullable()
                    ->constrained('scheduled_reports')
                    ->nullOnDelete();
                $table->string('report_type', 50);
                $table->json('snapshot');
                $table->timestamp('generated_at');
                $table->timestamps();

                $table->index([
                    'organization_id',
                    'report_type',
                    'generated_at',
                ], 'scheduled_report_runs_org_type_date_idx');
            },
        );

        Schema::create(
            'bulk_action_history',
            function (Blueprint $table): void {
                $table->id();
                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();
                $table
                    ->foreignId('user_id')
                    ->nullable()
                    ->constrained()
                    ->nullOnDelete();
                $table->string('entity_type', 50);
                $table->string('action', 80);
                $table->unsignedInteger('record_count');
                $table->json('record_ids');
                $table->json('changes')->nullable();
                $table->timestamp('created_at');

                $table->index([
                    'organization_id',
                    'entity_type',
                    'created_at',
                ], 'bulk_action_history_org_entity_date_idx');
            },
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('bulk_action_history');
        Schema::dropIfExists('scheduled_report_runs');
        Schema::dropIfExists('scheduled_reports');
        Schema::dropIfExists('approval_rules');
        Schema::dropIfExists('custom_status_assignments');
        Schema::dropIfExists('custom_status_definitions');
        Schema::dropIfExists('custom_field_values');
        Schema::dropIfExists('custom_field_definitions');
    }
};
