<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Extend Team Space with direct conversations and private media.
     *
     * This migration is intentionally restart-safe because MySQL DDL may have
     * committed earlier schema changes before a later statement failed.
     */
    public function up(): void
    {
        if (
            ! Schema::hasColumn(
                'workspace_conversations',
                'kind',
            )
        ) {
            Schema::table(
                'workspace_conversations',
                function (Blueprint $table): void {
                    $table
                        ->string(
                            'kind',
                            20,
                        )
                        ->default(
                            'group',
                        )
                        ->after(
                            'created_by',
                        );
                },
            );
        }

        if (
            ! Schema::hasColumn(
                'workspace_conversations',
                'direct_key',
            )
        ) {
            Schema::table(
                'workspace_conversations',
                function (Blueprint $table): void {
                    $table
                        ->string(
                            'direct_key',
                            80,
                        )
                        ->nullable()
                        ->after(
                            'kind',
                        );
                },
            );
        }

        if (
            ! $this->hasIndex(
                'workspace_conversations',
                'workspace_conversation_direct_unique',
            )
        ) {
            Schema::table(
                'workspace_conversations',
                function (Blueprint $table): void {
                    $table->unique(
                        [
                            'organization_id',
                            'direct_key',
                        ],
                        'workspace_conversation_direct_unique',
                    );
                },
            );
        }

        /*
         * A failed MySQL migration may already have created this table before
         * failing on a later long index name, so never recreate it blindly.
         */
        if (
            ! Schema::hasTable(
                'workspace_message_attachments',
            )
        ) {
            Schema::create(
                'workspace_message_attachments',
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

                    $table->string(
                        'disk',
                        60,
                    );

                    $table->string(
                        'path',
                        1000,
                    );

                    $table->string(
                        'original_name',
                        255,
                    );

                    $table->string(
                        'mime_type',
                        150,
                    );

                    $table->unsignedBigInteger(
                        'size',
                    );

                    $table->string(
                        'kind',
                        20,
                    );

                    $table->timestamps();
                },
            );
        }

        /*
         * Explicit short names avoid MySQL's 64-character identifier limit.
         */
        if (
            ! $this->hasIndex(
                'workspace_message_attachments',
                'wma_org_conv_idx',
            )
        ) {
            Schema::table(
                'workspace_message_attachments',
                function (Blueprint $table): void {
                    $table->index(
                        [
                            'organization_id',
                            'conversation_id',
                        ],
                        'wma_org_conv_idx',
                    );
                },
            );
        }

        if (
            ! $this->hasIndex(
                'workspace_message_attachments',
                'wma_message_idx',
            )
        ) {
            Schema::table(
                'workspace_message_attachments',
                function (Blueprint $table): void {
                    $table->index(
                        [
                            'message_id',
                            'id',
                        ],
                        'wma_message_idx',
                    );
                },
            );
        }
    }

    /**
     * Remove rich-messaging additions without touching the original Team Space
     * tables or their historical messages.
     */
    public function down(): void
    {
        Schema::dropIfExists(
            'workspace_message_attachments',
        );

        if (
            Schema::hasTable(
                'workspace_conversations',
            )
            && $this->hasIndex(
                'workspace_conversations',
                'workspace_conversation_direct_unique',
            )
        ) {
            Schema::table(
                'workspace_conversations',
                function (Blueprint $table): void {
                    $table->dropUnique(
                        'workspace_conversation_direct_unique',
                    );
                },
            );
        }

        if (
            Schema::hasColumn(
                'workspace_conversations',
                'direct_key',
            )
        ) {
            Schema::table(
                'workspace_conversations',
                function (Blueprint $table): void {
                    $table->dropColumn(
                        'direct_key',
                    );
                },
            );
        }

        if (
            Schema::hasColumn(
                'workspace_conversations',
                'kind',
            )
        ) {
            Schema::table(
                'workspace_conversations',
                function (Blueprint $table): void {
                    $table->dropColumn(
                        'kind',
                    );
                },
            );
        }
    }

    /**
     * Check whether a named database index already exists.
     *
     * This makes the migration safe to rerun after partially committed MySQL
     * schema changes.
     */
    private function hasIndex(
        string $table,
        string $index,
    ): bool {
        foreach (
            Schema::getIndexes(
                $table,
            ) as $existing
        ) {
            if (
                (
                    $existing['name']
                    ?? null
                ) === $index
            ) {
                return true;
            }
        }

        return false;
    }
};
