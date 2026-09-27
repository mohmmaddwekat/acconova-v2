<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('platform_role', 24)
                ->default('user')
                ->index();
        });

        $adminEmails = array_values(array_unique(array_filter(array_map(
            static fn ($email): string => strtolower(trim((string) $email)),
            (array) config('platform_admin.emails', []),
        ))));

        foreach ($adminEmails as $email) {
            DB::table('users')
                ->whereRaw('LOWER(email) = ?', [$email])
                ->update(['platform_role' => 'admin']);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('platform_role');
        });
    }
};
