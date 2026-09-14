<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('party_roles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('party_id')->constrained('parties')->cascadeOnDelete();
            $table->enum('role', ['customer', 'supplier']);
            $table->timestamps();

            // Prevent duplicate role assignments for the same party
            $table->unique(['party_id', 'role']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('party_roles');
    }
};
