<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_contact_messages', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100);
            $table->string('email', 190)->index();
            $table->string('company', 150)->nullable();
            $table->string('subject', 120);
            $table->text('message');
            $table->string('locale', 5)->default('en');
            $table->string('status', 20)->default('new')->index();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_contact_messages');
    }
};
