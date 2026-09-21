<?php

namespace App\Http\Controllers;

use App\Enums\OrganizationRole;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PaymentPlan;
use App\Models\Product;
use App\Models\Task;
use App\Services\FinanceAuthorization;
use App\Support\TaskAccess;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class DashboardIntelligenceController extends Controller
{
    private const DEFAULT_LAYOUT = [
        'kpi_targets',
        'trend_comparison',
        'profitability',
        'morning_actions',
        'exceptions',
        'changed_today',
    ];

    private const POSTED_DOCUMENT_STATUSES = [
        'issued',
        'partially_paid',
        'paid',
        'overpaid',
    ];

    public function index(
        Request $request,
    ): JsonResponse {
        $organizationId =
            app(TenantContext::class)
                ->id();
        $userId =
            $request->user()->id;

        $preference = DB::table(
            'dashboard_preferences',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'user_id',
                $userId,
            )
            ->first();

        $since =
            $request->user()
                ->previous_login_at
                ? CarbonImmutable::parse(
                    $request->user()
                        ->previous_login_at,
                )
                : CarbonImmutable::now()
                    ->startOfDay();

        $profitability =
            $this->profitability(
                $request,
                $organizationId,
            );

        $kpis =
            $this->kpiProgress(
                $request,
                $organizationId,
                $profitability,
            );

        $response = [
            'preferences' => [
                'layout' =>
                    $preference?->layout
                        ? json_decode(
                            $preference->layout,
                            true,
                        )
                        : self::DEFAULT_LAYOUT,
                'exception_only' =>
                    (bool) (
                        $preference
                            ? $preference
                                ->exception_only
                            : false
                    ),
            ],
            'kpi_targets' =>
                $kpis,
            'trends' =>
                $this->trends(
                    $request,
                    $organizationId,
                ),
            'profitability' =>
                $profitability,
            'changed_today' =>
                $this->changedSince(
                    $request,
                    $organizationId,
                    $since,
                ),
            'changed_since' =>
                $since
                    ->toIso8601String(),
            'morning_actions' =>
                $this->morningActions(
                    $request,
                    $organizationId,
                ),
            'exceptions' =>
                $this->exceptions(
                    $request,
                    $organizationId,
                ),
            'generated_at' =>
                now()->toIso8601String(),
        ];

        DB::table(
            'dashboard_visits',
        )->updateOrInsert([
            'organization_id' =>
                $organizationId,
            'user_id' =>
                $userId,
        ], [
            'last_seen_at' =>
                now(),
            'updated_at' =>
                now(),
            'created_at' =>
                now(),
        ]);

        return response()->json([
            'data' =>
                $response,
        ]);
    }

    public function updatePreferences(
        Request $request,
    ): JsonResponse {
        $data = $request->validate([
            'layout' => [
                'required',
                'array',
                'min:1',
                'max:12',
            ],
            'layout.*' => [
                'required',
                Rule::in(
                    self::DEFAULT_LAYOUT,
                ),
            ],
            'exception_only' => [
                'required',
                'boolean',
            ],
        ]);

        $layout = collect(
            $data['layout'],
        )
            ->unique()
            ->values()
            ->all();

        $organizationId =
            app(TenantContext::class)
                ->id();

        DB::table(
            'dashboard_preferences',
        )->updateOrInsert([
            'organization_id' =>
                $organizationId,
            'user_id' =>
                $request->user()->id,
        ], [
            'layout' =>
                json_encode(
                    $layout,
                    JSON_THROW_ON_ERROR,
                ),
            'exception_only' =>
                $data['exception_only'],
            'updated_at' =>
                now(),
            'created_at' =>
                now(),
        ]);

        return response()->json([
            'data' => [
                'layout' =>
                    $layout,
                'exception_only' =>
                    $data[
                        'exception_only'
                    ],
            ],
        ]);
    }

    public function storeTarget(
        Request $request,
    ): JsonResponse {
        $this->authorizeTargetManagement(
            $request,
        );

        $data =
            $this->targetData(
                $request,
            );

        $organizationId =
            app(TenantContext::class)
                ->id();

        $currency =
            $data['metric']
            === 'new_customers'
                ? null
                : strtoupper(
                    $data['currency']
                    ?: (
                        app(
                            TenantContext::class,
                        )
                            ->organization()
                            ->preferences[
                                'currency'
                            ]
                        ?? ''
                    ),
                );

        $existing = DB::table(
            'kpi_targets',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'metric',
                $data['metric'],
            )
            ->where(
                'period',
                $data['period'],
            )
            ->when(
                $currency === null,
                fn ($query) =>
                    $query->whereNull(
                        'currency',
                    ),
                fn ($query) =>
                    $query->where(
                        'currency',
                        $currency,
                    ),
            )
            ->first();

        if ($existing) {
            DB::table(
                'kpi_targets',
            )
                ->where(
                    'id',
                    $existing->id,
                )
                ->update([
                    'target_value' =>
                        $data[
                            'target_value'
                        ],
                    'active' =>
                        $data['active'],
                    'updated_at' =>
                        now(),
                ]);

            $id =
                (int) $existing->id;
        } else {
            $id = DB::table(
                'kpi_targets',
            )->insertGetId([
                'organization_id' =>
                    $organizationId,
                'created_by' =>
                    $request->user()->id,
                ...$data,
                'currency' =>
                    $currency,
                'created_at' =>
                    now(),
                'updated_at' =>
                    now(),
            ]);
        }

        return response()->json([
            'data' =>
                DB::table(
                    'kpi_targets',
                )
                    ->where(
                        'id',
                        $id,
                    )
                    ->first(),
        ], $existing ? 200 : 201);
    }

    public function updateTarget(
        Request $request,
        string $target,
    ): JsonResponse {
        $this->authorizeTargetManagement(
            $request,
        );

        $organizationId =
            app(TenantContext::class)
                ->id();

        $row = DB::table(
            'kpi_targets',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'id',
                (int) $target,
            )
            ->first();

        abort_unless(
            $row,
            404,
        );

        $data =
            $this->targetData(
                $request,
            );

        DB::table(
            'kpi_targets',
        )
            ->where(
                'id',
                $row->id,
            )
            ->update([
                ...$data,
                'updated_at' =>
                    now(),
            ]);

        return response()->json([
            'data' =>
                DB::table(
                    'kpi_targets',
                )
                    ->where(
                        'id',
                        $row->id,
                    )
                    ->first(),
        ]);
    }

    public function deleteTarget(
        Request $request,
        string $target,
    ): JsonResponse {
        $this->authorizeTargetManagement(
            $request,
        );

        $organizationId =
            app(TenantContext::class)
                ->id();

        $deleted = DB::table(
            'kpi_targets',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'id',
                (int) $target,
            )
            ->delete();

        abort_unless(
            $deleted > 0,
            404,
        );

        return response()->json([
            'ok' => true,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function profitability(
        Request $request,
        int $organizationId,
    ): array {
        if (
            ! FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            )
        ) {
            return [
                'visible' => false,
                'revenue' => '0.0000',
                'cogs' => '0.0000',
                'gross_profit' => '0.0000',
                'margin_percent' => '0.00',
                'currency' => '',
                'top_customers' => [],
                'top_products' => [],
            ];
        }

        $start =
            CarbonImmutable::today()
                ->startOfMonth();
        $end =
            CarbonImmutable::today()
                ->endOfMonth();

        $base = DB::table(
            'financial_document_lines as line',
        )
            ->join(
                'financial_documents as document',
                'document.id',
                '=',
                'line.financial_document_id',
            )
            ->leftJoin(
                'products as product',
                'product.id',
                '=',
                'line.product_id',
            )
            ->where(
                'document.organization_id',
                $organizationId,
            )
            ->where(
                'document.kind',
                'sale_invoice',
            )
            ->whereIn(
                'document.status',
                self::POSTED_DOCUMENT_STATUSES,
            )
            ->whereBetween(
                'document.issue_date',
                [
                    $start
                        ->toDateString(),
                    $end
                        ->toDateString(),
                ],
            );

        $summary =
            (clone $base)
                ->selectRaw(
                    'COALESCE(SUM(line.line_subtotal - line.line_discount), 0) as revenue,
                     COALESCE(SUM(line.quantity * COALESCE(line.cost_price_snapshot, product.cost_price, 0)), 0) as cogs,
                     MIN(document.currency) as currency',
                )
                ->first();

        $revenue =
            (float) (
                $summary->revenue
                ?? 0
            );
        $cogs =
            (float) (
                $summary->cogs
                ?? 0
            );
        $profit =
            $revenue - $cogs;
        $margin =
            $revenue > 0
                ? $profit
                    / $revenue
                    * 100
                : 0;

        $topCustomers =
            (clone $base)
                ->leftJoin(
                    'parties as party',
                    'party.id',
                    '=',
                    'document.party_id',
                )
                ->whereNotNull(
                    'document.party_id',
                )
                ->selectRaw(
                    "document.party_id,
                     COALESCE(party.company_name, party.name, CONCAT('#', document.party_id)) as name,
                     SUM(line.line_subtotal - line.line_discount) as revenue,
                     SUM((line.line_subtotal - line.line_discount) - (line.quantity * COALESCE(line.cost_price_snapshot, product.cost_price, 0))) as gross_profit",
                )
                ->groupBy(
                    'document.party_id',
                    'party.company_name',
                    'party.name',
                )
                ->orderByDesc(
                    'gross_profit',
                )
                ->limit(5)
                ->get()
                ->map(
                    fn ($row): array => [
                        'id' =>
                            (int) $row
                                ->party_id,
                        'name' =>
                            $row->name,
                        'revenue' =>
                            number_format(
                                (float) $row
                                    ->revenue,
                                4,
                                '.',
                                '',
                            ),
                        'gross_profit' =>
                            number_format(
                                (float) $row
                                    ->gross_profit,
                                4,
                                '.',
                                '',
                            ),
                        'url' =>
                            '/app/parties?focus='
                            .$row
                                ->party_id,
                    ],
                )
                ->values();

        $topProducts =
            (clone $base)
                ->whereNotNull(
                    'line.product_id',
                )
                ->selectRaw(
                    "line.product_id,
                     COALESCE(product.name, line.description, CONCAT('#', line.product_id)) as name,
                     SUM(line.line_subtotal - line.line_discount) as revenue,
                     SUM((line.line_subtotal - line.line_discount) - (line.quantity * COALESCE(line.cost_price_snapshot, product.cost_price, 0))) as gross_profit",
                )
                ->groupBy(
                    'line.product_id',
                    'product.name',
                    'line.description',
                )
                ->orderByDesc(
                    'gross_profit',
                )
                ->limit(5)
                ->get()
                ->map(
                    fn ($row): array => [
                        'id' =>
                            (int) $row
                                ->product_id,
                        'name' =>
                            $row->name,
                        'revenue' =>
                            number_format(
                                (float) $row
                                    ->revenue,
                                4,
                                '.',
                                '',
                            ),
                        'gross_profit' =>
                            number_format(
                                (float) $row
                                    ->gross_profit,
                                4,
                                '.',
                                '',
                            ),
                        'url' =>
                            '/app/products?focus='
                            .$row
                                ->product_id,
                    ],
                )
                ->values();

        return [
            'visible' => true,
            'period' =>
                $start->format(
                    'Y-m',
                ),
            'revenue' =>
                number_format(
                    $revenue,
                    4,
                    '.',
                    '',
                ),
            'cogs' =>
                number_format(
                    $cogs,
                    4,
                    '.',
                    '',
                ),
            'gross_profit' =>
                number_format(
                    $profit,
                    4,
                    '.',
                    '',
                ),
            'margin_percent' =>
                number_format(
                    $margin,
                    2,
                    '.',
                    '',
                ),
            'currency' =>
                (string) (
                    $summary->currency
                    ?? ''
                ),
            'top_customers' =>
                $topCustomers,
            'top_products' =>
                $topProducts,
        ];
    }

    /**
     * @param array<string, mixed> $profitability
     * @return list<array<string, mixed>>
     */
    private function kpiProgress(
        Request $request,
        int $organizationId,
        array $profitability,
    ): array {
        $targets = DB::table(
            'kpi_targets',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'active',
                true,
            )
            ->orderBy('id')
            ->get();

        $monthStart =
            CarbonImmutable::today()
                ->startOfMonth();

        return $targets
            ->map(
                function (
                    $target,
                ) use (
                    $request,
                    $organizationId,
                    $profitability,
                    $monthStart,
                ): array {
                    $current = match (
                        $target->metric
                    ) {
                        'sales_revenue' =>
                            FinanceAuthorization::allows(
                                $request->user(),
                                'finance.sales.view',
                            )
                                ? (float) $profitability[
                                    'revenue'
                                ]
                                : 0,
                        'gross_profit' =>
                            FinanceAuthorization::allows(
                                $request->user(),
                                'finance.sales.view',
                            )
                                ? (float) $profitability[
                                    'gross_profit'
                                ]
                                : 0,
                        'collections' =>
                            FinanceAuthorization::allows(
                                $request->user(),
                                'finance.cash.view',
                            )
                                ? (float) DB::table(
                                    'cash_movements',
                                )
                                    ->where(
                                        'organization_id',
                                        $organizationId,
                                    )
                                    ->where(
                                        'direction',
                                        'incoming',
                                    )
                                    ->where(
                                        'status',
                                        'posted',
                                    )
                                    ->whereBetween(
                                        'movement_date',
                                        [
                                            $monthStart
                                                ->toDateString(),
                                            $monthStart
                                                ->endOfMonth()
                                                ->toDateString(),
                                        ],
                                    )
                                    ->sum(
                                        'amount',
                                    )
                                : 0,
                        'new_customers' =>
                            Gate::forUser(
                                $request->user(),
                            )->allows(
                                'viewAny',
                                Party::class,
                            )
                                ? (float) DB::table(
                                    'parties',
                                )
                                    ->where(
                                        'organization_id',
                                        $organizationId,
                                    )
                                    ->whereNull(
                                        'deleted_at',
                                    )
                                    ->whereBetween(
                                        'created_at',
                                        [
                                            $monthStart,
                                            $monthStart
                                                ->endOfMonth(),
                                        ],
                                    )
                                    ->count()
                                : 0,
                        default =>
                            0,
                    };

                    $targetValue =
                        (float) $target
                            ->target_value;

                    return [
                        'id' =>
                            (int) $target->id,
                        'metric' =>
                            $target->metric,
                        'period' =>
                            $target->period,
                        'target_value' =>
                            (string) $target
                                ->target_value,
                        'current_value' =>
                            number_format(
                                $current,
                                4,
                                '.',
                                '',
                            ),
                        'achievement_percent' =>
                            $targetValue > 0
                                ? round(
                                    min(
                                        $current
                                        / $targetValue
                                        * 100,
                                        999.99,
                                    ),
                                    2,
                                )
                                : 0,
                        'currency' =>
                            $target->currency,
                    ];
                },
            )
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function trends(
        Request $request,
        int $organizationId,
    ): array {
        $now =
            CarbonImmutable::today();
        $currentStart =
            $now->startOfMonth();
        $currentEnd =
            $now->endOfMonth();
        $previousStart =
            $currentStart
                ->subMonth()
                ->startOfMonth();
        $previousEnd =
            $previousStart
                ->endOfMonth();
        $yearStart =
            $currentStart
                ->subYear();
        $yearEnd =
            $currentEnd
                ->subYear();

        $metrics = [];

        if (
            FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            )
        ) {
            $metrics[] =
                $this->documentTrend(
                    $organizationId,
                    'sale_invoice',
                    'sales_revenue',
                    $currentStart,
                    $currentEnd,
                    $previousStart,
                    $previousEnd,
                    $yearStart,
                    $yearEnd,
                );
        }

        if (
            FinanceAuthorization::allows(
                $request->user(),
                'finance.purchases.view',
            )
        ) {
            $metrics[] =
                $this->documentTrend(
                    $organizationId,
                    'purchase_invoice',
                    'purchases',
                    $currentStart,
                    $currentEnd,
                    $previousStart,
                    $previousEnd,
                    $yearStart,
                    $yearEnd,
                );
        }

        if (
            FinanceAuthorization::allows(
                $request->user(),
                'finance.cash.view',
            )
        ) {
            $metrics[] =
                $this->cashTrend(
                    $organizationId,
                    $currentStart,
                    $currentEnd,
                    $previousStart,
                    $previousEnd,
                    $yearStart,
                    $yearEnd,
                );
        }

        return $metrics;
    }

    /**
     * @return array<string, mixed>
     */
    private function documentTrend(
        int $organizationId,
        string $kind,
        string $metric,
        CarbonImmutable $currentStart,
        CarbonImmutable $currentEnd,
        CarbonImmutable $previousStart,
        CarbonImmutable $previousEnd,
        CarbonImmutable $yearStart,
        CarbonImmutable $yearEnd,
    ): array {
        $sum = function (
            CarbonImmutable $start,
            CarbonImmutable $end,
        ) use (
            $organizationId,
            $kind,
        ): float {
            return (float) DB::table(
                'financial_documents',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'kind',
                    $kind,
                )
                ->whereIn(
                    'status',
                    self::POSTED_DOCUMENT_STATUSES,
                )
                ->whereBetween(
                    'issue_date',
                    [
                        $start
                            ->toDateString(),
                        $end
                            ->toDateString(),
                    ],
                )
                ->sum('total');
        };

        $current =
            $sum(
                $currentStart,
                $currentEnd,
            );
        $previous =
            $sum(
                $previousStart,
                $previousEnd,
            );
        $year =
            $sum(
                $yearStart,
                $yearEnd,
            );

        return [
            'metric' =>
                $metric,
            'current' =>
                number_format(
                    $current,
                    4,
                    '.',
                    '',
                ),
            'previous_month' =>
                number_format(
                    $previous,
                    4,
                    '.',
                    '',
                ),
            'previous_year' =>
                number_format(
                    $year,
                    4,
                    '.',
                    '',
                ),
            'vs_previous_month_percent' =>
                $this->deltaPercent(
                    $current,
                    $previous,
                ),
            'vs_previous_year_percent' =>
                $this->deltaPercent(
                    $current,
                    $year,
                ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function cashTrend(
        int $organizationId,
        CarbonImmutable $currentStart,
        CarbonImmutable $currentEnd,
        CarbonImmutable $previousStart,
        CarbonImmutable $previousEnd,
        CarbonImmutable $yearStart,
        CarbonImmutable $yearEnd,
    ): array {
        $sum = function (
            CarbonImmutable $start,
            CarbonImmutable $end,
        ) use (
            $organizationId,
        ): float {
            return (float) DB::table(
                'cash_movements',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'direction',
                    'incoming',
                )
                ->where(
                    'status',
                    'posted',
                )
                ->whereBetween(
                    'movement_date',
                    [
                        $start
                            ->toDateString(),
                        $end
                            ->toDateString(),
                    ],
                )
                ->sum('amount');
        };

        $current =
            $sum(
                $currentStart,
                $currentEnd,
            );
        $previous =
            $sum(
                $previousStart,
                $previousEnd,
            );
        $year =
            $sum(
                $yearStart,
                $yearEnd,
            );

        return [
            'metric' =>
                'collections',
            'current' =>
                number_format(
                    $current,
                    4,
                    '.',
                    '',
                ),
            'previous_month' =>
                number_format(
                    $previous,
                    4,
                    '.',
                    '',
                ),
            'previous_year' =>
                number_format(
                    $year,
                    4,
                    '.',
                    '',
                ),
            'vs_previous_month_percent' =>
                $this->deltaPercent(
                    $current,
                    $previous,
                ),
            'vs_previous_year_percent' =>
                $this->deltaPercent(
                    $current,
                    $year,
                ),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function changedSince(
        Request $request,
        int $organizationId,
        CarbonImmutable $since,
    ): array {
        $canViewFinance =
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
            );

        $finance =
            $canViewFinance
                ? DB::table(
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
            ->where(
                'audit.created_at',
                '>',
                $since,
            )
            ->latest(
                'audit.id',
            )
            ->limit(12)
            ->get([
                'audit.id',
                'audit.auditable_type',
                'audit.auditable_id',
                'audit.action',
                'audit.reason',
                'audit.created_at',
                'user.name as actor',
            ])
            ->map(
                fn ($row): array => [
                    'key' =>
                        'finance-'
                        .$row->id,
                    'kind' =>
                        'finance',
                    'title' =>
                        $row->action
                        .' · '
                        .$row
                            ->auditable_type
                        .' #'
                        .$row
                            ->auditable_id,
                    'detail' =>
                        $row->reason,
                    'actor' =>
                        $row->actor,
                    'created_at' =>
                        $row->created_at,
                    'url' =>
                        '/app/audit',
                ],
            );
                : collect();

        $canViewBulkAudit =
            in_array(
                app(
                    TenantContext::class,
                )->role(),
                [
                    OrganizationRole::Owner,
                    OrganizationRole::Admin,
                    OrganizationRole::Manager,
                ],
                true,
            );

        $bulk =
            $canViewBulkAudit
                ? DB::table(
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
            ->where(
                'history.created_at',
                '>',
                $since,
            )
            ->latest(
                'history.id',
            )
            ->limit(8)
            ->get([
                'history.id',
                'history.entity_type',
                'history.action',
                'history.record_count',
                'history.created_at',
                'user.name as actor',
            ])
            ->map(
                fn ($row): array => [
                    'key' =>
                        'bulk-'
                        .$row->id,
                    'kind' =>
                        'bulk',
                    'title' =>
                        $row->action
                        .' · '
                        .$row
                            ->record_count
                        .' '
                        .$row
                            ->entity_type,
                    'detail' =>
                        null,
                    'actor' =>
                        $row->actor,
                    'created_at' =>
                        $row->created_at,
                    'url' =>
                        '/app/audit/bulk-actions',
                ],
            )
                : collect();

        $tasks =
            TaskAccess::applyVisible(
                Task::query()
                    ->operational(),
                $request->user(),
            )
                ->where(
                    'updated_at',
                    '>',
                    $since,
                )
                ->latest(
                    'updated_at',
                )
                ->limit(8)
                ->get([
                    'id',
                    'title',
                    'status',
                    'updated_at',
                ])
                ->map(
                    fn (
                        Task $row,
                    ): array => [
                        'key' =>
                            'task-'
                            .$row->id,
                        'kind' =>
                            'task',
                        'title' =>
                            $row->title,
                        'detail' =>
                            $row->status,
                        'actor' =>
                            null,
                        'created_at' =>
                            $row->updated_at,
                        'url' =>
                            '/app/task-management/'
                            .$row->id,
                    ],
                );

        return $finance
            ->concat($bulk)
            ->concat($tasks)
            ->sortByDesc(
                fn (
                    array $row,
                ) =>
                    $row['created_at'],
            )
            ->take(20)
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function morningActions(
        Request $request,
        int $organizationId,
    ): array {
        $items = collect();

        if (
            FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            )
        ) {
            $count = FinancialDocument::query()
                ->where(
                    'kind',
                    'sale_invoice',
                )
                ->whereIn(
                    'status',
                    [
                        'issued',
                        'partially_paid',
                    ],
                )
                ->whereDate(
                    'due_date',
                    '<',
                    today(),
                )
                ->where(
                    'balance_due',
                    '>',
                    0,
                )
                ->count();

            if ($count) {
                $items->push([
                    'kind' =>
                        'overdue_sales',
                    'title' =>
                        'Collect overdue sales invoices',
                    'count' =>
                        $count,
                    'priority' =>
                        'high',
                    'url' =>
                        '/app/reports/ar-aging',
                ]);
            }
        }

        $overdueTasks =
            TaskAccess::applyVisible(
                Task::query()
                    ->operational(),
                $request->user(),
            )
                ->where(
                    'status',
                    '!=',
                    'completed',
                )
                ->whereDate(
                    'due_on',
                    '<',
                    today(),
                )
                ->count();

        if (
            $overdueTasks
            > 0
        ) {
            $items->push([
                'kind' =>
                    'overdue_tasks',
                'title' =>
                    'Review overdue tasks',
                'count' =>
                    $overdueTasks,
                'priority' =>
                    'high',
                'url' =>
                    '/app/task-management',
            ]);
        }

        $followUps =
            (int) DB::table(
                'record_reminders',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'user_id',
                    $request->user()->id,
                )
                ->whereNull(
                    'completed_at',
                )
                ->where(
                    'due_at',
                    '<=',
                    now()
                        ->endOfDay(),
                )
                ->count();

        if (
            $followUps > 0
        ) {
            $items->push([
                'kind' =>
                    'follow_ups',
                'title' =>
                    'Complete due follow-ups',
                'count' =>
                    $followUps,
                'priority' =>
                    'medium',
                'url' =>
                    '/app/follow-ups',
            ]);
        }

        if (
            FinanceAuthorization::allows(
                $request->user(),
                'finance.cash.view',
            )
        ) {
            $duePayments =
                PaymentPlan::query()
                    ->where(
                        'active',
                        true,
                    )
                    ->where(
                        'direction',
                        'outgoing',
                    )
                    ->whereDate(
                        'next_due_on',
                        '<=',
                        today(),
                    )
                    ->count();

            if (
                $duePayments > 0
            ) {
                $items->push([
                    'kind' =>
                        'due_payments',
                    'title' =>
                        'Process due payments',
                    'count' =>
                        $duePayments,
                    'priority' =>
                        'medium',
                    'url' =>
                        '/app/payments?view=recurring',
                ]);
            }
        }

        if (
            Gate::forUser(
                $request->user(),
            )->allows(
                'viewAny',
                Product::class,
            )
        ) {
            $lowStock =
                $this->lowStockCount(
                    $organizationId,
                );

            if (
                $lowStock > 0
            ) {
                $items->push([
                    'kind' =>
                        'low_stock',
                    'title' =>
                        'Replenish low stock',
                    'count' =>
                        $lowStock,
                    'priority' =>
                        'medium',
                    'url' =>
                        '/app/inventory/intelligence',
                ]);
            }
        }

        $approvals =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.approvals.review',
            )
                ? (int) DB::table(
                    'approval_requests',
                )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where(
                        'status',
                        'pending',
                    )
                    ->count()
                : 0;

        if (
            $approvals > 0
        ) {
            $items->push([
                'kind' =>
                    'approvals',
                'title' =>
                    'Review pending approvals',
                'count' =>
                    $approvals,
                'priority' =>
                    'high',
                'url' =>
                    '/app/finance/approvals',
            ]);
        }

        $ordered =
            $items
                ->sortBy(
                    fn (
                        array $item,
                    ): int =>
                        $item['priority']
                        === 'high'
                            ? 0
                            : 1,
                )
                ->values();

        return [
            'total_actions' =>
                (int) $ordered
                    ->sum(
                        'count',
                    ),
            'items' =>
                $ordered
                    ->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function exceptions(
        Request $request,
        int $organizationId,
    ): array {
        $items = collect();

        if (
            Gate::forUser(
                $request->user(),
            )->allows(
                'viewAny',
                Product::class,
            )
        ) {
            $lowStock =
                $this->lowStockCount(
                    $organizationId,
                );

            if ($lowStock) {
                $items->push([
                    'kind' =>
                        'low_stock',
                    'severity' =>
                        'warning',
                    'title' =>
                        'Products below low-stock threshold',
                    'count' =>
                        $lowStock,
                    'url' =>
                        '/app/inventory/intelligence',
                ]);
            }
        }

        $approvals =
            FinanceAuthorization::allows(
                $request->user(),
                'finance.approvals.review',
            )
                ? (int) DB::table(
                    'approval_requests',
                )
                    ->where(
                        'organization_id',
                        $organizationId,
                    )
                    ->where(
                        'status',
                        'pending',
                    )
                    ->count()
                : 0;

        if ($approvals) {
            $items->push([
                'kind' =>
                    'approval',
                'severity' =>
                    'decision',
                'title' =>
                    'Transactions awaiting approval',
                'count' =>
                    $approvals,
                'url' =>
                    '/app/finance/approvals',
            ]);
        }

        if (
            FinanceAuthorization::allows(
                $request->user(),
                'finance.sales.view',
            )
        ) {
            $overdue =
                FinancialDocument::query()
                    ->where(
                        'kind',
                        'sale_invoice',
                    )
                    ->whereIn(
                        'status',
                        [
                            'issued',
                            'partially_paid',
                        ],
                    )
                    ->whereDate(
                        'due_date',
                        '<',
                        today(),
                    )
                    ->where(
                        'balance_due',
                        '>',
                        0,
                    )
                    ->count();

            if ($overdue) {
                $items->push([
                    'kind' =>
                        'overdue_receivables',
                    'severity' =>
                        'critical',
                    'title' =>
                        'Overdue customer invoices',
                    'count' =>
                        $overdue,
                    'url' =>
                        '/app/reports/ar-aging',
                ]);
            }
        }

        $expiredDocuments =
            (int) DB::table(
                'expiring_documents',
            )
                ->where(
                    'organization_id',
                    $organizationId,
                )
                ->where(
                    'status',
                    'active',
                )
                ->whereDate(
                    'expires_on',
                    '<',
                    today(),
                )
                ->count();

        if (
            $expiredDocuments
            > 0
        ) {
            $items->push([
                'kind' =>
                    'expired_documents',
                'severity' =>
                    'critical',
                'title' =>
                    'Expired tracked documents',
                'count' =>
                    $expiredDocuments,
                'url' =>
                    '/app/documents/expiry',
            ]);
        }

        return [
            'total' =>
                (int) $items
                    ->sum(
                        'count',
                    ),
            'items' =>
                $items
                    ->values()
                    ->all(),
        ];
    }

    private function lowStockCount(
        int $organizationId,
    ): int {
        return Product::withoutGlobalScopes()
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'track_inventory',
                true,
            )
            ->where(
                'low_stock_threshold',
                '>',
                0,
            )
            ->withSum(
                'inventoryBalances as on_hand_total',
                'on_hand',
            )
            ->get([
                'id',
                'low_stock_threshold',
            ])
            ->filter(
                fn (
                    Product $product,
                ): bool =>
                    (float) (
                        $product
                            ->on_hand_total
                        ?? 0
                    )
                    <= (float) $product
                        ->low_stock_threshold,
            )
            ->count();
    }

    private function deltaPercent(
        float $current,
        float $comparison,
    ): ?float {
        if (
            abs(
                $comparison,
            )
            < 0.00001
        ) {
            return null;
        }

        return round(
            (
                $current
                - $comparison
            )
            / abs(
                $comparison,
            )
            * 100,
            2,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function targetData(
        Request $request,
    ): array {
        return $request->validate([
            'metric' => [
                'required',
                Rule::in([
                    'sales_revenue',
                    'gross_profit',
                    'collections',
                    'new_customers',
                ]),
            ],
            'period' => [
                'required',
                Rule::in([
                    'monthly',
                ]),
            ],
            'target_value' => [
                'required',
                'numeric',
                'gt:0',
            ],
            'currency' => [
                'nullable',
                'string',
                'size:3',
            ],
            'active' => [
                'nullable',
                'boolean',
            ],
        ]) + [
            'active' => true,
        ];
    }

    private function authorizeTargetManagement(
        Request $request,
    ): void {
        abort_unless(
            in_array(
                app(
                    TenantContext::class,
                )->role(),
                [
                    OrganizationRole::Owner,
                    OrganizationRole::Admin,
                    OrganizationRole::Manager,
                ],
                true,
            ),
            403,
        );
    }
}
