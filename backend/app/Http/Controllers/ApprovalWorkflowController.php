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
                return [
                    ...((array) $row),
                    'snapshot' => $row->snapshot
                        ? json_decode(
                            $row->snapshot,
                            true,
                        )
                        : null,
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

        DB::table('approval_requests')
            ->where('id', $row->id)
            ->update([
                'status' => $data['decision'],
                'reviewed_by' => $request->user()->id,
                'reviewed_at' => now(),
                'updated_at' => now(),
            ]);

        DB::table('workspace_notifications')
            ->where(
                'organization_id',
                app(TenantContext::class)->id(),
            )
            ->where(
                'event_key',
                'like',
                'approval-required:'.$row->id.':%',
            )
            ->whereNull('read_at')
            ->update([
                'read_at' => now(),
                'updated_at' => now(),
            ]);

        DB::table('workspace_notifications')
            ->insertOrIgnore([
                'organization_id' => app(TenantContext::class)->id(),
                'user_id' => $row->requested_by,
                'event_key' => 'approval-reviewed:'.$row->id.':'.$row->requested_by,
                'kind' => $data['decision'] === 'approved'
                    ? 'approval_approved'
                    : 'approval_rejected',
                'category' => 'activity',
                'data' => json_encode([
                    'name' => $data['decision'] === 'approved'
                        ? 'Approval approved'
                        : 'Approval rejected',
                    'detail' => $row->reason,
                ], JSON_THROW_ON_ERROR),
                'url' => '/app/finance/approvals',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => DB::table('approval_requests')
                ->where('id', $row->id)
                ->first(),
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
