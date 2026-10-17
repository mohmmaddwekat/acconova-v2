<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspace_messages', function (Blueprint $table): void {
            $table->foreignId('reply_to_id')
                ->nullable()
                ->after('user_id')
                ->constrained('workspace_messages')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('workspace_messages', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('reply_to_id');
        });
    }
};
