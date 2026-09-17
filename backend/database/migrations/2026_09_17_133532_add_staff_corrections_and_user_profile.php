<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void {
  Schema::table('staff_entries',fn(Blueprint $table)=>$table->softDeletes());
  Schema::table('staff_members',fn(Blueprint $table)=>$table->softDeletes());
  Schema::table('users',function(Blueprint $table): void {$table->string('phone',50)->nullable();$table->string('job_title')->nullable();$table->text('bio')->nullable();$table->string('avatar_path')->nullable();$table->string('pending_email')->nullable();});
  Schema::create('staff_corrections',function(Blueprint $table): void {$table->id();$table->foreignId('organization_id')->constrained()->cascadeOnDelete();$table->foreignId('staff_member_id')->constrained()->restrictOnDelete();$table->foreignId('created_by')->constrained('users')->restrictOnDelete();$table->string('entity');$table->unsignedBigInteger('entity_id');$table->string('action',20);$table->text('reason');$table->json('before');$table->json('after')->nullable();$table->timestamps();});
 }
 public function down(): void {Schema::dropIfExists('staff_corrections');Schema::table('staff_entries',fn(Blueprint $table)=>$table->dropSoftDeletes());Schema::table('staff_members',fn(Blueprint $table)=>$table->dropSoftDeletes());Schema::table('users',fn(Blueprint $table)=>$table->dropColumn(['phone','job_title','bio','avatar_path','pending_email']));}
};
