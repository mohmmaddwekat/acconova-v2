<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('staff_members', 'deleted_at')) {
            Schema::table('staff_members', function (Blueprint $table): void {
                $table->softDeletes();
            });
        }
    }

    public function down(): void
    {
        /*
         * Compatibility-only migration: the original staff corrections
         * migration owns staff_members.deleted_at. On a fresh schema this
         * migration does not create the column, so it must not remove it
         * during rollback or the owning migration will attempt a second drop.
         */
    }
};
