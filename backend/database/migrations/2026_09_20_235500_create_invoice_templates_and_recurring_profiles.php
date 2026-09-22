<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /*
         * MySQL DDL is not transactional. The original version of this
         * migration could therefore leave both tables behind even though
         * Laravel did not record the migration as completed.
         *
         * Do not trust Schema::hasTable() alone for recovery here. Attempt
         * each CREATE and explicitly tolerate MySQL error 1050 (table already
         * exists), then repair the missing composite index separately.
         */
        $this->createInvoiceTemplatesTable();
        $this->createRecurringProfilesTable();
        $this->ensureRecurringScheduleIndex();
    }

    public function down(): void
    {
        Schema::dropIfExists('recurring_invoice_profiles');
        Schema::dropIfExists('invoice_templates');
    }

    private function createInvoiceTemplatesTable(): void
    {
        try {
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
        } catch (QueryException $exception) {
            if (! $this->isMysqlError($exception, 1050)) {
                throw $exception;
            }
        }
    }

    private function createRecurringProfilesTable(): void
    {
        try {
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
            });
        } catch (QueryException $exception) {
            if (! $this->isMysqlError($exception, 1050)) {
                throw $exception;
            }
        }
    }

    private function ensureRecurringScheduleIndex(): void
    {
        $driver = DB::connection()->getDriverName();

        /*
         * The recovery probe below is MySQL-specific because it inspects
         * information_schema. SQLite migrations run transactionally in our
         * test suite, so creating the index directly is sufficient there.
         */
        if ($driver !== 'mysql') {
            try {
                Schema::table(
                    'recurring_invoice_profiles',
                    function (Blueprint $table): void {
                        $table->index(
                            ['organization_id', 'active', 'next_run_on'],
                            'rec_inv_org_active_next_idx',
                        );
                    },
                );
            } catch (QueryException $exception) {
                if (
                    $driver !== 'sqlite'
                    || ! str_contains(
                        strtolower($exception->getMessage()),
                        'already exists',
                    )
                ) {
                    throw $exception;
                }
            }

            return;
        }

        $indexExists = DB::selectOne(
            <<<'SQL'
                SELECT 1 AS found
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'recurring_invoice_profiles'
                  AND index_name = 'rec_inv_org_active_next_idx'
                LIMIT 1
            SQL,
        );

        if ($indexExists) {
            return;
        }

        try {
            Schema::table('recurring_invoice_profiles', function (Blueprint $table): void {
                $table->index(
                    ['organization_id', 'active', 'next_run_on'],
                    'rec_inv_org_active_next_idx',
                );
            });
        } catch (QueryException $exception) {
            /*
             * 1061 means another attempt/process already created the same
             * named index. Any other SQL error must still surface normally.
             */
            if (! $this->isMysqlError($exception, 1061)) {
                throw $exception;
            }
        }
    }

    private function isMysqlError(
        QueryException $exception,
        int $driverCode,
    ): bool {
        $previous = $exception->getPrevious();
        $errorInfo = $previous?->errorInfo ?? null;

        return is_array($errorInfo)
            && (int) ($errorInfo[1] ?? 0) === $driverCode;
    }
};
