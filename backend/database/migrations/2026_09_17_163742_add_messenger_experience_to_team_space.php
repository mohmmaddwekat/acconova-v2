<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add per-user conversation state, per-user message hiding, reactions,
     * and lightweight Organization presence without changing message history.
     */
    public function up(): void
    {
        Schema::create(
            'workspace_conversation_user_states',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('conversation_id')
                    ->constrained('workspace_conversations')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('user_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->timestamp('archived_at')
                    ->nullable();

                /*
                 * "Delete for me" keeps shared history intact but prevents this
                 * user from seeing messages through this point. A later message
                 * can make the conversation appear again.
                 */
                $table
                    ->unsignedBigInteger('hidden_through_message_id')
                    ->nullable();

                $table->timestamps();

                $table->unique(
                    [
                        'conversation_id',
                        'user_id',
                    ],
                    'wcus_conv_user_unique',
                );

                $table->index(
                    [
                        'organization_id',
                        'user_id',
                        'archived_at',
                    ],
                    'wcus_org_user_archive_idx',
                );
            },
        );

        Schema::create(
            'workspace_message_user_states',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('conversation_id')
                    ->constrained('workspace_conversations')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('message_id')
                    ->constrained('workspace_messages')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('user_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->timestamp('hidden_at')
                    ->nullable();

                $table->timestamps();

                $table->unique(
                    [
                        'message_id',
                        'user_id',
                    ],
                    'wmus_message_user_unique',
                );

                $table->index(
                    [
                        'conversation_id',
                        'user_id',
                    ],
                    'wmus_conv_user_idx',
                );
            },
        );

        Schema::create(
            'workspace_message_reactions',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('conversation_id')
                    ->constrained('workspace_conversations')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('message_id')
                    ->constrained('workspace_messages')
                    ->cascadeOnDelete();

                $table
                    ->foreignId('user_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table->string(
                    'emoji',
                    16,
                );

                $table->timestamps();

                $table->unique(
                    [
                        'message_id',
                        'user_id',
                        'emoji',
                    ],
                    'wmr_message_user_emoji_unique',
                );

                $table->index(
                    [
                        'conversation_id',
                        'message_id',
                    ],
                    'wmr_conv_message_idx',
                );
            },
        );

        Schema::create(
            'workspace_presence',
            function (Blueprint $table): void {
                $table->id();

                $table
                    ->foreignId('organization_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->foreignId('user_id')
                    ->constrained()
                    ->cascadeOnDelete();

                $table
                    ->timestamp('last_seen_at');

                $table->timestamps();

                $table->unique(
                    [
                        'organization_id',
                        'user_id',
                    ],
                    'wp_org_user_unique',
                );

                $table->index(
                    [
                        'organization_id',
                        'last_seen_at',
                    ],
                    'wp_org_seen_idx',
                );
            },
        );
    }

    /**
     * Remove Messenger-style user state while preserving the original Team
     * Space schema.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'workspace_presence',
        );

        Schema::dropIfExists(
            'workspace_message_reactions',
        );

        Schema::dropIfExists(
            'workspace_message_user_states',
        );

        Schema::dropIfExists(
            'workspace_conversation_user_states',
        );
    }
};
