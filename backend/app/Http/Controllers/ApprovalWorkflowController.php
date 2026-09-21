<?php

namespace App\Http\Controllers;

use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ApprovalWorkflowController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeReviewer($request, false);

        $status = $request->validate([
            'status' => [
                'nullable',
                Rule::in([
                    'pending',
                    'approved',
                    'rejected',
                    'all',
                ]),
            ],
        ])['status'] ?? 'pending';

        $query = DB::table('approval_requests as approvals')
            ->leftJoin('users as requester', 'requester.id', '=', 'approvals.requested_by')
            ->leftJoin('users as reviewer', 'reviewer.id', '=', 'approvals.reviewed_by')
            ->where(
                'approvals.organization_id',
                app(TenantContext::class)->id(),
            );

        if ($status !== 'all') {
            $query->where(
                'approvals.status',
                $status,
            );
        }

        $rows = $query
            ->latest('approvals.id')
            ->limit(250)
            ->get([
                'approvals.id',
                'approvals.subject_type',
                'approvals.subject_id',
                'approvals.category',
                'approvals.status',
                'approvals.required_approvals',
                'approvals.approved_count',
                'approvals.reason',
                'approvals.snapshot',
                'approvals.requested_by',
                'requester.name as requested_by_name',
                'approvals.reviewed_by',
                'reviewer.name as reviewed_by_name',
                'approvals.reviewed_at',
                'approvals.created_at',
            ])
            ->map(function ($row): array {
                $decisions = DB::table(
                    'approval_decisions as decision',
                )
                    ->join(
                        'users as reviewer_user',
                        'reviewer_user.id',
                        '=',
                        'decision.reviewer_id',
                    )
                    ->where(
                        'decision.approval_request_id',
                        $row->id,
                    )
                    ->orderBy('decision.id')
                    ->get([
                        'decision.id',
                        'decision.reviewer_id',
                        'decision.decision',
                        'decision.decided_at',
                        'reviewer_user.name as reviewer_name',
                    ]);

                return [
                    ...((array) $row),
                    'snapshot' => $row->snapshot
                        ? json_decode(
                            $row->snapshot,
                            true,
                        )
                        : null,
                    'decisions' => $decisions,
                    'remaining_approvals' => max(
                        (int) $row->required_approvals
                        - (int) $row->approved_count,
                        0,
                    ),
                ];
            })
            ->values();

        return response()->json([
            'data' => $rows,
        ]);
    }

    public function review(
        Request $request,
        string $approval,
    ): JsonResponse {
        $this->authorizeReviewer($request, true);

        $data = $request->validate([
            'decision' => [
                'required',
                Rule::in([
                    'approved',
                    'rejected',
                ]),
            ],
        ]);

        $row = DB::table('approval_requests')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            )
            ->where('id', (int) $approval)
            ->first();

        abort_unless($row, 404);

        if ($row->status !== 'pending') {
            return response()->json([
                'data' => $row,
            ]);
        }

        if (
            (int) $row->requested_by
            === (int) $request->user()->id
        ) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'approval' => [
                    'The requester cannot approve their own request. A different authorized reviewer is required.',
                ],
            ]);
        }

        $organizationId =
            app(TenantContext::class)->id();

        $updated = DB::transaction(
            function () use (
                $request,
                $data,
                $row,
                $organizationId,
            ): object {
                $locked = DB::table(
                    'approval_requests',
                )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where('id', $row->id)
                    ->lockForUpdate()
                    ->first();

                abort_unless($locked, 404);

                if (
                    $locked->status
                    !== 'pending'
                ) {
                    return $locked;
                }

                $existing = DB::table(
                    'approval_decisions',
                )
                    ->where(
                        'approval_request_id',
                        $locked->id,
                    )
                    ->where(
                        'reviewer_id',
                        $request->user()->id,
                    )
                    ->first();

                if ($existing) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'approval' => [
                            'You have already reviewed this approval request.',
                        ],
                    ]);
                }

                DB::table(
                    'approval_decisions',
                )->insert([
                    'organization_id' =>
                        $organizationId,
                    'approval_request_id' =>
                        $locked->id,
                    'reviewer_id' =>
                        $request->user()->id,
                    'decision' =>
                        $data['decision'],
                    'decided_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $approvedCount =
                    (int) DB::table(
                        'approval_decisions',
                    )
                        ->where(
                            'approval_request_id',
                            $locked->id,
                        )
                        ->where(
                            'decision',
                            'approved',
                        )
                        ->count();

                $required =
                    max(
                        1,
                        (int) (
                            $locked->required_approvals
                            ?? 1
                        ),
                    );

                $status =
                    $data['decision']
                    === 'rejected'
                        ? 'rejected'
                        : (
                            $approvedCount
                            >= $required
                                ? 'approved'
                                : 'pending'
                        );

                DB::table(
                    'approval_requests',
                )
                    ->where(
                        'id',
                        $locked->id,
                    )
                    ->update([
                        'status' => $status,
                        'approved_count' =>
                            $approvedCount,
                        'reviewed_by' =>
                            $status
                            !== 'pending'
                                ? $request->user()->id
                                : $locked->reviewed_by,
                        'reviewed_at' =>
                            $status
                            !== 'pending'
                                ? now()
                                : $locked->reviewed_at,
                        'updated_at' => now(),
                    ]);

                return DB::table(
                    'approval_requests',
                )
                    ->where(
                        'id',
                        $locked->id,
                    )
                    ->first();
            },
            3,
        );

        DB::table('workspace_notifications')
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'event_key',
                'approval-required:'
                .$row->id
                .':'
                .$request->user()->id,
            )
            ->whereNull('read_at')
            ->update([
                'read_at' => now(),
                'updated_at' => now(),
            ]);

        if (
            $updated->status
            !== 'pending'
        ) {
            DB::table('workspace_notifications')
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'event_key',
                    'like',
                    'approval-required:'
                    .$row->id
                    .':%',
                )
                ->whereNull('read_at')
                ->update([
                    'read_at' => now(),
                    'updated_at' => now(),
                ]);
        }

        DB::table('workspace_notifications')
            ->insertOrIgnore([
                'organization_id' =>
                    $organizationId,
                'user_id' =>
                    $row->requested_by,
                'event_key' =>
                    'approval-review-progress:'
                    .$row->id
                    .':'
                    .$updated->approved_count
                    .':'
                    .$updated->status,
                'kind' => match (
                    $updated->status
                ) {
                    'approved' =>
                        'approval_approved',
                    'rejected' =>
                        'approval_rejected',
                    default =>
                        'approval_progress',
                },
                'category' => 'activity',
                'data' => json_encode([
                    'name' => match (
                        $updated->status
                    ) {
                        'approved' =>
                            'Approval approved',
                        'rejected' =>
                            'Approval rejected',
                        default =>
                            'Approval progress',
                    },
                    'detail' =>
                        $updated->status
                        === 'pending'
                            ? sprintf(
                                '%d of %d required approvals completed.',
                                $updated->approved_count,
                                $updated->required_approvals,
                            )
                            : $row->reason,
                ], JSON_THROW_ON_ERROR),
                'url' =>
                    '/app/finance/approvals',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => $updated,
        ]);
    }

    private function authorizeReviewer(
        Request $request,
        bool $mustReview,
    ): void {
        abort_unless(
            $request->user(),
            403,
        );

        if (! $mustReview) {
            abort_unless(
                FinanceAuthorization::allows(
                    $request->user(),
                    'finance.approvals.review',
                )
                || FinanceAuthorization::allows(
                    $request->user(),
                    'finance.sales.view',
                )
                || FinanceAuthorization::allows(
                    $request->user(),
                    'finance.purchases.view',
                )
                || FinanceAuthorization::allows(
                    $request->user(),
                    'finance.cash.view',
                ),
                403,
            );

            return;
        }

        FinanceAuthorization::authorize(
            $request->user(),
            'finance.approvals.review',
        );
    }
}
