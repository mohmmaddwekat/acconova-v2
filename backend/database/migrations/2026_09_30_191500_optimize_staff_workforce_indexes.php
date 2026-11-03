<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staff_members', function (Blueprint $table): void {
            $table->index(
                ['organization_id', 'active', 'id'],
                'idx_staff_org_active',
            );
            $table->index(
                ['organization_id', 'department_id', 'active'],
                'idx_staff_org_dept',
            );
            $table->index(
                ['organization_id', 'started_on', 'id'],
                'idx_staff_org_started',
            );
        });

        Schema::table('staff_attendances', function (Blueprint $table): void {
            $table->index(
                ['organization_id', 'occurred_on', 'status', 'staff_member_id'],
                'idx_att_org_date_status',
            );
        });

        Schema::table('staff_entries', function (Blueprint $table): void {
            $table->index(
                ['organization_id', 'staff_member_id', 'kind', 'occurred_on'],
                'idx_entry_member_kind',
            );
        });

        Schema::table('staff_adjustments', function (Blueprint $table): void {
            $table->index(
                ['organization_id', 'staff_member_id', 'starts_on', 'ends_on'],
                'idx_adj_member_period',
            );
        });
    }

    public function down(): void
    {
        /*
         * The composite indexes above are also what backs each table's
         * organization_id foreign key, so MySQL refuses to drop them unless
         * a plain index on that column exists again first.
         */
        foreach (['staff_adjustments', 'staff_entries', 'staff_attendances', 'staff_members'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->index('organization_id');
            });
        }

        Schema::table('staff_adjustments', function (Blueprint $table): void {
            $table->dropIndex('idx_adj_member_period');
        });

        Schema::table('staff_entries', function (Blueprint $table): void {
            $table->dropIndex('idx_entry_member_kind');
        });

        Schema::table('staff_attendances', function (Blueprint $table): void {
            $table->dropIndex('idx_att_org_date_status');
        });

        Schema::table('staff_members', function (Blueprint $table): void {
            $table->dropIndex('idx_staff_org_started');
            $table->dropIndex('idx_staff_org_dept');
            $table->dropIndex('idx_staff_org_active');
        });
    }
};
