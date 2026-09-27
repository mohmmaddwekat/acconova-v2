<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mcp_context_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('kind', 32);
            $table->string('entity_type', 50)->nullable();
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->string('title', 180)->nullable();
            $table->longText('content')->nullable();
            $table->text('external_url')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->index(['organization_id', 'kind', 'created_at'], 'mcp_context_org_kind_created_idx');
            $table->index(['organization_id', 'entity_type', 'entity_id'], 'mcp_context_entity_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mcp_context_records');
    }
};
