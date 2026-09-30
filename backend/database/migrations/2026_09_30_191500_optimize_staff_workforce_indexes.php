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
