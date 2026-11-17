<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Record whether a catalog item is for sale, for purchase, or both.
     *
     * Every existing item keeps working exactly as before because "both" is the default.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->string('usage', 20)->default('both')->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('usage');
        });
    }
};
