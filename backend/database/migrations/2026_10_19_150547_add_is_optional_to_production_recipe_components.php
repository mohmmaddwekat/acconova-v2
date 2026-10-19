<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Optional components are consumed only while the raw material is in
     * stock; production never fails or goes negative because of them.
     */
    public function up(): void
    {
        Schema::table('production_recipe_components', function (Blueprint $table): void {
            $table->boolean('is_optional')->default(false)->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('production_recipe_components', function (Blueprint $table): void {
            $table->dropColumn('is_optional');
        });
    }
};
