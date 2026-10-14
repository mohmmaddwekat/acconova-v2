<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_tool_runs', function (Blueprint $table): void {
            $table->json('before_payload')->nullable()->after('result_meta');
            $table->json('after_payload')->nullable()->after('before_payload');
        });
    }

    public function down(): void
    {
        Schema::table('ai_tool_runs', function (Blueprint $table): void {
            $table->dropColumn(['before_payload', 'after_payload']);
        });
    }
};
