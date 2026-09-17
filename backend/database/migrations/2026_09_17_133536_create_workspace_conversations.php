<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void {
  Schema::create('workspace_conversations',function(Blueprint $table): void {$table->id();$table->foreignId('organization_id')->constrained()->cascadeOnDelete();$table->foreignId('created_by')->constrained('users')->restrictOnDelete();$table->string('name',100);$table->string('description',500)->nullable();$table->boolean('is_private')->default(true);$table->timestamps();$table->index(['organization_id','updated_at']);});
  Schema::create('workspace_conversation_members',function(Blueprint $table): void {$table->id();$table->foreignId('conversation_id')->constrained('workspace_conversations')->cascadeOnDelete();$table->foreignId('user_id')->constrained()->cascadeOnDelete();$table->unsignedBigInteger('last_read_id')->default(0);$table->unique(['conversation_id','user_id']);});
  Schema::create('workspace_messages',function(Blueprint $table): void {$table->id();$table->foreignId('conversation_id')->constrained('workspace_conversations')->cascadeOnDelete();$table->foreignId('user_id')->constrained()->restrictOnDelete();$table->uuid('request_id');$table->text('body');$table->timestamps();$table->softDeletes();$table->unique(['conversation_id','user_id','request_id'],'workspace_message_request_unique');$table->index(['conversation_id','id']);});
 }
 public function down(): void {Schema::dropIfExists('workspace_messages');Schema::dropIfExists('workspace_conversation_members');Schema::dropIfExists('workspace_conversations');}
};
