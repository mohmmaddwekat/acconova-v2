import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    BarChart3,
    Bookmark,
    Boxes,
    Calculator,
    CheckCircle2,
    ChevronRight,
    CircleDollarSign,
    Download,
    FileCheck2,
    Filter,
    GitCompareArrows,
    GripVertical,
    LineChart,
    MessageSquareText,
    Play,
    Printer,
    Save,
    Search,
    Snowflake,
    Sparkles,
    Table2,
    Target,
    Trash2,
    TrendingUp,
    XCircle,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type DragEvent,
} from 'react';

type Feature = {
    number: number;
    key: string;
    title: string;
    title_ar: string;
    category: string;
};

type Result = {
    feature: string;
    date_from: string;
    date_to: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
    meta?: Record<string, unknown>;
};

type FilterRow = {
    field: string;
    operator: 'eq' | 'neq' | 'contains' | 'gte' | 'lte';
    value: string;
};

type FormulaDefinition = {
    id: string;
    name: string;
    expression: string;
};

type PivotConfiguration = {
    row: string;
    column: string;
    value: string;
    aggregation: 'sum' | 'avg' | 'count';
};

type SavedReport = {
    id: number;
    name: string;
    dataset: string;
    columns: string[];
    filters: FilterRow[];
    group_by: string | null;
    sort_by: string | null;
    sort_direction: 'asc' | 'desc';
    shared: boolean;
    can_edit: boolean;
    visualization?: {
        type?: 'table' | 'bar' | 'line' | 'area' | 'pie' | 'donut';
        x?: string | null;
        y?: string | null;
    } | null;
    configuration?: {
        formulas?: FormulaDefinition[];
        pivot?: PivotConfiguration;
    } | null;
};

type Board = {
    id: number;
    name: string;
    layout: Array<{ report_id: number; order: number }>;
    shared: boolean;
};

type Snapshot = {
    id: number;
    name: string;
    as_of_date: string;
    definition: string;
    payload: string;
};

type Preset = {
    id: number;
    name: string;
    scope: string;
    filters: string;
};

type CollaborationItem = Record<string, unknown> & {
    id?: number;
    report_id?: number | null;
    creator_name?: string | null;
    body?: string;
    created_at?: string;
};

type Approval = Record<string, unknown> & {
    id?: number;
    report_id?: number | null;
    status?: string;
    note?: string | null;
    reviewer_name?: string | null;
    reviewed_at?: string | null;
};

type Member = {
    id: number;
    name: string;
};

type DimensionTarget = {
    id: number;
    dimension_type: string;
    dimension_id: number | null;
    metric: string;
    period_start: string;
    period_end: string;
    target_value: string | number;
    currency: string | null;
};

type StudioIndex = {
    features: Feature[];
    snapshots: Snapshot[];
    presets: Preset[];
    boards: Board[];
    reports: SavedReport[];
    annotations: CollaborationItem[];
    comments: CollaborationItem[];
    approvals: Approval[];
    members: Member[];
    targets: DimensionTarget[];
};

type DrillResult = {
    breadcrumbs: Array<{ label: string; value: string }>;
    months: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
};

type BuilderColumn = {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date';
};

type BuilderRunResult = {
    columns: BuilderColumn[];
    rows: Array<Record<string, unknown>>;
    groups: Array<{
        key: string;
        count: number;
        totals: Record<string, string>;
        rows: Array<Record<string, unknown>>;
    }>;
    group_by: string | null;
    limited: boolean;
};

type BoardRunState = {
    reportId: number;
    status: 'loading' | 'ready' | 'error';
    result?: BuilderRunResult;
    error?: string;
};

const panel =
    'rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)]';

const input =
    'h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';

const button =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40';

const categoryIcon: Record<string, typeof BarChart3> = {
    builder: Table2,
    analysis: TrendingUp,
    profitability: CircleDollarSign,
    cash: GitCompareArrows,
    inventory: Boxes,
    purchasing: Calculator,
    sales: BarChart3,
    compliance: FileCheck2,
    collaboration: MessageSquareText,
};

const columnLabels: Record<string, [string, string]> = {
    metric: ['المؤشر', 'Metric'],
    value: ['القيمة', 'Value'],
    period: ['الفترة', 'Period'],
    sales: ['المبيعات', 'Sales'],
    purchases: ['المشتريات', 'Purchases'],
    change_percent: ['نسبة التغير', 'Change %'],
    actual: ['الفعلي', 'Actual'],
    budget: ['الميزانية', 'Budget'],
    target: ['الهدف', 'Target'],
    variance: ['الانحراف', 'Variance'],
    variance_percent: ['نسبة الانحراف', 'Variance %'],
    dimension: ['البعد', 'Dimension'],
    revenue: ['الإيرادات', 'Revenue'],
    discounts: ['الخصومات', 'Discounts'],
    discount_percent: ['نسبة الخصم', 'Discount %'],
    cost: ['التكلفة', 'Cost'],
    gross_profit: ['الربح الإجمالي', 'Gross profit'],
    margin_percent: ['هامش الربح %', 'Margin %'],
    quantity: ['الكمية', 'Quantity'],
    return_quantity: ['كمية المرتجعات', 'Return quantity'],
    average_selling_price: ['متوسط سعر البيع', 'Average selling price'],
    leakage_reasons: ['أسباب تسرب الهامش', 'Margin leakage reasons'],
    opening: ['الرصيد الافتتاحي', 'Opening'],
    new_documents: ['مستندات جديدة', 'New documents'],
    cash: ['النقد', 'Cash'],
    credits: ['الإشعارات الدائنة', 'Credits'],
    closing: ['الرصيد الختامي', 'Closing'],
    month: ['الشهر', 'Month'],
    over_90: ['أكثر من 90 يوم', '90+ days'],
    customer: ['العميل', 'Customer'],
    supplier: ['المورد', 'Supplier'],
    avg_delay_days: ['متوسط أيام التأخير', 'Average delay days'],
    on_time_percent: ['الدفع في الوقت %', 'On-time %'],
    max_delay_days: ['أكبر تأخير بالأيام', 'Maximum delay days'],
    outstanding: ['الرصيد المستحق', 'Outstanding'],
    payment_rate_percent: ['معدل السداد %', 'Payment rate %'],
    paid_invoice_percent: ['الفواتير المسددة %', 'Paid invoices %'],
    horizon_days: ['الفترة المتوقعة بالأيام', 'Forecast horizon days'],
    expected_in: ['تدفقات داخلة متوقعة', 'Expected inflow'],
    receivables_in: ['تحصيلات متوقعة', 'Receivables inflow'],
    payment_plans_in: ['خطط دفع داخلة', 'Payment-plan inflow'],
    expected_out: ['تدفقات خارجة متوقعة', 'Expected outflow'],
    payables_out: ['ذمم دائنة متوقعة', 'Payables outflow'],
    recurring_expenses_out: ['مصروفات متكررة', 'Recurring expenses'],
    payment_plans_out: ['خطط دفع خارجة', 'Payment-plan outflow'],
    net_cashflow: ['صافي التدفق النقدي', 'Net cashflow'],
    product: ['المنتج', 'Product'],
    warehouse: ['المستودع', 'Warehouse'],
    opening_stock: ['مخزون أول المدة', 'Opening stock'],
    purchased: ['المشتريات', 'Purchased'],
    produced: ['الإنتاج', 'Produced'],
    sold: ['المباع', 'Sold'],
    adjusted: ['التسويات', 'Adjusted'],
    returned: ['المرتجع', 'Returned'],
    returns: ['المرتجعات', 'Returns'],
    net_movement: ['صافي الحركة', 'Net movement'],
    closing_stock: ['مخزون آخر المدة', 'Closing stock'],
    on_hand: ['الكمية المتوفرة', 'On hand'],
    days_without_sale: ['أيام بدون بيع', 'Days without sale'],
    frozen_capital: ['رأس المال المجمّد', 'Frozen capital'],
    bucket: ['الفئة الزمنية', 'Bucket'],
    sold_quantity: ['الكمية المباعة', 'Sold quantity'],
    cost_of_goods_sold: ['تكلفة البضاعة المباعة', 'Cost of goods sold'],
    average_inventory_value: ['متوسط قيمة المخزون', 'Average inventory value'],
    turnover: ['معدل الدوران', 'Turnover'],
    days_on_hand: ['أيام المخزون المتوقعة', 'Days on hand'],
    cost_price: ['سعر التكلفة', 'Cost price'],
    stock_value: ['قيمة المخزون', 'Stock value'],
    snapshot_date: ['تاريخ اللقطة', 'Snapshot date'],
    previous_price: ['السعر السابق', 'Previous price'],
    current_price: ['السعر الحالي', 'Current price'],
    avg_price: ['متوسط سعر الشراء', 'Average price'],
    profit_impact: ['الأثر على الربحية', 'Profit impact'],
    first_purchase_date: ['تاريخ أول شراء', 'First purchase date'],
    latest_purchase_date: ['تاريخ آخر شراء', 'Latest purchase date'],
    invoices: ['عدد الفواتير', 'Invoices'],
    avg_payment_terms_days: ['متوسط فترة الدفع', 'Average payment terms'],
    supplier_returns: ['مرتجعات المورد', 'Supplier returns'],
    supplier_return_count: ['عدد مرتجعات المورد', 'Supplier return count'],
    late_orders: ['طلبات متأخرة', 'Late orders'],
    problem_count: ['عدد المشاكل', 'Problem count'],
    employee: ['الموظف', 'Employee'],
    collections: ['التحصيلات', 'Collections'],
    deals: ['عدد الصفقات', 'Deals'],
    average_deal: ['متوسط الصفقة', 'Average deal'],
    target_achievement_percent: ['تحقيق الهدف %', 'Target achievement %'],
    avg_quantity_discounted: ['متوسط الكمية مع الخصم', 'Avg quantity with discount'],
    avg_quantity_regular: ['متوسط الكمية بدون خصم', 'Avg quantity without discount'],
    discount_effect: ['أثر الخصم', 'Discount effect'],
    kind: ['النوع', 'Type'],
    party: ['الطرف', 'Party'],
    count: ['العدد', 'Count'],
    amount: ['القيمة', 'Amount'],
    reason: ['السبب', 'Reason'],
    total_quantity: ['إجمالي الكمية', 'Total quantity'],
    return_rate_percent: ['نسبة المرتجعات %', 'Return rate %'],
    tax_side: ['جانب الضريبة', 'Tax side'],
    tax: ['الضريبة', 'Tax'],
    gross: ['الإجمالي', 'Gross'],
    sales_tax: ['ضريبة المبيعات', 'Sales tax'],
    purchase_tax: ['ضريبة المشتريات', 'Purchase tax'],
    net_tax_position: ['صافي المركز الضريبي', 'Net tax position'],
    exempt_sales: ['مبيعات معفاة', 'Exempt sales'],
    exempt_purchases: ['مشتريات معفاة', 'Exempt purchases'],
    id: ['المعرّف', 'ID'],
    auditable_type: ['نوع السجل', 'Record type'],
    auditable_id: ['معرّف السجل', 'Record ID'],
    action: ['الإجراء', 'Action'],
    before_payload: ['القيمة القديمة', 'Previous value'],
    after_payload: ['القيمة الجديدة', 'New value'],
    changed_by: ['تم التغيير بواسطة', 'Changed by'],
    created_at: ['التاريخ والوقت', 'Date & time'],
    rank_type: ['الترتيب', 'Rank'],
    cumulative_percent: ['النسبة التراكمية', 'Cumulative %'],
    share_percent: ['نسبة المساهمة', 'Share %'],
    case: ['الحالة', 'Case'],
    profit: ['الربح', 'Profit'],
    dso: ['أيام تحصيل الذمم DSO', 'DSO'],
    dpo: ['أيام سداد الموردين DPO', 'DPO'],
    inventory_days: ['أيام المخزون', 'Inventory days'],
    cash_conversion_cycle: ['دورة تحويل النقد', 'Cash conversion cycle'],
    number: ['رقم المستند', 'Document number'],
    issue_date: ['تاريخ الإصدار', 'Issue date'],
    due_date: ['تاريخ الاستحقاق', 'Due date'],
    status: ['الحالة', 'Status'],
    total: ['الإجمالي', 'Total'],
    paid_total: ['المدفوع', 'Paid'],
    balance_due: ['المتبقي', 'Balance due'],
    currency: ['العملة', 'Currency'],
    documents: ['عدد المستندات', 'Documents'],
    label: ['البيان', 'Label'],
    overdue_days: ['أيام التأخير', 'Overdue days'],
    largest_variance_metric: ['أكبر انحراف', 'Largest variance'],
    comparison_mode: ['نوع المقارنة', 'Comparison mode'],
    current_from: ['بداية الفترة الحالية', 'Current from'],
    current_to: ['نهاية الفترة الحالية', 'Current to'],
    previous_from: ['بداية الفترة السابقة', 'Previous from'],
    previous_to: ['نهاية الفترة السابقة', 'Previous to'],
    contributors_to_80: ['عدد المساهمين حتى 80%', 'Contributors to 80%'],
    total_entities: ['إجمالي العناصر', 'Total entities'],
    contributor_percent: ['نسبة العناصر المساهمة', 'Contributor %'],
    largest_share_percent: ['أكبر نسبة مساهمة', 'Largest share %'],
    first_purchase_date: ['أول تاريخ شراء', 'First purchase date'],
    latest_purchase_date: ['آخر تاريخ شراء', 'Latest purchase date'],
};

