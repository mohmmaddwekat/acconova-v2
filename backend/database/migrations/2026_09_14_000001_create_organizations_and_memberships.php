<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('memberships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->enum('role', ['owner', 'admin', 'member']);
            $table->unsignedTinyInteger('owner_guard')->nullable()->virtualAs("CASE WHEN role = 'owner' THEN 1 ELSE NULL END");
            $table->timestamps();
            $table->unique(['organization_id', 'owner_guard'], 'memberships_one_owner');
            $table->unique(['organization_id', 'user_id']);
            $table->index(['user_id', 'organization_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('memberships');
        Schema::dropIfExists('organizations');
    }
};
