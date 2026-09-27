<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mcp_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('kind', 24)->default('agent');
            $table->string('token_prefix', 24);
            $table->string('token_hash', 64)->unique();
            $table->string('mode', 24)->default('read');
            $table->json('scopes')->nullable();
            $table->unsignedInteger('daily_call_limit')->nullable();
            $table->unsignedInteger('monthly_call_limit')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'revoked_at'], 'mcp_tokens_org_revoked_idx');
        });

        Schema::create('mcp_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('mcp_access_token_id')->nullable()->constrained('mcp_access_tokens')->nullOnDelete();
            $table->string('capability', 100);
            $table->string('action', 80)->default('tools/call');
            $table->string('status', 32);
            $table->json('input')->nullable();
            $table->json('output_summary')->nullable();
            $table->unsignedInteger('duration_ms')->default(0);
            $table->unsignedInteger('cost_units')->default(1);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['organization_id', 'created_at'], 'mcp_audit_org_created_idx');
            $table->index(['mcp_access_token_id', 'created_at'], 'mcp_audit_token_created_idx');
        });

        Schema::create('mcp_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('mcp_access_token_id')->nullable()->constrained('mcp_access_tokens')->nullOnDelete();
            $table->string('capability', 100);
            $table->json('input')->nullable();
            $table->string('status', 24)->default('pending');
            $table->text('review_note')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'status'], 'mcp_approvals_org_status_idx');
        });

        Schema::create('mcp_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('provider', 80)->default('custom');
            $table->text('endpoint_url');
            $table->longText('secret_encrypted')->nullable();
            $table->json('scopes')->nullable();
            $table->string('status', 24)->default('active');
            $table->timestamp('last_used_at')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'status'], 'mcp_connections_org_status_idx');
        });

        Schema::create('mcp_custom_tools', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('slug', 100);
            $table->text('description')->nullable();
            $table->text('endpoint_url');
            $table->string('http_method', 10)->default('POST');
            $table->json('input_schema')->nullable();
            $table->longText('headers_encrypted')->nullable();
            $table->boolean('approval_required')->default(true);
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->unique(['organization_id', 'slug'], 'mcp_custom_tools_org_slug_uq');
        });

        Schema::create('mcp_workflows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('trigger_type', 32)->default('manual');
            $table->json('trigger_config')->nullable();
            $table->json('steps');
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_run_at')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'enabled'], 'mcp_workflows_org_enabled_idx');
        });

        Schema::create('mcp_workspace_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->unique()->constrained()->cascadeOnDelete();
            $table->boolean('enabled')->default(true);
            $table->boolean('allow_partner_tokens')->default(false);
            $table->boolean('require_approval_for_financial_writes')->default(true);
            $table->unsignedInteger('daily_call_limit')->nullable();
            $table->unsignedInteger('monthly_call_limit')->nullable();
            $table->json('enabled_capabilities')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mcp_workspace_settings');
        Schema::dropIfExists('mcp_workflows');
        Schema::dropIfExists('mcp_custom_tools');
        Schema::dropIfExists('mcp_connections');
        Schema::dropIfExists('mcp_approvals');
        Schema::dropIfExists('mcp_audit_logs');
        Schema::dropIfExists('mcp_access_tokens');
    }
};
