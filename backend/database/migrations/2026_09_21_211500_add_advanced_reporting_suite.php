<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('custom_reports', function (Blueprint $table): void {
            if (! Schema::hasColumn('custom_reports', 'configuration')) {
                $table->json('configuration')->nullable()->after('filters');
            }
            if (! Schema::hasColumn('custom_reports', 'visualization')) {
                $table->json('visualization')->nullable()->after('configuration');
            }
        });

        Schema::create('report_snapshots', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('report_id')->nullable()->constrained('custom_reports')->nullOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name', 180);
            $table->date('as_of_date');
            $table->json('definition');
            $table->json('payload');
            $table->timestamps();
            $table->index(['organization_id', 'as_of_date'], 'report_snapshots_org_date_idx');
        });

        Schema::create('report_annotations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('report_id')->nullable()->constrained('custom_reports')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('anchor_key', 180)->nullable();
            $table->date('period_date')->nullable();
            $table->text('body');
            $table->timestamps();
            $table->index(['organization_id', 'report_id'], 'report_annotations_org_report_idx');
        });

        Schema::create('report_comments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('report_id')->nullable()->constrained('custom_reports')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('anchor_key', 180)->nullable();
            $table->text('body');
            $table->json('mentions')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'report_id'], 'report_comments_org_report_idx');
        });

        Schema::create('report_approvals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('report_id')->nullable()->constrained('custom_reports')->cascadeOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 20)->default('pending');
            $table->text('note')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'report_id', 'status'], 'report_approvals_org_report_status_idx');
        });

        Schema::create('report_versions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('report_id')->constrained('custom_reports')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('version');
            $table->json('definition');
            $table->timestamps();
            $table->unique(['report_id', 'version'], 'report_versions_report_version_uq');
        });

        Schema::create('report_filter_presets', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('scope', 80)->default('reports');
            $table->json('filters');
            $table->timestamps();
            $table->index(['organization_id', 'user_id', 'scope'], 'report_presets_org_user_scope_idx');
        });

        Schema::create('report_boards', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('name', 160);
            $table->json('layout');
            $table->boolean('shared')->default(false);
            $table->timestamps();
            $table->index(['organization_id', 'created_by'], 'report_boards_org_creator_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_boards');
        Schema::dropIfExists('report_filter_presets');
        Schema::dropIfExists('report_versions');
        Schema::dropIfExists('report_approvals');
        Schema::dropIfExists('report_comments');
        Schema::dropIfExists('report_annotations');
        Schema::dropIfExists('report_snapshots');

        Schema::table('custom_reports', function (Blueprint $table): void {
            if (Schema::hasColumn('custom_reports', 'visualization')) {
                $table->dropColumn('visualization');
            }
            if (Schema::hasColumn('custom_reports', 'configuration')) {
                $table->dropColumn('configuration');
            }
        });
    }
};
