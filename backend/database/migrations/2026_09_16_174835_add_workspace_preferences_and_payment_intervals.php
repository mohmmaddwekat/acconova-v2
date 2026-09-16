<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_plans', function (Blueprint $table): void {
            $table->unsignedSmallInteger('interval_count')->default(1);
        });
        Schema::table('organizations', function (Blueprint $table): void {
            $table->json('preferences')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('payment_plans', function (Blueprint $table): void {
            $table->dropColumn('interval_count');
        });
        Schema::table('organizations', function (Blueprint $table): void {
            $table->dropColumn('preferences');
        });
    }
};
