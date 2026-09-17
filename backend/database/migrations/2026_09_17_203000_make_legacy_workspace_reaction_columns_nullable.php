<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Allow the current reaction writer to omit the preserved legacy emoji.
     */
    public function up(): void
    {
        if (Schema::hasColumn('workspace_message_reactions', 'emoji')) {
            Schema::table('workspace_message_reactions', function (Blueprint $table): void {
                $table->string('emoji', 16)->nullable()->change();
            });
        }
    }

    /**
     * Preserve nullability because current reactions do not populate emoji.
     */
    public function down(): void
    {
        //
    }
};
