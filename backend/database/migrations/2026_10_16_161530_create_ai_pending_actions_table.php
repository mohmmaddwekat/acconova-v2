<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_pending_actions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ai_conversation_id')->constrained('ai_conversations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('tool_name', 80);
            $table->string('token', 40)->unique();
            $table->char('arguments_hash', 64);
            $table->json('plan');
            $table->string('status', 16)->default('pending');
            $table->json('result')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('executed_at')->nullable();
            $table->timestamps();

            $table->index(['organization_id', 'ai_conversation_id', 'tool_name'], 'ai_pending_actions_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_pending_actions');
    }
};
