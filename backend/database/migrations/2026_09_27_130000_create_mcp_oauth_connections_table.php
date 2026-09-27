<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mcp_oauth_connections', function (Blueprint $table) {
            $table->id();
            $table->uuid('public_id')->unique();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('mcp_access_token_id')->unique()->constrained('mcp_access_tokens')->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('provider', 32)->default('custom');
            $table->string('status', 24)->default('active');
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'status'], 'mcp_oauth_connections_org_status_idx');
            $table->index(['user_id', 'status'], 'mcp_oauth_connections_user_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mcp_oauth_connections');
    }
};
