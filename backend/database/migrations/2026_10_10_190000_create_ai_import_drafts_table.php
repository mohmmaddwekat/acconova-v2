<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_import_drafts', function (Blueprint $table): void {
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
            $table->string('source_file_name', 255);
            $table->string('source_file_type', 24);
            $table->string('target_entity', 40)->nullable();
            $table->json('extracted_rows');
            $table->json('field_mapping')->nullable();
            $table->text('ai_notes')->nullable();
            $table->string('status', 24)->default('draft');
            $table->json('commit_summary')->nullable();
            $table->timestamps();

            $table->index(
                ['organization_id', 'ai_conversation_id', 'created_at'],
                'ai_import_drafts_conversation_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_import_drafts');
    }
};
