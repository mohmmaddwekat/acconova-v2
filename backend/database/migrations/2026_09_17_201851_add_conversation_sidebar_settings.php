<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('workspace_conversations', function (Blueprint $table): void {
            $table->string('avatar_path')->nullable();
            $table->string('theme', 20)->default('green');
            $table->string('quick_reaction', 16)->default('👍');
        });
        Schema::table('workspace_conversation_members', function (Blueprint $table): void {
            $table->string('nickname', 80)->nullable();
            $table->boolean('notifications_muted')->default(false);
            $table->timestamp('notifications_muted_until')->nullable();
            $table->boolean('read_receipts')->default(true);
            $table->unsignedBigInteger('receipt_read_id')->default(0);
        });
        Schema::table('workspace_messages', function (Blueprint $table): void {
            $table->timestamp('pinned_at')->nullable();
        });
        Schema::create('workspace_conversation_reports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('conversation_id')->constrained('workspace_conversations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('reason');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('workspace_conversation_reports');
        Schema::table('workspace_messages', fn (Blueprint $table) => $table->dropColumn('pinned_at'));
        Schema::table('workspace_conversation_members', fn (Blueprint $table) => $table->dropColumn(['nickname', 'notifications_muted', 'notifications_muted_until', 'read_receipts', 'receipt_read_id']));
        Schema::table('workspace_conversations', fn (Blueprint $table) => $table->dropColumn(['avatar_path', 'theme', 'quick_reaction']));
    }
};
