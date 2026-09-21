<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create(
            'custom_reports',
            function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('name', 160);
                $table->string('dataset', 40);
                $table->json('columns');
                $table->json('filters')->nullable();
                $table->string('group_by', 80)->nullable();
                $table->string('sort_by', 80)->nullable();
                $table->string('sort_direction', 4)->default('asc');
                $table->boolean('shared')->default(false);
                $table->timestamps();

                $table->index(
                    ['organization_id', 'dataset'],
                    'custom_reports_org_dataset_idx',
                );
            },
        );

        Schema::create(
            'dashboard_preferences',
            function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->json('layout')->nullable();
                $table->boolean('exception_only')->default(false);
                $table->timestamps();

                $table->unique(
                    ['organization_id', 'user_id'],
                    'dashboard_preferences_org_user_unique',
                );
            },
        );

        Schema::create(
            'dashboard_visits',
            function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamp('last_seen_at')->nullable();
                $table->timestamps();

                $table->unique(
                    ['organization_id', 'user_id'],
                    'dashboard_visits_org_user_unique',
                );
            },
        );

        Schema::create(
            'kpi_targets',
            function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('metric', 50);
                $table->string('period', 20)->default('monthly');
                $table->decimal('target_value', 18, 4);
                $table->string('currency', 3)->nullable();
                $table->boolean('active')->default(true);
                $table->timestamps();

                $table->unique(
                    ['organization_id', 'metric', 'period', 'currency'],
                    'kpi_targets_org_metric_period_currency_unique',
                );
            },
        );

        Schema::create(
            'notification_rules',
            function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('name', 160);
                $table->string('category', 30)->nullable();
                $table->string('kind', 80)->nullable();
                $table->string('field', 40);
                $table->string('operator', 12);
                $table->string('threshold', 160);
                $table->boolean('active')->default(true);
                $table->timestamps();

                $table->index(
                    ['organization_id', 'user_id', 'active'],
                    'notification_rules_org_user_active_idx',
                );
            },
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_rules');
        Schema::dropIfExists('kpi_targets');
        Schema::dropIfExists('dashboard_visits');
        Schema::dropIfExists('dashboard_preferences');
        Schema::dropIfExists('custom_reports');
    }
};
