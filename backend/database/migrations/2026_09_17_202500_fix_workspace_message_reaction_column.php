<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Repair the reaction schema created by an earlier messaging version.
     *
     * The current messaging API expects a `reaction` column. Older local
     * databases may already contain this table with a legacy column name,
     * causing conversation loading to fail after a message is sent.
     */
    public function up(): void
    {
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

            return;
        }

        if (
            ! Schema::hasColumn(
                'workspace_message_reactions',
                'reaction',
            )
        ) {
            Schema::table(
                'workspace_message_reactions',
                function (Blueprint $table): void {
                    /*
                     * Keep this nullable while converting any rows created by
                     * the older local schema.
                     */
                    $table
                        ->string(
                            'reaction',
                            16,
                        )
                        ->nullable();
                },
            );
        }

        /*
         * Preserve reactions from known older schema names if one exists.
         */
        if (
            Schema::hasColumn(
                'workspace_message_reactions',
                'emoji',
            )
        ) {
            DB::table(
                'workspace_message_reactions',
            )
                ->whereNull(
                    'reaction',
                )
                ->update([
                    'reaction' => DB::raw(
                        'emoji',
                    ),
                ]);
        }

        if (
            Schema::hasColumn(
                'workspace_message_reactions',
                'value',
            )
        ) {
            DB::table(
                'workspace_message_reactions',
            )
                ->whereNull(
                    'reaction',
                )
                ->update([
                    'reaction' => DB::raw(
                        'value',
                    ),
                ]);
        }

        /*
         * Invalid legacy rows with no recognizable reaction cannot be rendered
         * by the current API. Removing only those malformed rows prevents them
         * from breaking the entire conversation.
         */
        DB::table(
            'workspace_message_reactions',
        )
            ->where(
                function ($query): void {
                    $query
                        ->whereNull(
                            'reaction',
                        )
                        ->orWhere(
                            'reaction',
                            '',
                        );
                },
            )
            ->delete();
    }

    /**
     * Do not remove the repaired column on rollback because it may now contain
     * valid messaging data created by the current application.
     */
    public function down(): void
    {
        //
    }
};
