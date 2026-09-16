<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('party_roles', function (Blueprint $table): void {
            $table->enum('role', ['customer', 'supplier', 'contact'])->change();
        });
    }

    public function down(): void
    {
        if (DB::table('party_roles')->where('role', 'contact')->exists()) {
            throw new RuntimeException('Reclassify contact roles before rollback.');
        }
        Schema::table('party_roles', function (Blueprint $table): void {
            $table->enum('role', ['customer', 'supplier'])->change();
        });
    }
};