const valueLabels: Record<string, [string, string]> = {
    Current: ['الفترة الحالية', 'Current'],
    Previous: ['الفترة السابقة', 'Previous'],
    Sales: ['المبيعات', 'Sales'],
    Purchases: ['المشتريات', 'Purchases'],
    Net: ['الصافي', 'Net'],
    Baseline: ['الأساس', 'Baseline'],
    Scenario: ['السيناريو', 'Scenario'],
    Top: ['الأعلى', 'Top'],
    Bottom: ['الأدنى', 'Bottom'],
    Unassigned: ['غير محدد', 'Unassigned'],
    sales_tax: ['ضريبة المبيعات', 'Sales tax'],
    purchase_tax: ['ضريبة المشتريات', 'Purchase tax'],
    other: ['أخرى', 'Other'],
    sale_credit_note: ['إشعار دائن مبيعات', 'Sales credit note'],
    purchase_credit_note: ['إشعار دائن مشتريات', 'Purchase credit note'],
    sale_return_request: ['طلب مرتجع مبيعات', 'Sales return request'],
    purchase_return_request: ['طلب مرتجع مشتريات', 'Purchase return request'],
    Low_margin: ['هامش منخفض', 'Low margin'],
    High_discounts: ['خصومات مرتفعة', 'High discounts'],
    High_cost: ['تكلفة مرتفعة', 'High cost'],
    volume_up: ['الخصم رفع حجم المبيعات', 'Discount increased volume'],
    profit_leak: ['الخصم أكل الربح', 'Discount eroded profit'],
    mixed: ['أثر مختلط', 'Mixed effect'],
    approved: ['معتمد', 'Approved'],
    rejected: ['مرفوض', 'Rejected'],
    pending: ['بانتظار الاعتماد', 'Pending'],
    previous_period: ['الفترة السابقة المماثلة', 'Previous period'],
    previous_month: ['الشهر السابق', 'Previous month'],
    previous_quarter: ['الربع السابق', 'Previous quarter'],
    ytd_previous_year: ['من بداية السنة مقابل السنة الماضية', 'YTD vs previous year'],
};

function featureTitle(feature: Feature | undefined, ar: boolean): string {
    if (! feature) {
        return ar ? 'اختر تقريراً' : 'Choose a report';
    }

    return ar
        ? feature.title_ar
        : feature.title;
}

function categoryLabel(category: string, ar: boolean): string {
    const labels: Record<string, [string, string]> = {
        builder: ['منشئ التقارير', 'Builder'],
        analysis: ['التحليل', 'Analysis'],
        profitability: ['الربحية', 'Profitability'],
        cash: ['النقد والسيولة', 'Cash'],
        inventory: ['المخزون', 'Inventory'],
        purchasing: ['المشتريات', 'Purchasing'],
        sales: ['المبيعات', 'Sales'],
        compliance: ['التدقيق والامتثال', 'Compliance'],
        collaboration: ['التعاون', 'Collaboration'],
        report: ['التقارير', 'Reports'],
    };

    return labels[category]
        ? (ar ? labels[category][0] : labels[category][1])
        : category;
}

function columnLabel(key: string, ar: boolean): string {
    const pair = columnLabels[key];

    return pair
        ? (ar ? pair[0] : pair[1])
        : key.replaceAll('_', ' ');
}

function dimensionLabel(key: string, ar: boolean): string {
    const labels: Record<string, [string, string]> = {
        customer: ['العميل', 'Customer'],
        product: ['المنتج', 'Product'],
        supplier: ['المورد', 'Supplier'],
        employee: ['الموظف', 'Employee'],
        branch: ['الفرع', 'Branch'],
        warehouse: ['المستودع', 'Warehouse'],
        month: ['الشهر', 'Month'],
    };

    return labels[key]
        ? (ar ? labels[key][0] : labels[key][1])
        : key;
}

function metricLabel(key: string, ar: boolean): string {
    return columnLabel(key, ar);
}

function chartTypeLabel(type: string, ar: boolean): string {
    const labels: Record<string, [string, string]> = {
        table: ['جدول', 'Table'],
        bar: ['أعمدة', 'Bar'],
        line: ['خطي', 'Line'],
        area: ['مساحة', 'Area'],
        pie: ['دائري', 'Pie'],
        donut: ['حلقي', 'Donut'],
    };

    return labels[type]
        ? (ar ? labels[type][0] : labels[type][1])
        : type;
}

function displayValue(value: unknown, ar: boolean): string {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    if (typeof value === 'number') {
        return new Intl.NumberFormat(
            ar ? 'ar' : 'en',
            { maximumFractionDigits: 2 },
        ).format(value);
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    const raw = String(value);
    const normalized = raw.replaceAll(' ', '_');
    const pair =
        valueLabels[raw]
        ?? valueLabels[normalized];

    if (pair) {
        return ar ? pair[0] : pair[1];
    }

    const numeric = Number(raw);

    if (
        raw.trim() !== ''
        && ! Number.isNaN(numeric)
        && /^-?\d+(\.\d+)?$/.test(raw)
    ) {
        return new Intl.NumberFormat(
            ar ? 'ar' : 'en',
            { maximumFractionDigits: 2 },
        ).format(numeric);
    }

    return raw;
}

function parseJson<T>(value: string, fallback: T): T {
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function evaluateFormula(
    expression: string,
    row: Record<string, unknown>,
): number | null {
    const tokens: string[] = [];
    const regex = /\s*(\[[^\]]+\]|\d+(?:\.\d+)?|[()+\-*/])\s*/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(expression)) !== null) {
        if (match.index !== cursor) {
            const skipped = expression.slice(cursor, match.index).trim();

            if (skipped !== '') {
                return null;
            }
        }

        tokens.push(match[1]);
        cursor = regex.lastIndex;
    }

    if (expression.slice(cursor).trim() !== '' || tokens.length === 0) {
        return null;
    }

    let index = 0;

    const parseFactor = (): number | null => {
        const token = tokens[index];

        if (token === undefined) {
            return null;
        }

        if (token === '-') {
            index++;
            const next = parseFactor();

            return next === null
                ? null
                : -next;
        }

        if (token === '(') {
            index++;
            const value = parseExpression();

            if (tokens[index] !== ')') {
                return null;
            }

            index++;

            return value;
        }

        if (token.startsWith('[') && token.endsWith(']')) {
            index++;
            const key = token.slice(1, -1);
            const value = Number(row[key] ?? 0);

            return Number.isFinite(value)
                ? value
                : 0;
        }

        if (/^\d+(\.\d+)?$/.test(token)) {
            index++;

            return Number(token);
        }

        return null;
    };

    const parseTerm = (): number | null => {
        let value = parseFactor();

        if (value === null) {
            return null;
        }

        while (
            tokens[index] === '*'
            || tokens[index] === '/'
        ) {
            const operator = tokens[index];
            index++;
            const right = parseFactor();

            if (right === null) {
                return null;
            }

            if (operator === '/') {
                if (right === 0) {
                    return null;
                }

                value /= right;
            } else {
                value *= right;
            }
        }

        return value;
    };

    const parseExpression = (): number | null => {
        let value = parseTerm();

        if (value === null) {
            return null;
        }

        while (
            tokens[index] === '+'
            || tokens[index] === '-'
        ) {
            const operator = tokens[index];
            index++;
            const right = parseTerm();

            if (right === null) {
                return null;
            }

            value = operator === '+'
                ? value + right
                : value - right;
        }

        return value;
    };

    const value = parseExpression();

    if (
        value === null
        || index !== tokens.length
        || ! Number.isFinite(value)
    ) {
        return null;
    }

    return value;
}

function applyFormulas(
    rows: Array<Record<string, unknown>>,
    formulas: FormulaDefinition[],
): Array<Record<string, unknown>> {
    return rows.map(source => {
        const row = { ...source };

        formulas.forEach(formula => {
            row[formula.name] =
                evaluateFormula(
                    formula.expression,
                    row,
                );
        });

        return row;
    });
}

function escapeCsv(value: unknown): string {
    const text = value === null || value === undefined
        ? ''
        : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value);

    return '"' + text.replaceAll('"', '""') + '"';
}

