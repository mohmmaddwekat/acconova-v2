<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staff_attendances', function (Blueprint $table): void {
            $table->decimal('deduction_override', 15, 4)->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('staff_attendances', function (Blueprint $table): void {
            $table->dropColumn('deduction_override');
        });
    }
};
