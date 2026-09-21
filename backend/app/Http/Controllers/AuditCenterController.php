<?php

namespace App\Http\Controllers;

use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuditCenterController extends Controller
{
    public function index(
        Request $request,
    ): JsonResponse {
        abort_unless(
            FinanceAuthorization::allows(
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
            )
            || in_array(
                app(TenantContext::class)
                    ->role()
                    ->value,
                [
                    'owner',
                    'admin',
                    'manager',
                ],
                true,
            ),
            403,
        );

        $data = $request->validate([
            'user_id' => [
                'nullable',
                'integer',
            ],
            'type' => [
                'nullable',
                'string',
                'max:120',
            ],
            'action' => [
                'nullable',
                'string',
                'max:120',
            ],
            'from' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'to' => [
                'nullable',
                'date_format:Y-m-d',
            ],
            'search' => [
                'nullable',
                'string',
                'max:160',
            ],
        ]);

        $organizationId = app(
            TenantContext::class,
        )->id();

        $query = DB::table(
            'finance_audit_events as audit',
        )
            ->leftJoin(
                'users as user',
                'user.id',
                '=',
                'audit.created_by',
            )
            ->where(
                'audit.organization_id',
                $organizationId,
            )
            ->when(
                $data['user_id']
                ?? null,
                fn ($query, $userId) =>
                    $query->where(
                        'audit.created_by',
                        (int) $userId,
                    ),
            )
            ->when(
                $data['type']
                ?? null,
                fn ($query, $type) =>
                    $query->where(
                        'audit.auditable_type',
                        $type,
                    ),
            )
            ->when(
                $data['action']
                ?? null,
                fn ($query, $action) =>
                    $query->where(
                        'audit.action',
                        $action,
                    ),
            )
            ->when(
                $data['from']
                ?? null,
                fn ($query, $from) =>
                    $query->whereDate(
                        'audit.created_at',
                        '>=',
                        $from,
                    ),
            )
            ->when(
                $data['to']
                ?? null,
                fn ($query, $to) =>
                    $query->whereDate(
                        'audit.created_at',
                        '<=',
                        $to,
                    ),
            )
            ->when(
                $data['search']
                ?? null,
                function ($query, $search): void {
                    $needle =
                        '%'.$search.'%';

                    $query->where(
                        function ($inner) use (
                            $needle,
                        ): void {
                            $inner
                                ->where(
                                    'audit.action',
                                    'like',
                                    $needle,
                                )
                                ->orWhere(
                                    'audit.reason',
                                    'like',
                                    $needle,
                                )
                                ->orWhere(
                                    'audit.auditable_type',
                                    'like',
                                    $needle,
                                )
                                ->orWhere(
                                    'user.name',
                                    'like',
                                    $needle,
                                );
                        },
                    );
                },
            )
            ->latest(
                'audit.id',
            )
            ->limit(500)
            ->get([
                'audit.id',
                'audit.auditable_type',
                'audit.auditable_id',
                'audit.action',
                'audit.reason',
                'audit.before_payload',
                'audit.after_payload',
                'audit.created_by',
                'audit.created_at',
                'user.name as created_by_name',
            ]);

        $documents = DB::table(
            'financial_documents',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->whereIn(
                'id',
                $query
                    ->where(
                        'auditable_type',
                        'FinancialDocument',
                    )
                    ->pluck(
                        'auditable_id',
                    ),
            )
            ->get([
                'id',
                'kind',
                'number',
            ])
            ->keyBy('id');

        $movements = DB::table(
            'cash_movements',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->whereIn(
                'id',
                $query
                    ->where(
                        'auditable_type',
                        'CashMovement',
                    )
                    ->pluck(
                        'auditable_id',
                    ),
            )
            ->get([
                'id',
                'direction',
                'number',
            ])
            ->keyBy('id');

        $rows = $query
            ->map(
                function ($row) use (
                    $documents,
                    $movements,
                ): array {
                    $before =
                        $this->decodePayload(
                            $row->before_payload,
                        );
                    $after =
                        $this->decodePayload(
                            $row->after_payload,
                        );

                    $recordLabel =
                        '#'.$row->auditable_id;
                    $url = null;

                    if (
                        $row->auditable_type
                        === 'FinancialDocument'
                    ) {
                        $document =
                            $documents->get(
                                $row->auditable_id,
                            );

                        if ($document) {
                            $recordLabel =
                                $document->number;

                            $url =
                                $document->kind
                                    === 'sale_invoice'
                                    ? '/app/invoices/sales/'
                                        .$document->id
                                    : '/app/invoices/purchases/'
                                        .$document->id;
                        }
                    }

                    if (
                        $row->auditable_type
                        === 'CashMovement'
                    ) {
                        $movement =
                            $movements->get(
                                $row->auditable_id,
                            );

                        if ($movement) {
                            $recordLabel =
                                $movement->number;

                            $url =
                                $movement->direction
                                    === 'incoming'
                                    ? '/app/receipts/'
                                        .$movement->id
                                    : '/app/payments/'
                                        .$movement->id;
                        }
                    }

                    return [
                        'id' => $row->id,
                        'auditable_type' =>
                            $row->auditable_type,
                        'auditable_id' =>
                            $row->auditable_id,
                        'record_label' =>
                            $recordLabel,
                        'action' =>
                            $row->action,
                        'reason' =>
                            $row->reason,
                        'created_by' =>
                            $row->created_by,
                        'created_by_name' =>
                            $row->created_by_name,
                        'created_at' =>
                            $row->created_at,
                        'url' => $url,
                        'diff' =>
                            $this->diff(
                                $before,
                                $after,
                            ),
                    ];
                },
            )
            ->values()
            ->all();

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
            ->orderBy(
                'user.name',
            )
            ->get([
                'user.id',
                'user.name',
            ]);

        return response()->json([
            'data' => $rows,
            'filters' => [
                'users' => $users,
                'types' =>
                    collect($rows)
                        ->pluck(
                            'auditable_type',
                        )
                        ->filter()
                        ->unique()
                        ->values(),
                'actions' =>
                    collect($rows)
                        ->pluck(
                            'action',
                        )
                        ->filter()
                        ->unique()
                        ->values(),
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private function decodePayload(
        mixed $payload,
    ): array {
        if (is_array($payload)) {
            return $payload;
        }

        if (! is_string($payload)) {
            return [];
        }

        $decoded = json_decode(
            $payload,
            true,
        );

        return is_array($decoded)
            ? $decoded
            : [];
    }

    /**
     * @param array<string, mixed> $before
     * @param array<string, mixed> $after
     * @return list<array<string, mixed>>
     */
    private function diff(
        array $before,
        array $after,
    ): array {
        $keys = collect(
            array_keys($before),
        )
            ->merge(
                array_keys($after),
            )
            ->unique()
            ->values();

        return $keys
            ->filter(
                fn (string $key): bool =>
                    ($before[$key] ?? null)
                    != ($after[$key] ?? null),
            )
            ->map(
                fn (string $key): array => [
                    'field' => $key,
                    'before' =>
                        $this->presentValue(
                            $before[$key]
                            ?? null,
                        ),
                    'after' =>
                        $this->presentValue(
                            $after[$key]
                            ?? null,
                        ),
                ],
            )
            ->values()
            ->all();
    }

    private function presentValue(
        mixed $value,
    ): mixed {
        if (
            is_array($value)
            || is_object($value)
        ) {
            return json_encode(
                $value,
                JSON_UNESCAPED_UNICODE
                | JSON_UNESCAPED_SLASHES,
            );
        }

        return $value;
    }
}
