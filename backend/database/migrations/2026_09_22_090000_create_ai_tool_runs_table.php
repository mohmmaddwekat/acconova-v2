<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_tool_runs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->foreignId('ai_conversation_id')
                ->constrained('ai_conversations')
                ->cascadeOnDelete();
            $table->foreignId('user_id')
                ->constrained()
                ->cascadeOnDelete();
            $table->string('tool_name', 80);
            $table->json('arguments');
            $table->string('status', 24);
            $table->json('result_meta')->nullable();
            $table->unsignedInteger('duration_ms')->default(0);
            $table->string('error', 500)->nullable();
            $table->timestamps();

            $table->index(
                ['organization_id', 'ai_conversation_id', 'created_at'],
                'ai_tool_runs_conversation_idx',
            );
            $table->index(
                ['organization_id', 'tool_name', 'created_at'],
                'ai_tool_runs_tool_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_tool_runs');
    }
};
