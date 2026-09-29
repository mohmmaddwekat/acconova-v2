<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('billing_manual_payments', function (Blueprint $table): void {
            $table->foreignId('requested_by_user_id')
                ->nullable()
                ->after('recorded_by_user_id')
                ->constrained('users')
                ->nullOnDelete();
            $table->foreignId('reviewed_by_user_id')
                ->nullable()
                ->after('requested_by_user_id')
                ->constrained('users')
                ->nullOnDelete();
            $table->timestamp('requested_at')->nullable()->after('confirmed_at');
            $table->timestamp('reviewed_at')->nullable()->after('requested_at');
            $table->text('rejection_reason')->nullable()->after('reviewed_at');

            $table->timestamp('service_period_start')->nullable()->change();
            $table->timestamp('service_period_end')->nullable()->change();
            $table->timestamp('paid_at')->nullable()->change();
            $table->timestamp('confirmed_at')->nullable()->change();

            $table->index(['organization_id', 'status', 'requested_at'], 'billing_manual_requests_status_idx');
        });
    }

    public function down(): void
    {
        DB::table('billing_manual_payments')
            ->whereNull('service_period_start')
            ->update(['service_period_start' => DB::raw('COALESCE(requested_at, created_at)')]);
        DB::table('billing_manual_payments')
            ->whereNull('service_period_end')
            ->update(['service_period_end' => DB::raw('COALESCE(requested_at, created_at)')]);
        DB::table('billing_manual_payments')
            ->whereNull('paid_at')
            ->update(['paid_at' => DB::raw('COALESCE(requested_at, created_at)')]);
        DB::table('billing_manual_payments')
            ->whereNull('confirmed_at')
            ->update(['confirmed_at' => DB::raw('COALESCE(reviewed_at, requested_at, created_at)')]);

        Schema::table('billing_manual_payments', function (Blueprint $table): void {
            $table->dropIndex('billing_manual_requests_status_idx');
            $table->dropConstrainedForeignId('reviewed_by_user_id');
            $table->dropConstrainedForeignId('requested_by_user_id');
            $table->dropColumn(['requested_at', 'reviewed_at', 'rejection_reason']);

            $table->timestamp('service_period_start')->nullable(false)->change();
            $table->timestamp('service_period_end')->nullable(false)->change();
            $table->timestamp('paid_at')->nullable(false)->change();
            $table->timestamp('confirmed_at')->nullable(false)->change();
        });
    }
};
