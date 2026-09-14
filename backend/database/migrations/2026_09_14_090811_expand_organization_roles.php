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
        $this->roles(['owner', 'admin', 'member', 'manager', 'accountant', 'employee']);
        DB::table('memberships')->where('role', 'member')->update(['role' => 'employee']);
        $this->roles(['owner', 'admin', 'manager', 'accountant', 'employee']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $this->roles(['owner', 'admin', 'member', 'manager', 'accountant', 'employee']);
        DB::table('memberships')->whereIn('role', ['manager', 'accountant', 'employee'])->update(['role' => 'member']);
        $this->roles(['owner', 'admin', 'member']);
    }

    /** @param list<string> $roles */
    private function roles(array $roles): void
    {
        Schema::table('memberships', function (Blueprint $table) use ($roles): void {
            $table->enum('role', $roles)->change();
        });
    }
};