export default function ReportStudio() {
    const ar = useLocale() === 'ar';
    const t = (
        arabic: string,
        english: string,
    ): string => ar ? arabic : english;

    const [data, setData] = useState<StudioIndex>({
        features: [],
        snapshots: [],
        presets: [],
        boards: [],
        reports: [],
        annotations: [],
        comments: [],
        approvals: [],
        members: [],
        targets: [],
    });

    const [selected, setSelected] =
        useState('customer-profitability');
    const [query, setQuery] = useState('');
    const [dateFrom, setDateFrom] = useState(() => {
        const date = new Date();
        date.setMonth(0, 1);

        return date.toISOString().slice(0, 10);
    });
    const [dateTo, setDateTo] =
        useState(() => new Date().toISOString().slice(0, 10));
    const [dimension, setDimension] =
        useState('customer');
    const [metric, setMetric] =
        useState('revenue');
    const [comparisonMode, setComparisonMode] =
        useState('previous_period');
    const [result, setResult] =
        useState<Result | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    const [chartType, setChartType] =
        useState<'table' | 'bar' | 'line' | 'area' | 'pie' | 'donut'>('table');
    const [chartX, setChartX] = useState('');
    const [chartY, setChartY] = useState('');
    const [savedReportId, setSavedReportId] =
        useState<number | null>(null);

    const [pivot, setPivot] =
        useState<PivotConfiguration>({
            row: '',
            column: '',
            value: '',
            aggregation: 'sum',
        });

    const [formulaName, setFormulaName] =
        useState(ar ? 'محسوب' : 'Calculated');
    const [formulaExpression, setFormulaExpression] =
        useState('');
    const [formulas, setFormulas] =
        useState<FormulaDefinition[]>([]);

    const [scenarioSales, setScenarioSales] =
        useState(0);
    const [scenarioCost, setScenarioCost] =
        useState(0);

    const [exceptionMetric, setExceptionMetric] =
        useState('margin');
    const [exceptionOperator, setExceptionOperator] =
        useState('lt');
    const [exceptionValue, setExceptionValue] =
        useState(10);

    const [drill, setDrill] =
        useState<{
            row: Record<string, unknown>;
            key: string;
            details?: DrillResult;
            loading?: boolean;
        } | null>(null);

    const [note, setNote] = useState('');
    const [comment, setComment] = useState('');
    const [commentReportId, setCommentReportId] =
        useState<number | null>(null);
    const [mentionIds, setMentionIds] =
        useState<number[]>([]);

    const [boardName, setBoardName] = useState('');
    const [boardReports, setBoardReports] =
        useState<number[]>([]);
    const [activeBoardId, setActiveBoardId] =
        useState<number | null>(null);
    const [boardRuns, setBoardRuns] =
        useState<Record<number, BoardRunState>>({});

    const [approvalNote, setApprovalNote] =
        useState('');

    const [targetEmployeeId, setTargetEmployeeId] =
        useState<number | null>(null);
    const [targetValue, setTargetValue] =
        useState('');
    const [targetCurrency, setTargetCurrency] =
        useState('ILS');

    async function load(): Promise<void> {
        setError('');

        try {
            const response =
                await apiRequest<StudioIndex>(
                    '/api/report-studio',
                );

            setData(response);

            if (
                targetEmployeeId === null
                && response.members.length > 0
            ) {
                setTargetEmployeeId(
                    response.members[0].id,
                );
            }
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر تحميل استوديو التقارير.',
                        'Could not load Report Studio.',
                    ),
            );
        }
    }

    useEffect(() => {
        void load();
    }, []);

    useEffect(() => {
        setFormulaName(
            ar
                ? 'محسوب'
                : 'Calculated',
        );
    }, [ar]);

    const feature = data.features.find(
        item => item.key === selected,
    );

    const filteredFeatures = useMemo(
        () =>
            data.features.filter(item => {
                const haystack = [
                    item.title,
                    item.title_ar,
                    item.category,
                    categoryLabel(
                        item.category,
                        ar,
                    ),
                ]
                    .join(' ')
                    .toLowerCase();

                return ! search
                    || haystack.includes(
                        search.toLowerCase(),
                    );
            }),
        [data.features, search, ar],
    );

    async function run(
        featureKey = selected,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: Result;
                }>(
                    '/api/report-studio/run',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            feature: featureKey,
                            date_from: dateFrom,
                            date_to: dateTo,
                            dimension,
                            metric,
                            comparison_mode:
                                comparisonMode,
                            scenario: {
                                sales_percent:
                                    scenarioSales,
                                cost_percent:
                                    scenarioCost,
                                currency_percent: 0,
                            },
                            exception: {
                                metric:
                                    exceptionMetric,
                                operator:
                                    exceptionOperator,
                                value:
                                    exceptionValue,
                            },
                        }),
                    },
                );

            setSelected(featureKey);
            setResult(response.data);

            const numeric =
                response.data.columns.filter(
                    key =>
                        response.data.rows.some(
                            row =>
                                typeof row[key] ===
                                    'number'
                                || (
                                    row[key] !==
                                        null
                                    && row[key] !==
                                        ''
                                    && ! Number.isNaN(
                                        Number(
                                            row[key],
                                        ),
                                    )
                                ),
                        ),
                );

            setPivot(current => ({
                ...current,
                row:
                    response.data
                        .columns[0]
                    ?? '',
                value:
                    numeric[0]
                    ?? '',
            }));
            setChartX(
                response.data.columns[0]
                ?? '',
            );
            setChartY(
                numeric[0]
                ?? '',
            );
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر تشغيل التقرير.',
                        'Could not run report.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function naturalLanguage(): Promise<void> {
        if (
            ! query.trim()
            || busy
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: {
                        feature: string;
                        dimension: string;
                        metric: string;
                        comparison_mode: string;
                        date_from: string;
                        date_to: string;
                    };
                }>(
                    '/api/report-studio/natural-language',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            query,
                        }),
                    },
                );

            setSelected(
                response.data.feature,
            );
            setDimension(
                response.data.dimension,
            );
            setMetric(
                response.data.metric,
            );
            setComparisonMode(
                response.data.comparison_mode,
            );
            setDateFrom(
                response.data.date_from,
            );
            setDateTo(
                response.data.date_to,
            );
            setResult(null);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر فهم طلب التقرير.',
                        'Could not parse report request.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function saveSnapshot(): Promise<void> {
        if (! result) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/snapshots',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name:
                            featureTitle(
                                feature,
                                ar,
                            ),
                        as_of_date:
                            dateTo,
                        definition: {
                            feature:
                                selected,
                            date_from:
                                dateFrom,
                            date_to:
                                dateTo,
                            dimension,
                            metric,
                            comparison_mode:
                                comparisonMode,
                        },
                        payload:
                            result,
                    }),
                },
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر حفظ اللقطة.',
                        'Could not save snapshot.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function saveText(
        kind: 'annotations' | 'comments',
        body: string,
    ): Promise<void> {
        if (! body.trim()) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/'
                + kind,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        report_id:
                            kind ===
                            'comments'
                                ? commentReportId
                                : null,
                        anchor_key:
                            selected,
                        period_date:
                            kind ===
                            'annotations'
                                ? dateTo
                                : undefined,
                        body:
                            body.trim(),
                        mentions:
                            kind ===
                            'comments'
                                ? mentionIds
                                : [],
                    }),
                },
            );

            if (
                kind ===
                'annotations'
            ) {
                setNote('');
            } else {
                setComment('');
                setMentionIds([]);
            }

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر الحفظ.',
                        'Could not save.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function savePreset(): Promise<void> {
        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/presets',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name:
                            featureTitle(
                                feature,
                                ar,
                            )
                            + ' · '
                            + dateFrom,
                        scope: selected,
                        filters: {
                            dateFrom,
                            dateTo,
                            dimension,
                            metric,
                            comparisonMode,
                        },
                    }),
                },
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر حفظ الفلتر.',
                        'Could not save preset.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    function applyPreset(
        preset: Preset,
    ): void {
        const filters =
            parseJson<{
                dateFrom?: string;
                dateTo?: string;
                dimension?: string;
                metric?: string;
                comparisonMode?: string;
            }>(
                preset.filters,
                {},
            );

        if (filters.dateFrom) {
            setDateFrom(
                filters.dateFrom,
            );
        }

        if (filters.dateTo) {
            setDateTo(
                filters.dateTo,
            );
        }

        if (filters.dimension) {
            setDimension(
                filters.dimension,
            );
        }

        if (filters.metric) {
            setMetric(
                filters.metric,
            );
        }

        if (filters.comparisonMode) {
            setComparisonMode(
                filters.comparisonMode,
            );
        }

        setSelected(
            preset.scope,
        );
        setResult(null);
    }

    function openSnapshot(
        snapshot: Snapshot,
    ): void {
        const payload =
            parseJson<Result | null>(
                snapshot.payload,
                null,
            );

        const definition =
            parseJson<{
                feature?: string;
                date_from?: string;
                date_to?: string;
                dimension?: string;
                metric?: string;
                comparison_mode?: string;
            }>(
                snapshot.definition,
                {},
            );

        if (! payload) {
            setError(
                t(
                    'تعذر فتح اللقطة.',
                    'Could not open snapshot.',
                ),
            );
            return;
        }

        setResult(payload);

        if (definition.feature) {
            setSelected(
                definition.feature,
            );
        }

        if (definition.date_from) {
            setDateFrom(
                definition.date_from,
            );
        }

        if (definition.date_to) {
            setDateTo(
                definition.date_to,
            );
        }

        if (definition.dimension) {
            setDimension(
                definition.dimension,
            );
        }

        if (definition.metric) {
            setMetric(
                definition.metric,
            );
        }

        if (
            definition.comparison_mode
        ) {
            setComparisonMode(
                definition.comparison_mode,
            );
        }
    }

    async function openDrill(
        row: Record<string, unknown>,
        key: string,
    ): Promise<void> {
        setDrill({
            row,
            key,
            loading: true,
        });

        const dimensionKey = [
            'dimension',
            'customer',
            'supplier',
            'party',
            'branch',
            'month',
            'employee',
        ].find(
            candidate =>
                row[candidate] !==
                undefined,
        );

        try {
            const response =
                await apiRequest<{
                    data: DrillResult;
                }>(
                    '/api/report-studio/drill-down',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            feature:
                                selected,
                            date_from:
                                dateFrom,
                            date_to:
                                dateTo,
                            dimension:
                                dimensionKey
                                ?? dimension,
                            dimension_value:
                                dimensionKey
                                    ? String(
                                        row[
                                            dimensionKey
                                        ]
                                        ?? '',
                                    )
                                    : null,
                            metric:
                                key,
                        }),
                    },
                );

            setDrill({
                row,
                key,
                details:
                    response.data,
                loading: false,
            });
        } catch {
            setDrill({
                row,
                key,
                loading: false,
            });
        }
    }

    async function openDrillMonth(
        month: string,
    ): Promise<void> {
        if (! drill) {
            return;
        }

        setDrill(current =>
            current
                ? {
                    ...current,
                    loading: true,
                }
                : current,
        );

        try {
            const response =
                await apiRequest<{
                    data: DrillResult;
                }>(
                    '/api/report-studio/drill-down',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            feature:
                                selected,
                            date_from:
                                dateFrom,
                            date_to:
                                dateTo,
                            dimension:
                                'month',
                            dimension_value:
                                month,
                            metric:
                                drill.key,
                        }),
                    },
                );

            setDrill(current =>
                current
                    ? {
                        ...current,
                        details:
                            response.data,
                        loading: false,
                    }
                    : current,
            );
        } catch {
            setDrill(current =>
                current
                    ? {
                        ...current,
                        loading: false,
                    }
                    : current,
            );
        }
    }

    async function saveVisualization(): Promise<void> {
        if (! savedReportId) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/visualizations',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        report_id:
                            savedReportId,
                        type:
                            chartType,
                        x:
                            chartX
                            || null,
                        y:
                            chartY
                            || null,
                    }),
                },
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر حفظ الرسم.',
                        'Could not save visualization.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function saveConfiguration(): Promise<void> {
        if (! savedReportId) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/configuration',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        report_id:
                            savedReportId,
                        configuration: {
                            formulas,
                            pivot,
                        },
                    }),
                },
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر حفظ إعدادات التقرير.',
                        'Could not save report configuration.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    function loadSavedConfiguration(
        reportId: number,
    ): void {
        const report =
            data.reports.find(
                item =>
                    item.id ===
                    reportId,
            );

        if (! report) {
            return;
        }

        setSavedReportId(
            reportId,
        );

        if (
            report.visualization?.type
        ) {
            setChartType(
                report.visualization.type,
            );
        }

        setChartX(
            report.visualization?.x
            ?? '',
        );
        setChartY(
            report.visualization?.y
            ?? '',
        );
        setFormulas(
            report.configuration?.formulas
            ?? [],
        );
        setPivot(
            report.configuration?.pivot
            ?? {
                row: '',
                column: '',
                value: '',
                aggregation: 'sum',
            },
        );
    }

    function addFormula(): void {
        const name =
            formulaName.trim();
        const expression =
            formulaExpression.trim();

        if (
            ! name
            || ! expression
        ) {
            return;
        }

        setFormulas(current => [
            ...current,
            {
                id:
                    Date.now()
                        .toString(36)
                    + Math.random()
                        .toString(36)
                        .slice(2, 7),
                name,
                expression,
            },
        ]);

        setFormulaName(
            ar
                ? 'محسوب'
                : 'Calculated',
        );
        setFormulaExpression('');
    }

    function insertFieldIntoFormula(
        field: string,
    ): void {
        setFormulaExpression(
            current =>
                current
                + (
                    current
                    && ! /[+\-*/(]\s*$/.test(
                        current,
                    )
                        ? ' '
                        : ''
                )
                + '['
                + field
                + ']',
        );
    }

    async function saveBoard(): Promise<void> {
        if (
            ! boardName.trim()
            || boardReports.length < 4
            || boardReports.length > 8
        ) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/boards',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name:
                            boardName.trim(),
                        shared: false,
                        layout:
                            boardReports.map(
                                (
                                    reportId,
                                    index,
                                ) => ({
                                    report_id:
                                        reportId,
                                    order:
                                        index,
                                }),
                            ),
                    }),
                },
            );

            setBoardName('');
            setBoardReports([]);
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر حفظ لوحة التقارير.',
                        'Could not save report board.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function openBoard(
        board: Board,
    ): Promise<void> {
        setActiveBoardId(
            board.id,
        );

        const initial =
            Object.fromEntries(
                board.layout.map(
                    item => [
                        item.report_id,
                        {
                            reportId:
                                item.report_id,
                            status:
                                'loading',
                        } satisfies BoardRunState,
                    ],
                ),
            );

        setBoardRuns(initial);

        await Promise.all(
            board.layout.map(
                async item => {
                    const report =
                        data.reports.find(
                            candidate =>
                                candidate.id
                                === item.report_id,
                        );

                    if (! report) {
                        setBoardRuns(
                            current => ({
                                ...current,
                                [item.report_id]: {
                                    reportId:
                                        item.report_id,
                                    status:
                                        'error',
                                    error:
                                        t(
                                            'التقرير غير موجود.',
                                            'Report not found.',
                                        ),
                                },
                            }),
                        );
                        return;
                    }

                    try {
                        const response =
                            await apiRequest<{
                                data: BuilderRunResult;
                            }>(
                                '/api/report-builder/run',
                                {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        dataset:
                                            report.dataset,
                                        columns:
                                            report.columns,
                                        filters:
                                            report.filters
                                            ?? [],
                                        group_by:
                                            report.group_by,
                                        sort_by:
                                            report.sort_by,
                                        sort_direction:
                                            report.sort_direction
                                            ?? 'asc',
                                    }),
                                },
                            );

                        setBoardRuns(
                            current => ({
                                ...current,
                                [report.id]: {
                                    reportId:
                                        report.id,
                                    status:
                                        'ready',
                                    result:
                                        response.data,
                                },
                            }),
                        );
                    } catch (
                        failure
                    ) {
                        setBoardRuns(
                            current => ({
                                ...current,
                                [report.id]: {
                                    reportId:
                                        report.id,
                                    status:
                                        'error',
                                    error:
                                        failure instanceof
                                        ApiError
                                            ? failure.message
                                            : t(
                                                'تعذر تشغيل التقرير.',
                                                'Could not run report.',
                                            ),
                                },
                            }),
                        );
                    }
                },
            ),
        );
    }

    async function reviewReport(
        reportId: number,
        status:
            | 'pending'
            | 'approved'
            | 'rejected',
    ): Promise<void> {
        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/approvals',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        report_id:
                            reportId,
                        status,
                        note:
                            approvalNote.trim()
                            || null,
                    }),
                },
            );

            setApprovalNote('');
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر تحديث الاعتماد.',
                        'Could not update approval.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function saveTarget(): Promise<void> {
        if (
            ! targetEmployeeId
            || targetValue === ''
        ) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/report-studio/targets',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        dimension_type:
                            'employee',
                        dimension_id:
                            targetEmployeeId,
                        metric:
                            'sales',
                        period_start:
                            dateFrom,
                        period_end:
                            dateTo,
                        target_value:
                            Number(
                                targetValue,
                            ),
                        currency:
                            targetCurrency,
                    }),
                },
            );

            setTargetValue('');
            await load();

            if (
                selected ===
                'sales-performance'
            ) {
                await run();
            }
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'تعذر حفظ الهدف.',
                        'Could not save target.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    function exportCsv(): void {
        if (! result) {
            return;
        }

        const rows =
            applyFormulas(
                result.rows,
                formulas,
            );

        const columns = [
            ...result.columns,
            ...formulas.map(
                item => item.name,
            ),
        ];

        const csv = [
            columns
                .map(column =>
                    escapeCsv(
                        columnLabel(
                            column,
                            ar,
                        ),
                    ),
                )
                .join(','),
            ...rows.map(row =>
                columns
                    .map(column =>
                        escapeCsv(
                            row[column],
                        ),
                    )
                    .join(','),
            ),
        ].join('\n');

        const blob = new Blob(
            [csv],
            {
                type:
                    'text/csv;charset=utf-8',
            },
        );

        const url =
            URL.createObjectURL(
                blob,
            );
        const anchor =
            document.createElement(
                'a',
            );

        anchor.href = url;
        anchor.download =
            selected
            + '-'
            + dateTo
            + '.csv';
        anchor.click();
        URL.revokeObjectURL(url);
    }

    function printResult(): void {
        if (! result) {
            return;
        }

        const popup =
            window.open(
                '',
                '_blank',
                'width=1100,height=800',
            );

        if (! popup) {
            return;
        }

        const rows =
            applyFormulas(
                result.rows,
                formulas,
            );
        const columns = [
            ...result.columns,
            ...formulas.map(
                item => item.name,
            ),
        ];

        const header =
            columns
                .map(
                    column =>
                        '<th style="border:1px solid #ddd;padding:8px;text-align:start">'
                        + escapeHtml(
                            columnLabel(
                                column,
                                ar,
                            ),
                        )
                        + '</th>',
                )
                .join('');

        const body =
            rows
                .map(
                    row =>
                        '<tr>'
                        + columns
                            .map(
                                column =>
                                    '<td style="border:1px solid #ddd;padding:8px">'
                                    + escapeHtml(
                                        displayValue(
                                            row[
                                                column
                                            ],
                                            ar,
                                        ),
                                    )
                                    + '</td>',
                            )
                            .join('')
                        + '</tr>',
                )
                .join('');

        popup.document.write(
            '<!doctype html><html><head><meta charset="utf-8"><title>'
            + escapeHtml(
                featureTitle(
                    feature,
                    ar,
                ),
            )
            + '</title></head><body dir="'
            + (
                ar
                    ? 'rtl'
                    : 'ltr'
            )
            + '" style="font-family:Arial,sans-serif;padding:24px"><h1>'
            + escapeHtml(
                featureTitle(
                    feature,
                    ar,
                ),
            )
            + '</h1><p>'
            + dateFrom
            + ' → '
            + dateTo
            + '</p><table style="border-collapse:collapse;width:100%">'
            + '<thead><tr>'
            + header
            + '</tr></thead><tbody>'
            + body
            + '</tbody></table></body></html>',
        );
        popup.document.close();
        popup.focus();
        popup.print();
    }

    const displayedRows =
        useMemo(
            () =>
                result
                    ? applyFormulas(
                        result.rows,
                        formulas,
                    )
                    : [],
            [result, formulas],
        );

    const displayedColumns =
        useMemo(
            () =>
                result
                    ? [
                        ...result.columns,
                        ...formulas.map(
                            item =>
                                item.name,
                        ),
                    ]
                    : [],
            [result, formulas],
        );

    const pivotData =
        useMemo(
            () =>
                buildPivot(
                    displayedRows,
                    pivot,
                ),
            [
                displayedRows,
                pivot,
            ],
        );

    const currentApproval =
        (reportId: number):
            Approval | undefined =>
            data.approvals.find(
                item =>
                    Number(
                        item.report_id,
                    ) ===
                    reportId,
            );

    const activeBoard =
        data.boards.find(
            board =>
                board.id ===
                activeBoardId,
        );

    return (
        <AppShell>
            <Head
                title={t(
                    'استوديو التقارير',
                    'Report Studio',
                )}
            />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto w-full max-w-[1760px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section
                    className={panel + ' p-5'}
                >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <span className="flex size-11 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-accent)]">
                                <Sparkles
                                    size={18}
                                />
                            </span>

                            <div>
                                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                    {t(
                                        'ذكاء التقارير',
                                        'REPORT INTELLIGENCE',
                                    )}
                                </p>

                                <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                    {t(
                                        'استوديو التقارير المتقدم',
                                        'Advanced Report Studio',
                                    )}
                                </h1>

                                <p className="mt-2 max-w-4xl text-xs leading-6 text-[var(--ac-text-muted)]">
                                    {t(
                                        'منصة موحدة لبناء وتحليل وحفظ واعتماد ومشاركة التقارير على بيانات AccoNova الفعلية.',
                                        'A unified workspace to build, analyze, save, approve and collaborate on reports powered by live AccoNova data.',
                                    )}
                                </p>
                            </div>
                        </div>

                        <Link
                            href="/app/reports/builder"
                            className={button}
                        >
                            <Table2
                                size={13}
                            />
                            {t(
                                'فتح منشئ التقارير',
                                'Open Report Builder',
                            )}
                        </Link>
                    </div>

                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                        <input
                            value={query}
                            onChange={event =>
                                setQuery(
                                    event.target.value,
                                )
                            }
                            className={
                                input
                                + ' min-w-0 flex-1'
                            }
                            placeholder={t(
                                'مثال: اعرض مبيعات آخر 6 شهور حسب العميل مع الربح',
                                'Example: show sales for the last 6 months by customer with profit',
                            )}
                        />

                        <button
                            type="button"
                            className={button}
                            disabled={
                                busy
                                || ! query.trim()
                            }
                            onClick={() =>
                                void naturalLanguage()
                            }
                        >
                            <Search
                                size={13}
                            />
                            {t(
                                'جهّز الإعدادات',
                                'Prepare settings',
                            )}
                        </button>
                    </div>
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">
                        {error}
                    </div>
                )}

                <div className="mt-4 grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className="space-y-4 xl:sticky xl:top-4">
                        <section
                            className={panel + ' p-4'}
                        >
                            <div className="flex items-center gap-2">
                                <Search
                                    size={13}
                                    className="text-[var(--ac-accent)]"
                                />
                                <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                    {t(
                                        'كل الميزات الـ40',
                                        'All 40 capabilities',
                                    )}
                                </h2>
                            </div>

                            <input
                                className={
                                    input
                                    + ' mt-3 w-full'
                                }
                                value={search}
                                onChange={event =>
                                    setSearch(
                                        event.target.value,
                                    )
                                }
                                placeholder={t(
                                    'بحث...',
                                    'Search...',
                                )}
                            />

                            <div className="mt-3 max-h-[620px] space-y-1.5 overflow-auto pe-1">
                                {filteredFeatures.map(
                                    item => {
                                        const Icon =
                                            categoryIcon[
                                                item.category
                                            ]
                                            ?? BarChart3;
                                        const active =
                                            selected ===
                                            item.key;

                                        return (
                                            <button
                                                key={
                                                    item.key
                                                }
                                                type="button"
                                                onClick={() => {
                                                    setSelected(
                                                        item.key,
                                                    );
                                                    setResult(
                                                        null,
                                                    );
                                                }}
                                                className={[
                                                    'flex w-full items-center gap-2 rounded-[11px] border px-3 py-2.5 text-start transition',
                                                    active
                                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                                        : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]',
                                                ].join(
                                                    ' ',
                                                )}
                                            >
                                                <span className="text-[9px] font-bold text-[var(--ac-text-muted)]">
                                                    {String(
                                                        item.number,
                                                    ).padStart(
                                                        2,
                                                        '0',
                                                    )}
                                                </span>
                                                <Icon
                                                    size={
                                                        13
                                                    }
                                                    className="shrink-0 text-[var(--ac-accent)]"
                                                />
                                                <span className="min-w-0 flex-1 text-[10px] font-semibold text-[var(--ac-text)]">
                                                    {featureTitle(
                                                        item,
                                                        ar,
                                                    )}
                                                </span>
                                                <ChevronRight
                                                    size={
                                                        11
                                                    }
                                                    className={
                                                        ar
                                                            ? 'rotate-180'
                                                            : ''
                                                    }
                                                />
                                            </button>
                                        );
                                    },
                                )}
                            </div>
                        </section>

                        {data.presets.length > 0 && (
                            <section
                                className={panel + ' p-4'}
                            >
                                <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                    {t(
                                        'الفلاتر المحفوظة',
                                        'Saved filters',
                                    )}
                                </h2>

                                <div className="mt-3 space-y-2">
                                    {data.presets
                                        .slice(0, 8)
                                        .map(
                                            preset => (
                                                <button
                                                    key={
                                                        preset.id
                                                    }
                                                    type="button"
                                                    onClick={() =>
                                                        applyPreset(
                                                            preset,
                                                        )
                                                    }
                                                    className="w-full rounded-[10px] border border-[var(--ac-line)] p-2 text-start hover:border-[var(--ac-accent)]"
                                                >
                                                    <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                        {
                                                            preset.name
                                                        }
                                                    </p>
                                                    <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                                                        {featureTitle(
                                                            data.features.find(
                                                                item =>
                                                                    item.key
                                                                    ===
                                                                    preset.scope,
                                                            ),
                                                            ar,
                                                        )}
                                                    </p>
                                                </button>
                                            ),
                                        )}
                                </div>
                            </section>
                        )}
                    </aside>

                    <section className="space-y-4">
                        <section
                            className={panel + ' p-4'}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ac-accent)]">
                                        {categoryLabel(
                                            feature?.category
                                            ?? 'report',
                                            ar,
                                        )}
                                    </p>
                                    <h2 className="mt-1 text-lg font-bold text-[var(--ac-text)]">
                                        {featureTitle(
                                            feature,
                                            ar,
                                        )}
                                    </h2>
                                </div>

                                <button
                                    type="button"
                                    className={button}
                                    disabled={
                                        busy
                                        || ! feature
                                    }
                                    onClick={() =>
                                        void run()
                                    }
                                >
                                    <Play
                                        size={13}
                                    />
                                    {t(
                                        'تشغيل التقرير',
                                        'Run report',
                                    )}
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                                <label className="space-y-1">
                                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                                        {t(
                                            'من',
                                            'From',
                                        )}
                                    </span>
                                    <input
                                        type="date"
                                        className={
                                            input
                                            + ' w-full'
                                        }
                                        value={
                                            dateFrom
                                        }
                                        onChange={
                                            event =>
                                                setDateFrom(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    />
                                </label>

                                <label className="space-y-1">
                                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                                        {t(
                                            'إلى',
                                            'To',
                                        )}
                                    </span>
                                    <input
                                        type="date"
                                        className={
                                            input
                                            + ' w-full'
                                        }
                                        value={
                                            dateTo
                                        }
                                        onChange={
                                            event =>
                                                setDateTo(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    />
                                </label>

                                <label className="space-y-1">
                                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                                        {t(
                                            'البعد',
                                            'Dimension',
                                        )}
                                    </span>
                                    <select
                                        className={
                                            input
                                            + ' w-full'
                                        }
                                        value={
                                            dimension
                                        }
                                        onChange={
                                            event =>
                                                setDimension(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    >
                                        {[
                                            'customer',
                                            'product',
                                            'supplier',
                                            'employee',
                                            'branch',
                                            'warehouse',
                                            'month',
                                        ].map(
                                            value => (
                                                <option
                                                    key={
                                                        value
                                                    }
                                                    value={
                                                        value
                                                    }
                                                >
                                                    {dimensionLabel(
                                                        value,
                                                        ar,
                                                    )}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </label>

                                <label className="space-y-1">
                                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                                        {t(
                                            'المؤشر',
                                            'Metric',
                                        )}
                                    </span>
                                    <select
                                        className={
                                            input
                                            + ' w-full'
                                        }
                                        value={
                                            metric
                                        }
                                        onChange={
                                            event =>
                                                setMetric(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    >
                                        {[
                                            'revenue',
                                            'gross_profit',
                                            'margin_percent',
                                            'quantity',
                                            'discounts',
                                            'outstanding',
                                        ].map(
                                            value => (
                                                <option
                                                    key={
                                                        value
                                                    }
                                                    value={
                                                        value
                                                    }
                                                >
                                                    {metricLabel(
                                                        value,
                                                        ar,
                                                    )}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </label>

                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        className={
                                            button
                                            + ' w-full'
                                        }
                                        onClick={() =>
                                            void savePreset()
                                        }
                                    >
                                        <Bookmark
                                            size={13}
                                        />
                                        {t(
                                            'حفظ الفلتر',
                                            'Save preset',
                                        )}
                                    </button>
                                </div>
                            </div>

                            {selected ===
                                'period-comparison' && (
                                <div className="mt-4">
                                    <label className="block max-w-md space-y-1">
                                        <span className="text-[9px] text-[var(--ac-text-muted)]">
                                            {t(
                                                'نوع المقارنة',
                                                'Comparison mode',
                                            )}
                                        </span>
                                        <select
                                            className={
                                                input
                                                + ' w-full'
                                            }
                                            value={
                                                comparisonMode
                                            }
                                            onChange={
                                                event =>
                                                    setComparisonMode(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                            }
                                        >
                                            {[
                                                'previous_period',
                                                'previous_month',
                                                'previous_quarter',
                                                'ytd_previous_year',
                                            ].map(
                                                value => (
                                                    <option
                                                        key={
                                                            value
                                                        }
                                                        value={
                                                            value
                                                        }
                                                    >
                                                        {displayValue(
                                                            value,
                                                            ar,
                                                        )}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    </label>
                                </div>
                            )}

                            {selected ===
                                'scenario-reports' && (
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <label className="space-y-1">
                                        <span className="text-[9px] text-[var(--ac-text-muted)]">
                                            {t(
                                                'تغير المبيعات %',
                                                'Sales change %',
                                            )}
                                        </span>
                                        <input
                                            type="number"
                                            className={
                                                input
                                                + ' w-full'
                                            }
                                            value={
                                                scenarioSales
                                            }
                                            onChange={
                                                event =>
                                                    setScenarioSales(
                                                        Number(
                                                            event
                                                                .target
                                                                .value,
                                                        ),
                                                    )
                                            }
                                        />
                                    </label>

                                    <label className="space-y-1">
                                        <span className="text-[9px] text-[var(--ac-text-muted)]">
                                            {t(
                                                'تغير التكلفة %',
                                                'Cost change %',
                                            )}
                                        </span>
                                        <input
                                            type="number"
                                            className={
                                                input
                                                + ' w-full'
                                            }
                                            value={
                                                scenarioCost
                                            }
                                            onChange={
                                                event =>
                                                    setScenarioCost(
                                                        Number(
                                                            event
                                                                .target
                                                                .value,
                                                        ),
                                                    )
                                            }
                                        />
                                    </label>
                                </div>
                            )}

                            {selected ===
                                'exception-builder' && (
                                <div className="mt-4 grid gap-3 md:grid-cols-3">
                                    <select
                                        className={
                                            input
                                        }
                                        value={
                                            exceptionMetric
                                        }
                                        onChange={
                                            event => {
                                                const value =
                                                    event
                                                        .target
                                                        .value;
                                                setExceptionMetric(
                                                    value,
                                                );

                                                if (
                                                    value ===
                                                    'overdue_days'
                                                ) {
                                                    setExceptionValue(
                                                        30,
                                                    );
                                                }
                                            }
                                        }
                                    >
                                        <option value="margin">
                                            {t(
                                                'هامش الربح',
                                                'Margin',
                                            )}
                                        </option>
                                        <option value="overdue_days">
                                            {t(
                                                'أيام التأخير',
                                                'Overdue days',
                                            )}
                                        </option>
                                        <option value="stock">
                                            {t(
                                                'المخزون',
                                                'Stock',
                                            )}
                                        </option>
                                        <option value="discount">
                                            {t(
                                                'نسبة الخصم',
                                                'Discount %',
                                            )}
                                        </option>
                                    </select>

                                    <select
                                        className={
                                            input
                                        }
                                        value={
                                            exceptionOperator
                                        }
                                        onChange={
                                            event =>
                                                setExceptionOperator(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    >
                                        <option value="lt">
                                            &lt;
                                        </option>
                                        <option value="lte">
                                            ≤
                                        </option>
                                        <option value="gt">
                                            &gt;
                                        </option>
                                        <option value="gte">
                                            ≥
                                        </option>
                                    </select>

                                    <input
                                        type="number"
                                        className={
                                            input
                                        }
                                        value={
                                            exceptionValue
                                        }
                                        onChange={
                                            event =>
                                                setExceptionValue(
                                                    Number(
                                                        event
                                                            .target
                                                            .value,
                                                    ),
                                                )
                                        }
                                    />
                                </div>
                            )}
                        </section>

                        {selected ===
                            'sales-performance' && (
                            <section
                                className={panel + ' p-4'}
                            >
                                <div className="flex items-center gap-2">
                                    <Target
                                        size={14}
                                        className="text-[var(--ac-accent)]"
                                    />
                                    <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                        {t(
                                            'أهداف المبيعات حسب الموظف',
                                            'Sales targets by employee',
                                        )}
                                    </h3>
                                </div>

                                <div className="mt-3 grid gap-2 md:grid-cols-4">
                                    <select
                                        className={
                                            input
                                        }
                                        value={
                                            targetEmployeeId
                                            ?? ''
                                        }
                                        onChange={
                                            event =>
                                                setTargetEmployeeId(
                                                    event
                                                        .target
                                                        .value
                                                        ? Number(
                                                            event
                                                                .target
                                                                .value,
                                                        )
                                                        : null,
                                                )
                                        }
                                    >
                                        {data.members.map(
                                            member => (
                                                <option
                                                    key={
                                                        member.id
                                                    }
                                                    value={
                                                        member.id
                                                    }
                                                >
                                                    {
                                                        member.name
                                                    }
                                                </option>
                                            ),
                                        )}
                                    </select>

                                    <input
                                        type="number"
                                        min="0"
                                        className={
                                            input
                                        }
                                        value={
                                            targetValue
                                        }
                                        onChange={
                                            event =>
                                                setTargetValue(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                        placeholder={t(
                                            'قيمة الهدف',
                                            'Target value',
                                        )}
                                    />

                                    <input
                                        className={
                                            input
                                        }
                                        maxLength={3}
                                        value={
                                            targetCurrency
                                        }
                                        onChange={
                                            event =>
                                                setTargetCurrency(
                                                    event
                                                        .target
                                                        .value
                                                        .toUpperCase(),
                                                )
                                        }
                                        placeholder={t(
                                            'العملة',
                                            'Currency',
                                        )}
                                    />

                                    <button
                                        type="button"
                                        className={
                                            button
                                        }
                                        disabled={
                                            busy
                                            || ! targetEmployeeId
                                            || targetValue ===
                                                ''
                                        }
                                        onClick={() =>
                                            void saveTarget()
                                        }
                                    >
                                        <Save
                                            size={13}
                                        />
                                        {t(
                                            'حفظ الهدف',
                                            'Save target',
                                        )}
                                    </button>
                                </div>

                                {data.targets.length >
                                    0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {data.targets
                                            .filter(
                                                target =>
                                                    target.dimension_type
                                                    ===
                                                    'employee'
                                                    && target.metric
                                                    ===
                                                    'sales',
                                            )
                                            .slice(
                                                0,
                                                12,
                                            )
                                            .map(
                                                target => {
                                                    const member =
                                                        data.members.find(
                                                            item =>
                                                                item.id
                                                                ===
                                                                Number(
                                                                    target.dimension_id,
                                                                ),
                                                        );

                                                    return (
                                                        <span
                                                            key={
                                                                target.id
                                                            }
                                                            className="rounded-full border border-[var(--ac-line)] px-2 py-1 text-[9px] text-[var(--ac-text-soft)]"
                                                        >
                                                            {member?.name
                                                                ?? '#'
                                                                + target.dimension_id}
                                                            {' · '}
                                                            {displayValue(
                                                                target.target_value,
                                                                ar,
                                                            )}
                                                            {' '}
                                                            {target.currency
                                                                ?? ''}
                                                        </span>
                                                    );
                                                },
                                            )}
                                    </div>
                                )}
                            </section>
                        )}

                        {result && (
                            <>
                                <section
                                    className={panel + ' p-4'}
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <LineChart
                                                size={14}
                                                className="text-[var(--ac-accent)]"
                                            />
                                            <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                                {t(
                                                    'النتيجة والتحليل',
                                                    'Result & visualization',
                                                )}
                                            </h3>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {([
                                                'table',
                                                'bar',
                                                'line',
                                                'area',
                                                'pie',
                                                'donut',
                                            ] as const).map(
                                                type => (
                                                    <button
                                                        key={
                                                            type
                                                        }
                                                        type="button"
                                                        className={
                                                            button
                                                            + (
                                                                chartType
                                                                ===
                                                                type
                                                                    ? ' border-[var(--ac-accent)] text-[var(--ac-accent)]'
                                                                    : ''
                                                            )
                                                        }
                                                        onClick={() =>
                                                            setChartType(
                                                                type,
                                                            )
                                                        }
                                                    >
                                                        {chartTypeLabel(
                                                            type,
                                                            ar,
                                                        )}
                                                    </button>
                                                ),
                                            )}

                                            <button
                                                type="button"
                                                className={
                                                    button
                                                }
                                                onClick={() =>
                                                    void saveSnapshot()
                                                }
                                            >
                                                <Snowflake
                                                    size={
                                                        13
                                                    }
                                                />
                                                {t(
                                                    'تجميد لقطة',
                                                    'Freeze snapshot',
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                className={
                                                    button
                                                }
                                                onClick={
                                                    exportCsv
                                                }
                                            >
                                                <Download
                                                    size={
                                                        13
                                                    }
                                                />
                                                CSV
                                            </button>

                                            <button
                                                type="button"
                                                className={
                                                    button
                                                }
                                                onClick={
                                                    printResult
                                                }
                                            >
                                                <Printer
                                                    size={
                                                        13
                                                    }
                                                />
                                                {t(
                                                    'طباعة',
                                                    'Print',
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2 text-[9px] text-[var(--ac-text-muted)]">
                                        <span>
                                            {result.date_from}
                                            {' → '}
                                            {result.date_to}
                                        </span>
                                        <span>•</span>
                                        <span>
                                            {
                                                displayedRows.length
                                            }
                                            {' '}
                                            {t(
                                                'صف',
                                                'rows',
                                            )}
                                        </span>

                                        {result.meta
                                            && Object.entries(
                                                result.meta,
                                            )
                                                .slice(
                                                    0,
                                                    8,
                                                )
                                                .map(
                                                    ([
                                                        key,
                                                        value,
                                                    ]) => (
                                                        <span
                                                            key={
                                                                key
                                                            }
                                                        >
                                                            •{' '}
                                                            {columnLabel(
                                                                key,
                                                                ar,
                                                            )}
                                                            :{' '}
                                                            {displayValue(
                                                                value,
                                                                ar,
                                                            )}
                                                        </span>
                                                    ),
                                                )}
                                    </div>

                                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                                        <select
                                            className={
                                                input
                                            }
                                            value={
                                                chartX
                                            }
                                            onChange={
                                                event =>
                                                    setChartX(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                            }
                                        >
                                            <option value="">
                                                {t(
                                                    'المحور الأفقي X',
                                                    'X axis',
                                                )}
                                            </option>
                                            {displayedColumns.map(
                                                column => (
                                                    <option
                                                        key={
                                                            column
                                                        }
                                                        value={
                                                            column
                                                        }
                                                    >
                                                        {columnLabel(
                                                            column,
                                                            ar,
                                                        )}
                                                    </option>
                                                ),
                                            )}
                                        </select>

                                        <select
                                            className={
                                                input
                                            }
                                            value={
                                                chartY
                                            }
                                            onChange={
                                                event =>
                                                    setChartY(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                            }
                                        >
                                            <option value="">
                                                {t(
                                                    'المحور الرأسي Y',
                                                    'Y axis',
                                                )}
                                            </option>
                                            {displayedColumns.map(
                                                column => (
                                                    <option
                                                        key={
                                                            column
                                                        }
                                                        value={
                                                            column
                                                        }
                                                    >
                                                        {columnLabel(
                                                            column,
                                                            ar,
                                                        )}
                                                    </option>
                                                ),
                                            )}
                                        </select>

                                        <select
                                            className={
                                                input
                                            }
                                            value={
                                                savedReportId
                                                ?? ''
                                            }
                                            onChange={
                                                event => {
                                                    const value =
                                                        event
                                                            .target
                                                            .value;

                                                    if (
                                                        value
                                                    ) {
                                                        loadSavedConfiguration(
                                                            Number(
                                                                value,
                                                            ),
                                                        );
                                                    } else {
                                                        setSavedReportId(
                                                            null,
                                                        );
                                                    }
                                                }
                                            }
                                        >
                                            <option value="">
                                                {t(
                                                    'اختر تقريراً محفوظاً',
                                                    'Choose saved report',
                                                )}
                                            </option>
                                            {data.reports.map(
                                                report => (
                                                    <option
                                                        key={
                                                            report.id
                                                        }
                                                        value={
                                                            report.id
                                                        }
                                                    >
                                                        {
                                                            report.name
                                                        }
                                                    </option>
                                                ),
                                            )}
                                        </select>

                                        <button
                                            type="button"
                                            className={
                                                button
                                            }
                                            disabled={
                                                ! savedReportId
                                            }
                                            onClick={() =>
                                                void saveVisualization()
                                            }
                                        >
                                            <Save
                                                size={13}
                                            />
                                            {t(
                                                'حفظ الرسم',
                                                'Save visualization',
                                            )}
                                        </button>
                                    </div>

                                    {chartType ===
                                    'table' ? (
                                        <ResultTable
                                            columns={
                                                displayedColumns
                                            }
                                            rows={
                                                displayedRows
                                            }
                                            onDrill={(
                                                row,
                                                key,
                                            ) =>
                                                void openDrill(
                                                    row,
                                                    key,
                                                )
                                            }
                                            ar={ar}
                                        />
                                    ) : (
                                        <SimpleChart
                                            rows={
                                                displayedRows
                                            }
                                            columns={
                                                displayedColumns
                                            }
                                            type={
                                                chartType
                                            }
                                            xKey={
                                                chartX
                                            }
                                            yKey={
                                                chartY
                                            }
                                            ar={ar}
                                        />
                                    )}
                                </section>

                                <section className="grid gap-4 2xl:grid-cols-2">
                                    <div
                                        className={panel + ' p-4'}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <Calculator
                                                    size={
                                                        14
                                                    }
                                                    className="text-[var(--ac-accent)]"
                                                />
                                                <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                                    {t(
                                                        'منشئ المعادلات',
                                                        'Formula Builder',
                                                    )}
                                                </h3>
                                            </div>

                                            <button
                                                type="button"
                                                className={
                                                    button
                                                    + ' h-8'
                                                }
                                                disabled={
                                                    ! savedReportId
                                                }
                                                onClick={() =>
                                                    void saveConfiguration()
                                                }
                                            >
                                                <Save
                                                    size={
                                                        12
                                                    }
                                                />
                                                {t(
                                                    'حفظ مع التقرير',
                                                    'Save with report',
                                                )}
                                            </button>
                                        </div>

                                        <p className="mt-2 text-[9px] leading-5 text-[var(--ac-text-muted)]">
                                            {t(
                                                'اكتب معادلة مثل [revenue] - [cost] أو ([gross_profit] / [revenue]) * 100. استخدم الحقول أدناه لإدخالها بدون أخطاء.',
                                                'Write formulas such as [revenue] - [cost] or ([gross_profit] / [revenue]) * 100. Use the field chips below to insert fields safely.',
                                            )}
                                        </p>

                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {result.columns.map(
                                                column => (
                                                    <button
                                                        key={
                                                            column
                                                        }
                                                        type="button"
                                                        draggable
                                                        onDragStart={
                                                            event =>
                                                                event.dataTransfer.setData(
                                                                    'text/plain',
                                                                    column,
                                                                )
                                                        }
                                                        onClick={() =>
                                                            insertFieldIntoFormula(
                                                                column,
                                                            )
                                                        }
                                                        className="inline-flex items-center gap-1 rounded-full border border-[var(--ac-line)] px-2 py-1 text-[9px] text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)]"
                                                    >
                                                        <GripVertical
                                                            size={
                                                                9
                                                            }
                                                        />
                                                        {columnLabel(
                                                            column,
                                                            ar,
                                                        )}
                                                    </button>
                                                ),
                                            )}
                                        </div>

                                        <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]">
                                            <input
                                                className={
                                                    input
                                                }
                                                value={
                                                    formulaName
                                                }
                                                onChange={
                                                    event =>
                                                        setFormulaName(
                                                            event
                                                                .target
                                                                .value,
                                                        )
                                                }
                                                placeholder={t(
                                                    'اسم الحقل',
                                                    'Field name',
                                                )}
                                            />

                                            <input
                                                className={
                                                    input
                                                }
                                                value={
                                                    formulaExpression
                                                }
                                                onChange={
                                                    event =>
                                                        setFormulaExpression(
                                                            event
                                                                .target
                                                                .value,
                                                        )
                                                }
                                                placeholder="[revenue] - [cost]"
                                            />

                                            <button
                                                type="button"
                                                className={
                                                    button
                                                }
                                                disabled={
                                                    ! formulaName.trim()
                                                    || ! formulaExpression.trim()
                                                }
                                                onClick={
                                                    addFormula
                                                }
                                            >
                                                {t(
                                                    'إضافة',
                                                    'Add',
                                                )}
                                            </button>
                                        </div>

                                        {formulas.length >
                                            0 && (
                                            <div className="mt-3 space-y-2">
                                                {formulas.map(
                                                    formula => (
                                                        <div
                                                            key={
                                                                formula.id
                                                            }
                                                            className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--ac-line)] p-2"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                                    {
                                                                        formula.name
                                                                    }
                                                                </p>
                                                                <p className="truncate text-[8px] text-[var(--ac-text-muted)]">
                                                                    {
                                                                        formula.expression
                                                                    }
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] hover:border-red-400/40 hover:text-red-300"
                                                                onClick={() =>
                                                                    setFormulas(
                                                                        current =>
                                                                            current.filter(
                                                                                item =>
                                                                                    item.id
                                                                                    !==
                                                                                    formula.id,
                                                                            ),
                                                                    )
                                                                }
                                                            >
                                                                <Trash2
                                                                    size={
                                                                        12
                                                                    }
                                                                />
                                                            </button>
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        className={panel + ' p-4'}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Table2
                                                size={14}
                                                className="text-[var(--ac-accent)]"
                                            />
                                            <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                                {t(
                                                    'منشئ Pivot بالسحب والإفلات',
                                                    'Drag & Drop Pivot Builder',
                                                )}
                                            </h3>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                            {displayedColumns.map(
                                                column => (
                                                    <button
                                                        key={
                                                            column
                                                        }
                                                        type="button"
                                                        draggable
                                                        onDragStart={
                                                            event =>
                                                                event.dataTransfer.setData(
                                                                    'text/plain',
                                                                    column,
                                                                )
                                                        }
                                                        className="inline-flex cursor-grab items-center gap-1 rounded-full border border-[var(--ac-line)] px-2 py-1 text-[9px] text-[var(--ac-text-soft)]"
                                                    >
                                                        <GripVertical
                                                            size={
                                                                9
                                                            }
                                                        />
                                                        {columnLabel(
                                                            column,
                                                            ar,
                                                        )}
                                                    </button>
                                                ),
                                            )}
                                        </div>

                                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                                            <PivotDropZone
                                                label={t(
                                                    'الصفوف',
                                                    'Rows',
                                                )}
                                                value={
                                                    pivot.row
                                                }
                                                ar={ar}
                                                onDrop={
                                                    field =>
                                                        setPivot(
                                                            current => ({
                                                                ...current,
                                                                row:
                                                                    field,
                                                            }),
                                                        )
                                                }
                                                onClear={() =>
                                                    setPivot(
                                                        current => ({
                                                            ...current,
                                                            row:
                                                                '',
                                                        }),
                                                    )
                                                }
                                            />

                                            <PivotDropZone
                                                label={t(
                                                    'الأعمدة',
                                                    'Columns',
                                                )}
                                                value={
                                                    pivot.column
                                                }
                                                ar={ar}
                                                onDrop={
                                                    field =>
                                                        setPivot(
                                                            current => ({
                                                                ...current,
                                                                column:
                                                                    field,
                                                            }),
                                                        )
                                                }
                                                onClear={() =>
                                                    setPivot(
                                                        current => ({
                                                            ...current,
                                                            column:
                                                                '',
                                                        }),
                                                    )
                                                }
                                            />

                                            <PivotDropZone
                                                label={t(
                                                    'القيم',
                                                    'Values',
                                                )}
                                                value={
                                                    pivot.value
                                                }
                                                ar={ar}
                                                onDrop={
                                                    field =>
                                                        setPivot(
                                                            current => ({
                                                                ...current,
                                                                value:
                                                                    field,
                                                            }),
                                                        )
                                                }
                                                onClear={() =>
                                                    setPivot(
                                                        current => ({
                                                            ...current,
                                                            value:
                                                                '',
                                                        }),
                                                    )
                                                }
                                            />
                                        </div>

                                        <label className="mt-3 block max-w-xs space-y-1">
                                            <span className="text-[9px] text-[var(--ac-text-muted)]">
                                                {t(
                                                    'طريقة التجميع',
                                                    'Aggregation',
                                                )}
                                            </span>
                                            <select
                                                className={
                                                    input
                                                    + ' w-full'
                                                }
                                                value={
                                                    pivot.aggregation
                                                }
                                                onChange={
                                                    event =>
                                                        setPivot(
                                                            current => ({
                                                                ...current,
                                                                aggregation:
                                                                    event
                                                                        .target
                                                                        .value as PivotConfiguration['aggregation'],
                                                            }),
                                                        )
                                                }
                                            >
                                                <option value="sum">
                                                    {t(
                                                        'المجموع',
                                                        'Sum',
                                                    )}
                                                </option>
                                                <option value="avg">
                                                    {t(
                                                        'المتوسط',
                                                        'Average',
                                                    )}
                                                </option>
                                                <option value="count">
                                                    {t(
                                                        'العدد',
                                                        'Count',
                                                    )}
                                                </option>
                                            </select>
                                        </label>

                                        {pivotData && (
                                            <div className="mt-3 max-h-[320px] overflow-auto rounded-[12px] border border-[var(--ac-line)]">
                                                <table className="w-full min-w-[520px] text-[9px]">
                                                    <thead className="sticky top-0 bg-[var(--ac-surface-soft)]">
                                                        <tr>
                                                            <th className="p-2 text-start">
                                                                {columnLabel(
                                                                    pivot.row,
                                                                    ar,
                                                                )}
                                                            </th>
                                                            {pivotData.columns.map(
                                                                column => (
                                                                    <th
                                                                        key={
                                                                            column
                                                                        }
                                                                        className="p-2 text-end"
                                                                    >
                                                                        {displayValue(
                                                                            column,
                                                                            ar,
                                                                        )}
                                                                    </th>
                                                                ),
                                                            )}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {pivotData.rows.map(
                                                            row => (
                                                                <tr
                                                                    key={
                                                                        row.label
                                                                    }
                                                                    className="border-t border-[var(--ac-line)]"
                                                                >
                                                                    <td className="p-2 text-[var(--ac-text)]">
                                                                        {displayValue(
                                                                            row.label,
                                                                            ar,
                                                                        )}
                                                                    </td>
                                                                    {pivotData.columns.map(
                                                                        column => (
                                                                            <td
                                                                                key={
                                                                                    column
                                                                                }
                                                                                className="p-2 text-end text-[var(--ac-text-soft)]"
                                                                            >
                                                                                {displayValue(
                                                                                    row.values[
                                                                                        column
                                                                                    ]
                                                                                    ?? 0,
                                                                                    ar,
                                                                                )}
                                                                            </td>
                                                                        ),
                                                                    )}
                                                                </tr>
                                                            ),
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="grid gap-4 xl:grid-cols-3">
                                    <div
                                        className={panel + ' p-4'}
                                    >
                                        <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                            {t(
                                                'ملاحظة على التقرير',
                                                'Report annotation',
                                            )}
                                        </h3>

                                        <textarea
                                            className="mt-3 min-h-24 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs text-[var(--ac-text)] outline-none"
                                            value={
                                                note
                                            }
                                            onChange={
                                                event =>
                                                    setNote(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                            }
                                        />

                                        <button
                                            type="button"
                                            className={
                                                button
                                                + ' mt-2 w-full'
                                            }
                                            disabled={
                                                ! note.trim()
                                            }
                                            onClick={() =>
                                                void saveText(
                                                    'annotations',
                                                    note,
                                                )
                                            }
                                        >
                                            <Save
                                                size={13}
                                            />
                                            {t(
                                                'حفظ الملاحظة',
                                                'Save annotation',
                                            )}
                                        </button>
                                    </div>

                                    <div
                                        className={panel + ' p-4'}
                                    >
                                        <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                            {t(
                                                'تعليق وتعاون',
                                                'Comment & collaborate',
                                            )}
                                        </h3>

                                        <select
                                            className={
                                                input
                                                + ' mt-3 w-full'
                                            }
                                            value={
                                                commentReportId
                                                ?? ''
                                            }
                                            onChange={
                                                event =>
                                                    setCommentReportId(
                                                        event
                                                            .target
                                                            .value
                                                            ? Number(
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                            : null,
                                                    )
                                            }
                                        >
                                            <option value="">
                                                {t(
                                                    'تعليق عام على التحليل الحالي',
                                                    'General comment on current analysis',
                                                )}
                                            </option>
                                            {data.reports.map(
                                                report => (
                                                    <option
                                                        key={
                                                            report.id
                                                        }
                                                        value={
                                                            report.id
                                                        }
                                                    >
                                                        {
                                                            report.name
                                                        }
                                                    </option>
                                                ),
                                            )}
                                        </select>

                                        <textarea
                                            className="mt-2 min-h-20 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs text-[var(--ac-text)] outline-none"
                                            value={
                                                comment
                                            }
                                            onChange={
                                                event =>
                                                    setComment(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                            }
                                            placeholder={t(
                                                'اكتب تعليقاً وحدد الأشخاص المطلوب تنبيههم...',
                                                'Write a comment and choose people to mention...',
                                            )}
                                        />

                                        <div className="mt-2 max-h-24 overflow-auto rounded-[10px] border border-[var(--ac-line)] p-2">
                                            {data.members.map(
                                                member => (
                                                    <label
                                                        key={
                                                            member.id
                                                        }
                                                        className="flex items-center gap-2 py-1 text-[9px] text-[var(--ac-text-soft)]"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                mentionIds.includes(
                                                                    member.id,
                                                                )
                                                            }
                                                            onChange={() =>
                                                                setMentionIds(
                                                                    current =>
                                                                        current.includes(
                                                                            member.id,
                                                                        )
                                                                            ? current.filter(
                                                                                id =>
                                                                                    id
                                                                                    !==
                                                                                    member.id,
                                                                            )
                                                                            : [
                                                                                ...current,
                                                                                member.id,
                                                                            ],
                                                                )
                                                            }
                                                        />
                                                        @
                                                        {
                                                            member.name
                                                        }
                                                    </label>
                                                ),
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            className={
                                                button
                                                + ' mt-2 w-full'
                                            }
                                            disabled={
                                                ! comment.trim()
                                            }
                                            onClick={() =>
                                                void saveText(
                                                    'comments',
                                                    comment,
                                                )
                                            }
                                        >
                                            <MessageSquareText
                                                size={13}
                                            />
                                            {t(
                                                'إضافة تعليق',
                                                'Add comment',
                                            )}
                                        </button>
                                    </div>

                                    <div
                                        className={panel + ' p-4'}
                                    >
                                        <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                            {t(
                                                'لوحة التقارير التنفيذية',
                                                'Executive Report Board',
                                            )}
                                        </h3>
                                        <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                            {t(
                                                'اختر من 4 إلى 8 تقارير محفوظة.',
                                                'Choose 4 to 8 saved reports.',
                                            )}
                                        </p>

                                        <input
                                            className={
                                                input
                                                + ' mt-3 w-full'
                                            }
                                            value={
                                                boardName
                                            }
                                            onChange={
                                                event =>
                                                    setBoardName(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                            }
                                            placeholder={t(
                                                'اسم اللوحة',
                                                'Board name',
                                            )}
                                        />

                                        <div className="mt-2 max-h-28 overflow-auto text-[9px]">
                                            {data.reports.length ===
                                            0 ? (
                                                <p className="py-2 text-[var(--ac-text-muted)]">
                                                    {t(
                                                        'احفظ تقارير من منشئ التقارير أولاً.',
                                                        'Save reports in Report Builder first.',
                                                    )}
                                                </p>
                                            ) : (
                                                data.reports.map(
                                                    report => (
                                                        <label
                                                            key={
                                                                report.id
                                                            }
                                                            className="flex items-center gap-2 py-1 text-[var(--ac-text-soft)]"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    boardReports.includes(
                                                                        report.id,
                                                                    )
                                                                }
                                                                disabled={
                                                                    ! boardReports.includes(
                                                                        report.id,
                                                                    )
                                                                    && boardReports.length >=
                                                                        8
                                                                }
                                                                onChange={() =>
                                                                    setBoardReports(
                                                                        current =>
                                                                            current.includes(
                                                                                report.id,
                                                                            )
                                                                                ? current.filter(
                                                                                    id =>
                                                                                        id
                                                                                        !==
                                                                                        report.id,
                                                                                )
                                                                                : [
                                                                                    ...current,
                                                                                    report.id,
                                                                                ],
                                                                    )
                                                                }
                                                            />
                                                            {
                                                                report.name
                                                            }
                                                        </label>
                                                    ),
                                                )
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            className={
                                                button
                                                + ' mt-2 w-full'
                                            }
                                            onClick={() =>
                                                void saveBoard()
                                            }
                                            disabled={
                                                ! boardName.trim()
                                                || boardReports.length <
                                                    4
                                                || boardReports.length >
                                                    8
                                            }
                                        >
                                            <Save
                                                size={13}
                                            />
                                            {t(
                                                'حفظ اللوحة',
                                                'Save board',
                                            )}
                                            {' ('}
                                            {
                                                boardReports.length
                                            }
                                            /8)
                                        </button>
                                    </div>
                                </section>
                            </>
                        )}
                    </section>
                </div>

                {activeBoard && (
                    <section
                        className={panel + ' mt-4 p-4'}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ac-accent)]">
                                    {t(
                                        'لوحة تنفيذية',
                                        'EXECUTIVE BOARD',
                                    )}
                                </p>
                                <h2 className="mt-1 text-lg font-bold text-[var(--ac-text)]">
                                    {
                                        activeBoard.name
                                    }
                                </h2>
                            </div>

                            <button
                                type="button"
                                className={button}
                                onClick={() =>
                                    setActiveBoardId(
                                        null,
                                    )
                                }
                            >
                                {t(
                                    'إغلاق اللوحة',
                                    'Close board',
                                )}
                            </button>
                        </div>

                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            {activeBoard.layout
                                .slice()
                                .sort(
                                    (
                                        first,
                                        second,
                                    ) =>
                                        first.order
                                        - second.order,
                                )
                                .map(item => {
                                    const report =
                                        data.reports.find(
                                            candidate =>
                                                candidate.id
                                                ===
                                                item.report_id,
                                        );
                                    const state =
                                        boardRuns[
                                            item.report_id
                                        ];

                                    return (
                                        <BoardReportCard
                                            key={
                                                item.report_id
                                            }
                                            report={
                                                report
                                            }
                                            state={
                                                state
                                            }
                                            ar={ar}
                                        />
                                    );
                                })}
                        </div>
                    </section>
                )}

                <section className="mt-4 grid gap-4 xl:grid-cols-3">
                    <div
                        className={panel + ' p-4'}
                    >
                        <h3 className="text-xs font-bold text-[var(--ac-text)]">
                            {t(
                                'اللقطات المحفوظة',
                                'Saved snapshots',
                            )}
                        </h3>

                        <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                            {data.snapshots.length ===
                            0 ? (
                                <p className="text-[9px] text-[var(--ac-text-muted)]">
                                    {t(
                                        'لا توجد لقطات بعد.',
                                        'No snapshots yet.',
                                    )}
                                </p>
                            ) : (
                                data.snapshots.map(
                                    snapshot => (
                                        <button
                                            key={
                                                snapshot.id
                                            }
                                            type="button"
                                            className="w-full rounded-[10px] border border-[var(--ac-line)] p-2 text-start hover:border-[var(--ac-accent)]"
                                            onClick={() =>
                                                openSnapshot(
                                                    snapshot,
                                                )
                                            }
                                        >
                                            <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                {
                                                    snapshot.name
                                                }
                                            </p>
                                            <p className="text-[8px] text-[var(--ac-text-muted)]">
                                                {
                                                    snapshot.as_of_date
                                                }
                                            </p>
                                        </button>
                                    ),
                                )
                            )}
                        </div>
                    </div>

                    <div
                        className={panel + ' p-4'}
                    >
                        <h3 className="text-xs font-bold text-[var(--ac-text)]">
                            {t(
                                'اللوحات التنفيذية',
                                'Executive boards',
                            )}
                        </h3>

                        <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                            {data.boards.length ===
                            0 ? (
                                <p className="text-[9px] text-[var(--ac-text-muted)]">
                                    {t(
                                        'لا توجد لوحات بعد.',
                                        'No boards yet.',
                                    )}
                                </p>
                            ) : (
                                data.boards.map(
                                    board => (
                                        <button
                                            key={
                                                board.id
                                            }
                                            type="button"
                                            className={[
                                                'w-full rounded-[10px] border p-2 text-start',
                                                activeBoardId ===
                                                board.id
                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                                    : 'border-[var(--ac-line)] hover:border-[var(--ac-accent)]',
                                            ].join(
                                                ' ',
                                            )}
                                            onClick={() =>
                                                void openBoard(
                                                    board,
                                                )
                                            }
                                        >
                                            <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                {
                                                    board.name
                                                }
                                            </p>
                                            <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                                                {board.layout
                                                    .map(
                                                        item =>
                                                            data.reports.find(
                                                                report =>
                                                                    report.id
                                                                    ===
                                                                    item.report_id,
                                                            )
                                                                ?.name
                                                            ?? '#'
                                                            + item.report_id,
                                                    )
                                                    .join(
                                                        ' · ',
                                                    )}
                                            </p>
                                        </button>
                                    ),
                                )
                            )}
                        </div>
                    </div>

                    <div
                        className={panel + ' p-4'}
                    >
                        <h3 className="text-xs font-bold text-[var(--ac-text)]">
                            {t(
                                'الاعتماد والتوقيع',
                                'Approval & sign-off',
                            )}
                        </h3>

                        <input
                            className={
                                input
                                + ' mt-3 w-full'
                            }
                            value={
                                approvalNote
                            }
                            onChange={
                                event =>
                                    setApprovalNote(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            placeholder={t(
                                'ملاحظة الاعتماد أو الرفض',
                                'Approval or rejection note',
                            )}
                        />

                        <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                            {data.reports.map(
                                report => {
                                    const approval =
                                        currentApproval(
                                            report.id,
                                        );
                                    const status =
                                        String(
                                            approval?.status
                                            ?? 'pending',
                                        );

                                    return (
                                        <div
                                            key={
                                                report.id
                                            }
                                            className="rounded-[10px] border border-[var(--ac-line)] p-2"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-[10px] font-semibold text-[var(--ac-text)]">
                                                        {
                                                            report.name
                                                        }
                                                    </p>
                                                    <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                                                        {displayValue(
                                                            status,
                                                            ar,
                                                        )}
                                                        {approval?.reviewer_name
                                                            ? ' · '
                                                                + approval.reviewer_name
                                                            : ''}
                                                    </p>
                                                </div>

                                                <div className="flex gap-1">
                                                    <button
                                                        type="button"
                                                        title={t(
                                                            'اعتماد',
                                                            'Approve',
                                                        )}
                                                        className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-emerald-400/40 hover:text-emerald-300"
                                                        onClick={() =>
                                                            void reviewReport(
                                                                report.id,
                                                                'approved',
                                                            )
                                                        }
                                                    >
                                                        <CheckCircle2
                                                            size={
                                                                12
                                                            }
                                                        />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        title={t(
                                                            'رفض',
                                                            'Reject',
                                                        )}
                                                        className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-red-400/40 hover:text-red-300"
                                                        onClick={() =>
                                                            void reviewReport(
                                                                report.id,
                                                                'rejected',
                                                            )
                                                        }
                                                    >
                                                        <XCircle
                                                            size={
                                                                12
                                                            }
                                                        />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    </div>
                </section>

                {(data.annotations.length >
                    0
                    || data.comments.length >
                        0) && (
                    <section className="mt-4 grid gap-4 lg:grid-cols-2">
                        <div
                            className={panel + ' p-4'}
                        >
                            <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                {t(
                                    'ملاحظات التقارير',
                                    'Report annotations',
                                )}
                            </h3>

                            <div className="mt-3 max-h-60 space-y-2 overflow-auto">
                                {data.annotations.map(
                                    item => (
                                        <div
                                            key={
                                                Number(
                                                    item.id,
                                                )
                                            }
                                            className="rounded-[10px] border border-[var(--ac-line)] p-3"
                                        >
                                            <p className="text-[10px] text-[var(--ac-text)]">
                                                {String(
                                                    item.body
                                                    ?? '',
                                                )}
                                            </p>
                                            <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                                                {String(
                                                    item.creator_name
                                                    ?? '',
                                                )}
                                                {' · '}
                                                {String(
                                                    item.created_at
                                                    ?? '',
                                                )}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>

                        <div
                            className={panel + ' p-4'}
                        >
                            <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                {t(
                                    'التعليقات والتعاون',
                                    'Comments & collaboration',
                                )}
                            </h3>

                            <div className="mt-3 max-h-60 space-y-2 overflow-auto">
                                {data.comments.map(
                                    item => (
                                        <div
                                            key={
                                                Number(
                                                    item.id,
                                                )
                                            }
                                            className="rounded-[10px] border border-[var(--ac-line)] p-3"
                                        >
                                            <p className="text-[10px] text-[var(--ac-text)]">
                                                {String(
                                                    item.body
                                                    ?? '',
                                                )}
                                            </p>
                                            <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                                                {String(
                                                    item.creator_name
                                                    ?? '',
                                                )}
                                                {' · '}
                                                {String(
                                                    item.created_at
                                                    ?? '',
                                                )}
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {drill && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                        onClick={() =>
                            setDrill(null)
                        }
                    >
                        <div
                            className={
                                panel
                                + ' max-h-[85vh] w-full max-w-5xl overflow-auto p-5'
                            }
                            onClick={
                                event =>
                                    event.stopPropagation()
                            }
                        >
                            <h3 className="text-sm font-bold text-[var(--ac-text)]">
                                {t(
                                    'الاستكشاف التفاعلي',
                                    'Interactive Drill-Down',
                                )}
                                {' · '}
                                {columnLabel(
                                    drill.key,
                                    ar,
                                )}
                            </h3>

                            {drill.loading && (
                                <p className="mt-4 text-xs text-[var(--ac-text-muted)]">
                                    {t(
                                        'تحميل التفاصيل...',
                                        'Loading details...',
                                    )}
                                </p>
                            )}

                            {drill.details && (
                                <>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {drill.details.breadcrumbs.map(
                                            (
                                                crumb,
                                                index,
                                            ) => (
                                                <span
                                                    key={
                                                        index
                                                    }
                                                    className="rounded-full border border-[var(--ac-line)] px-2 py-1 text-[9px] text-[var(--ac-text-soft)]"
                                                >
                                                    {columnLabel(
                                                        crumb.label.toLowerCase(),
                                                        ar,
                                                    )}
                                                    :{' '}
                                                    {displayValue(
                                                        crumb.value,
                                                        ar,
                                                    )}
                                                </span>
                                            ),
                                        )}
                                    </div>

                                    <h4 className="mt-5 text-xs font-bold text-[var(--ac-text)]">
                                        {t(
                                            'حسب الشهر',
                                            'By month',
                                        )}
                                    </h4>
                                    <ResultTable
                                        columns={
                                            drill.details
                                                .months
                                                .length
                                                ? Object.keys(
                                                    drill
                                                        .details
                                                        .months[0],
                                                )
                                                : []
                                        }
                                        rows={
                                            drill.details
                                                .months
                                        }
                                        onDrill={row => {
                                            const month =
                                                String(
                                                    row.label
                                                    ?? '',
                                                );

                                            if (month) {
                                                void openDrillMonth(
                                                    month,
                                                );
                                            }
                                        }}
                                        ar={ar}
                                    />

                                    <h4 className="mt-5 text-xs font-bold text-[var(--ac-text)]">
                                        {t(
                                            'الفواتير',
                                            'Invoices',
                                        )}
                                    </h4>
                                    <ResultTable
                                        columns={
                                            drill.details
                                                .invoices
                                                .length
                                                ? Object.keys(
                                                    drill
                                                        .details
                                                        .invoices[0],
                                                ).filter(
                                                    key =>
                                                        ! [
                                                            'invoice_url',
                                                            'party_url',
                                                            'party_id',
                                                        ].includes(
                                                            key,
                                                        ),
                                                )
                                                : []
                                        }
                                        rows={
                                            drill.details
                                                .invoices
                                        }
                                        onDrill={() => {}}
                                        ar={ar}
                                    />
                                </>
                            )}

                            {! drill.loading
                                && ! drill.details && (
                                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                    {Object.entries(
                                        drill.row,
                                    ).map(
                                        ([
                                            key,
                                            value,
                                        ]) => (
                                            <div
                                                key={
                                                    key
                                                }
                                                className="rounded-[11px] border border-[var(--ac-line)] p-3"
                                            >
                                                <p className="text-[9px] text-[var(--ac-text-muted)]">
                                                    {columnLabel(
                                                        key,
                                                        ar,
                                                    )}
                                                </p>
                                                <p className="mt-1 break-words text-xs font-semibold text-[var(--ac-text)]">
                                                    {displayValue(
                                                        value,
                                                        ar,
                                                    )}
                                                </p>
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}

                            <button
                                type="button"
                                className={
                                    button
                                    + ' mt-4 w-full'
                                }
                                onClick={() =>
                                    setDrill(null)
                                }
                            >
                                {t(
                                    'إغلاق',
                                    'Close',
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </AppShell>
    );
}

function PivotDropZone({
    label,
    value,
    onDrop,
    onClear,
    ar,
}: {
    label: string;
    value: string;
    onDrop: (field: string) => void;
    onClear: () => void;
    ar: boolean;
}) {
    function handleDrop(
        event: DragEvent<HTMLDivElement>,
    ): void {
        event.preventDefault();
        const field =
            event.dataTransfer.getData(
                'text/plain',
            );

        if (field) {
            onDrop(field);
        }
    }

    return (
        <div
            onDragOver={event =>
                event.preventDefault()
            }
            onDrop={handleDrop}
            className="min-h-20 rounded-[12px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-bg)] p-3"
        >
            <p className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                {label}
            </p>

            {value ? (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-[9px] border border-[var(--ac-line)] px-2 py-1.5">
                    <span className="text-[10px] font-semibold text-[var(--ac-text)]">
                        {columnLabel(
                            value,
                            ar,
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={onClear}
                        className="text-[var(--ac-text-muted)] hover:text-red-300"
                    >
                        ×
                    </button>
                </div>
            ) : (
                <p className="mt-2 text-[9px] text-[var(--ac-text-muted)]">
                    {ar
                        ? 'اسحب حقلاً إلى هنا'
                        : 'Drag a field here'}
                </p>
            )}
        </div>
    );
}

function buildPivot(
    rows: Array<Record<string, unknown>>,
    config: PivotConfiguration,
): {
    columns: string[];
    rows: Array<{
        label: string;
        values: Record<string, number>;
    }>;
} | null {
    if (
        ! config.row
        || ! config.value
    ) {
        return null;
    }

    const buckets =
        new Map<
            string,
            Map<
                string,
                {
                    sum: number;
                    count: number;
                }
            >
        >();
    const columns =
        new Set<string>();

    rows.forEach(row => {
        const rowKey = String(
            row[config.row]
            ?? '—',
        );
        const columnKey =
            config.column
                ? String(
                    row[
                        config.column
                    ]
                    ?? '—',
                )
                : 'Total';

        columns.add(columnKey);

        const rowBucket =
            buckets.get(rowKey)
            ?? new Map();

        const cell =
            rowBucket.get(
                columnKey,
            )
            ?? {
                sum: 0,
                count: 0,
            };

        const numeric =
            Number(
                row[
                    config.value
                ]
                ?? 0,
            );

        cell.sum +=
            Number.isFinite(numeric)
                ? numeric
                : 0;
        cell.count += 1;

        rowBucket.set(
            columnKey,
            cell,
        );
        buckets.set(
            rowKey,
            rowBucket,
        );
    });

    const pivotColumns =
        Array.from(columns);

    return {
        columns:
            pivotColumns,
        rows:
            Array.from(
                buckets.entries(),
            ).map(
                ([
                    label,
                    values,
                ]) => ({
                    label,
                    values:
                        Object.fromEntries(
                            pivotColumns.map(
                                column => {
                                    const cell =
                                        values.get(
                                            column,
                                        )
                                        ?? {
                                            sum:
                                                0,
                                            count:
                                                0,
                                        };

                                    const value =
                                        config.aggregation
                                        ===
                                        'count'
                                            ? cell.count
                                            : config.aggregation
                                            ===
                                            'avg'
                                                ? (
                                                    cell.count
                                                    ===
                                                    0
                                                        ? 0
                                                        : cell.sum
                                                            / cell.count
                                                )
                                                : cell.sum;

                                    return [
                                        column,
                                        value,
                                    ];
                                },
                            ),
                        ),
                }),
            ),
    };
}

function ResultTable({
    columns,
    rows,
    onDrill,
    ar,
}: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    onDrill: (
        row: Record<string, unknown>,
        key: string,
    ) => void;
    ar: boolean;
}) {
    return (
        <div className="mt-4 max-h-[580px] overflow-auto rounded-[14px] border border-[var(--ac-line)]">
            <table className="w-full min-w-[800px] text-[10px]">
                <thead className="sticky top-0 bg-[var(--ac-surface-soft)]">
                    <tr>
                        {columns.map(
                            column => (
                                <th
                                    key={
                                        column
                                    }
                                    className="border-b border-[var(--ac-line)] px-3 py-2 text-start font-semibold text-[var(--ac-text-muted)]"
                                >
                                    {columnLabel(
                                        column,
                                        ar,
                                    )}
                                </th>
                            ),
                        )}
                    </tr>
                </thead>

                <tbody className="divide-y divide-[var(--ac-line)]">
                    {rows.map(
                        (
                            row,
                            index,
                        ) => (
                            <tr
                                key={
                                    index
                                }
                                className="hover:bg-[var(--ac-surface-soft)]"
                            >
                                {columns.map(
                                    column => {
                                        const value =
                                            row[
                                                column
                                            ];
                                        const numeric =
                                            typeof value
                                            ===
                                            'number'
                                            || (
                                                value
                                                !==
                                                null
                                                && value
                                                !==
                                                ''
                                                && ! Number.isNaN(
                                                    Number(
                                                        value,
                                                    ),
                                                )
                                            );

                                        const linkUrl =
                                            column ===
                                                'number'
                                                && typeof row.invoice_url
                                                    ===
                                                    'string'
                                                ? row.invoice_url
                                                : column ===
                                                        'party'
                                                    && typeof row.party_url
                                                        ===
                                                        'string'
                                                    ? row.party_url
                                                    : null;

                                        return (
                                            <td
                                                key={
                                                    column
                                                }
                                                className="max-w-[340px] px-3 py-2 text-[var(--ac-text-soft)]"
                                            >
                                                {linkUrl ? (
                                                    <a
                                                        href={
                                                            linkUrl
                                                        }
                                                        className="font-semibold text-[var(--ac-accent)] hover:underline"
                                                    >
                                                        {displayValue(
                                                            value,
                                                            ar,
                                                        )}
                                                    </a>
                                                ) : numeric ? (
                                                    <button
                                                        type="button"
                                                        className="font-semibold text-[var(--ac-accent)] hover:underline"
                                                        onClick={() =>
                                                            onDrill(
                                                                row,
                                                                column,
                                                            )
                                                        }
                                                    >
                                                        {displayValue(
                                                            value,
                                                            ar,
                                                        )}
                                                    </button>
                                                ) : (
                                                    <span className="break-words">
                                                        {displayValue(
                                                            value,
                                                            ar,
                                                        )}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    },
                                )}
                            </tr>
                        ),
                    )}
                </tbody>
            </table>
        </div>
    );
}

function SimpleChart({
    rows,
    columns,
    type,
    xKey,
    yKey,
    ar,
}: {
    rows: Array<Record<string, unknown>>;
    columns: string[];
    type:
        | 'bar'
        | 'line'
        | 'area'
        | 'pie'
        | 'donut';
    xKey?: string;
    yKey?: string;
    ar: boolean;
}) {
    const numeric =
        yKey
        || columns.find(
            column =>
                rows.some(
                    row =>
                        typeof row[
                            column
                        ] ===
                            'number'
                        || ! Number.isNaN(
                            Number(
                                row[
                                    column
                                ],
                            ),
                        ),
                ),
        );

    const label =
        xKey
        || columns.find(
            column =>
                column !==
                numeric,
        )
        || columns[0];

    const points =
        rows.slice(0, 20).map(
            row => ({
                label:
                    String(
                        row[
                            label
                        ]
                        ?? '—',
                    ),
                value:
                    Number(
                        row[
                            numeric
                            ?? ''
                        ]
                        ?? 0,
                    ),
            }),
        );

    const max =
        Math.max(
            1,
            ...points.map(
                point =>
                    Math.abs(
                        point.value,
                    ),
            ),
        );

    if (! numeric) {
        return (
            <div className="mt-4 p-8 text-center text-xs text-[var(--ac-text-muted)]">
                {ar
                    ? 'لا يوجد حقل رقمي متاح للرسم.'
                    : 'No numeric field available.'}
            </div>
        );
    }

    if (
        type === 'line'
        || type === 'area'
    ) {
        const path =
            points
                .map(
                    (
                        point,
                        index,
                    ) =>
                        `${index === 0 ? 'M' : 'L'} ${20 + index * (760 / Math.max(1, points.length - 1))} ${190 - (Math.max(0, point.value) / max) * 160}`,
                )
                .join(' ');

        const areaPath =
            path
            + ` L ${20 + Math.max(0, points.length - 1) * (760 / Math.max(1, points.length - 1))} 190 L 20 190 Z`;

        return (
            <div className="mt-4 overflow-x-auto rounded-[14px] border border-[var(--ac-line)] p-4">
                <svg
                    viewBox="0 0 800 220"
                    className="min-w-[720px]"
                >
                    {type ===
                        'area' && (
                        <path
                            d={
                                areaPath
                            }
                            fill="currentColor"
                            opacity="0.12"
                            className="text-[var(--ac-accent)]"
                        />
                    )}

                    <path
                        d={path}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-[var(--ac-accent)]"
                    />

                    {points.map(
                        (
                            point,
                            index,
                        ) => (
                            <circle
                                key={
                                    index
                                }
                                cx={
                                    20
                                    + index
                                        * (
                                            760
                                            / Math.max(
                                                1,
                                                points.length
                                                - 1,
                                            )
                                        )
                                }
                                cy={
                                    190
                                    - (
                                        Math.max(
                                            0,
                                            point.value,
                                        )
                                        / max
                                    )
                                        * 160
                                }
                                r="3"
                                fill="currentColor"
                                className="text-[var(--ac-accent)]"
                            />
                        ),
                    )}
                </svg>
            </div>
        );
    }

    if (
        type === 'pie'
        || type === 'donut'
    ) {
        const total =
            Math.max(
                1,
                points.reduce(
                    (
                        sum,
                        point,
                    ) =>
                        sum
                        + Math.max(
                            0,
                            point.value,
                        ),
                    0,
                ),
            );

        let cursor = 0;

        const stops =
            points
                .map(
                    (
                        point,
                        index,
                    ) => {
                        const start =
                            cursor;
                        cursor +=
                            (
                                Math.max(
                                    0,
                                    point.value,
                                )
                                / total
                            )
                            * 100;

                        const hue =
                            (
                                index
                                * 47
                            )
                            % 360;

                        return `hsl(${hue} 70% 55%) ${start}% ${cursor}%`;
                    },
                )
                .join(', ');

        return (
            <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
                <div
                    className="mx-auto size-56 rounded-full"
                    style={{
                        background:
                            `conic-gradient(${stops})`,
                        WebkitMask:
                            type ===
                            'donut'
                                ? 'radial-gradient(circle at center, transparent 0 38%, black 39%)'
                                : undefined,
                        mask:
                            type ===
                            'donut'
                                ? 'radial-gradient(circle at center, transparent 0 38%, black 39%)'
                                : undefined,
                    }}
                />

                <div className="space-y-2">
                    {points.map(
                        (
                            point,
                            index,
                        ) => (
                            <div
                                key={
                                    index
                                }
                                className="flex items-center justify-between gap-3 text-[9px]"
                            >
                                <span className="truncate text-[var(--ac-text-soft)]">
                                    {displayValue(
                                        point.label,
                                        ar,
                                    )}
                                </span>
                                <span className="font-semibold text-[var(--ac-text)]">
                                    {displayValue(
                                        point.value,
                                        ar,
                                    )}
                                    {' · '}
                                    {(
                                        (
                                            Math.max(
                                                0,
                                                point.value,
                                            )
                                            / total
                                        )
                                        * 100
                                    ).toFixed(
                                        1,
                                    )}
                                    %
                                </span>
                            </div>
                        ),
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="mt-4 space-y-2">
            {points.map(
                (
                    point,
                    index,
                ) => (
                    <div
                        key={index}
                        className="grid grid-cols-[150px_1fr_100px] items-center gap-2 text-[9px]"
                    >
                        <span className="truncate text-[var(--ac-text-soft)]">
                            {displayValue(
                                point.label,
                                ar,
                            )}
                        </span>

                        <div className="h-2 overflow-hidden rounded-full bg-[var(--ac-surface-soft)]">
                            <div
                                className="h-full rounded-full bg-[var(--ac-accent)]"
                                style={{
                                    width:
                                        Math.max(
                                            1,
                                            (
                                                Math.abs(
                                                    point.value,
                                                )
                                                / max
                                            )
                                            * 100,
                                        )
                                        + '%',
                                }}
                            />
                        </div>

                        <span className="text-end font-semibold text-[var(--ac-text)]">
                            {displayValue(
                                point.value,
                                ar,
                            )}
                        </span>
                    </div>
                ),
            )}
        </div>
    );
}

function BoardReportCard({
    report,
    state,
    ar,
}: {
    report: SavedReport | undefined;
    state: BoardRunState | undefined;
    ar: boolean;
}) {
    if (! report) {
        return null;
    }

    if (
        ! state
        || state.status ===
            'loading'
    ) {
        return (
            <article className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4">
                <h3 className="text-xs font-bold text-[var(--ac-text)]">
                    {report.name}
                </h3>
                <p className="mt-3 text-[10px] text-[var(--ac-text-muted)]">
                    {ar
                        ? 'تحميل التقرير...'
                        : 'Loading report...'}
                </p>
            </article>
        );
    }

    if (
        state.status ===
        'error'
    ) {
        return (
            <article className="rounded-[16px] border border-red-400/30 bg-red-500/10 p-4">
                <h3 className="text-xs font-bold text-[var(--ac-text)]">
                    {report.name}
                </h3>
                <p className="mt-3 text-[10px] text-red-300">
                    {state.error}
                </p>
            </article>
        );
    }

    const result =
        state.result;

    if (! result) {
        return null;
    }

    const formulas =
        report.configuration?.formulas
        ?? [];
    const rows =
        applyFormulas(
            result.rows,
            formulas,
        );
    const columns = [
        ...result.columns.map(
            column =>
                column.key,
        ),
        ...formulas.map(
            formula =>
                formula.name,
        ),
    ];

    const visualization =
        report.visualization
        ?? {
            type:
                'table' as const,
            x: null,
            y: null,
        };

    return (
        <article className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold text-[var(--ac-text)]">
                    {report.name}
                </h3>
                <span className="text-[8px] text-[var(--ac-text-muted)]">
                    {rows.length}
                    {' '}
                    {ar
                        ? 'صف'
                        : 'rows'}
                </span>
            </div>

            {visualization.type
                && visualization.type !==
                    'table' ? (
                <SimpleChart
                    rows={rows}
                    columns={
                        columns
                    }
                    type={
                        visualization.type
                    }
                    xKey={
                        visualization.x
                        ?? undefined
                    }
                    yKey={
                        visualization.y
                        ?? undefined
                    }
                    ar={ar}
                />
            ) : (
                <div className="mt-3 max-h-64 overflow-auto">
                    <table className="w-full min-w-[520px] text-[9px]">
                        <thead>
                            <tr>
                                {columns
                                    .slice(
                                        0,
                                        6,
                                    )
                                    .map(
                                        column => (
                                            <th
                                                key={
                                                    column
                                                }
                                                className="border-b border-[var(--ac-line)] p-2 text-start text-[var(--ac-text-muted)]"
                                            >
                                                {columnLabel(
                                                    column,
                                                    ar,
                                                )}
                                            </th>
                                        ),
                                    )}
                            </tr>
                        </thead>
                        <tbody>
                            {rows
                                .slice(
                                    0,
                                    8,
                                )
                                .map(
                                    (
                                        row,
                                        index,
                                    ) => (
                                        <tr
                                            key={
                                                index
                                            }
                                            className="border-b border-[var(--ac-line)]"
                                        >
                                            {columns
                                                .slice(
                                                    0,
                                                    6,
                                                )
                                                .map(
                                                    column => (
                                                        <td
                                                            key={
                                                                column
                                                            }
                                                            className="p-2 text-[var(--ac-text-soft)]"
                                                        >
                                                            {displayValue(
                                                                row[
                                                                    column
                                                                ],
                                                                ar,
                                                            )}
                                                        </td>
                                                    ),
                                                )}
                                        </tr>
                                    ),
                                )}
                        </tbody>
                    </table>
                </div>
            )}
        </article>
    );
}

function escapeHtml(
    value: string,
): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
