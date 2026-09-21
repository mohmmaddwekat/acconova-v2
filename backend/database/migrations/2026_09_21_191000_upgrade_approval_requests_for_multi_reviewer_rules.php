<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (
            Schema::hasTable('approval_requests')
            && ! Schema::hasColumn(
                'approval_requests',
                'required_approvals',
            )
        ) {
            Schema::table(
                'approval_requests',
                function (Blueprint $table): void {
                    $table
                        ->unsignedTinyInteger(
                            'required_approvals',
                        )
                        ->default(1)
                        ->after('status');
                    $table
                        ->unsignedTinyInteger(
                            'approved_count',
                        )
                        ->default(0)
                        ->after('required_approvals');
                },
            );
        }

        if (! Schema::hasTable('approval_decisions')) {
            Schema::create(
                'approval_decisions',
                function (Blueprint $table): void {
                    $table->id();
                    $table
                        ->foreignId('organization_id')
                        ->constrained()
                        ->cascadeOnDelete();
                    $table
                        ->foreignId('approval_request_id')
                        ->constrained('approval_requests')
                        ->cascadeOnDelete();
                    $table
                        ->foreignId('reviewer_id')
                        ->constrained('users')
                        ->cascadeOnDelete();
                    $table->string('decision', 20);
                    $table->timestamp('decided_at');
                    $table->timestamps();

                    $table->unique([
                        'approval_request_id',
                        'reviewer_id',
                    ], 'approval_decisions_request_reviewer_unique');

                    $table->index([
                        'organization_id',
                        'approval_request_id',
                        'decision',
                    ], 'approval_decisions_org_request_idx');
                },
            );
        }

        if (
            Schema::hasColumn(
                'approval_requests',
                'reviewed_by',
            )
        ) {
            DB::table('approval_requests')
                ->where(
                    'status',
                    'approved',
                )
                ->whereNotNull(
                    'reviewed_by',
                )
                ->orderBy('id')
                ->get([
                    'id',
                    'organization_id',
                    'reviewed_by',
                    'reviewed_at',
                    'created_at',
                ])
                ->each(function ($row): void {
                    DB::table(
                        'approval_decisions',
                    )->insertOrIgnore([
                        'organization_id' =>
                            $row->organization_id,
                        'approval_request_id' =>
                            $row->id,
                        'reviewer_id' =>
                            $row->reviewed_by,
                        'decision' => 'approved',
                        'decided_at' =>
                            $row->reviewed_at
                            ?? $row->created_at
                            ?? now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    DB::table(
                        'approval_requests',
                    )
                        ->where('id', $row->id)
                        ->update([
                            'required_approvals' => 1,
                            'approved_count' => 1,
                        ]);
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists(
            'approval_decisions',
        );

        if (
            Schema::hasTable('approval_requests')
            && Schema::hasColumn(
                'approval_requests',
                'required_approvals',
            )
        ) {
            Schema::table(
                'approval_requests',
                function (Blueprint $table): void {
                    $table->dropColumn([
                        'required_approvals',
                        'approved_count',
                    ]);
                },
            );
        }
    }
};
