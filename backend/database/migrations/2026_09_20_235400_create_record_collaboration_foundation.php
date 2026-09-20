<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('record_tags', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->string('slug', 80);
            $table->string('color', 20)->nullable();
            $table->timestamps();

            $table->unique(['organization_id', 'slug']);
        });

        Schema::create('record_taggables', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('record_tag_id')->constrained('record_tags')->cascadeOnDelete();
            $table->string('record_type', 40);
            $table->unsignedBigInteger('record_id');
            $table->timestamps();

            $table->unique(
                ['organization_id', 'record_tag_id', 'record_type', 'record_id'],
                'record_taggables_unique',
            );
            $table->index(
                ['organization_id', 'record_type', 'record_id'],
                'record_taggables_record_index',
            );
        });

        Schema::create('record_comments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('record_type', 40);
            $table->unsignedBigInteger('record_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamp('edited_at')->nullable();
            $table->timestamps();

            $table->index(
                ['organization_id', 'record_type', 'record_id', 'id'],
                'record_comments_record_index',
            );
        });

        Schema::create('record_attachments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('record_type', 40);
            $table->unsignedBigInteger('record_id');
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->string('disk', 30)->default('local');
            $table->string('path');
            $table->string('original_name', 255);
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('size_bytes')->default(0);
            $table->timestamps();

            $table->index(
                ['organization_id', 'record_type', 'record_id', 'id'],
                'record_attachments_record_index',
            );
        });

        Schema::create('record_reminders', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('record_type', 40);
            $table->unsignedBigInteger('record_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('note', 255)->nullable();
            $table->timestamp('due_at');
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(
                ['organization_id', 'user_id', 'due_at', 'completed_at'],
                'record_reminders_due_index',
            );
            $table->index(
                ['organization_id', 'record_type', 'record_id'],
                'record_reminders_record_index',
            );
        });

        Schema::create('party_relationship_links', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->foreignId('person_party_id')->constrained('parties')->cascadeOnDelete();
            $table->foreignId('company_party_id')->constrained('parties')->cascadeOnDelete();
            $table->string('title', 120)->nullable();
            $table->string('department', 120)->nullable();
            $table->boolean('is_primary')->default(false);
            $table->timestamps();

            $table->unique(
                ['organization_id', 'person_party_id', 'company_party_id'],
                'party_relationship_links_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('party_relationship_links');
        Schema::dropIfExists('record_reminders');
        Schema::dropIfExists('record_attachments');
        Schema::dropIfExists('record_comments');
        Schema::dropIfExists('record_taggables');
        Schema::dropIfExists('record_tags');
    }
};
