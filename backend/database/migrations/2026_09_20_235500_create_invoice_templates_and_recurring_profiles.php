<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoice_templates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('kind', 32);
            $table->foreignId('source_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->json('snapshot');
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['organization_id', 'name', 'kind']);
        });

        Schema::create('recurring_invoice_profiles', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('kind', 32);
            $table->foreignId('source_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
            $table->json('snapshot');
            $table->string('frequency', 20);
            $table->unsignedSmallInteger('interval')->default(1);
            $table->date('next_run_on');
            $table->date('ends_on')->nullable();
            $table->boolean('active')->default(true);
            $table->date('last_generated_on')->nullable();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->index(['organization_id', 'active', 'next_run_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_invoice_profiles');
        Schema::dropIfExists('invoice_templates');
    }
};
