<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_conversations', function (Blueprint $table): void {
            $table->string('mode', 8)->default('chat')->after('title');
        });

        Schema::create('ai_work_tasks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('ai_conversation_id')->constrained('ai_conversations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('position');
            $table->string('title', 255);
            $table->string('status', 12)->default('pending');
            $table->text('note')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['ai_conversation_id', 'position'], 'ai_work_tasks_conversation_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_work_tasks');

        Schema::table('ai_conversations', function (Blueprint $table): void {
            $table->dropColumn('mode');
        });
    }
};
