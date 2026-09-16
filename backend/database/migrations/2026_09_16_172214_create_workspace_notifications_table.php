<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_notifications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('event_key', 160);
            $table->string('kind', 30);
            $table->string('category', 20);
            $table->json('data');
            $table->string('url');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->unique(['organization_id', 'user_id', 'event_key'], 'notification_recipient_event_unique');
            $table->index(['organization_id', 'user_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_notifications');
    }
};
