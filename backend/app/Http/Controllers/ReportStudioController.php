<?php

namespace App\Http\Controllers;

use App\Services\FinanceAuthorization;
use App\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ReportStudioController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);
        $org = app(TenantContext::class)->id();
        $user = $request->user();

        return response()->json([
            'features' => $this->catalog(),
            'snapshots' => Schema::hasTable('report_snapshots')
                ? DB::table('report_snapshots')->where('organization_id', $org)->latest('id')->limit(20)->get()
                : [],
            'presets' => Schema::hasTable('report_filter_presets')
                ? DB::table('report_filter_presets')->where('organization_id', $org)->where('user_id', $user->id)->latest('id')->get()
                : [],
            'boards' => Schema::hasTable('report_boards')
                ? DB::table('report_boards')->where('organization_id', $org)
                    ->where(fn ($q) => $q->where('created_by', $user->id)->orWhere('shared', true))
                    ->latest('id')->get()->map(function ($row) {
                        $row->layout = json_decode($row->layout ?: '[]', true) ?: [];
                        return $row;
                    })
                : [],
            'reports' => DB::table('custom_reports')
                ->where('organization_id', $org)
                ->where(fn ($q) => $q->where('created_by', $user->id)->orWhere('shared', true))
                ->orderBy('name')
                ->get()
                ->map(fn ($row): array => [
                    'id' => (int) $row->id,
                    'name' => $row->name,
                    'dataset' => $row->dataset,
                    'columns' => json_decode($row->columns ?: '[]', true) ?: [],
                    'filters' => json_decode($row->filters ?: '[]', true) ?: [],
                    'group_by' => $row->group_by,
                    'sort_by' => $row->sort_by,
                    'sort_direction' => $row->sort_direction,
                    'shared' => (bool) $row->shared,
                    'can_edit' => (int) $row->created_by === (int) $user->id,
                    'visualization' => $row->visualization
                        ? (json_decode($row->visualization, true) ?: null)
                        : null,
                    'configuration' => $row->configuration
                        ? (json_decode($row->configuration, true) ?: null)
                        : null,
                ]),
            'annotations' => Schema::hasTable('report_annotations')
                ? DB::table('report_annotations as annotation')
                    ->leftJoin('users as creator', 'creator.id', '=', 'annotation.created_by')
                    ->where('annotation.organization_id', $org)
                    ->latest('annotation.id')
                    ->limit(30)
                    ->get([
                        'annotation.*',
                        'creator.name as creator_name',
                    ])
                : [],
            'comments' => Schema::hasTable('report_comments')
                ? DB::table('report_comments as comment')
                    ->leftJoin('users as creator', 'creator.id', '=', 'comment.created_by')
                    ->where('comment.organization_id', $org)
                    ->latest('comment.id')
                    ->limit(30)
                    ->get([
                        'comment.*',
                        'creator.name as creator_name',
                    ])
                    ->map(function ($row) {
                        $row->mentions = json_decode($row->mentions ?: '[]', true) ?: [];
                        return $row;
                    })
                : [],
            'approvals' => Schema::hasTable('report_approvals')
                ? DB::table('report_approvals as approval')
                    ->leftJoin('users as reviewer', 'reviewer.id', '=', 'approval.reviewed_by')
                    ->where('approval.organization_id', $org)
                    ->latest('approval.id')
                    ->limit(30)
                    ->get([
                        'approval.*',
                        'reviewer.name as reviewer_name',
                    ])
                : [],
            'members' => DB::table('memberships as membership')
                ->join('users as user', 'user.id', '=', 'membership.user_id')
                ->where('membership.organization_id', $org)
                ->orderBy('user.name')
                ->get([
                    'user.id',
                    'user.name',
                ]),
            'targets' => Schema::hasTable('report_dimension_targets')
                ? DB::table('report_dimension_targets')
                    ->where('organization_id', $org)
                    ->latest('id')
                    ->limit(200)
                    ->get()
                : [],
        ]);
    }

    public function run(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);

        $data = $request->validate([
            'feature' => ['required', 'string', Rule::in(array_column($this->catalog(), 'key'))],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'dimension' => ['nullable', Rule::in(['customer', 'product', 'supplier', 'employee', 'branch', 'warehouse', 'month'])],
            'limit' => ['nullable', 'integer', 'min:3', 'max:100'],
            'metric' => ['nullable', Rule::in(['revenue', 'gross_profit', 'margin_percent', 'quantity', 'discounts', 'outstanding'])],
            'comparison_mode' => ['nullable', Rule::in(['previous_period', 'previous_month', 'previous_quarter', 'ytd_previous_year'])],
            'scenario.sales_percent' => ['nullable', 'numeric', 'between:-90,500'],
            'scenario.cost_percent' => ['nullable', 'numeric', 'between:-90,500'],
            'scenario.currency_percent' => ['nullable', 'numeric', 'between:-90,500'],
            'exception.metric' => ['nullable', Rule::in(['margin', 'overdue_days', 'stock', 'discount'])],
            'exception.operator' => ['nullable', Rule::in(['lt', 'lte', 'gt', 'gte'])],
            'exception.value' => ['nullable', 'numeric'],
        ]);

        $from = Carbon::parse($data['date_from'] ?? now()->startOfYear()->toDateString())->startOfDay();
        $to = Carbon::parse($data['date_to'] ?? now()->toDateString())->endOfDay();
        $feature = $data['feature'];

        $result = match ($feature) {
            'period-comparison' => $this->periodComparison($from, $to, $data['comparison_mode'] ?? 'previous_period'),
            'variance-analysis' => $this->varianceAnalysis($from, $to),
            'profitability-explorer' => $this->profitability($from, $to, $data['dimension'] ?? 'customer'),
            'margin-leakage' => $this->marginLeakage($from, $to),
            'customer-profitability' => $this->profitability($from, $to, 'customer'),
            'product-profitability' => $this->profitability($from, $to, 'product'),
            'cash-conversion-cycle' => $this->cashConversionCycle($to),
            'receivables-movement' => $this->movementReport($from, $to, 'sale_invoice'),
            'payables-movement' => $this->movementReport($from, $to, 'purchase_invoice'),
            'aging-trend' => $this->agingTrend($from, $to),
            'payment-behavior' => $this->paymentBehavior($from, $to),
            'cashflow-forecast' => $this->cashflowForecast($to),
            'inventory-movement' => $this->inventoryMovement($from, $to),
            'dead-stock' => $this->deadStock($to),
            'inventory-turnover' => $this->inventoryTurnover($from, $to),
            'stock-valuation' => $this->stockValuation($to),
            'purchase-price-variance' => $this->purchasePriceVariance($from, $to),
            'supplier-performance' => $this->supplierPerformance($from, $to),
            'sales-performance' => $this->salesPerformance($from, $to),
            'discount-analysis' => $this->discountAnalysis($from, $to),
            'returns-analysis' => $this->returnsAnalysis($from, $to),
            'tax-center' => $this->taxCenter($from, $to),
            'audit-report' => $this->auditReport($from, $to),
            'exception-builder' => $this->exceptionReport($from, $to, $data['exception'] ?? []),
            'top-bottom' => $this->topBottom(
                $from,
                $to,
                (int) ($data['limit'] ?? 10),
                $data['dimension'] ?? 'customer',
                $data['metric'] ?? 'revenue',
            ),
            'pareto' => $this->pareto(
                $from,
                $to,
                $data['dimension'] ?? 'customer',
                $data['metric'] ?? 'revenue',
            ),
            'concentration-risk' => $this->concentrationRisk(
                $from,
                $to,
                $data['dimension'] ?? 'customer',
                $data['metric'] ?? 'revenue',
            ),
            'scenario-reports' => $this->scenario($from, $to, $data['scenario'] ?? []),
            default => $this->summary($from, $to, $feature),
        };

        return response()->json(['data' => [
            'feature' => $feature,
            'date_from' => $from->toDateString(),
            'date_to' => $to->toDateString(),
            ...$result,
        ]]);
    }

    public function drillDown(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);

        $data = $request->validate([
            'feature' => ['required', 'string', Rule::in(array_column($this->catalog(), 'key'))],
            'date_from' => ['required', 'date'],
            'date_to' => ['required', 'date', 'after_or_equal:date_from'],
            'dimension' => ['nullable', 'string', 'max:160'],
            'dimension_value' => ['nullable', 'string', 'max:255'],
            'metric' => ['nullable', 'string', 'max:100'],
        ]);

        $org = app(TenantContext::class)->id();
        $from = Carbon::parse($data['date_from'])->startOfDay();
        $to = Carbon::parse($data['date_to'])->endOfDay();

        $q = DB::table('financial_documents as doc')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)
            ->whereBetween('doc.issue_date', [$from, $to])
            ->where('doc.status', '!=', 'void');

        if (in_array($data['feature'], ['supplier-performance', 'payables-movement', 'purchase-price-variance'], true)) {
            $q->where('doc.kind', 'purchase_invoice');
        } else {
            $q->where('doc.kind', 'sale_invoice');
        }

        $dimension = $data['dimension'] ?? null;
        $value = $data['dimension_value'] ?? null;

        if ($value !== null && $value !== '') {
            if (in_array($dimension, ['customer', 'supplier', 'party', 'dimension'], true)) {
                $q->whereRaw("COALESCE(party.company_name, party.name, 'Unassigned') = ?", [$value]);
            } elseif ($dimension === 'branch') {
                $q->whereRaw("COALESCE(doc.branch_label, 'Unassigned') = ?", [$value]);
            } elseif ($dimension === 'month') {
                $q->whereRaw("DATE_FORMAT(doc.issue_date, '%Y-%m') = ?", [$value]);
            } elseif ($dimension === 'employee') {
                $q->leftJoin('users as employee', 'employee.id', '=', 'doc.created_by')
                    ->whereRaw("COALESCE(employee.name, 'Unassigned') = ?", [$value]);
            }
        }

        $months = (clone $q)
            ->selectRaw("DATE_FORMAT(doc.issue_date, '%Y-%m') as label, COUNT(*) as documents, SUM(doc.total) as total, SUM(doc.balance_due) as balance_due")
            ->groupByRaw("DATE_FORMAT(doc.issue_date, '%Y-%m')")
            ->orderBy('label')
            ->get();

        $invoices = (clone $q)
            ->select([
                'doc.id',
                'doc.number',
                'doc.issue_date',
                'doc.due_date',
                'doc.status',
                'doc.total',
                'doc.paid_total',
                'doc.balance_due',
                'doc.currency',
                DB::raw("COALESCE(party.company_name, party.name, 'Unassigned') as party"),
            ])
            ->latest('doc.issue_date')
            ->limit(100)
            ->get();

        return response()->json(['data' => [
            'breadcrumbs' => [
                ['label' => 'Report', 'value' => $data['feature']],
                ['label' => 'Dimension', 'value' => $value ?: 'All'],
                ['label' => 'Metric', 'value' => $data['metric'] ?? 'value'],
            ],
            'months' => $months,
            'invoices' => $invoices,
        ]]);
    }

    public function saveVisualization(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);

        $data = $request->validate([
            'report_id' => ['required', 'integer'],
            'type' => ['required', Rule::in(['table', 'bar', 'line', 'area', 'pie', 'donut'])],
            'x' => ['nullable', 'string', 'max:100'],
            'y' => ['nullable', 'string', 'max:100'],
        ]);

        $updated = DB::table('custom_reports')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('id', $data['report_id'])
            ->where(function ($query) use ($request): void {
                $query->where('created_by', $request->user()->id)
                    ->orWhere('shared', true);
            })
            ->update([
                'visualization' => json_encode([
                    'type' => $data['type'],
                    'x' => $data['x'] ?? null,
                    'y' => $data['y'] ?? null,
                ], JSON_THROW_ON_ERROR),
                'updated_at' => now(),
            ]);

        abort_unless($updated > 0, 404);

        $this->saveReportVersion(
            (int) $data['report_id'],
            (int) $request->user()->id,
        );

        return response()->json(['ok' => true]);
    }

    public function saveConfiguration(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);

        $data = $request->validate([
            'report_id' => ['required', 'integer'],
            'configuration' => ['required', 'array'],
        ]);

        $updated = DB::table('custom_reports')
            ->where('organization_id', app(TenantContext::class)->id())
            ->where('id', $data['report_id'])
            ->where('created_by', $request->user()->id)
            ->update([
                'configuration' => json_encode(
                    $data['configuration'],
                    JSON_THROW_ON_ERROR,
                ),
                'updated_at' => now(),
            ]);

        abort_unless($updated > 0, 404);

        $this->saveReportVersion(
            (int) $data['report_id'],
            (int) $request->user()->id,
        );

        return response()->json(['ok' => true]);
    }

    public function naturalLanguage(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);

        $data = $request->validate([
            'query' => ['required', 'string', 'max:500'],
        ]);

        $query = mb_strtolower($data['query']);

        $featureRules = [
            'margin-leakage' => ['margin leakage', 'leakage', 'تسرب', 'هامش منخفض'],
            'customer-profitability' => ['customer profit', 'customer profitability', 'ربحية العميل', 'ربحية العملاء'],
            'product-profitability' => ['product profit', 'product profitability', 'ربحية المنتج', 'ربحية المنتجات'],
            'profitability-explorer' => ['profit', 'profitability', 'ربح', 'ربحية'],
            'cash-conversion-cycle' => ['cash conversion', 'dso', 'dpo', 'دورة تحويل النقد'],
            'receivables-movement' => ['receivable movement', 'حركة الذمم المدينة'],
            'payables-movement' => ['payable movement', 'حركة الذمم الدائنة'],
            'aging-trend' => ['aging trend', 'اتجاه الذمم', 'اعمار الذمم', 'أعمار الذمم'],
            'payment-behavior' => ['payment behavior', 'سلوك الدفع', 'تأخير العملاء'],
            'cashflow-forecast' => ['cashflow forecast', 'cash flow forecast', 'توقع التدفق', 'تدفق نقدي', 'سيولة'],
            'dead-stock' => ['dead stock', 'slow moving', 'راكد', 'بطيء الحركة'],
            'inventory-turnover' => ['inventory turnover', 'دوران المخزون'],
            'stock-valuation' => ['stock valuation', 'inventory valuation', 'تقييم المخزون', 'قيمة المخزون'],
            'inventory-movement' => ['inventory movement', 'stock movement', 'حركة المخزون', 'مخزون'],
            'purchase-price-variance' => ['purchase price', 'price variance', 'سعر الشراء', 'انحراف الشراء'],
            'supplier-performance' => ['supplier performance', 'أداء المورد', 'اداء المورد'],
            'sales-performance' => ['sales performance', 'salesperson', 'أداء المبيعات', 'مندوب'],
            'discount-analysis' => ['discount analysis', 'discount', 'خصم', 'خصومات'],
            'returns-analysis' => ['returns', 'credit notes', 'مرتجعات', 'إشعارات دائنة', 'اشعارات دائنة'],
            'tax-center' => ['tax', 'vat', 'ضريبة', 'ضرائب'],
            'audit-report' => ['audit', 'changes', 'تدقيق', 'تغييرات'],
            'variance-analysis' => ['actual vs budget', 'actual vs target', 'variance', 'انحراف', 'ميزانية مقابل'],
            'top-bottom' => ['top 10', 'bottom 10', 'top ', 'bottom ', 'أعلى', 'ادنى', 'أدنى'],
            'pareto' => ['pareto', '80/20', '80 20', 'باريتو'],
            'concentration-risk' => ['concentration', 'dependency risk', 'تركز', 'تركيز الإيراد', 'اعتماد على عميل'],
            'scenario-reports' => ['scenario', 'what if', 'سيناريو', 'ماذا لو'],
            'period-comparison' => ['compare period', 'comparison', 'مقارنة', 'مقابل الشهر', 'مقابل السنة'],
        ];

        $feature = 'customer-profitability';

        foreach ($featureRules as $candidate => $needles) {
            foreach ($needles as $needle) {
                if (str_contains($query, $needle)) {
                    $feature = $candidate;
                    break 2;
                }
            }
        }

        $dimensionRules = [
            'product' => ['product', 'products', 'منتج', 'منتجات'],
            'supplier' => ['supplier', 'suppliers', 'مورد', 'موردين'],
            'employee' => ['employee', 'salesperson', 'staff', 'موظف', 'مندوب'],
            'branch' => ['branch', 'branches', 'فرع', 'فروع'],
            'warehouse' => ['warehouse', 'warehouses', 'مستودع', 'مستودعات'],
            'month' => ['by month', 'monthly', 'حسب الشهر', 'شهري'],
            'customer' => ['customer', 'customers', 'client', 'عميل', 'عملاء'],
        ];

        $dimension = 'customer';

        foreach ($dimensionRules as $candidate => $needles) {
            foreach ($needles as $needle) {
                if (str_contains($query, $needle)) {
                    $dimension = $candidate;
                    break 2;
                }
            }
        }

        $metricRules = [
            'gross_profit' => ['gross profit', 'profit', 'ربح إجمالي', 'الربح'],
            'margin_percent' => ['margin', 'هامش'],
            'quantity' => ['quantity', 'units', 'كمية', 'كميات'],
            'discounts' => ['discount', 'خصم'],
            'outstanding' => ['outstanding', 'balance due', 'مستحق', 'متبقي'],
            'revenue' => ['revenue', 'sales', 'إيراد', 'ايراد', 'مبيعات'],
        ];

        $metric = 'revenue';

        foreach ($metricRules as $candidate => $needles) {
            foreach ($needles as $needle) {
                if (str_contains($query, $needle)) {
                    $metric = $candidate;
                    break 2;
                }
            }
        }

        $to = now();
        $from = now()->subMonths(6)->startOfDay();
        $comparisonMode = 'previous_period';

        if (
            str_contains($query, 'this month')
            || str_contains($query, 'هذا الشهر')
            || str_contains($query, 'الشهر الحالي')
        ) {
            $from = now()->startOfMonth();
        } elseif (
            str_contains($query, 'this quarter')
            || str_contains($query, 'هذا الربع')
            || str_contains($query, 'الربع الحالي')
        ) {
            $from = now()->startOfQuarter();
        } elseif (
            str_contains($query, 'ytd')
            || str_contains($query, 'year to date')
            || str_contains($query, 'من بداية السنة')
        ) {
            $from = now()->startOfYear();
            $comparisonMode = 'ytd_previous_year';
        } elseif (
            preg_match('/(\d+)\s*(day|days|يوم|أيام|ايام)/u', $query, $match)
        ) {
            $from = now()->subDays(max(1, min(730, (int) $match[1])))->startOfDay();
        } elseif (
            preg_match('/(\d+)\s*(month|months|شهر|شهور|أشهر|اشهر)/u', $query, $match)
        ) {
            $from = now()->subMonths(max(1, min(36, (int) $match[1])))->startOfDay();
        } elseif (
            preg_match('/(\d+)\s*(year|years|سنة|سنوات)/u', $query, $match)
        ) {
            $from = now()->subYears(max(1, min(5, (int) $match[1])))->startOfDay();
        }

        if (
            str_contains($query, 'previous month')
            || str_contains($query, 'الشهر السابق')
        ) {
            $comparisonMode = 'previous_month';
        }

        if (
            str_contains($query, 'previous quarter')
            || str_contains($query, 'الربع السابق')
        ) {
            $comparisonMode = 'previous_quarter';
        }

        return response()->json([
            'data' => [
                'feature' => $feature,
                'dimension' => $dimension,
                'metric' => $metric,
                'comparison_mode' => $comparisonMode,
                'date_from' => $from->toDateString(),
                'date_to' => $to->toDateString(),
                'explanation' => 'Review these settings before running the report.',
            ],
        ]);
    }

    public function snapshot(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);
        $data = $request->validate([
            'report_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:180'],
            'as_of_date' => ['required', 'date'],
            'definition' => ['required', 'array'],
            'payload' => ['required', 'array'],
        ]);

        $id = DB::table('report_snapshots')->insertGetId([
            'organization_id' => app(TenantContext::class)->id(),
            'report_id' => $data['report_id'] ?? null,
            'created_by' => $request->user()->id,
            'name' => $data['name'],
            'as_of_date' => $data['as_of_date'],
            'definition' => json_encode($data['definition'], JSON_THROW_ON_ERROR),
            'payload' => json_encode($data['payload'], JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['id' => $id], 201);
    }

    public function annotation(Request $request): JsonResponse
    {
        return $this->storeTextItem($request, 'report_annotations', true);
    }

    public function comment(Request $request): JsonResponse
    {
        return $this->storeTextItem($request, 'report_comments', false);
    }

    private function storeTextItem(
        Request $request,
        string $table,
        bool $annotation,
    ): JsonResponse {
        abort_unless($this->canViewReports($request), 403);

        $data = $request->validate([
            'report_id' => ['nullable', 'integer'],
            'anchor_key' => ['nullable', 'string', 'max:180'],
            'period_date' => ['nullable', 'date'],
            'body' => ['required', 'string', 'max:4000'],
            'mentions' => ['nullable', 'array', 'max:20'],
            'mentions.*' => ['integer'],
        ]);

        $organizationId = app(TenantContext::class)->id();

        $row = [
            'organization_id' => $organizationId,
            'report_id' => $data['report_id'] ?? null,
            'created_by' => $request->user()->id,
            'anchor_key' => $data['anchor_key'] ?? null,
            'body' => $data['body'],
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if ($annotation) {
            $row['period_date'] = $data['period_date'] ?? null;
        } else {
            $mentions = collect($data['mentions'] ?? [])
                ->map(fn ($id): int => (int) $id)
                ->unique()
                ->values();

            $validMentions = DB::table('memberships')
                ->where('organization_id', $organizationId)
                ->whereIn('user_id', $mentions->all())
                ->pluck('user_id')
                ->map(fn ($id): int => (int) $id)
                ->values();

            $row['mentions'] = json_encode(
                $validMentions->all(),
                JSON_THROW_ON_ERROR,
            );
        }

        $id = DB::table($table)->insertGetId($row);

        if (! $annotation) {
            $reportName = null;

            if (! empty($data['report_id'])) {
                $reportName = DB::table('custom_reports')
                    ->where('organization_id', $organizationId)
                    ->where('id', (int) $data['report_id'])
                    ->value('name');
            }

            $senderName = (string) ($request->user()->name ?? 'Team member');

            foreach ($validMentions ?? collect() as $mentionedUserId) {
                if ((int) $mentionedUserId === (int) $request->user()->id) {
                    continue;
                }

                DB::table('workspace_notifications')->insertOrIgnore([
                    'organization_id' => $organizationId,
                    'user_id' => (int) $mentionedUserId,
                    'event_key' => 'report-comment:'.$id.':'.$mentionedUserId,
                    'kind' => 'report_mention',
                    'category' => 'activity',
                    'data' => json_encode([
                        'name' => $senderName,
                        'detail' => $reportName
                            ?: ($data['anchor_key'] ?? 'Report'),
                    ], JSON_THROW_ON_ERROR),
                    'url' => '/app/reports/studio',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        return response()->json(['id' => $id], 201);
    }

    public function approval(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);
        $data = $request->validate([
            'report_id' => ['required', 'integer'],
            'status' => ['required', Rule::in(['pending', 'approved', 'rejected'])],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        DB::table('report_approvals')->updateOrInsert(
            [
                'organization_id' => app(TenantContext::class)->id(),
                'report_id' => $data['report_id'],
            ],
            [
                'reviewed_by' => $request->user()->id,
                'status' => $data['status'],
                'note' => $data['note'] ?? null,
                'reviewed_at' => $data['status'] === 'pending' ? null : now(),
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return response()->json(['ok' => true]);
    }

    public function saveTarget(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);

        $data = $request->validate([
            'dimension_type' => ['required', Rule::in(['employee'])],
            'dimension_id' => ['required', 'integer'],
            'metric' => ['required', Rule::in(['sales'])],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'target_value' => ['required', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
        ]);

        $organizationId = app(TenantContext::class)->id();

        $isMember = DB::table('memberships')
            ->where('organization_id', $organizationId)
            ->where('user_id', $data['dimension_id'])
            ->exists();

        abort_unless($isMember, 422);

        DB::table('report_dimension_targets')->updateOrInsert(
            [
                'organization_id' => $organizationId,
                'dimension_type' => $data['dimension_type'],
                'dimension_id' => $data['dimension_id'],
                'metric' => $data['metric'],
                'period_start' => $data['period_start'],
                'period_end' => $data['period_end'],
            ],
            [
                'target_value' => $data['target_value'],
                'currency' => isset($data['currency'])
                    ? strtoupper($data['currency'])
                    : null,
                'created_by' => $request->user()->id,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );

        return response()->json(['ok' => true]);
    }

    public function preset(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'scope' => ['nullable', 'string', 'max:80'],
            'filters' => ['required', 'array'],
        ]);

        $id = DB::table('report_filter_presets')->insertGetId([
            'organization_id' => app(TenantContext::class)->id(),
            'user_id' => $request->user()->id,
            'name' => $data['name'],
            'scope' => $data['scope'] ?? 'reports',
            'filters' => json_encode($data['filters'], JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['id' => $id], 201);
    }

    public function board(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'layout' => ['required', 'array', 'min:4', 'max:8'],
            'shared' => ['nullable', 'boolean'],
        ]);

        $id = DB::table('report_boards')->insertGetId([
            'organization_id' => app(TenantContext::class)->id(),
            'created_by' => $request->user()->id,
            'name' => $data['name'],
            'layout' => json_encode($data['layout'], JSON_THROW_ON_ERROR),
            'shared' => (bool) ($data['shared'] ?? false),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['id' => $id], 201);
    }

    private function summary(Carbon $from, Carbon $to, string $feature): array
    {
        $org = app(TenantContext::class)->id();
        $sales = (float) DB::table('financial_documents')
            ->where('organization_id', $org)->where('kind', 'sale_invoice')
            ->whereBetween('issue_date', [$from, $to])->where('status', '!=', 'void')->sum('total');
        $purchases = (float) DB::table('financial_documents')
            ->where('organization_id', $org)->where('kind', 'purchase_invoice')
            ->whereBetween('issue_date', [$from, $to])->where('status', '!=', 'void')->sum('total');
        return [
            'columns' => ['metric', 'value'],
            'rows' => [
                ['metric' => 'Sales', 'value' => $sales],
                ['metric' => 'Purchases', 'value' => $purchases],
                ['metric' => 'Net', 'value' => $sales - $purchases],
            ],
            'meta' => ['mode' => $feature],
        ];
    }

    private function periodComparison(
        Carbon $from,
        Carbon $to,
        string $mode = 'previous_period',
    ): array {
        [$currentFrom, $currentTo, $previousFrom, $previousTo] = match ($mode) {
            'previous_month' => [
                $to->copy()->startOfMonth(),
                $to->copy()->endOfDay(),
                $to->copy()->subMonthNoOverflow()->startOfMonth(),
                $to->copy()->subMonthNoOverflow()->endOfMonth(),
            ],
            'previous_quarter' => [
                $to->copy()->startOfQuarter(),
                $to->copy()->endOfDay(),
                $to->copy()->subQuarter()->startOfQuarter(),
                $to->copy()->subQuarter()->endOfQuarter(),
            ],
            'ytd_previous_year' => [
                $to->copy()->startOfYear(),
                $to->copy()->endOfDay(),
                $to->copy()->subYear()->startOfYear(),
                $to->copy()->subYear()->endOfDay(),
            ],
            default => (function () use ($from, $to): array {
                $days = max(1, $from->diffInDays($to) + 1);
                $previousTo = $from->copy()->subDay()->endOfDay();

                return [
                    $from->copy(),
                    $to->copy(),
                    $previousTo->copy()->subDays($days - 1)->startOfDay(),
                    $previousTo,
                ];
            })(),
        };

        $current = $this->salesTotal($currentFrom, $currentTo);
        $previous = $this->salesTotal($previousFrom, $previousTo);
        $change = $previous == 0.0
            ? null
            : (($current - $previous) / abs($previous)) * 100;

        return [
            'columns' => ['period', 'sales', 'change_percent'],
            'rows' => [
                [
                    'period' => 'Current',
                    'sales' => $current,
                    'change_percent' => $change,
                ],
                [
                    'period' => 'Previous',
                    'sales' => $previous,
                    'change_percent' => null,
                ],
            ],
            'meta' => [
                'comparison_mode' => $mode,
                'current_from' => $currentFrom->toDateString(),
                'current_to' => $currentTo->toDateString(),
                'previous_from' => $previousFrom->toDateString(),
                'previous_to' => $previousTo->toDateString(),
            ],
        ];
    }

    private function varianceAnalysis(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $actualSales = $this->salesTotal($from, $to);
        $salesTarget = (float) (DB::table('kpi_targets')
            ->where('organization_id', $org)
            ->where('metric', 'sales')
            ->where('active', true)
            ->value('target_value') ?? 0);

        $actualPurchases = (float) DB::table('financial_documents')
            ->where('organization_id', $org)
            ->where('kind', 'purchase_invoice')
            ->where('status', '!=', 'void')
            ->whereBetween('issue_date', [$from, $to])
            ->sum('total');

        $budget = Schema::hasTable('department_budgets')
            ? (float) DB::table('department_budgets')
                ->where('organization_id', $org)
                ->whereBetween('month', [
                    $from->copy()->startOfMonth()->toDateString(),
                    $to->copy()->startOfMonth()->toDateString(),
                ])
                ->sum('amount')
            : 0.0;

        $salesVariance = $actualSales - $salesTarget;
        $budgetVariance = $budget - $actualPurchases;

        return [
            'columns' => [
                'metric',
                'actual',
                'budget',
                'target',
                'variance',
                'variance_percent',
            ],
            'rows' => [
                [
                    'metric' => 'Sales',
                    'actual' => $actualSales,
                    'budget' => null,
                    'target' => $salesTarget,
                    'variance' => $salesVariance,
                    'variance_percent' => $salesTarget == 0.0
                        ? null
                        : ($salesVariance / abs($salesTarget)) * 100,
                ],
                [
                    'metric' => 'Purchases',
                    'actual' => $actualPurchases,
                    'budget' => $budget,
                    'target' => null,
                    'variance' => $budgetVariance,
                    'variance_percent' => $budget == 0.0
                        ? null
                        : ($budgetVariance / abs($budget)) * 100,
                ],
            ],
            'meta' => [
                'largest_variance_metric' => abs($salesVariance) >= abs($budgetVariance)
                    ? 'Sales'
                    : 'Purchases',
            ],
        ];
    }

    private function profitability(Carbon $from, Carbon $to, string $dimension): array
    {
        $org = app(TenantContext::class)->id();

        $dimensionSql = match ($dimension) {
            'product' => "COALESCE(product.name, line.description, 'Unassigned')",
            'supplier' => "COALESCE(party.company_name, party.name, 'Unassigned')",
            'employee' => "COALESCE(employee.name, 'Unassigned')",
            'branch' => "COALESCE(doc.branch_label, 'Unassigned')",
            'warehouse' => "COALESCE(warehouse.name, 'Unassigned')",
            'month' => "DATE_FORMAT(doc.issue_date, '%Y-%m')",
            default => "COALESCE(party.company_name, party.name, 'Unassigned')",
        };

        $baseQuery = fn (string $kind) => DB::table('financial_document_lines as line')
            ->join('financial_documents as doc', 'doc.id', '=', 'line.financial_document_id')
            ->leftJoin('products as product', 'product.id', '=', 'line.product_id')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->leftJoin('users as employee', 'employee.id', '=', 'doc.created_by')
            ->leftJoin('warehouses as warehouse', 'warehouse.id', '=', 'line.warehouse_id')
            ->where('doc.organization_id', $org)
            ->where('doc.kind', $kind)
            ->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to]);

        $returns = $baseQuery('sale_credit_note')
            ->selectRaw("$dimensionSql as dimension")
            ->selectRaw('SUM(line.line_total) as return_amount')
            ->selectRaw('SUM(line.quantity) as return_quantity')
            ->groupByRaw($dimensionSql)
            ->get()
            ->keyBy(fn ($row) => (string) $row->dimension);

        $rows = $baseQuery('sale_invoice')
            ->selectRaw("$dimensionSql as dimension")
            ->selectRaw('SUM(line.line_subtotal - line.line_discount) as revenue')
            ->selectRaw('SUM(COALESCE(line.cost_price_snapshot, product.cost_price, 0) * line.quantity) as cost')
            ->selectRaw('SUM(line.line_discount) as discounts')
            ->selectRaw('SUM(line.quantity) as quantity')
            ->groupByRaw($dimensionSql)
            ->orderByDesc('revenue')
            ->limit(200)
            ->get()
            ->map(function ($row) use ($returns): array {
                $dimension = (string) $row->dimension;
                $revenue = (float) $row->revenue;
                $cost = (float) $row->cost;
                $returnAmount = (float) ($returns->get($dimension)?->return_amount ?? 0);
                $returnQuantity = (float) ($returns->get($dimension)?->return_quantity ?? 0);
                $netRevenue = $revenue - $returnAmount;
                $profit = $netRevenue - $cost;
                $quantity = (float) $row->quantity;

                return [
                    'dimension' => $dimension,
                    'revenue' => $revenue,
                    'discounts' => (float) $row->discounts,
                    'returns' => $returnAmount,
                    'return_quantity' => $returnQuantity,
                    'cost' => $cost,
                    'gross_profit' => $profit,
                    'margin_percent' => $netRevenue == 0.0
                        ? 0
                        : ($profit / $netRevenue) * 100,
                    'quantity' => $quantity,
                    'average_selling_price' => $quantity == 0.0
                        ? 0
                        : $netRevenue / $quantity,
                ];
            })
            ->values();

        return [
            'columns' => [
                'dimension',
                'revenue',
                'discounts',
                'returns',
                'cost',
                'gross_profit',
                'margin_percent',
                'quantity',
                'average_selling_price',
            ],
            'rows' => $rows,
        ];
    }

    private function marginLeakage(Carbon $from, Carbon $to): array
    {
        $base = collect($this->profitability($from, $to, 'product')['rows']);
        $rows = $base->map(function ($row) {
            $reasons = [];
            if ($row['margin_percent'] < 10) $reasons[] = 'Low margin';
            if ($row['discounts'] > $row['revenue'] * 0.15) $reasons[] = 'High discounts';
            if ($row['cost'] > $row['revenue'] * 0.8) $reasons[] = 'High cost';
            return [...$row, 'leakage_reasons' => implode(', ', $reasons)];
        })->filter(fn ($row) => $row['leakage_reasons'] !== '')->values();
        return ['columns' => ['dimension', 'revenue', 'cost', 'discounts', 'gross_profit', 'margin_percent', 'leakage_reasons'], 'rows' => $rows];
    }

    private function movementReport(
        Carbon $from,
        Carbon $to,
        string $kind,
    ): array {
        $org = app(TenantContext::class)->id();
        $openingDate = $from->copy()->subDay()->endOfDay();

        $opening = (float) $this
            ->historicalOutstandingDocuments(
                $kind,
                $openingDate,
            )
            ->sum('historical_balance');

        $newDocuments = (float) DB::table('financial_documents')
            ->where('organization_id', $org)
            ->where('kind', $kind)
            ->where('status', '!=', 'void')
            ->whereBetween('issue_date', [$from, $to])
            ->sum('total');

        $cash = (float) DB::table('cash_allocations as allocation')
            ->join(
                'cash_movements as movement',
                'movement.id',
                '=',
                'allocation.cash_movement_id',
            )
            ->join(
                'financial_documents as document',
                'document.id',
                '=',
                'allocation.financial_document_id',
            )
            ->where('allocation.organization_id', $org)
            ->where('document.kind', $kind)
            ->where('movement.status', 'posted')
            ->whereBetween('movement.movement_date', [$from, $to])
            ->sum('allocation.amount');

        $creditKind = $kind === 'sale_invoice'
            ? 'sale_credit_note'
            : 'purchase_credit_note';

        $credits = (float) DB::table('financial_documents')
            ->where('organization_id', $org)
            ->where('kind', $creditKind)
            ->where('status', '!=', 'void')
            ->whereBetween('issue_date', [$from, $to])
            ->sum('total');

        $closing = (float) $this
            ->historicalOutstandingDocuments(
                $kind,
                $to,
            )
            ->sum('historical_balance');

        return [
            'columns' => [
                'opening',
                'new_documents',
                'cash',
                'credits',
                'closing',
            ],
            'rows' => [[
                'opening' => $opening,
                'new_documents' => $newDocuments,
                'cash' => $cash,
                'credits' => $credits,
                'closing' => $closing,
            ]],
            'meta' => [
                'reconciled_closing' => $opening
                    + $newDocuments
                    - $cash
                    - $credits,
            ],
        ];
    }

    private function agingTrend(Carbon $from, Carbon $to): array
    {
        $cursor = $from->copy()->startOfMonth();
        $rows = [];

        while (
            $cursor <= $to
            && count($rows) < 24
        ) {
            $end = $cursor
                ->copy()
                ->endOfMonth()
                ->min($to)
                ->endOfDay();

            $buckets = [
                'current_0_30' => 0.0,
                'days_31_60' => 0.0,
                'days_61_90' => 0.0,
                'over_90' => 0.0,
            ];

            foreach (
                $this->historicalOutstandingDocuments(
                    'sale_invoice',
                    $end,
                )
                as $document
            ) {
                $balance =
                    (float) $document['historical_balance'];

                if (
                    empty($document['due_date'])
                    || Carbon::parse($document['due_date'])->greaterThan($end)
                ) {
                    $buckets['current_0_30'] += $balance;
                    continue;
                }

                $overdueDays =
                    Carbon::parse($document['due_date'])
                        ->startOfDay()
                        ->diffInDays(
                            $end->copy()->startOfDay(),
                        );

                if ($overdueDays <= 30) {
                    $buckets['current_0_30'] += $balance;
                } elseif ($overdueDays <= 60) {
                    $buckets['days_31_60'] += $balance;
                } elseif ($overdueDays <= 90) {
                    $buckets['days_61_90'] += $balance;
                } else {
                    $buckets['over_90'] += $balance;
                }
            }

            $rows[] = [
                'month' => $end->format('Y-m'),
                ...$buckets,
                'total_outstanding' => array_sum($buckets),
            ];

            $cursor->addMonth();
        }

        return [
            'columns' => [
                'month',
                'current_0_30',
                'days_31_60',
                'days_61_90',
                'over_90',
                'total_outstanding',
            ],
            'rows' => $rows,
        ];
    }

    /**
     * Reconstruct invoice balances as they actually stood at a historical date.
     *
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function historicalOutstandingDocuments(
        string $kind,
        Carbon $asOf,
    ) {
        $organizationId = app(TenantContext::class)->id();

        $documents = DB::table('financial_documents')
            ->where('organization_id', $organizationId)
            ->where('kind', $kind)
            ->where('status', '!=', 'void')
            ->whereDate('issue_date', '<=', $asOf)
            ->get([
                'id',
                'party_id',
                'number',
                'issue_date',
                'due_date',
                'total',
                'currency',
            ]);

        if ($documents->isEmpty()) {
            return collect();
        }

        $documentIds = $documents
            ->pluck('id')
            ->map(fn ($id): int => (int) $id)
            ->all();

        $allocations = DB::table('cash_allocations as allocation')
            ->join(
                'cash_movements as movement',
                'movement.id',
                '=',
                'allocation.cash_movement_id',
            )
            ->where('allocation.organization_id', $organizationId)
            ->whereIn('allocation.financial_document_id', $documentIds)
            ->where('movement.status', 'posted')
            ->whereDate('movement.movement_date', '<=', $asOf)
            ->groupBy('allocation.financial_document_id')
            ->selectRaw(
                'allocation.financial_document_id, SUM(allocation.amount) as allocated_total',
            )
            ->pluck(
                'allocated_total',
                'allocation.financial_document_id',
            );

        $creditKind = $kind === 'sale_invoice'
            ? 'sale_credit_note'
            : 'purchase_credit_note';

        $credits = DB::table('financial_documents')
            ->where('organization_id', $organizationId)
            ->where('kind', $creditKind)
            ->where('status', '!=', 'void')
            ->whereIn('root_document_id', $documentIds)
            ->whereDate('issue_date', '<=', $asOf)
            ->groupBy('root_document_id')
            ->selectRaw(
                'root_document_id, SUM(total) as credit_total',
            )
            ->pluck(
                'credit_total',
                'root_document_id',
            );

        return $documents
            ->map(function ($document) use ($allocations, $credits): array {
                $allocated = (float) (
                    $allocations[$document->id]
                    ?? 0
                );

                $credit = (float) (
                    $credits[$document->id]
                    ?? 0
                );

                return [
                    ...((array) $document),
                    'historical_balance' => max(
                        0,
                        (float) $document->total
                        - $allocated
                        - $credit,
                    ),
                ];
            })
            ->filter(
                fn (array $document): bool =>
                    $document['historical_balance'] > 0.0001,
            )
            ->values();
    }

    private function paymentBehavior(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $paymentDates = DB::table('cash_allocations as allocation')
            ->join('cash_movements as movement', 'movement.id', '=', 'allocation.cash_movement_id')
            ->where('allocation.organization_id', $org)
            ->where('movement.status', 'posted')
            ->groupBy('allocation.financial_document_id')
            ->selectRaw('allocation.financial_document_id, MAX(movement.movement_date) as last_payment_date, SUM(allocation.amount) as allocated_amount');

        $rows = DB::table('financial_documents as doc')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->leftJoinSub($paymentDates, 'payment', function ($join): void {
                $join->on('payment.financial_document_id', '=', 'doc.id');
            })
            ->where('doc.organization_id', $org)
            ->where('doc.kind', 'sale_invoice')
            ->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as customer")
            ->selectRaw('AVG(CASE WHEN doc.paid_total >= doc.total AND doc.due_date IS NOT NULL THEN GREATEST(DATEDIFF(COALESCE(payment.last_payment_date, doc.updated_at), doc.due_date), 0) ELSE NULL END) as avg_delay_days')
            ->selectRaw('MAX(CASE WHEN doc.due_date IS NOT NULL THEN GREATEST(DATEDIFF(COALESCE(payment.last_payment_date, CURRENT_DATE), doc.due_date), 0) ELSE 0 END) as max_delay_days')
            ->selectRaw('SUM(doc.balance_due) as outstanding')
            ->selectRaw('AVG(CASE WHEN doc.paid_total >= doc.total AND (doc.due_date IS NULL OR COALESCE(payment.last_payment_date, DATE(doc.updated_at)) <= doc.due_date) THEN 1 ELSE 0 END) * 100 as on_time_percent')
            ->selectRaw('SUM(doc.paid_total) / NULLIF(SUM(doc.total), 0) * 100 as payment_rate_percent')
            ->selectRaw('AVG(CASE WHEN doc.paid_total >= doc.total THEN 1 ELSE 0 END) * 100 as paid_invoice_percent')
            ->groupByRaw("COALESCE(party.company_name, party.name, 'Unassigned')")
            ->orderByDesc('outstanding')
            ->limit(200)
            ->get();

        return [
            'columns' => [
                'customer',
                'avg_delay_days',
                'on_time_percent',
                'max_delay_days',
                'outstanding',
                'payment_rate_percent',
                'paid_invoice_percent',
            ],
            'rows' => $rows,
        ];
    }

    private function cashflowForecast(Carbon $asOf): array
    {
        $org = app(TenantContext::class)->id();
        $rows = [];

        foreach ([7, 30, 60, 90] as $days) {
            $end = $asOf->copy()->addDays($days);

            $receivables = (float) DB::table('financial_documents')
                ->where('organization_id', $org)
                ->where('kind', 'sale_invoice')
                ->where('status', '!=', 'void')
                ->where('balance_due', '>', 0)
                ->whereBetween('due_date', [$asOf, $end])
                ->sum('balance_due');

            $payables = (float) DB::table('financial_documents')
                ->where('organization_id', $org)
                ->where('kind', 'purchase_invoice')
                ->where('status', '!=', 'void')
                ->where('balance_due', '>', 0)
                ->whereBetween('due_date', [$asOf, $end])
                ->sum('balance_due');

            $recurringExpenses = Schema::hasTable('recurring_expenses')
                ? (float) DB::table('recurring_expenses')
                    ->where('organization_id', $org)
                    ->where('active', true)
                    ->whereBetween('next_due_on', [$asOf, $end])
                    ->sum('amount')
                : 0.0;

            $paymentPlansIn = Schema::hasTable('payment_plans')
                ? (float) DB::table('payment_plans')
                    ->where('organization_id', $org)
                    ->where('active', true)
                    ->where('direction', 'in')
                    ->whereBetween('next_due_on', [$asOf, $end])
                    ->sum('amount')
                : 0.0;

            $paymentPlansOut = Schema::hasTable('payment_plans')
                ? (float) DB::table('payment_plans')
                    ->where('organization_id', $org)
                    ->where('active', true)
                    ->where('direction', 'out')
                    ->whereBetween('next_due_on', [$asOf, $end])
                    ->sum('amount')
                : 0.0;

            $expectedIn = $receivables + $paymentPlansIn;
            $expectedOut = $payables + $recurringExpenses + $paymentPlansOut;

            $rows[] = [
                'horizon_days' => $days,
                'receivables_in' => $receivables,
                'payment_plans_in' => $paymentPlansIn,
                'expected_in' => $expectedIn,
                'payables_out' => $payables,
                'recurring_expenses_out' => $recurringExpenses,
                'payment_plans_out' => $paymentPlansOut,
                'expected_out' => $expectedOut,
                'net_cashflow' => $expectedIn - $expectedOut,
            ];
        }

        return [
            'columns' => [
                'horizon_days',
                'receivables_in',
                'payment_plans_in',
                'expected_in',
                'payables_out',
                'recurring_expenses_out',
                'payment_plans_out',
                'expected_out',
                'net_cashflow',
            ],
            'rows' => $rows,
        ];
    }

    private function inventoryMovement(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $movementRows = DB::table('stock_movements as move')
            ->join('products as product', 'product.id', '=', 'move.product_id')
            ->join('warehouses as warehouse', 'warehouse.id', '=', 'move.warehouse_id')
            ->where('move.organization_id', $org)
            ->whereBetween('move.created_at', [$from, $to])
            ->selectRaw('move.product_id, move.warehouse_id, product.name as product, warehouse.name as warehouse')
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%purchase%' OR move.type LIKE '%receipt%' THEN GREATEST(move.quantity, 0) ELSE 0 END) as purchased")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%production%' THEN GREATEST(move.quantity, 0) ELSE 0 END) as produced")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%sale%' THEN ABS(LEAST(move.quantity, 0)) ELSE 0 END) as sold")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%adjust%' THEN move.quantity ELSE 0 END) as adjusted")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%return%' THEN move.quantity ELSE 0 END) as returned")
            ->selectRaw('SUM(move.quantity) as net_movement')
            ->groupBy('move.product_id', 'move.warehouse_id', 'product.name', 'warehouse.name')
            ->orderBy('product.name')
            ->limit(500)
            ->get()
            ->map(function ($row) use ($org, $from): array {
                $opening = (float) (DB::table('stock_movements')
                    ->where('organization_id', $org)
                    ->where('product_id', $row->product_id)
                    ->where('warehouse_id', $row->warehouse_id)
                    ->where('created_at', '<', $from)
                    ->latest('id')
                    ->value('balance_after') ?? 0);

                $net = (float) $row->net_movement;

                return [
                    'product' => $row->product,
                    'warehouse' => $row->warehouse,
                    'opening_stock' => $opening,
                    'purchased' => (float) $row->purchased,
                    'produced' => (float) $row->produced,
                    'sold' => (float) $row->sold,
                    'adjusted' => (float) $row->adjusted,
                    'returned' => (float) $row->returned,
                    'net_movement' => $net,
                    'closing_stock' => $opening + $net,
                ];
            });

        return [
            'columns' => [
                'product',
                'warehouse',
                'opening_stock',
                'purchased',
                'produced',
                'sold',
                'adjusted',
                'returned',
                'net_movement',
                'closing_stock',
            ],
            'rows' => $movementRows,
        ];
    }

    private function deadStock(Carbon $asOf): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('inventory_balances as balance')->join('products as product', 'product.id', '=', 'balance.product_id')
            ->join('warehouses as warehouse', 'warehouse.id', '=', 'balance.warehouse_id')
            ->leftJoin('stock_movements as move', function ($join) {
                $join->on('move.product_id', '=', 'balance.product_id')->on('move.warehouse_id', '=', 'balance.warehouse_id')->where('move.quantity', '<', 0);
            })
            ->where('balance.organization_id', $org)->where('balance.on_hand', '>', 0)
            ->selectRaw('product.name as product, warehouse.name as warehouse, balance.on_hand, product.cost_price')
            ->selectRaw('MAX(move.created_at) as last_outbound_at')
            ->groupBy('product.name', 'warehouse.name', 'balance.on_hand', 'product.cost_price')
            ->get()->map(function ($row) use ($asOf) {
                $last = $row->last_outbound_at ? Carbon::parse($row->last_outbound_at) : null;
                $days = $last ? $last->diffInDays($asOf) : 9999;
                return [
                    'product' => $row->product, 'warehouse' => $row->warehouse, 'on_hand' => (float) $row->on_hand,
                    'days_without_sale' => $days, 'frozen_capital' => (float) $row->on_hand * (float) $row->cost_price,
                    'bucket' => $days >= 180 ? '180+' : ($days >= 90 ? '90+' : ($days >= 60 ? '60+' : ($days >= 30 ? '30+' : '<30'))),
                ];
            })->filter(fn ($row) => $row['days_without_sale'] >= 30)->sortByDesc('days_without_sale')->values();
        return ['columns' => ['product', 'warehouse', 'on_hand', 'days_without_sale', 'bucket', 'frozen_capital'], 'rows' => $rows];
    }

    private function inventoryTurnover(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $movements = collect($this->inventoryMovement($from, $to)['rows'])
            ->groupBy('product');

        $sales = DB::table('financial_document_lines as line')
            ->join('financial_documents as doc', 'doc.id', '=', 'line.financial_document_id')
            ->leftJoin('products as product', 'product.id', '=', 'line.product_id')
            ->where('doc.organization_id', $org)
            ->where('doc.kind', 'sale_invoice')
            ->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw("COALESCE(product.name, line.description, 'Unassigned') as product")
            ->selectRaw('SUM(line.quantity) as sold_quantity')
            ->selectRaw('SUM(COALESCE(line.cost_price_snapshot, product.cost_price, 0) * line.quantity) as cost_of_goods_sold')
            ->selectRaw('AVG(COALESCE(line.cost_price_snapshot, product.cost_price, 0)) as avg_cost')
            ->groupByRaw("COALESCE(product.name, line.description, 'Unassigned')")
            ->get()
            ->map(function ($row) use ($movements): array {
                $movementRows = $movements->get($row->product, collect());
                $openingQuantity = (float) $movementRows->sum('opening_stock');
                $closingQuantity = (float) $movementRows->sum('closing_stock');
                $avgCost = (float) $row->avg_cost;
                $averageInventoryValue = (($openingQuantity + $closingQuantity) / 2) * $avgCost;
                $cogs = (float) $row->cost_of_goods_sold;
                $turnover = $averageInventoryValue == 0.0
                    ? 0
                    : $cogs / $averageInventoryValue;

                return [
                    'product' => $row->product,
                    'sold_quantity' => (float) $row->sold_quantity,
                    'cost_of_goods_sold' => $cogs,
                    'average_inventory_value' => $averageInventoryValue,
                    'turnover' => $turnover,
                    'days_on_hand' => $turnover == 0.0
                        ? null
                        : 365 / $turnover,
                ];
            })
            ->sortByDesc('turnover')
            ->values();

        return [
            'columns' => [
                'product',
                'sold_quantity',
                'cost_of_goods_sold',
                'average_inventory_value',
                'turnover',
                'days_on_hand',
            ],
            'rows' => $sales,
        ];
    }

    private function stockValuation(?Carbon $asOf = null): array
    {
        $org = app(TenantContext::class)->id();
        $asOf = ($asOf ?? now())->copy()->endOfDay();

        $latestMovementIds = DB::table('stock_movements')
            ->where('organization_id', $org)
            ->where('created_at', '<=', $asOf)
            ->selectRaw('MAX(id) as id')
            ->groupBy('product_id', 'warehouse_id')
            ->pluck('id');

        if ($latestMovementIds->isEmpty()) {
            return [
                'columns' => [
                    'warehouse',
                    'product',
                    'on_hand',
                    'cost_price',
                    'stock_value',
                    'snapshot_date',
                ],
                'rows' => [],
                'meta' => ['snapshot_at' => $asOf->toIso8601String()],
            ];
        }

        $rows = DB::table('stock_movements as movement')
            ->join('products as product', 'product.id', '=', 'movement.product_id')
            ->join('warehouses as warehouse', 'warehouse.id', '=', 'movement.warehouse_id')
            ->where('movement.organization_id', $org)
            ->whereIn('movement.id', $latestMovementIds->all())
            ->selectRaw('warehouse.name as warehouse')
            ->selectRaw('product.name as product')
            ->selectRaw('movement.balance_after as on_hand')
            ->selectRaw('product.cost_price as cost_price')
            ->selectRaw('movement.balance_after * product.cost_price as stock_value')
            ->selectRaw('? as snapshot_date', [$asOf->toDateString()])
            ->orderByDesc('stock_value')
            ->limit(500)
            ->get();

        return [
            'columns' => [
                'warehouse',
                'product',
                'on_hand',
                'cost_price',
                'stock_value',
                'snapshot_date',
            ],
            'rows' => $rows,
            'meta' => [
                'snapshot_at' => $asOf->toIso8601String(),
                'valuation_note' => 'Historical quantity with the current catalog cost when no historical cost layer exists.',
            ],
        ];
    }

    private function purchasePriceVariance(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $groups = DB::table('financial_document_lines as line')
            ->join('financial_documents as doc', 'doc.id', '=', 'line.financial_document_id')
            ->leftJoin('products as product', 'product.id', '=', 'line.product_id')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)
            ->where('doc.kind', 'purchase_invoice')
            ->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to])
            ->orderBy('doc.issue_date')
            ->orderBy('line.id')
            ->get([
                'line.product_id',
                'doc.party_id',
                'doc.issue_date',
                'line.unit_price',
                'line.quantity',
                'product.name as product_name',
                'line.description',
                'party.company_name',
                'party.name as party_name',
            ])
            ->groupBy(fn ($row): string => ($row->product_id ?? 'line-'.$row->description).'|'.($row->party_id ?? 0))
            ->map(function ($items): array {
                $first = $items->first();
                $last = $items->last();
                $previous = (float) $first->unit_price;
                $current = (float) $last->unit_price;
                $quantity = (float) $items->sum('quantity');
                $variance = $current - $previous;

                return [
                    'product' => $first->product_name ?: $first->description,
                    'supplier' => $first->company_name ?: $first->party_name ?: 'Unassigned',
                    'previous_price' => $previous,
                    'current_price' => $current,
                    'avg_price' => (float) $items->avg('unit_price'),
                    'quantity' => $quantity,
                    'variance' => $variance,
                    'variance_percent' => $previous == 0.0
                        ? null
                        : ($variance / abs($previous)) * 100,
                    'profit_impact' => $variance * $quantity,
                    'first_purchase_date' => $first->issue_date,
                    'latest_purchase_date' => $last->issue_date,
                ];
            })
            ->sortByDesc(fn (array $row): float => abs((float) $row['profit_impact']))
            ->values();

        return [
            'columns' => [
                'product',
                'supplier',
                'previous_price',
                'current_price',
                'avg_price',
                'quantity',
                'variance',
                'variance_percent',
                'profit_impact',
                'first_purchase_date',
                'latest_purchase_date',
            ],
            'rows' => $groups,
        ];
    }

    private function supplierPerformance(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $rows = DB::table('financial_documents as doc')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)
            ->where('doc.kind', 'purchase_invoice')
            ->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw('doc.party_id as party_id')
            ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as supplier")
            ->selectRaw('COUNT(*) as invoices')
            ->selectRaw('SUM(doc.total) as purchases')
            ->selectRaw('SUM(doc.balance_due) as outstanding')
            ->selectRaw('AVG(DATEDIFF(COALESCE(doc.due_date, doc.issue_date), doc.issue_date)) as avg_payment_terms_days')
            ->selectRaw('AVG(CASE WHEN doc.balance_due > 0 AND doc.due_date < CURRENT_DATE THEN DATEDIFF(CURRENT_DATE, doc.due_date) ELSE 0 END) as avg_delay_days')
            ->groupBy('doc.party_id', 'party.company_name', 'party.name')
            ->orderByDesc('purchases')
            ->get()
            ->map(function ($row) use ($org, $from, $to): array {
                $returns = (float) DB::table('financial_documents')
                    ->where('organization_id', $org)
                    ->where('kind', 'purchase_credit_note')
                    ->where('status', '!=', 'void')
                    ->where('party_id', $row->party_id)
                    ->whereBetween('issue_date', [$from, $to])
                    ->sum('total');

                $returnCount = (int) DB::table('financial_documents')
                    ->where('organization_id', $org)
                    ->where('kind', 'purchase_credit_note')
                    ->where('status', '!=', 'void')
                    ->where('party_id', $row->party_id)
                    ->whereBetween('issue_date', [$from, $to])
                    ->count();

                $problemCount = Schema::hasTable('return_requests')
                    ? (int) DB::table('return_requests as request')
                        ->join('financial_documents as source', 'source.id', '=', 'request.financial_document_id')
                        ->where('request.organization_id', $org)
                        ->where('source.party_id', $row->party_id)
                        ->where('request.kind', 'purchase')
                        ->whereBetween('request.created_at', [$from, $to])
                        ->count()
                    : 0;

                $lateOrders = Schema::hasTable('trade_documents')
                    ? (int) DB::table('trade_documents as trade')
                        ->where('trade.organization_id', $org)
                        ->where('trade.party_id', $row->party_id)
                        ->where('trade.kind', 'purchase_order')
                        ->whereNotNull('trade.expected_on')
                        ->whereDate('trade.expected_on', '<', today())
                        ->whereNotIn('trade.status', ['completed', 'closed', 'cancelled'])
                        ->count()
                    : 0;

                return [
                    'supplier' => $row->supplier,
                    'invoices' => (int) $row->invoices,
                    'purchases' => (float) $row->purchases,
                    'outstanding' => (float) $row->outstanding,
                    'avg_payment_terms_days' => (float) $row->avg_payment_terms_days,
                    'avg_delay_days' => (float) $row->avg_delay_days,
                    'supplier_returns' => $returns,
                    'supplier_return_count' => $returnCount,
                    'late_orders' => $lateOrders,
                    'problem_count' => $problemCount,
                ];
            });

        return [
            'columns' => [
                'supplier',
                'invoices',
                'purchases',
                'outstanding',
                'avg_payment_terms_days',
                'avg_delay_days',
                'supplier_returns',
                'supplier_return_count',
                'late_orders',
                'problem_count',
            ],
            'rows' => $rows,
        ];
    }

    private function salesPerformance(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $rows = DB::table('financial_documents as doc')
            ->leftJoin('users as user', 'user.id', '=', 'doc.created_by')
            ->leftJoin('financial_document_lines as line', 'line.financial_document_id', '=', 'doc.id')
            ->leftJoin('products as product', 'product.id', '=', 'line.product_id')
            ->where('doc.organization_id', $org)
            ->where('doc.kind', 'sale_invoice')
            ->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw('doc.created_by as employee_id')
            ->selectRaw("COALESCE(user.name, 'Unassigned') as employee")
            ->selectRaw('COUNT(DISTINCT doc.id) as deals')
            ->selectRaw('SUM(DISTINCT doc.total) as sales')
            ->selectRaw('SUM(DISTINCT doc.discount_total) as discounts')
            ->selectRaw('SUM(DISTINCT doc.paid_total) as collections')
            ->selectRaw('AVG(DISTINCT doc.total) as average_deal')
            ->selectRaw('SUM((line.line_subtotal - line.line_discount) - (COALESCE(line.cost_price_snapshot, product.cost_price, 0) * line.quantity)) as gross_profit')
            ->groupBy('doc.created_by', 'user.name')
            ->orderByDesc('sales')
            ->get()
            ->map(function ($row) use ($org, $from, $to): array {
                $returns = (float) DB::table('financial_documents')
                    ->where('organization_id', $org)
                    ->where('kind', 'sale_credit_note')
                    ->where('status', '!=', 'void')
                    ->where('created_by', $row->employee_id)
                    ->whereBetween('issue_date', [$from, $to])
                    ->sum('total');

                $target = 0.0;

                if (
                    Schema::hasTable('report_dimension_targets')
                    && $row->employee_id
                ) {
                    $target = (float) (DB::table('report_dimension_targets')
                        ->where('organization_id', $org)
                        ->where('dimension_type', 'employee')
                        ->where('dimension_id', $row->employee_id)
                        ->where('metric', 'sales')
                        ->whereDate('period_start', '<=', $to)
                        ->whereDate('period_end', '>=', $from)
                        ->sum('target_value'));
                }

                if ($target == 0.0) {
                    $target = (float) (DB::table('kpi_targets')
                        ->where('organization_id', $org)
                        ->where('metric', 'sales')
                        ->where('active', true)
                        ->value('target_value') ?? 0);
                }

                $sales = (float) $row->sales;

                return [
                    'employee' => $row->employee,
                    'sales' => $sales,
                    'gross_profit' => (float) $row->gross_profit,
                    'average_deal' => (float) $row->average_deal,
                    'collections' => (float) $row->collections,
                    'discounts' => (float) $row->discounts,
                    'returns' => $returns,
                    'deals' => (int) $row->deals,
                    'target' => $target ?: null,
                    'target_achievement_percent' => $target == 0.0
                        ? null
                        : ($sales / $target) * 100,
                ];
            });

        return [
            'columns' => [
                'employee',
                'sales',
                'gross_profit',
                'average_deal',
                'collections',
                'discounts',
                'returns',
                'deals',
                'target',
                'target_achievement_percent',
            ],
            'rows' => $rows,
            'meta' => [
                'target_scope' => 'workspace_sales_target',
            ],
        ];
    }

    private function discountAnalysis(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $rows = DB::table('financial_document_lines as line')
            ->join('financial_documents as doc', 'doc.id', '=', 'line.financial_document_id')
            ->leftJoin('products as product', 'product.id', '=', 'line.product_id')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->leftJoin('users as employee', 'employee.id', '=', 'doc.created_by')
            ->where('doc.organization_id', $org)
            ->where('doc.kind', 'sale_invoice')
            ->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw("COALESCE(employee.name, 'Unassigned') as employee")
            ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as customer")
            ->selectRaw("COALESCE(product.name, line.description, 'Unassigned') as product")
            ->selectRaw('SUM(line.line_subtotal) as gross_before_discount')
            ->selectRaw('SUM(line.line_discount) as discounts')
            ->selectRaw('SUM(line.line_subtotal - line.line_discount) as revenue')
            ->selectRaw('SUM((line.line_subtotal - line.line_discount) - (COALESCE(line.cost_price_snapshot, product.cost_price, 0) * line.quantity)) as gross_profit')
            ->selectRaw('SUM(line.quantity) as quantity')
            ->selectRaw('AVG(CASE WHEN line.line_discount > 0 THEN line.quantity END) as avg_quantity_discounted')
            ->selectRaw('AVG(CASE WHEN line.line_discount = 0 THEN line.quantity END) as avg_quantity_regular')
            ->groupByRaw("COALESCE(employee.name, 'Unassigned')")
            ->groupByRaw("COALESCE(party.company_name, party.name, 'Unassigned')")
            ->groupByRaw("COALESCE(product.name, line.description, 'Unassigned')")
            ->get()
            ->map(function ($row): array {
                $gross = (float) $row->gross_before_discount;
                $discounts = (float) $row->discounts;
                $revenue = (float) $row->revenue;
                $profit = (float) $row->gross_profit;
                $discountedQty = (float) ($row->avg_quantity_discounted ?? 0);
                $regularQty = (float) ($row->avg_quantity_regular ?? 0);

                $effect = 'mixed';
                if ($discounts > 0 && $discountedQty > $regularQty * 1.10 && $profit > 0) {
                    $effect = 'volume_up';
                } elseif ($discounts > 0 && ($profit <= 0 || ($revenue > 0 && ($profit / $revenue) < 0.10))) {
                    $effect = 'profit_leak';
                }

                return [
                    'employee' => $row->employee,
                    'customer' => $row->customer,
                    'product' => $row->product,
                    'revenue' => $revenue,
                    'discounts' => $discounts,
                    'discount_percent' => $gross == 0.0 ? 0 : ($discounts / $gross) * 100,
                    'gross_profit' => $profit,
                    'margin_percent' => $revenue == 0.0 ? 0 : ($profit / $revenue) * 100,
                    'quantity' => (float) $row->quantity,
                    'avg_quantity_discounted' => $discountedQty,
                    'avg_quantity_regular' => $regularQty,
                    'discount_effect' => $effect,
                ];
            })
            ->sortByDesc('discounts')
            ->values();

        return [
            'columns' => [
                'employee',
                'customer',
                'product',
                'revenue',
                'discounts',
                'discount_percent',
                'gross_profit',
                'margin_percent',
                'quantity',
                'avg_quantity_discounted',
                'avg_quantity_regular',
                'discount_effect',
            ],
            'rows' => $rows,
        ];
    }

    private function returnsAnalysis(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $credits = DB::table('financial_documents as doc')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)
            ->whereIn('doc.kind', ['sale_credit_note', 'purchase_credit_note'])
            ->whereBetween('doc.issue_date', [$from, $to])
            ->where('doc.status', '!=', 'void')
            ->selectRaw('doc.kind')
            ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as party")
            ->selectRaw('COUNT(*) as count')
            ->selectRaw('SUM(doc.total) as amount')
            ->groupBy('doc.kind', 'party.company_name', 'party.name')
            ->get()
            ->map(fn ($row): array => [
                'kind' => $row->kind,
                'party' => $row->party,
                'reason' => null,
                'count' => (int) $row->count,
                'total_quantity' => null,
                'amount' => (float) $row->amount,
            ]);

        $requests = Schema::hasTable('return_requests')
            ? DB::table('return_requests as request')
                ->leftJoin('parties as party', 'party.id', '=', 'request.party_id')
                ->leftJoin('financial_documents as source', 'source.id', '=', 'request.financial_document_id')
                ->where('request.organization_id', $org)
                ->whereBetween('request.created_at', [$from, $to])
                ->selectRaw("CONCAT(request.kind, '_return_request') as kind")
                ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as party")
                ->selectRaw('request.reason as reason')
                ->selectRaw('COUNT(*) as count')
                ->selectRaw('SUM(request.total_quantity) as total_quantity')
                ->selectRaw('SUM(COALESCE(source.total, 0)) as amount')
                ->groupBy('request.kind', 'request.reason', 'party.company_name', 'party.name')
                ->get()
                ->map(fn ($row): array => [
                    'kind' => $row->kind,
                    'party' => $row->party,
                    'reason' => $row->reason,
                    'count' => (int) $row->count,
                    'total_quantity' => (float) $row->total_quantity,
                    'amount' => (float) $row->amount,
                ])
            : collect();

        $sales = max(0.01, $this->salesTotal($from, $to));
        $returnAmount = (float) $credits
            ->filter(fn (array $row): bool => $row['kind'] === 'sale_credit_note')
            ->sum('amount');

        return [
            'columns' => [
                'kind',
                'party',
                'reason',
                'count',
                'total_quantity',
                'amount',
                'return_rate_percent',
            ],
            'rows' => $credits
                ->concat($requests)
                ->map(fn (array $row): array => [
                    ...$row,
                    'return_rate_percent' => str_starts_with((string) $row['kind'], 'sale')
                        ? ((float) $row['amount'] / $sales) * 100
                        : null,
                ])
                ->sortByDesc('amount')
                ->values(),
            'meta' => [
                'sales_return_rate_percent' => ($returnAmount / $sales) * 100,
            ],
        ];
    }

    private function taxCenter(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $rows = DB::table('financial_documents')
            ->where('organization_id', $org)
            ->whereBetween('issue_date', [$from, $to])
            ->where('status', '!=', 'void')
            ->whereIn('kind', [
                'sale_invoice',
                'purchase_invoice',
                'sale_credit_note',
                'purchase_credit_note',
            ])
            ->selectRaw("DATE_FORMAT(issue_date, '%Y-%m') as period")
            ->selectRaw("SUM(CASE WHEN kind = 'sale_invoice' THEN tax_total WHEN kind = 'sale_credit_note' THEN -tax_total ELSE 0 END) as sales_tax")
            ->selectRaw("SUM(CASE WHEN kind = 'purchase_invoice' THEN tax_total WHEN kind = 'purchase_credit_note' THEN -tax_total ELSE 0 END) as purchase_tax")
            ->selectRaw("SUM(CASE WHEN kind = 'sale_invoice' AND tax_total = 0 THEN total ELSE 0 END) as exempt_sales")
            ->selectRaw("SUM(CASE WHEN kind = 'purchase_invoice' AND tax_total = 0 THEN total ELSE 0 END) as exempt_purchases")
            ->groupByRaw("DATE_FORMAT(issue_date, '%Y-%m')")
            ->orderBy('period')
            ->get()
            ->map(function ($row): array {
                $salesTax = (float) $row->sales_tax;
                $purchaseTax = (float) $row->purchase_tax;

                return [
                    'period' => $row->period,
                    'sales_tax' => $salesTax,
                    'purchase_tax' => $purchaseTax,
                    'net_tax_position' => $salesTax - $purchaseTax,
                    'exempt_sales' => (float) $row->exempt_sales,
                    'exempt_purchases' => (float) $row->exempt_purchases,
                ];
            });

        return [
            'columns' => [
                'period',
                'sales_tax',
                'purchase_tax',
                'net_tax_position',
                'exempt_sales',
                'exempt_purchases',
            ],
            'rows' => $rows,
            'meta' => [
                'sales_tax' => (float) $rows->sum('sales_tax'),
                'purchase_tax' => (float) $rows->sum('purchase_tax'),
                'net_tax_position' => (float) $rows->sum('net_tax_position'),
                'exempt_sales' => (float) $rows->sum('exempt_sales'),
                'exempt_purchases' => (float) $rows->sum('exempt_purchases'),
            ],
        ];
    }

    private function auditReport(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();

        $rows = DB::table('finance_audit_events as audit')
            ->leftJoin('users as user', 'user.id', '=', 'audit.created_by')
            ->where('audit.organization_id', $org)
            ->whereBetween('audit.created_at', [$from, $to])
            ->select([
                'audit.id',
                'audit.auditable_type',
                'audit.auditable_id',
                'audit.action',
                'audit.reason',
                'audit.before_payload',
                'audit.after_payload',
                'audit.created_at',
                'user.name as changed_by',
            ])
            ->latest('audit.id')
            ->limit(500)
            ->get()
            ->map(fn ($row): array => [
                'id' => (int) $row->id,
                'auditable_type' => $row->auditable_type,
                'auditable_id' => (int) $row->auditable_id,
                'action' => $row->action,
                'reason' => $row->reason,
                'before_payload' => $row->before_payload,
                'after_payload' => $row->after_payload,
                'changed_by' => $row->changed_by,
                'created_at' => $row->created_at,
            ]);

        return [
            'columns' => [
                'id',
                'auditable_type',
                'auditable_id',
                'action',
                'reason',
                'before_payload',
                'after_payload',
                'changed_by',
                'created_at',
            ],
            'rows' => $rows,
        ];
    }

    private function exceptionReport(Carbon $from, Carbon $to, array $exception): array
    {
        $metric = $exception['metric'] ?? 'margin';
        $operator = $exception['operator'] ?? 'lt';
        $value = (float) ($exception['value'] ?? ($metric === 'overdue_days' ? 30 : 10));

        $base = match ($metric) {
            'stock' => collect($this->stockValuation($to)['rows'])
                ->map(fn ($row) => (array) $row)
                ->map(fn ($row) => [...$row, '_metric' => (float) $row['on_hand']]),
            'discount' => collect($this->discountAnalysis($from, $to)['rows'])
                ->map(fn ($row) => (array) $row)
                ->map(fn ($row) => [...$row, '_metric' => (float) $row['discount_percent']]),
            'overdue_days' => DB::table('financial_documents as doc')
                ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
                ->where('doc.organization_id', app(TenantContext::class)->id())
                ->where('doc.kind', 'sale_invoice')
                ->where('doc.status', '!=', 'void')
                ->where('doc.balance_due', '>', 0)
                ->whereNotNull('doc.due_date')
                ->whereDate('doc.due_date', '<', today())
                ->selectRaw('doc.number, doc.due_date, doc.balance_due, doc.currency')
                ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as customer")
                ->selectRaw('DATEDIFF(CURRENT_DATE, doc.due_date) as overdue_days')
                ->get()
                ->map(fn ($row) => [...((array) $row), '_metric' => (float) $row->overdue_days]),
            default => collect($this->profitability($from, $to, 'customer')['rows'])
                ->map(fn ($row) => [...$row, '_metric' => (float) $row['margin_percent']]),
        };

        $passes = fn (float $candidate): bool => match ($operator) {
            'gt' => $candidate > $value,
            'gte' => $candidate >= $value,
            'lte' => $candidate <= $value,
            default => $candidate < $value,
        };

        $rows = collect($base)
            ->filter(fn ($row): bool => $passes((float) $row['_metric']))
            ->map(function ($row): array {
                $row = (array) $row;
                unset($row['_metric']);
                return $row;
            })
            ->values();

        return [
            'columns' => $rows->isEmpty() ? [] : array_keys($rows->first()),
            'rows' => $rows,
            'meta' => [
                'metric' => $metric,
                'operator' => $operator,
                'threshold' => $value,
            ],
        ];
    }

    private function topBottom(
        Carbon $from,
        Carbon $to,
        int $limit,
        string $dimension,
        string $metric,
    ): array {
        $rows = $this->analysisRows($from, $to, $dimension);
        $top = $rows
            ->sortByDesc(fn (array $row): float => (float) ($row[$metric] ?? 0))
            ->take($limit)
            ->values()
            ->map(fn (array $row): array => ['rank_type' => 'Top', ...$row]);

        $bottom = $rows
            ->sortBy(fn (array $row): float => (float) ($row[$metric] ?? 0))
            ->take($limit)
            ->values()
            ->map(fn (array $row): array => ['rank_type' => 'Bottom', ...$row]);

        return [
            'columns' => [
                'rank_type',
                'dimension',
                $metric,
                'revenue',
                'gross_profit',
                'margin_percent',
                'quantity',
            ],
            'rows' => $top->concat($bottom)->values(),
            'meta' => [
                'dimension' => $dimension,
                'metric' => $metric,
            ],
        ];
    }

    private function pareto(
        Carbon $from,
        Carbon $to,
        string $dimension,
        string $metric,
    ): array {
        $rows = $this->analysisRows($from, $to, $dimension)
            ->sortByDesc(fn (array $row): float => (float) ($row[$metric] ?? 0))
            ->values();

        $total = (float) $rows->sum(fn (array $row): float => max(0, (float) ($row[$metric] ?? 0)));
        $running = 0.0;

        $out = $rows->map(function (array $row) use (&$running, $total, $metric): array {
            $running += max(0, (float) ($row[$metric] ?? 0));

            return [
                ...$row,
                'cumulative_percent' => $total == 0.0
                    ? 0
                    : ($running / $total) * 100,
            ];
        });

        $contributors = 0;
        foreach ($out as $row) {
            $contributors++;
            if ((float) $row['cumulative_percent'] >= 80) {
                break;
            }
        }

        return [
            'columns' => [
                'dimension',
                $metric,
                'cumulative_percent',
            ],
            'rows' => $out,
            'meta' => [
                'dimension' => $dimension,
                'metric' => $metric,
                'contributors_to_80' => min($contributors, $out->count()),
                'total_entities' => $out->count(),
                'contributor_percent' => $out->count() === 0
                    ? 0
                    : (min($contributors, $out->count()) / $out->count()) * 100,
            ],
        ];
    }

    private function concentrationRisk(
        Carbon $from,
        Carbon $to,
        string $dimension,
        string $metric,
    ): array {
        $rows = $this->analysisRows($from, $to, $dimension);
        $total = (float) $rows->sum(fn (array $row): float => max(0, (float) ($row[$metric] ?? 0)));

        $out = $rows
            ->map(function (array $row) use ($total, $metric): array {
                $value = max(0, (float) ($row[$metric] ?? 0));

                return [
                    'dimension' => $row['dimension'],
                    $metric => $value,
                    'share_percent' => $total == 0.0
                        ? 0
                        : ($value / $total) * 100,
                ];
            })
            ->sortByDesc('share_percent')
            ->values();

        return [
            'columns' => ['dimension', $metric, 'share_percent'],
            'rows' => $out,
            'meta' => [
                'dimension' => $dimension,
                'metric' => $metric,
                'largest_share_percent' => (float) ($out->first()['share_percent'] ?? 0),
            ],
        ];
    }

    /**
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function analysisRows(
        Carbon $from,
        Carbon $to,
        string $dimension,
    ) {
        if ($dimension === 'supplier') {
            return collect($this->supplierPerformance($from, $to)['rows'])
                ->map(fn ($row): array => [
                    'dimension' => $row['supplier'] ?? $row->supplier ?? 'Unassigned',
                    'revenue' => (float) ($row['purchases'] ?? $row->purchases ?? 0),
                    'gross_profit' => 0.0,
                    'margin_percent' => 0.0,
                    'quantity' => (float) ($row['invoices'] ?? $row->invoices ?? 0),
                    'discounts' => 0.0,
                    'outstanding' => (float) ($row['outstanding'] ?? $row->outstanding ?? 0),
                ])
                ->values();
        }

        return collect($this->profitability($from, $to, $dimension)['rows'])
            ->map(fn ($row): array => [
                ...((array) $row),
                'outstanding' => (float) (((array) $row)['outstanding'] ?? 0),
            ])
            ->values();
    }

    private function scenario(Carbon $from, Carbon $to, array $scenario): array
    {
        $base = collect($this->profitability($from, $to, 'customer')['rows']);
        $sales = (float) $base->sum('revenue');
        $cost = (float) $base->sum('cost');
        $salesRate = 1 + ((float) ($scenario['sales_percent'] ?? 0) / 100);
        $costRate = 1 + ((float) ($scenario['cost_percent'] ?? 0) / 100);
        $fxRate = 1 + ((float) ($scenario['currency_percent'] ?? 0) / 100);
        $scenarioSales = $sales * $salesRate * $fxRate;
        $scenarioCost = $cost * $costRate * $fxRate;
        return ['columns' => ['case', 'sales', 'cost', 'profit', 'margin_percent'], 'rows' => [
            ['case' => 'Baseline', 'sales' => $sales, 'cost' => $cost, 'profit' => $sales - $cost, 'margin_percent' => $sales == 0 ? 0 : (($sales - $cost) / $sales) * 100],
            ['case' => 'Scenario', 'sales' => $scenarioSales, 'cost' => $scenarioCost, 'profit' => $scenarioSales - $scenarioCost, 'margin_percent' => $scenarioSales == 0 ? 0 : (($scenarioSales - $scenarioCost) / $scenarioSales) * 100],
        ]];
    }

    private function cashConversionCycle(Carbon $asOf): array
    {
        $org = app(TenantContext::class)->id();
        $sales90 = max(0.01, (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', 'sale_invoice')->whereBetween('issue_date', [$asOf->copy()->subDays(90), $asOf])->sum('total'));
        $purchases90 = max(0.01, (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', 'purchase_invoice')->whereBetween('issue_date', [$asOf->copy()->subDays(90), $asOf])->sum('total'));
        $ar = (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', 'sale_invoice')->where('balance_due', '>', 0)->sum('balance_due');
        $ap = (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', 'purchase_invoice')->where('balance_due', '>', 0)->sum('balance_due');
        $inventory = (float) DB::table('inventory_balances as b')->join('products as p', 'p.id', '=', 'b.product_id')->where('b.organization_id', $org)->sum(DB::raw('b.on_hand * p.cost_price'));
        $dso = ($ar / $sales90) * 90;
        $dpo = ($ap / $purchases90) * 90;
        $inventoryDays = ($inventory / $purchases90) * 90;
        return ['columns' => ['dso', 'dpo', 'inventory_days', 'cash_conversion_cycle'], 'rows' => [[
            'dso' => $dso, 'dpo' => $dpo, 'inventory_days' => $inventoryDays, 'cash_conversion_cycle' => $dso + $inventoryDays - $dpo,
        ]]];
    }

    private function saveReportVersion(
        int $reportId,
        int $userId,
    ): void {
        if (! Schema::hasTable('report_versions')) {
            return;
        }

        $organizationId = app(TenantContext::class)->id();

        $report = DB::table('custom_reports')
            ->where('organization_id', $organizationId)
            ->where('id', $reportId)
            ->first();

        if (! $report) {
            return;
        }

        $version = ((int) DB::table('report_versions')
            ->where('report_id', $reportId)
            ->max('version')) + 1;

        $definition = [
            ...((array) $report),
            'columns' => json_decode($report->columns ?: '[]', true) ?: [],
            'filters' => json_decode($report->filters ?: '[]', true) ?: [],
            'configuration' => $report->configuration
                ? (json_decode($report->configuration, true) ?: null)
                : null,
            'visualization' => $report->visualization
                ? (json_decode($report->visualization, true) ?: null)
                : null,
        ];

        DB::table('report_versions')->insert([
            'organization_id' => $organizationId,
            'report_id' => $reportId,
            'created_by' => $userId,
            'version' => $version,
            'definition' => json_encode($definition, JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function salesTotal(Carbon $from, Carbon $to): float
    {
        return (float) DB::table('financial_documents')->where('organization_id', app(TenantContext::class)->id())
            ->where('kind', 'sale_invoice')->where('status', '!=', 'void')->whereBetween('issue_date', [$from, $to])->sum('total');
    }

    private function canViewReports(Request $request): bool
    {
        return FinanceAuthorization::allows($request->user(), 'finance.sales.view')
            || FinanceAuthorization::allows($request->user(), 'finance.purchases.view')
            || FinanceAuthorization::allows($request->user(), 'finance.cash.view');
    }

    private function catalog(): array
    {
        $items = [
            ['interactive-drilldown', 'Interactive Drill-Down Reports', 'تقارير الاستكشاف التفاعلي', 'builder'],
            ['pivot-builder', 'Pivot Report Builder', 'منشئ التقارير المحورية', 'builder'],
            ['formula-builder', 'Calculated Fields / Formula Builder', 'الحقول المحسوبة ومنشئ المعادلات', 'builder'],
            ['chart-builder', 'Report Chart Builder', 'منشئ الرسوم البيانية للتقارير', 'builder'],
            ['dashboard-mode', 'Report Dashboard Mode', 'لوحة التقارير التنفيذية', 'collaboration'],
            ['period-comparison', 'Period Comparison Engine', 'محرك مقارنة الفترات', 'analysis'],
            ['variance-analysis', 'Variance Analysis', 'تحليل الانحرافات', 'analysis'],
            ['profitability-explorer', 'Profitability Explorer', 'مستكشف الربحية', 'profitability'],
            ['margin-leakage', 'Margin Leakage Report', 'تقرير تسرب هامش الربح', 'profitability'],
            ['customer-profitability', 'Customer Profitability Report', 'تقرير ربحية العملاء', 'profitability'],
            ['product-profitability', 'Product Profitability Report', 'تقرير ربحية المنتجات', 'profitability'],
            ['cash-conversion-cycle', 'Cash Conversion Cycle Report', 'تقرير دورة تحويل النقد', 'cash'],
            ['receivables-movement', 'Receivables Movement Report', 'تقرير حركة الذمم المدينة', 'cash'],
            ['payables-movement', 'Payables Movement Report', 'تقرير حركة الذمم الدائنة', 'cash'],
            ['aging-trend', 'Aging Trend Report', 'تقرير اتجاه أعمار الذمم', 'cash'],
            ['payment-behavior', 'Payment Behavior Report', 'تقرير سلوك الدفع', 'cash'],
            ['cashflow-forecast', 'Cashflow Forecast Report', 'تقرير توقع التدفق النقدي', 'cash'],
            ['inventory-movement', 'Inventory Movement Report', 'تقرير حركة المخزون', 'inventory'],
            ['dead-stock', 'Dead Stock / Slow Moving Report', 'تقرير المخزون الراكد والبطيء', 'inventory'],
            ['inventory-turnover', 'Inventory Turnover Report', 'تقرير دوران المخزون', 'inventory'],
            ['stock-valuation', 'Stock Valuation Report', 'تقرير تقييم المخزون', 'inventory'],
            ['purchase-price-variance', 'Purchase Price Variance Report', 'تقرير انحراف أسعار الشراء', 'purchasing'],
            ['supplier-performance', 'Supplier Performance Report', 'تقرير أداء الموردين', 'purchasing'],
            ['sales-performance', 'Sales Performance Report', 'تقرير أداء المبيعات', 'sales'],
            ['discount-analysis', 'Discount Analysis Report', 'تقرير تحليل الخصومات', 'sales'],
            ['returns-analysis', 'Returns & Credit Notes Analysis', 'تحليل المرتجعات والإشعارات الدائنة', 'sales'],
            ['tax-center', 'Tax Report Center', 'مركز التقارير الضريبية', 'compliance'],
            ['audit-report', 'Audit Report', 'تقرير التدقيق', 'compliance'],
            ['exception-builder', 'Exception Report Builder', 'منشئ تقارير الاستثناءات', 'analysis'],
            ['top-bottom', 'Top / Bottom Analysis', 'تحليل الأعلى والأدنى', 'analysis'],
            ['pareto', 'Pareto 80/20 Report', 'تقرير باريتو 80/20', 'analysis'],
            ['concentration-risk', 'Concentration Risk Report', 'تقرير مخاطر التركّز', 'analysis'],
            ['scenario-reports', 'Scenario Reports', 'تقارير السيناريوهات', 'analysis'],
            ['snapshot-freeze', 'Report Snapshot / Freeze', 'تجميد وحفظ لقطة التقرير', 'collaboration'],
            ['annotations', 'Report Annotations', 'ملاحظات التقارير', 'collaboration'],
            ['comments', 'Report Comments & Collaboration', 'تعليقات التقارير والتعاون', 'collaboration'],
            ['approval', 'Report Approval / Sign-off', 'اعتماد التقرير والتوقيع', 'collaboration'],
            ['version-history', 'Report Version History', 'سجل نسخ التقرير', 'collaboration'],
            ['filter-presets', 'Saved Filter Presets', 'إعدادات الفلاتر المحفوظة', 'builder'],
            ['natural-language', 'Natural Language Report Search', 'البحث عن التقارير باللغة الطبيعية', 'builder'],
        ];

        return array_map(
            fn ($item, $index) => [
                'number' => $index + 1,
                'key' => $item[0],
                'title' => $item[1],
                'title_ar' => $item[2],
                'category' => $item[3],
            ],
            $items,
            array_keys($items),
        );
    }
}
