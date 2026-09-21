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
                ->get(['id', 'name', 'dataset', 'created_by', 'shared', 'visualization']),
            'annotations' => Schema::hasTable('report_annotations')
                ? DB::table('report_annotations')->where('organization_id', $org)->latest('id')->limit(30)->get()
                : [],
            'comments' => Schema::hasTable('report_comments')
                ? DB::table('report_comments')->where('organization_id', $org)->latest('id')->limit(30)->get()
                : [],
            'approvals' => Schema::hasTable('report_approvals')
                ? DB::table('report_approvals')->where('organization_id', $org)->latest('id')->limit(30)->get()
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
            'period-comparison' => $this->periodComparison($from, $to),
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
            'stock-valuation' => $this->stockValuation(),
            'purchase-price-variance' => $this->purchasePriceVariance($from, $to),
            'supplier-performance' => $this->supplierPerformance($from, $to),
            'sales-performance' => $this->salesPerformance($from, $to),
            'discount-analysis' => $this->discountAnalysis($from, $to),
            'returns-analysis' => $this->returnsAnalysis($from, $to),
            'tax-center' => $this->taxCenter($from, $to),
            'audit-report' => $this->auditReport($from, $to),
            'exception-builder' => $this->exceptionReport($from, $to, $data['exception'] ?? []),
            'top-bottom' => $this->topBottom($from, $to, (int) ($data['limit'] ?? 10)),
            'pareto' => $this->pareto($from, $to),
            'concentration-risk' => $this->concentrationRisk($from, $to),
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

        return response()->json(['ok' => true]);
    }

    public function naturalLanguage(Request $request): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);
        $data = $request->validate(['query' => ['required', 'string', 'max:500']]);
        $query = mb_strtolower($data['query']);

        $feature = str_contains($query, 'profit') || str_contains($query, 'ربح')
            ? 'profitability-explorer'
            : (str_contains($query, 'inventory') || str_contains($query, 'مخزون')
                ? 'inventory-movement'
                : (str_contains($query, 'cash') || str_contains($query, 'كاش') || str_contains($query, 'نقد')
                    ? 'cashflow-forecast'
                    : 'customer-profitability'));

        $dimension = str_contains($query, 'product') || str_contains($query, 'منتج')
            ? 'product'
            : (str_contains($query, 'supplier') || str_contains($query, 'مورد') ? 'supplier' : 'customer');

        $months = 6;
        if (preg_match('/(\d+)\s*(month|months|شهر|شهور)/u', $query, $match)) {
            $months = max(1, min(36, (int) $match[1]));
        }

        return response()->json(['data' => [
            'feature' => $feature,
            'dimension' => $dimension,
            'date_from' => now()->subMonths($months)->startOfDay()->toDateString(),
            'date_to' => now()->toDateString(),
            'explanation' => 'Review these settings before running the report.',
        ]]);
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

    private function storeTextItem(Request $request, string $table, bool $annotation): JsonResponse
    {
        abort_unless($this->canViewReports($request), 403);
        $data = $request->validate([
            'report_id' => ['nullable', 'integer'],
            'anchor_key' => ['nullable', 'string', 'max:180'],
            'period_date' => ['nullable', 'date'],
            'body' => ['required', 'string', 'max:4000'],
            'mentions' => ['nullable', 'array', 'max:20'],
            'mentions.*' => ['integer'],
        ]);

        $row = [
            'organization_id' => app(TenantContext::class)->id(),
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
            $row['mentions'] = json_encode($data['mentions'] ?? [], JSON_THROW_ON_ERROR);
        }

        $id = DB::table($table)->insertGetId($row);
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

    private function periodComparison(Carbon $from, Carbon $to): array
    {
        $days = max(1, $from->diffInDays($to) + 1);
        $previousTo = $from->copy()->subDay();
        $previousFrom = $previousTo->copy()->subDays($days - 1);
        $current = $this->salesTotal($from, $to);
        $previous = $this->salesTotal($previousFrom, $previousTo);
        $change = $previous == 0.0 ? null : (($current - $previous) / abs($previous)) * 100;

        return [
            'columns' => ['period', 'sales', 'change_percent'],
            'rows' => [
                ['period' => 'Current', 'sales' => $current, 'change_percent' => $change],
                ['period' => 'Previous', 'sales' => $previous, 'change_percent' => null],
            ],
            'meta' => ['previous_from' => $previousFrom->toDateString(), 'previous_to' => $previousTo->toDateString()],
        ];
    }

    private function varianceAnalysis(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $actual = $this->salesTotal($from, $to);
        $target = (float) (DB::table('kpi_targets')->where('organization_id', $org)
            ->where('metric', 'sales')->where('active', true)->value('target_value') ?? 0);
        $variance = $actual - $target;
        return [
            'columns' => ['metric', 'actual', 'target', 'variance', 'variance_percent'],
            'rows' => [[
                'metric' => 'Sales',
                'actual' => $actual,
                'target' => $target,
                'variance' => $variance,
                'variance_percent' => $target == 0.0 ? null : ($variance / abs($target)) * 100,
            ]],
        ];
    }

    private function profitability(Carbon $from, Carbon $to, string $dimension): array
    {
        $org = app(TenantContext::class)->id();
        $q = DB::table('financial_document_lines as line')
            ->join('financial_documents as doc', 'doc.id', '=', 'line.financial_document_id')
            ->leftJoin('products as product', 'product.id', '=', 'line.product_id')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->leftJoin('users as employee', 'employee.id', '=', 'doc.created_by')
            ->leftJoin('warehouses as warehouse', 'warehouse.id', '=', 'line.warehouse_id')
            ->where('doc.organization_id', $org)->where('doc.kind', 'sale_invoice')
            ->where('doc.status', '!=', 'void')->whereBetween('doc.issue_date', [$from, $to]);

        $dimensionSql = match ($dimension) {
            'product' => "COALESCE(product.name, line.description, 'Unassigned')",
            'supplier' => "COALESCE(party.company_name, party.name, 'Unassigned')",
            'employee' => "COALESCE(employee.name, 'Unassigned')",
            'branch' => "COALESCE(doc.branch_label, 'Unassigned')",
            'warehouse' => "COALESCE(warehouse.name, 'Unassigned')",
            'month' => "DATE_FORMAT(doc.issue_date, '%Y-%m')",
            default => "COALESCE(party.company_name, party.name, 'Unassigned')",
        };

        $rows = $q->selectRaw("$dimensionSql as dimension")
            ->selectRaw('SUM(line.line_subtotal - line.line_discount) as revenue')
            ->selectRaw('SUM(COALESCE(line.cost_price_snapshot, product.cost_price, 0) * line.quantity) as cost')
            ->selectRaw('SUM(line.line_discount) as discounts')
            ->selectRaw('SUM(line.quantity) as quantity')
            ->groupByRaw($dimensionSql)->orderByDesc('revenue')->limit(200)->get()
            ->map(function ($row) {
                $revenue = (float) $row->revenue;
                $cost = (float) $row->cost;
                $profit = $revenue - $cost;
                return [
                    'dimension' => $row->dimension,
                    'revenue' => $revenue,
                    'discounts' => (float) $row->discounts,
                    'cost' => $cost,
                    'gross_profit' => $profit,
                    'margin_percent' => $revenue == 0.0 ? 0 : ($profit / $revenue) * 100,
                    'quantity' => (float) $row->quantity,
                ];
            })->values();

        return ['columns' => ['dimension', 'revenue', 'discounts', 'cost', 'gross_profit', 'margin_percent', 'quantity'], 'rows' => $rows];
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

    private function movementReport(Carbon $from, Carbon $to, string $kind): array
    {
        $org = app(TenantContext::class)->id();
        $opening = (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', $kind)
            ->where('issue_date', '<', $from)->where('status', '!=', 'void')->sum('balance_due');
        $new = (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', $kind)
            ->whereBetween('issue_date', [$from, $to])->where('status', '!=', 'void')->sum('total');
        $direction = $kind === 'sale_invoice' ? 'in' : 'out';
        $paid = (float) DB::table('cash_movements')->where('organization_id', $org)->where('direction', $direction)
            ->whereBetween('movement_date', [$from, $to])->where('status', 'posted')->sum('amount');
        $credits = (float) DB::table('financial_documents')->where('organization_id', $org)
            ->where('kind', $kind === 'sale_invoice' ? 'sale_credit_note' : 'purchase_credit_note')
            ->whereBetween('issue_date', [$from, $to])->where('status', '!=', 'void')->sum('total');
        return [
            'columns' => ['opening', 'new_documents', 'cash', 'credits', 'closing'],
            'rows' => [[
                'opening' => $opening,
                'new_documents' => $new,
                'cash' => $paid,
                'credits' => $credits,
                'closing' => $opening + $new - $paid - $credits,
            ]],
        ];
    }

    private function agingTrend(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $cursor = $from->copy()->startOfMonth();
        $rows = [];
        while ($cursor <= $to && count($rows) < 24) {
            $end = $cursor->copy()->endOfMonth()->min($to);
            $cut90 = $end->copy()->subDays(90)->toDateString();
            $amount = (float) DB::table('financial_documents')->where('organization_id', $org)
                ->where('kind', 'sale_invoice')->where('status', '!=', 'void')->where('balance_due', '>', 0)
                ->whereDate('due_date', '<=', $cut90)->whereDate('issue_date', '<=', $end)->sum('balance_due');
            $rows[] = ['month' => $end->format('Y-m'), 'over_90' => $amount];
            $cursor->addMonth();
        }
        return ['columns' => ['month', 'over_90'], 'rows' => $rows];
    }

    private function paymentBehavior(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('financial_documents as doc')
            ->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)->where('doc.kind', 'sale_invoice')->where('doc.status', '!=', 'void')
            ->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as customer")
            ->selectRaw('AVG(CASE WHEN doc.paid_total >= doc.total AND doc.due_date IS NOT NULL THEN GREATEST(DATEDIFF(COALESCE(doc.updated_at, doc.issue_date), doc.due_date), 0) ELSE NULL END) as avg_delay_days')
            ->selectRaw('MAX(CASE WHEN doc.due_date IS NOT NULL THEN GREATEST(DATEDIFF(COALESCE(doc.updated_at, CURRENT_DATE), doc.due_date), 0) ELSE 0 END) as max_delay_days')
            ->selectRaw('SUM(doc.balance_due) as outstanding')
            ->selectRaw('AVG(CASE WHEN doc.paid_total >= doc.total AND (doc.due_date IS NULL OR DATE(doc.updated_at) <= doc.due_date) THEN 1 ELSE 0 END) * 100 as on_time_percent')
            ->groupByRaw("COALESCE(party.company_name, party.name, 'Unassigned')")
            ->orderByDesc('outstanding')->limit(200)->get();
        return ['columns' => ['customer', 'avg_delay_days', 'on_time_percent', 'max_delay_days', 'outstanding'], 'rows' => $rows];
    }

    private function cashflowForecast(Carbon $asOf): array
    {
        $org = app(TenantContext::class)->id();
        $rows = [];
        foreach ([7, 30, 60, 90] as $days) {
            $end = $asOf->copy()->addDays($days);
            $in = (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', 'sale_invoice')
                ->where('balance_due', '>', 0)->whereBetween('due_date', [$asOf, $end])->sum('balance_due');
            $out = (float) DB::table('financial_documents')->where('organization_id', $org)->where('kind', 'purchase_invoice')
                ->where('balance_due', '>', 0)->whereBetween('due_date', [$asOf, $end])->sum('balance_due');
            $rows[] = ['horizon_days' => $days, 'expected_in' => $in, 'expected_out' => $out, 'net_cashflow' => $in - $out];
        }
        return ['columns' => ['horizon_days', 'expected_in', 'expected_out', 'net_cashflow'], 'rows' => $rows];
    }

    private function inventoryMovement(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('stock_movements as move')->join('products as product', 'product.id', '=', 'move.product_id')
            ->join('warehouses as warehouse', 'warehouse.id', '=', 'move.warehouse_id')
            ->where('move.organization_id', $org)->whereBetween('move.created_at', [$from, $to])
            ->selectRaw('product.name as product, warehouse.name as warehouse')
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%purchase%' OR move.type LIKE '%receipt%' THEN move.quantity ELSE 0 END) as purchased")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%production%' THEN move.quantity ELSE 0 END) as produced")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%sale%' THEN ABS(move.quantity) ELSE 0 END) as sold")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%adjust%' THEN move.quantity ELSE 0 END) as adjusted")
            ->selectRaw("SUM(CASE WHEN move.type LIKE '%return%' THEN move.quantity ELSE 0 END) as returned")
            ->selectRaw('SUM(move.quantity) as net_movement')
            ->groupBy('product.name', 'warehouse.name')->orderBy('product.name')->limit(500)->get();
        return ['columns' => ['product', 'warehouse', 'purchased', 'produced', 'sold', 'adjusted', 'returned', 'net_movement'], 'rows' => $rows];
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
        $rows = DB::table('products as product')->leftJoin('inventory_balances as balance', 'balance.product_id', '=', 'product.id')
            ->leftJoin('financial_document_lines as line', 'line.product_id', '=', 'product.id')
            ->leftJoin('financial_documents as doc', function ($join) use ($from, $to) {
                $join->on('doc.id', '=', 'line.financial_document_id')->where('doc.kind', 'sale_invoice')->whereBetween('doc.issue_date', [$from, $to]);
            })
            ->where('product.organization_id', $org)
            ->selectRaw('product.name as product, SUM(DISTINCT COALESCE(balance.on_hand,0)) as on_hand')
            ->selectRaw('SUM(CASE WHEN doc.id IS NOT NULL THEN line.quantity ELSE 0 END) as sold_quantity')
            ->groupBy('product.id', 'product.name')->get()->map(function ($row) {
                $onHand = max(0.0001, (float) $row->on_hand);
                return ['product' => $row->product, 'sold_quantity' => (float) $row->sold_quantity, 'on_hand' => (float) $row->on_hand, 'turnover' => (float) $row->sold_quantity / $onHand];
            })->sortByDesc('turnover')->values();
        return ['columns' => ['product', 'sold_quantity', 'on_hand', 'turnover'], 'rows' => $rows];
    }

    private function stockValuation(): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('inventory_balances as balance')->join('products as product', 'product.id', '=', 'balance.product_id')
            ->join('warehouses as warehouse', 'warehouse.id', '=', 'balance.warehouse_id')->where('balance.organization_id', $org)
            ->selectRaw('warehouse.name as warehouse, product.name as product, balance.on_hand, product.cost_price, balance.on_hand * product.cost_price as value')
            ->orderByDesc('value')->limit(500)->get();
        return ['columns' => ['warehouse', 'product', 'on_hand', 'cost_price', 'value'], 'rows' => $rows, 'meta' => ['snapshot_at' => now()->toIso8601String()]];
    }

    private function purchasePriceVariance(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('financial_document_lines as line')->join('financial_documents as doc', 'doc.id', '=', 'line.financial_document_id')
            ->join('products as product', 'product.id', '=', 'line.product_id')->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)->where('doc.kind', 'purchase_invoice')->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw("product.name as product, COALESCE(party.company_name, party.name, 'Unassigned') as supplier")
            ->selectRaw('MIN(line.unit_price) as min_price, MAX(line.unit_price) as max_price, AVG(line.unit_price) as avg_price, SUM(line.quantity) as quantity')
            ->groupBy('product.name', 'party.company_name', 'party.name')->get()->map(function ($row) {
                $min = (float) $row->min_price; $max = (float) $row->max_price;
                return ['product' => $row->product, 'supplier' => $row->supplier, 'min_price' => $min, 'max_price' => $max, 'variance' => $max - $min, 'variance_percent' => $min == 0 ? null : (($max - $min) / $min) * 100, 'quantity' => (float) $row->quantity];
            })->sortByDesc('variance')->values();
        return ['columns' => ['product', 'supplier', 'min_price', 'max_price', 'variance', 'variance_percent', 'quantity'], 'rows' => $rows];
    }

    private function supplierPerformance(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('financial_documents as doc')->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)->where('doc.kind', 'purchase_invoice')->whereBetween('doc.issue_date', [$from, $to])
            ->selectRaw("COALESCE(party.company_name, party.name, 'Unassigned') as supplier")
            ->selectRaw('COUNT(*) as invoices, SUM(doc.total) as purchases, SUM(doc.balance_due) as outstanding, AVG(DATEDIFF(COALESCE(doc.due_date, doc.issue_date), doc.issue_date)) as avg_payment_terms_days')
            ->groupByRaw("COALESCE(party.company_name, party.name, 'Unassigned')")->orderByDesc('purchases')->get();
        return ['columns' => ['supplier', 'invoices', 'purchases', 'outstanding', 'avg_payment_terms_days'], 'rows' => $rows];
    }

    private function salesPerformance(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('financial_documents as doc')->leftJoin('users as user', 'user.id', '=', 'doc.created_by')
            ->where('doc.organization_id', $org)->where('doc.kind', 'sale_invoice')->whereBetween('doc.issue_date', [$from, $to])->where('doc.status', '!=', 'void')
            ->selectRaw("COALESCE(user.name, 'Unassigned') as employee, SUM(doc.total) as sales, SUM(doc.discount_total) as discounts, SUM(doc.paid_total) as collections, COUNT(*) as deals, AVG(doc.total) as average_deal")
            ->groupByRaw("COALESCE(user.name, 'Unassigned')")->orderByDesc('sales')->get();
        return ['columns' => ['employee', 'sales', 'collections', 'discounts', 'deals', 'average_deal'], 'rows' => $rows];
    }

    private function discountAnalysis(Carbon $from, Carbon $to): array
    {
        $profit = collect($this->profitability($from, $to, 'customer')['rows']);
        return ['columns' => ['dimension', 'revenue', 'discounts', 'gross_profit', 'margin_percent'], 'rows' => $profit->sortByDesc('discounts')->values()];
    }

    private function returnsAnalysis(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('financial_documents as doc')->leftJoin('parties as party', 'party.id', '=', 'doc.party_id')
            ->where('doc.organization_id', $org)->whereIn('doc.kind', ['sale_credit_note', 'purchase_credit_note'])
            ->whereBetween('doc.issue_date', [$from, $to])->where('doc.status', '!=', 'void')
            ->selectRaw("doc.kind, COALESCE(party.company_name, party.name, 'Unassigned') as party, COUNT(*) as count, SUM(doc.total) as amount")
            ->groupBy('doc.kind', 'party.company_name', 'party.name')->orderByDesc('amount')->get();
        return ['columns' => ['kind', 'party', 'count', 'amount'], 'rows' => $rows];
    }

    private function taxCenter(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('financial_documents')->where('organization_id', $org)->whereBetween('issue_date', [$from, $to])->where('status', '!=', 'void')
            ->selectRaw("CASE WHEN kind LIKE 'sale%' THEN 'sales_tax' WHEN kind LIKE 'purchase%' THEN 'purchase_tax' ELSE 'other' END as tax_side")
            ->selectRaw('SUM(tax_total) as tax, SUM(total) as gross')->groupBy('tax_side')->get();
        $sales = (float) ($rows->firstWhere('tax_side', 'sales_tax')->tax ?? 0);
        $purchases = (float) ($rows->firstWhere('tax_side', 'purchase_tax')->tax ?? 0);
        return ['columns' => ['tax_side', 'tax', 'gross'], 'rows' => $rows, 'meta' => ['net_tax_position' => $sales - $purchases]];
    }

    private function auditReport(Carbon $from, Carbon $to): array
    {
        $org = app(TenantContext::class)->id();
        $rows = DB::table('finance_audit_events as audit')->leftJoin('users as user', 'user.id', '=', 'audit.created_by')
            ->where('audit.organization_id', $org)->whereBetween('audit.created_at', [$from, $to])
            ->select('audit.id', 'audit.auditable_type', 'audit.auditable_id', 'audit.action', 'audit.reason', 'audit.before_payload', 'audit.after_payload', 'audit.created_at', 'user.name as changed_by')
            ->latest('audit.id')->limit(500)->get();
        return ['columns' => ['id', 'auditable_type', 'auditable_id', 'action', 'reason', 'changed_by', 'created_at'], 'rows' => $rows];
    }

    private function exceptionReport(Carbon $from, Carbon $to, array $exception): array
    {
        $metric = $exception['metric'] ?? 'margin';
        $operator = $exception['operator'] ?? 'lt';
        $value = (float) ($exception['value'] ?? 10);
        $base = match ($metric) {
            'stock' => collect($this->stockValuation()['rows'])->map(fn ($r) => (array) $r)->map(fn ($r) => [...$r, '_metric' => (float) $r['on_hand']]),
            'discount' => collect($this->discountAnalysis($from, $to)['rows'])->map(fn ($r) => (array) $r)->map(fn ($r) => [...$r, '_metric' => (float) $r['discounts']]),
            default => collect($this->profitability($from, $to, 'customer')['rows'])->map(fn ($r) => [...$r, '_metric' => (float) $r['margin_percent']]),
        };
        $passes = fn (float $v) => match ($operator) { 'gt' => $v > $value, 'gte' => $v >= $value, 'lte' => $v <= $value, default => $v < $value };
        return ['columns' => array_values(array_filter(array_keys((array) ($base->first() ?? [])), fn ($k) => $k !== '_metric')), 'rows' => $base->filter(fn ($r) => $passes((float) $r['_metric']))->map(function ($r) { unset($r['_metric']); return $r; })->values()];
    }

    private function topBottom(Carbon $from, Carbon $to, int $limit): array
    {
        $rows = collect($this->profitability($from, $to, 'customer')['rows']);
        return ['columns' => ['rank_type', 'dimension', 'revenue', 'gross_profit', 'margin_percent'], 'rows' => $rows->take($limit)->map(fn ($r) => ['rank_type' => 'Top', ...$r])->concat($rows->sortBy('revenue')->take($limit)->map(fn ($r) => ['rank_type' => 'Bottom', ...$r]))->values()];
    }

    private function pareto(Carbon $from, Carbon $to): array
    {
        $rows = collect($this->profitability($from, $to, 'customer')['rows'])->sortByDesc('revenue')->values();
        $total = (float) $rows->sum('revenue');
        $running = 0.0;
        $out = $rows->map(function ($row) use (&$running, $total) {
            $running += (float) $row['revenue'];
            return [...$row, 'cumulative_percent' => $total == 0.0 ? 0 : ($running / $total) * 100];
        });
        $contributors = $out->takeUntil(fn ($r) => $r['cumulative_percent'] >= 80)->count() + ($out->isNotEmpty() ? 1 : 0);
        return ['columns' => ['dimension', 'revenue', 'cumulative_percent'], 'rows' => $out, 'meta' => ['contributors_to_80' => min($contributors, $out->count()), 'total_entities' => $out->count()]];
    }

    private function concentrationRisk(Carbon $from, Carbon $to): array
    {
        $rows = collect($this->profitability($from, $to, 'customer')['rows']);
        $total = (float) $rows->sum('revenue');
        return ['columns' => ['dimension', 'revenue', 'share_percent'], 'rows' => $rows->map(fn ($r) => ['dimension' => $r['dimension'], 'revenue' => $r['revenue'], 'share_percent' => $total == 0.0 ? 0 : ((float) $r['revenue'] / $total) * 100])->sortByDesc('share_percent')->values()];
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
            ['interactive-drilldown', 'Interactive Drill-Down Reports', 'builder'],
            ['pivot-builder', 'Pivot Report Builder', 'builder'],
            ['formula-builder', 'Calculated Fields / Formula Builder', 'builder'],
            ['chart-builder', 'Report Chart Builder', 'builder'],
            ['dashboard-mode', 'Report Dashboard Mode', 'collaboration'],
            ['period-comparison', 'Period Comparison Engine', 'analysis'],
            ['variance-analysis', 'Variance Analysis', 'analysis'],
            ['profitability-explorer', 'Profitability Explorer', 'profitability'],
            ['margin-leakage', 'Margin Leakage Report', 'profitability'],
            ['customer-profitability', 'Customer Profitability Report', 'profitability'],
            ['product-profitability', 'Product Profitability Report', 'profitability'],
            ['cash-conversion-cycle', 'Cash Conversion Cycle Report', 'cash'],
            ['receivables-movement', 'Receivables Movement Report', 'cash'],
            ['payables-movement', 'Payables Movement Report', 'cash'],
            ['aging-trend', 'Aging Trend Report', 'cash'],
            ['payment-behavior', 'Payment Behavior Report', 'cash'],
            ['cashflow-forecast', 'Cashflow Forecast Report', 'cash'],
            ['inventory-movement', 'Inventory Movement Report', 'inventory'],
            ['dead-stock', 'Dead Stock / Slow Moving Report', 'inventory'],
            ['inventory-turnover', 'Inventory Turnover Report', 'inventory'],
            ['stock-valuation', 'Stock Valuation Report', 'inventory'],
            ['purchase-price-variance', 'Purchase Price Variance Report', 'purchasing'],
            ['supplier-performance', 'Supplier Performance Report', 'purchasing'],
            ['sales-performance', 'Sales Performance Report', 'sales'],
            ['discount-analysis', 'Discount Analysis Report', 'sales'],
            ['returns-analysis', 'Returns & Credit Notes Analysis', 'sales'],
            ['tax-center', 'Tax Report Center', 'compliance'],
            ['audit-report', 'Audit Report', 'compliance'],
            ['exception-builder', 'Exception Report Builder', 'analysis'],
            ['top-bottom', 'Top / Bottom Analysis', 'analysis'],
            ['pareto', 'Pareto 80/20 Report', 'analysis'],
            ['concentration-risk', 'Concentration Risk Report', 'analysis'],
            ['scenario-reports', 'Scenario Reports', 'analysis'],
            ['snapshot-freeze', 'Report Snapshot / Freeze', 'collaboration'],
            ['annotations', 'Report Annotations', 'collaboration'],
            ['comments', 'Report Comments & Collaboration', 'collaboration'],
            ['approval', 'Report Approval / Sign-off', 'collaboration'],
            ['version-history', 'Report Version History', 'collaboration'],
            ['filter-presets', 'Saved Filter Presets', 'builder'],
            ['natural-language', 'Natural Language Report Search', 'builder'],
        ];
        return array_map(fn ($item, $index) => ['number' => $index + 1, 'key' => $item[0], 'title' => $item[1], 'category' => $item[2]], $items, array_keys($items));
    }
}
