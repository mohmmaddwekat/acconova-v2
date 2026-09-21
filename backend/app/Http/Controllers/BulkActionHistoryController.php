<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BulkActionHistoryController extends Controller
{
    public function index(
        Request $request,
    ): JsonResponse {
        abort_unless(
            WorkspaceFeaturePermissions::allows(
                $request->user(),
                'audit.bulk_actions.view',
            ),
            403,
        );

        $filters = $request->validate([
            'entity_type' => [
                'nullable',
                Rule::in([
                    'party',
                    'product',
                ]),
            ],
            'action' => [
                'nullable',
                Rule::in([
                    'bulk_archive',
                    'bulk_restore',
                    'bulk_edit',
                ]),
            ],
            'user_id' => [
                'nullable',
                'integer',
            ],
            'from' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'to' => [
                'nullable',
                'date_format:Y-m-d',
            ],
        ]);

        $organizationId =
            app(TenantContext::class)
                ->id();

        $rows = DB::table(
            'bulk_action_history as history',
        )
            ->leftJoin(
                'users as user',
                'user.id',
                '=',
                'history.user_id',
            )
            ->where(
                'history.organization_id',
                $organizationId,
            )
            ->when(
                $filters['entity_type']
                ?? null,
                fn ($query, $entityType) =>
                    $query->where(
                        'history.entity_type',
                        $entityType,
                    ),
            )
            ->when(
                $filters['action']
                ?? null,
                fn ($query, $action) =>
                    $query->where(
                        'history.action',
                        $action,
                    ),
            )
            ->when(
                $filters['user_id']
                ?? null,
                fn ($query, $userId) =>
                    $query->where(
                        'history.user_id',
                        (int) $userId,
                    ),
            )
            ->when(
                $filters['from']
                ?? null,
                fn ($query, $from) =>
                    $query->whereDate(
                        'history.created_at',
                        '>=',
                        $from,
                    ),
            )
            ->when(
                $filters['to']
                ?? null,
                fn ($query, $to) =>
                    $query->whereDate(
                        'history.created_at',
                        '<=',
                        $to,
                    ),
            )
            ->latest(
                'history.id',
            )
            ->limit(500)
            ->get([
                'history.id',
                'history.entity_type',
                'history.action',
                'history.record_count',
                'history.record_ids',
                'history.changes',
                'history.user_id',
                'history.created_at',
                'user.name as user_name',
            ])
            ->map(
                fn ($row): array => [
                    ...((array) $row),
                    'record_ids' =>
                        $row->record_ids
                            ? json_decode(
                                $row->record_ids,
                                true,
                            )
                            : [],
                    'changes' =>
                        $row->changes
                            ? json_decode(
                                $row->changes,
                                true,
                            )
                            : null,
                ],
            )
            ->values();

        $users = DB::table(
            'memberships as membership',
        )
            ->join(
                'users as user',
                'user.id',
                '=',
                'membership.user_id',
            )
            ->where(
                'membership.organization_id',
                $organizationId,
            )
            ->orderBy('user.name')
            ->get([
                'user.id',
                'user.name',
            ]);

        return response()->json([
            'data' => $rows,
            'filters' => [
                'users' => $users,
            ],
        ]);
    }
}
