<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /*
         * MySQL limits identifier names to 64 characters. Keep index names
         * explicit and short instead of allowing Laravel to derive a long
         * name from the table and column names.
         *
         * The hasTable guards also make this migration safe to rerun after
         * MySQL partially created the tables before failing on the old index
         * name.
         */
        if (! Schema::hasTable('invoice_templates')) {
            Schema::create('invoice_templates', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('organization_id')->constrained()->cascadeOnDelete();
                $table->string('name', 120);
                $table->string('kind', 32);
                $table->foreignId('source_document_id')->nullable()->constrained('financial_documents')->nullOnDelete();
                $table->json('snapshot');
                $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(
                    ['organization_id', 'name', 'kind'],
                    'inv_tpl_org_name_kind_uq',
                );
            });
        }

        if (! Schema::hasTable('recurring_invoice_profiles')) {
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

                $table->index(
                    ['organization_id', 'active', 'next_run_on'],
                    'rec_inv_org_active_next_idx',
                );
            });
        } else {
            /*
             * Recovery path for the exact partial-migration state caused by
             * the previous overlong MySQL index name. The table already
             * exists, but the final composite index was never created.
             */
            Schema::table('recurring_invoice_profiles', function (Blueprint $table): void {
                $table->index(
                    ['organization_id', 'active', 'next_run_on'],
                    'rec_inv_org_active_next_idx',
                );
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_invoice_profiles');
        Schema::dropIfExists('invoice_templates');
    }
};
