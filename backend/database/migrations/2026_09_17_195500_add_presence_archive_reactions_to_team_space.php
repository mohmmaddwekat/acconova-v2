<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add per-user conversation archive, online presence, message hiding,
     * and Messenger-style reactions.
     */
    public function up(): void
    {
        if (
            ! Schema::hasColumn(
                'workspace_conversation_members',
                'archived_at',
            )
        ) {
            Schema::table(
                'workspace_conversation_members',
                function (Blueprint $table): void {
                    $table
                        ->timestamp(
                            'archived_at',
                        )
                        ->nullable()
                        ->after(
                            'last_read_id',
                        );

                    $table->index(
                        'archived_at',
                        'wcm_archived_idx',
                    );
                },
            );
        }

        if (
            ! Schema::hasTable(
                'workspace_user_presence',
            )
        ) {
            Schema::create(
                'workspace_user_presence',
                function (Blueprint $table): void {
                    $table->id();

                    $table
                        ->foreignId(
                            'organization_id',
                        )
                        ->constrained()
                        ->cascadeOnDelete();

                    $table
                        ->foreignId(
                            'user_id',
                        )
                        ->constrained()
                        ->cascadeOnDelete();

                    $table->timestamp(
                        'last_seen_at',
                    );

                    $table->timestamps();

                    $table->unique(
                        [
                            'organization_id',
                            'user_id',
                        ],
                        'wup_org_user_uq',
                    );

                    $table->index(
                        [
                            'organization_id',
                            'last_seen_at',
                        ],
                        'wup_org_seen_idx',
                    );
                },
            );
        }

        /*
         * Any member may remove any visible message from their own view without
         * mutating what other members see.
         */
        if (
            ! Schema::hasTable(
                'workspace_message_user_hides',
            )
        ) {
            Schema::create(
                'workspace_message_user_hides',
                function (Blueprint $table): void {
                    $table->id();

                    $table
                        ->foreignId(
                            'organization_id',
                        )
                        ->constrained()
                        ->cascadeOnDelete();

                    $table
                        ->foreignId(
                            'conversation_id',
                        )
                        ->constrained(
                            'workspace_conversations',
                        )
                        ->cascadeOnDelete();

                    $table
                        ->foreignId(
                            'message_id',
                        )
                        ->constrained(
                            'workspace_messages',
                        )
                        ->cascadeOnDelete();

                    $table
                        ->foreignId(
                            'user_id',
                        )
                        ->constrained()
                        ->cascadeOnDelete();

                    $table->timestamp(
                        'hidden_at',
                    );

                    $table->timestamps();

                    $table->unique(
                        [
                            'message_id',
                            'user_id',
                        ],
                        'wmh_msg_user_uq',
                    );

                    $table->index(
                        [
                            'organization_id',
                            'conversation_id',
                        ],
                        'wmh_org_conv_idx',
                    );
                },
            );
        }

        /*
         * One current reaction per user/message keeps the interaction model
         * predictable while still allowing the user to change their reaction.
         */
        if (
            ! Schema::hasTable(
                'workspace_message_reactions',
            )
        ) {
            Schema::create(
                'workspace_message_reactions',
                function (Blueprint $table): void {
                    $table->id();

                    $table
                        ->foreignId(
                            'organization_id',
                        )
                        ->constrained()
                        ->cascadeOnDelete();

                    $table
                        ->foreignId(
                            'conversation_id',
                        )
                        ->constrained(
                            'workspace_conversations',
                        )
                        ->cascadeOnDelete();

                    $table
                        ->foreignId(
                            'message_id',
                        )
                        ->constrained(
                            'workspace_messages',
                        )
                        ->cascadeOnDelete();

                    $table
                        ->foreignId(
                            'user_id',
                        )
                        ->constrained()
                        ->cascadeOnDelete();

                    $table->string(
                        'reaction',
                        16,
                    );

                    $table->timestamps();

                    $table->unique(
                        [
                            'message_id',
                            'user_id',
                        ],
                        'wmr_msg_user_uq',
                    );

                    $table->index(
                        [
                            'organization_id',
                            'conversation_id',
                        ],
                        'wmr_org_conv_idx',
                    );
                },
            );
        }
    }

    /**
     * Remove richer messaging state while preserving base conversations and
     * their historical messages.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'workspace_message_reactions',
        );

        Schema::dropIfExists(
            'workspace_message_user_hides',
        );

        Schema::dropIfExists(
            'workspace_user_presence',
        );

        if (
            Schema::hasColumn(
                'workspace_conversation_members',
                'archived_at',
            )
        ) {
            Schema::table(
                'workspace_conversation_members',
                function (Blueprint $table): void {
                    $table->dropIndex(
                        'wcm_archived_idx',
                    );

                    $table->dropColumn(
                        'archived_at',
                    );
                },
            );
        }
    }
};
