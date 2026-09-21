<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table(
            'users',
            function (Blueprint $table): void {
                $table
                    ->timestamp('previous_login_at')
                    ->nullable()
                    ->after('remember_token');
                $table
                    ->timestamp('last_login_at')
                    ->nullable()
                    ->after('previous_login_at');
            },
        );
    }

    public function down(): void
    {
        Schema::table(
            'users',
            function (Blueprint $table): void {
                $table->dropColumn([
                    'previous_login_at',
                    'last_login_at',
                ]);
            },
        );
    }
};
