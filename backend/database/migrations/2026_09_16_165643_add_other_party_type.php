<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('parties', function (Blueprint $table): void {
            $table->enum('type', ['person', 'company', 'other'])->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::table('parties')->where('type', 'other')->exists()) {
            throw new RuntimeException('Reclassify general parties before removing this type.');
        }
        Schema::table('parties', function (Blueprint $table): void {
            $table->enum('type', ['person', 'company'])->change();
        });
    }
};
