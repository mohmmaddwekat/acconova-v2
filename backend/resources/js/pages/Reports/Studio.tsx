import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    BarChart3,
    Bookmark,
    Boxes,
    Calculator,
    ChevronRight,
    CircleDollarSign,
    FileCheck2,
    Filter,
    GitCompareArrows,
    LineChart,
    MessageSquareText,
    Play,
    Save,
    Search,
    Snowflake,
    Sparkles,
    Table2,
    TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Feature = { number: number; key: string; title: string; title_ar: string; category: string };
type Result = {
    feature: string;
    date_from: string;
    date_to: string;
    columns: string[];
    rows: Array<Record<string, unknown>>;
    meta?: Record<string, unknown>;
};
type StudioIndex = {
    features: Feature[];
    snapshots: Array<{ id: number; name: string; as_of_date: string; definition: string; payload: string }>;
    presets: Array<{ id: number; name: string; scope: string; filters: string }>;
    boards: Array<{ id: number; name: string; layout: Array<{ report_id: number; order: number }>; shared: boolean }>;
    reports: Array<{ id: number; name: string; dataset: string; shared: boolean; visualization?: string | null }>;
    annotations: Array<Record<string, unknown>>;
    comments: Array<Record<string, unknown>>;
    approvals: Array<Record<string, unknown>>;
};

type DrillResult = {
    breadcrumbs: Array<{ label: string; value: string }>;
    months: Array<Record<string, unknown>>;
    invoices: Array<Record<string, unknown>>;
};

const panel = 'rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)]';
const input = 'h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';
const button = 'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40';

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
    change_percent: ['نسبة التغير', 'Change %'],
    actual: ['الفعلي', 'Actual'],
    budget: ['الميزانية', 'Budget'],
    target: ['الهدف', 'Target'],
    variance: ['الانحراف', 'Variance'],
    variance_percent: ['نسبة الانحراف', 'Variance %'],
    dimension: ['البعد', 'Dimension'],
    revenue: ['الإيرادات', 'Revenue'],
    discounts: ['الخصومات', 'Discounts'],
    cost: ['التكلفة', 'Cost'],
    gross_profit: ['الربح الإجمالي', 'Gross profit'],
    margin_percent: ['هامش الربح %', 'Margin %'],
    quantity: ['الكمية', 'Quantity'],
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
    purchased: ['المشتريات', 'Purchased'],
    produced: ['الإنتاج', 'Produced'],
    sold: ['المباع', 'Sold'],
    adjusted: ['التسويات', 'Adjusted'],
    returned: ['المرتجع', 'Returned'],
    net_movement: ['صافي الحركة', 'Net movement'],
    on_hand: ['الكمية المتوفرة', 'On hand'],
    opening_stock: ['مخزون أول المدة', 'Opening stock'],
    closing_stock: ['مخزون آخر المدة', 'Closing stock'],
    days_without_sale: ['أيام بدون بيع', 'Days without sale'],
    frozen_capital: ['رأس المال المجمّد', 'Frozen capital'],
    bucket: ['الفئة الزمنية', 'Bucket'],
    sold_quantity: ['الكمية المباعة', 'Sold quantity'],
    turnover: ['معدل الدوران', 'Turnover'],
    cost_price: ['سعر التكلفة', 'Cost price'],
    stock_value: ['قيمة المخزون', 'Stock value'],
    snapshot_date: ['تاريخ اللقطة', 'Snapshot date'],
    min_price: ['أقل سعر شراء', 'Minimum price'],
    max_price: ['أعلى سعر شراء', 'Maximum price'],
    avg_price: ['متوسط سعر الشراء', 'Average price'],
    purchase_price_change: ['تغير سعر الشراء', 'Purchase price change'],
    purchase_price_change_percent: ['تغير سعر الشراء %', 'Purchase price change %'],
    supplier_returns: ['مرتجعات المورد', 'Supplier returns'],
    supplier_return_count: ['عدد مرتجعات المورد', 'Supplier return count'],
    late_orders: ['طلبات متأخرة', 'Late orders'],
    problem_count: ['عدد المشاكل', 'Problem count'],
    avg_payment_terms_days: ['متوسط فترة الدفع', 'Average payment terms'],
    employee: ['الموظف', 'Employee'],
    collections: ['التحصيلات', 'Collections'],
    deals: ['عدد الصفقات', 'Deals'],
    average_deal: ['متوسط الصفقة', 'Average deal'],
    returns: ['المرتجعات', 'Returns'],
    return_count: ['عدد المرتجعات', 'Return count'],
    target_achievement_percent: ['تحقيق الهدف %', 'Target achievement %'],
    discount_percent: ['نسبة الخصم', 'Discount %'],
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
    net_tax_position: ['صافي المركز الضريبي', 'Net tax position'],
    id: ['المعرّف', 'ID'],
    auditable_type: ['نوع السجل', 'Record type'],
    auditable_id: ['معرّف السجل', 'Record ID'],
    action: ['الإجراء', 'Action'],
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
    Low_margin: ['هامش منخفض', 'Low margin'],
    High_discounts: ['خصومات مرتفعة', 'High discounts'],
    High_cost: ['تكلفة مرتفعة', 'High cost'],
    volume_up: ['الخصم رفع حجم المبيعات', 'Discount increased volume'],
    profit_leak: ['الخصم أكل الربح', 'Discount eroded profit'],
    mixed: ['أثر مختلط', 'Mixed effect'],
    approved: ['معتمد', 'Approved'],
    rejected: ['مرفوض', 'Rejected'],
    pending: ['بانتظار الاعتماد', 'Pending'],
};

function featureTitle(feature: Feature | undefined, ar: boolean): string {
    if (! feature) return ar ? 'اختر تقريراً' : 'Choose a report';
    return ar ? feature.title_ar : feature.title;
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
    return labels[category] ? (ar ? labels[category][0] : labels[category][1]) : category;
}

function columnLabel(key: string, ar: boolean): string {
    const pair = columnLabels[key];
    if (pair) return ar ? pair[0] : pair[1];
    return key.replaceAll('_', ' ');
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
    return labels[key] ? (ar ? labels[key][0] : labels[key][1]) : key;
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
    return labels[type] ? (ar ? labels[type][0] : labels[type][1]) : type;
}

function displayValue(value: unknown, ar: boolean): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'number') {
        return new Intl.NumberFormat(ar ? 'ar' : 'en', { maximumFractionDigits: 2 }).format(value);
    }
    const raw = String(value);
    const normalized = raw.replaceAll(' ', '_');
    const pair = valueLabels[raw] ?? valueLabels[normalized];
    if (pair) return ar ? pair[0] : pair[1];
    const numeric = Number(raw);
    if (raw.trim() !== '' && !Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(raw)) {
        return new Intl.NumberFormat(ar ? 'ar' : 'en', { maximumFractionDigits: 2 }).format(numeric);
    }
    return raw;
}

export default function ReportStudio() {
    const ar = useLocale() === 'ar';
    const t = (arabic: string, english: string) => ar ? arabic : english;
    const [data, setData] = useState<StudioIndex>({ features: [], snapshots: [], presets: [], boards: [], reports: [], annotations: [], comments: [], approvals: [] });
    const [selected, setSelected] = useState('customer-profitability');
    const [query, setQuery] = useState('');
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setMonth(0, 1); return d.toISOString().slice(0, 10);
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
    const [dimension, setDimension] = useState('customer');
    const [result, setResult] = useState<Result | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [chartType, setChartType] = useState<'table' | 'bar' | 'line' | 'area' | 'pie' | 'donut'>('table');
    const [pivotRows, setPivotRows] = useState('');
    const [pivotCols, setPivotCols] = useState('');
    const [pivotValue, setPivotValue] = useState('');
    const [formulaName, setFormulaName] = useState(ar ? 'محسوب' : 'Calculated');
    const [formulaLeft, setFormulaLeft] = useState('');
    const [formulaRight, setFormulaRight] = useState('');
    const [formulaOp, setFormulaOp] = useState<'+' | '-' | '*' | '/'>('-');
    const [formula, setFormula] = useState<{ name: string; left: string; right: string; op: string } | null>(null);
    const [scenarioSales, setScenarioSales] = useState(0);
    const [scenarioCost, setScenarioCost] = useState(0);
    const [exceptionMetric, setExceptionMetric] = useState('margin');
    const [exceptionOperator, setExceptionOperator] = useState('lt');
    const [exceptionValue, setExceptionValue] = useState(10);
    const [drill, setDrill] = useState<{ row: Record<string, unknown>; key: string; details?: DrillResult; loading?: boolean } | null>(null);
    const [chartX, setChartX] = useState('');
    const [chartY, setChartY] = useState('');
    const [visualizationReportId, setVisualizationReportId] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [comment, setComment] = useState('');
    const [boardName, setBoardName] = useState('');
    const [boardReports, setBoardReports] = useState<number[]>([]);

    async function load() {
        setError('');
        try {
            setData(await apiRequest<StudioIndex>('/api/report-studio'));
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر تحميل Report Studio.', 'Could not load Report Studio.'));
        }
    }

    useEffect(() => { void load(); }, []);

    const feature = data.features.find(item => item.key === selected);
    const filtered = useMemo(() => data.features.filter(item => {
        const haystack = [item.title, item.title_ar, item.category, categoryLabel(item.category, ar)]
            .join(' ')
            .toLowerCase();
        return ! search || haystack.includes(search.toLowerCase());
    }), [data.features, search, ar]);

    async function run(featureKey = selected) {
        if (busy) return;
        setBusy(true); setError('');
        try {
            const response = await apiRequest<{ data: Result }>('/api/report-studio/run', {
                method: 'POST',
                body: JSON.stringify({
                    feature: featureKey,
                    date_from: dateFrom,
                    date_to: dateTo,
                    dimension,
                    scenario: { sales_percent: scenarioSales, cost_percent: scenarioCost, currency_percent: 0 },
                    exception: { metric: exceptionMetric, operator: exceptionOperator, value: exceptionValue },
                }),
            });
            setSelected(featureKey);
            setResult(response.data);
            const numeric = response.data.columns.filter(key => response.data.rows.some(row => typeof row[key] === 'number' || !Number.isNaN(Number(row[key]))));
            setPivotValue(numeric[0] ?? '');
            setFormulaLeft(numeric[0] ?? '');
            setFormulaRight(numeric[1] ?? numeric[0] ?? '');
            setPivotRows(response.data.columns[0] ?? '');
            setChartX(response.data.columns[0] ?? '');
            setChartY(numeric[0] ?? '');
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر تشغيل التقرير.', 'Could not run report.'));
        } finally { setBusy(false); }
    }

    async function naturalLanguage() {
        if (!query.trim() || busy) return;
        setBusy(true); setError('');
        try {
            const response = await apiRequest<{ data: { feature: string; dimension: string; date_from: string; date_to: string } }>('/api/report-studio/natural-language', {
                method: 'POST', body: JSON.stringify({ query }),
            });
            setSelected(response.data.feature);
            setDimension(response.data.dimension);
            setDateFrom(response.data.date_from);
            setDateTo(response.data.date_to);
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر فهم الطلب.', 'Could not parse request.'));
        } finally { setBusy(false); }
    }

    async function saveSnapshot() {
        if (!result) return;
        setBusy(true);
        try {
            await apiRequest('/api/report-studio/snapshots', {
                method: 'POST',
                body: JSON.stringify({
                    name: featureTitle(feature, ar),
                    as_of_date: dateTo,
                    definition: { feature: selected, date_from: dateFrom, date_to: dateTo, dimension },
                    payload: result,
                }),
            });
            await load();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر حفظ Snapshot.', 'Could not save snapshot.'));
        } finally { setBusy(false); }
    }

    async function saveText(kind: 'annotations' | 'comments', body: string) {
        if (!body.trim()) return;
        setBusy(true);
        try {
            await apiRequest('/api/report-studio/' + kind, {
                method: 'POST',
                body: JSON.stringify({ anchor_key: selected, period_date: kind === 'annotations' ? dateTo : undefined, body: body.trim(), mentions: [] }),
            });
            if (kind === 'annotations') setNote(''); else setComment('');
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر الحفظ.', 'Could not save.'));
        } finally { setBusy(false); }
    }

    async function savePreset() {
        setBusy(true);
        try {
            await apiRequest('/api/report-studio/presets', {
                method: 'POST',
                body: JSON.stringify({ name: featureTitle(feature, ar) + ' · ' + dateFrom, scope: selected, filters: { dateFrom, dateTo, dimension } }),
            });
            await load();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر حفظ الفلتر.', 'Could not save preset.'));
        } finally { setBusy(false); }
    }

    async function saveBoard() {
        if (!boardName.trim() || boardReports.length < 4 || boardReports.length > 8) return;
        setBusy(true);
        try {
            await apiRequest('/api/report-studio/boards', {
                method: 'POST',
                body: JSON.stringify({ name: boardName.trim(), shared: false, layout: boardReports.map((report_id, index) => ({ report_id, order: index })) }),
            });
            setBoardName(''); setBoardReports([]); await load();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر حفظ لوحة التقارير.', 'Could not save report board.'));
        } finally { setBusy(false); }
    }


    function applyPreset(filtersRaw: string) {
        try {
            const filters = JSON.parse(filtersRaw) as { dateFrom?: string; dateTo?: string; dimension?: string };
            if (filters.dateFrom) setDateFrom(filters.dateFrom);
            if (filters.dateTo) setDateTo(filters.dateTo);
            if (filters.dimension) setDimension(filters.dimension);
        } catch {
            setError(t('إعدادات الفلتر المحفوظ غير صالحة.', 'Saved preset is invalid.'));
        }
    }

    function openSnapshot(snapshot: StudioIndex['snapshots'][number]) {
        try {
            const payload = JSON.parse(snapshot.payload) as Result;
            const definition = JSON.parse(snapshot.definition) as { feature?: string; date_from?: string; date_to?: string; dimension?: string };
            setResult(payload);
            if (definition.feature) setSelected(definition.feature);
            if (definition.date_from) setDateFrom(definition.date_from);
            if (definition.date_to) setDateTo(definition.date_to);
            if (definition.dimension) setDimension(definition.dimension);
        } catch {
            setError(t('تعذر فتح الـSnapshot.', 'Could not open snapshot.'));
        }
    }

    async function openDrill(row: Record<string, unknown>, key: string) {
        setDrill({ row, key, loading: true });
        const dimensionKey = ['dimension', 'customer', 'supplier', 'party', 'branch', 'month', 'employee']
            .find(candidate => row[candidate] !== undefined);
        try {
            const response = await apiRequest<{ data: DrillResult }>('/api/report-studio/drill-down', {
                method: 'POST',
                body: JSON.stringify({
                    feature: selected,
                    date_from: dateFrom,
                    date_to: dateTo,
                    dimension: dimensionKey ?? dimension,
                    dimension_value: dimensionKey ? String(row[dimensionKey] ?? '') : null,
                    metric: key,
                }),
            });
            setDrill({ row, key, details: response.data, loading: false });
        } catch {
            setDrill({ row, key, loading: false });
        }
    }

    async function saveVisualization() {
        if (!visualizationReportId) return;
        setBusy(true);
        try {
            await apiRequest('/api/report-studio/visualizations', {
                method: 'POST',
                body: JSON.stringify({ report_id: visualizationReportId, type: chartType, x: chartX || null, y: chartY || null }),
            });
            await load();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر حفظ الرسم.', 'Could not save visualization.'));
        } finally {
            setBusy(false);
        }
    }

    const displayedRows = useMemo(() => {
        if (!result) return [];
        if (!formula || !formula.left || !formula.right) return result.rows;
        return result.rows.map(row => {
            const a = Number(row[formula.left] ?? 0);
            const b = Number(row[formula.right] ?? 0);
            const value = formula.op === '+' ? a + b : formula.op === '*' ? a * b : formula.op === '/' ? (b === 0 ? null : a / b) : a - b;
            return { ...row, [formula.name]: value };
        });
    }, [result, formula]);

    const displayedColumns = useMemo(() => result ? [...result.columns, ...(formula ? [formula.name] : [])] : [], [result, formula]);

    const pivot = useMemo(() => {
        if (!result || !pivotRows || !pivotValue) return null;
        const map = new Map<string, Record<string, number>>();
        const colNames = new Set<string>();
        for (const row of displayedRows) {
            const r = String(row[pivotRows] ?? '—');
            const c = pivotCols ? String(row[pivotCols] ?? 'Total') : 'Total';
            colNames.add(c);
            const bucket = map.get(r) ?? {};
            bucket[c] = (bucket[c] ?? 0) + Number(row[pivotValue] ?? 0);
            map.set(r, bucket);
        }
        return { columns: Array.from(colNames), rows: Array.from(map.entries()) };
    }, [result, displayedRows, pivotRows, pivotCols, pivotValue]);

    return (
        <AppShell>
            <Head title={t('استوديو التقارير', 'Report Studio')} />
            <main dir={ar ? 'rtl' : 'ltr'} className="mx-auto w-full max-w-[1760px] px-3 py-5 sm:px-5 lg:px-8">
                <section className={panel + ' p-5'}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <span className="flex size-11 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-accent)]"><Sparkles size={18}/></span>
                            <div>
                                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">{t('ذكاء التقارير', 'REPORT INTELLIGENCE')}</p>
                                <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">{t('استوديو التقارير المتقدم', 'Advanced Report Studio')}</h1>
                                <p className="mt-2 max-w-4xl text-xs leading-6 text-[var(--ac-text-muted)]">
                                    {t('40 أداة للتقارير والتحليل والربحية والمخزون والكاش والتعاون، مبنية فوق بيانات AccoNova الفعلية.', '40 reporting, analytics, profitability, inventory, cash and collaboration capabilities powered by live AccoNova data.')}
                                </p>
                            </div>
                        </div>
                        <Link href="/app/reports/builder" className={button}><Table2 size={13}/>{t('فتح منشئ التقارير', 'Open Report Builder')}</Link>
                    </div>
                    <div className="mt-5 flex gap-2">
                        <input value={query} onChange={e => setQuery(e.target.value)} className={input + ' min-w-0 flex-1'} placeholder={t('مثال: اعرضلي مبيعات آخر 6 شهور حسب العميل مع الربح', 'Example: show sales for the last 6 months by customer with profit')} />
                        <button className={button} disabled={busy || !query.trim()} onClick={() => void naturalLanguage()}><Search size={13}/>{t('جهّز الإعدادات', 'Prepare')}</button>
                    </div>
                </section>

                {error && <div className="mt-4 rounded-[14px] border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">{error}</div>}

                <div className="mt-4 grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className="space-y-4 xl:sticky xl:top-4">
                        <section className={panel + ' p-4'}>
                            <div className="flex items-center gap-2"><Search size={13} className="text-[var(--ac-accent)]"/><h2 className="text-xs font-bold text-[var(--ac-text)]">{t('كل الميزات الـ40', 'All 40 capabilities')}</h2></div>
                            <input className={input + ' mt-3 w-full'} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...')} />
                            <div className="mt-3 max-h-[620px] space-y-1.5 overflow-auto pe-1">
                                {filtered.map(item => {
                                    const Icon = categoryIcon[item.category] ?? BarChart3;
                                    const active = selected === item.key;
                                    return <button key={item.key} type="button" onClick={() => { setSelected(item.key); setResult(null); }} className={['flex w-full items-center gap-2 rounded-[11px] border px-3 py-2.5 text-start transition', active ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]' : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]'].join(' ')}>
                                        <span className="text-[9px] font-bold text-[var(--ac-text-muted)]">{String(item.number).padStart(2,'0')}</span>
                                        <Icon size={13} className="shrink-0 text-[var(--ac-accent)]"/>
                                        <span className="min-w-0 flex-1 text-[10px] font-semibold text-[var(--ac-text)]">{featureTitle(item, ar)}</span>
                                        <ChevronRight size={11} className={ar ? 'rotate-180' : ''}/>
                                    </button>;
                                })}
                            </div>
                        </section>
                    </aside>

                    <section className="space-y-4">
                        <section className={panel + ' p-4'}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ac-accent)]">{categoryLabel(feature?.category ?? 'report', ar)}</p>
                                    <h2 className="mt-1 text-lg font-bold text-[var(--ac-text)]">{featureTitle(feature, ar)}</h2>
                                </div>
                                <button className={button} disabled={busy || !feature} onClick={() => void run()}><Play size={13}/>{t('تشغيل التقرير', 'Run report')}</button>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">{t('من', 'From')}</span><input type="date" className={input + ' w-full'} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/></label>
                                <label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">{t('إلى', 'To')}</span><input type="date" className={input + ' w-full'} value={dateTo} onChange={e => setDateTo(e.target.value)}/></label>
                                <label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">{t('البعد', 'Dimension')}</span><select className={input + ' w-full'} value={dimension} onChange={e => setDimension(e.target.value)}>{['customer','product','supplier','employee','branch','warehouse','month'].map(value => <option key={value} value={value}>{dimensionLabel(value, ar)}</option>)}</select></label>
                                <div className="flex items-end"><button className={button + ' w-full'} onClick={() => void savePreset()}><Bookmark size={13}/>{t('حفظ الفلتر', 'Save preset')}</button></div>
                            </div>

                            {selected === 'scenario-reports' && <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">{t('تغير المبيعات %', 'Sales change %')}</span><input type="number" className={input + ' w-full'} value={scenarioSales} onChange={e => setScenarioSales(Number(e.target.value))}/></label><label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">{t('تغير التكلفة %', 'Cost change %')}</span><input type="number" className={input + ' w-full'} value={scenarioCost} onChange={e => setScenarioCost(Number(e.target.value))}/></label></div>}
                            {selected === 'exception-builder' && <div className="mt-4 grid gap-3 md:grid-cols-3"><select className={input} value={exceptionMetric} onChange={e => setExceptionMetric(e.target.value)}><option value="margin">{t('هامش الربح', 'Margin')}</option><option value="stock">{t('المخزون', 'Stock')}</option><option value="discount">{t('الخصم', 'Discount')}</option></select><select className={input} value={exceptionOperator} onChange={e => setExceptionOperator(e.target.value)}><option value="lt">&lt;</option><option value="lte">≤</option><option value="gt">&gt;</option><option value="gte">≥</option></select><input type="number" className={input} value={exceptionValue} onChange={e => setExceptionValue(Number(e.target.value))}/></div>}
                        </section>

                        {result && <>
                            <section className={panel + ' p-4'}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2"><LineChart size={14} className="text-[var(--ac-accent)]"/><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('النتيجة والتحليل', 'Result & visualization')}</h3></div>
                                    <div className="flex gap-2">
                                        {(['table','bar','line','area','pie','donut'] as const).map(type => <button key={type} className={button + (chartType === type ? ' border-[var(--ac-accent)] text-[var(--ac-accent)]' : '')} onClick={() => setChartType(type)}>{chartTypeLabel(type, ar)}</button>)}
                                        <button className={button} onClick={() => void saveSnapshot()}><Snowflake size={13}/>{t('تجميد لقطة', 'Freeze Snapshot')}</button>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-[9px] text-[var(--ac-text-muted)]"><span>{result.date_from} → {result.date_to}</span><span>•</span><span>{displayedRows.length} {t('صف', 'rows')}</span>{result.meta && Object.entries(result.meta).slice(0,4).map(([k,v]) => <span key={k}>• {columnLabel(k, ar)}: {displayValue(v, ar)}</span>)}</div>
                                <div className="mt-3 grid gap-2 md:grid-cols-4">
                                    <select className={input} value={chartX} onChange={e => setChartX(e.target.value)}><option value="">{t('المحور الأفقي X', 'X axis')}</option>{displayedColumns.map(c => <option key={c} value={c}>{columnLabel(c, ar)}</option>)}</select>
                                    <select className={input} value={chartY} onChange={e => setChartY(e.target.value)}><option value="">{t('المحور الرأسي Y', 'Y axis')}</option>{displayedColumns.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                    <select className={input} value={visualizationReportId ?? ''} onChange={e => setVisualizationReportId(e.target.value ? Number(e.target.value) : null)}><option value="">{t('اختر تقرير محفوظ', 'Choose saved report')}</option>{data.reports.map(report => <option key={report.id} value={report.id}>{report.name}</option>)}</select>
                                    <button className={button} disabled={!visualizationReportId} onClick={() => void saveVisualization()}><Save size={13}/>{t('حفظ الرسم', 'Save visualization')}</button>
                                </div>
                                {chartType === 'table' ? <ResultTable columns={displayedColumns} rows={displayedRows} onDrill={(row,key) => void openDrill(row,key)}/> : <SimpleChart rows={displayedRows} columns={displayedColumns} type={chartType} xKey={chartX} yKey={chartY}/>}
                            </section>

                            <section className="grid gap-4 2xl:grid-cols-2">
                                <div className={panel + ' p-4'}>
                                    <div className="flex items-center gap-2"><Calculator size={14} className="text-[var(--ac-accent)]"/><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('منشئ المعادلات', 'Formula Builder')}</h3></div>
                                    <div className="mt-3 grid gap-2 md:grid-cols-5">
                                        <input className={input} value={formulaName} onChange={e => setFormulaName(e.target.value)} placeholder={t('الربح', 'Profit')}/>
                                        <select className={input} value={formulaLeft} onChange={e => setFormulaLeft(e.target.value)}>{result.columns.map(c => <option key={c} value={c}>{columnLabel(c, ar)}</option>)}</select>
                                        <select className={input} value={formulaOp} onChange={e => setFormulaOp(e.target.value as '+'|'-'|'*'|'/')}><option>+</option><option>-</option><option>*</option><option>/</option></select>
                                        <select className={input} value={formulaRight} onChange={e => setFormulaRight(e.target.value)}>{result.columns.map(c => <option key={c}>{c}</option>)}</select>
                                        <button className={button} onClick={() => setFormula({name: formulaName || (ar ? 'محسوب' : 'Calculated'), left: formulaLeft, right: formulaRight, op: formulaOp})}>{t('تطبيق', 'Apply')}</button>
                                    </div>
                                </div>
                                <div className={panel + ' p-4'}>
                                    <div className="flex items-center gap-2"><Table2 size={14} className="text-[var(--ac-accent)]"/><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('التقرير المحوري', 'Pivot')}</h3></div>
                                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                                        <select className={input} value={pivotRows} onChange={e => setPivotRows(e.target.value)}><option value="">{t('الصفوف', 'Rows')}</option>{displayedColumns.map(c => <option key={c}>{c}</option>)}</select>
                                        <select className={input} value={pivotCols} onChange={e => setPivotCols(e.target.value)}><option value="">{t('بدون أعمدة', 'No columns')}</option>{displayedColumns.map(c => <option key={c}>{c}</option>)}</select>
                                        <select className={input} value={pivotValue} onChange={e => setPivotValue(e.target.value)}><option value="">{t('القيم', 'Values')}</option>{displayedColumns.map(c => <option key={c}>{c}</option>)}</select>
                                    </div>
                                    {pivot && <div className="mt-3 max-h-[300px] overflow-auto"><table className="w-full text-[9px]"><thead><tr><th className="p-2 text-start">{columnLabel(pivotRows, ar)}</th>{pivot.columns.map(c => <th key={c} className="p-2 text-end">{c}</th>)}</tr></thead><tbody>{pivot.rows.map(([r,values]) => <tr key={r} className="border-t border-[var(--ac-line)]"><td className="p-2 text-[var(--ac-text)]">{r}</td>{pivot.columns.map(c => <td key={c} className="p-2 text-end text-[var(--ac-text-soft)]">{formatValue(values[c] ?? 0)}</td>)}</tr>)}</tbody></table></div>}
                                </div>
                            </section>

                            <section className="grid gap-4 xl:grid-cols-3">
                                <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('ملاحظة على التقرير', 'Report annotation')}</h3><textarea className="mt-3 min-h-24 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs text-[var(--ac-text)] outline-none" value={note} onChange={e => setNote(e.target.value)}/><button className={button + ' mt-2 w-full'} disabled={!note.trim()} onClick={() => void saveText('annotations', note)}><Save size={13}/>{t('حفظ الملاحظة', 'Save annotation')}</button></div>
                                <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('تعليق وتعاون', 'Comment & collaborate')}</h3><textarea className="mt-3 min-h-24 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs text-[var(--ac-text)] outline-none" value={comment} onChange={e => setComment(e.target.value)} placeholder="@Ahmad ..."/><button className={button + ' mt-2 w-full'} disabled={!comment.trim()} onClick={() => void saveText('comments', comment)}><MessageSquareText size={13}/>{t('إضافة تعليق', 'Add comment')}</button></div>
                                <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('لوحة التقارير التنفيذية', 'Executive Report Board')}</h3><p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">{t('اختر من 4 إلى 8 تقارير محفوظة.', 'Choose 4 to 8 saved reports.')}</p><input className={input + ' mt-3 w-full'} value={boardName} onChange={e => setBoardName(e.target.value)} placeholder={t('اسم اللوحة', 'Board name')}/><div className="mt-2 max-h-28 overflow-auto text-[9px]">{data.reports.length === 0 ? <p className="py-2 text-[var(--ac-text-muted)]">{t('احفظ تقارير من Report Builder أولاً.', 'Save reports in Report Builder first.')}</p> : data.reports.map(report => <label key={report.id} className="flex items-center gap-2 py-1 text-[var(--ac-text-soft)]"><input type="checkbox" checked={boardReports.includes(report.id)} disabled={!boardReports.includes(report.id) && boardReports.length >= 8} onChange={() => setBoardReports(v => v.includes(report.id) ? v.filter(id => id !== report.id) : [...v, report.id])}/>{report.name}</label>)}</div><button className={button + ' mt-2 w-full'} onClick={() => void saveBoard()} disabled={!boardName.trim() || boardReports.length < 4 || boardReports.length > 8}><Save size={13}/>{t('حفظ اللوحة', 'Save board')} ({boardReports.length}/8)</button></div>
                            </section>
                        </>}
                    </section>
                </div>

                {data.snapshots.length > 0 || data.presets.length > 0 || data.boards.length > 0 ? <section className="mt-4 grid gap-4 xl:grid-cols-3">
                    <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('اللقطات المحفوظة', 'Saved snapshots')}</h3><div className="mt-3 max-h-44 space-y-2 overflow-auto">{data.snapshots.map(snapshot => <button key={snapshot.id} className="w-full rounded-[10px] border border-[var(--ac-line)] p-2 text-start hover:border-[var(--ac-accent)]" onClick={() => openSnapshot(snapshot)}><p className="text-[10px] font-semibold text-[var(--ac-text)]">{snapshot.name}</p><p className="text-[8px] text-[var(--ac-text-muted)]">{snapshot.as_of_date}</p></button>)}</div></div>
                    <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('إعدادات الفلاتر المحفوظة', 'Filter presets')}</h3><div className="mt-3 max-h-44 space-y-2 overflow-auto">{data.presets.map(preset => <button key={preset.id} className="w-full rounded-[10px] border border-[var(--ac-line)] p-2 text-start hover:border-[var(--ac-accent)]" onClick={() => applyPreset(preset.filters)}><p className="text-[10px] font-semibold text-[var(--ac-text)]">{preset.name}</p><p className="text-[8px] text-[var(--ac-text-muted)]">{preset.scope}</p></button>)}</div></div>
                    <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('اللوحات التنفيذية', 'Executive boards')}</h3><div className="mt-3 max-h-44 space-y-2 overflow-auto">{data.boards.map(board => <div key={board.id} className="rounded-[10px] border border-[var(--ac-line)] p-2"><p className="text-[10px] font-semibold text-[var(--ac-text)]">{board.name}</p><p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">{board.layout.map(item => data.reports.find(r => r.id === item.report_id)?.name ?? '#' + item.report_id).join(' · ')}</p></div>)}</div></div>
                </section> : null}

                {drill && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDrill(null)}><div className={panel + ' max-h-[85vh] w-full max-w-5xl overflow-auto p-5'} onClick={e => e.stopPropagation()}><h3 className="text-sm font-bold text-[var(--ac-text)]">{t('الاستكشاف التفاعلي', 'Interactive Drill-Down')} · {columnLabel(drill.key, ar)}</h3>
                    {drill.loading && <p className="mt-4 text-xs text-[var(--ac-text-muted)]">{t('تحميل التفاصيل...', 'Loading details...')}</p>}
                    {drill.details && <><div className="mt-3 flex flex-wrap gap-2">{drill.details.breadcrumbs.map((crumb,i) => <span key={i} className="rounded-full border border-[var(--ac-line)] px-2 py-1 text-[9px] text-[var(--ac-text-soft)]">{columnLabel(crumb.label.toLowerCase(), ar)}: {displayValue(crumb.value, ar)}</span>)}</div>
                    <h4 className="mt-5 text-xs font-bold text-[var(--ac-text)]">{t('حسب الشهر', 'By month')}</h4><ResultTable columns={drill.details.months.length ? Object.keys(drill.details.months[0]) : []} rows={drill.details.months} onDrill={() => {}} ar={ar}/>
                    <h4 className="mt-5 text-xs font-bold text-[var(--ac-text)]">{t('الفواتير', 'Invoices')}</h4><ResultTable columns={drill.details.invoices.length ? Object.keys(drill.details.invoices[0]) : []} rows={drill.details.invoices} onDrill={() => {}} ar={ar}/></>}
                    {!drill.loading && !drill.details && <div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(drill.row).map(([k,v]) => <div key={k} className="rounded-[11px] border border-[var(--ac-line)] p-3"><p className="text-[9px] text-[var(--ac-text-muted)]">{columnLabel(k, ar)}</p><p className="mt-1 break-words text-xs font-semibold text-[var(--ac-text)]">{displayValue(v, ar)}</p></div>)}</div>}
                    <button className={button + ' mt-4 w-full'} onClick={() => setDrill(null)}>{t('إغلاق', 'Close')}</button></div></div>}
            </main>
        </AppShell>
    );
}

function ResultTable({columns, rows, onDrill, ar}: {columns: string[]; rows: Array<Record<string, unknown>>; onDrill: (row: Record<string, unknown>, key: string) => void; ar: boolean}) {
    return <div className="mt-4 max-h-[580px] overflow-auto rounded-[14px] border border-[var(--ac-line)]"><table className="w-full min-w-[800px] text-[10px]"><thead className="sticky top-0 bg-[var(--ac-surface-soft)]"><tr>{columns.map(c => <th key={c} className="border-b border-[var(--ac-line)] px-3 py-2 text-start font-semibold text-[var(--ac-text-muted)]">{columnLabel(c, ar)}</th>)}</tr></thead><tbody className="divide-y divide-[var(--ac-line)]">{rows.map((row,i) => <tr key={i} className="hover:bg-[var(--ac-surface-soft)]">{columns.map(c => { const numeric = typeof row[c] === 'number' || (row[c] !== null && row[c] !== '' && !Number.isNaN(Number(row[c]))); return <td key={c} className="max-w-[300px] px-3 py-2 text-[var(--ac-text-soft)]">{numeric ? <button className="font-semibold text-[var(--ac-accent)] hover:underline" onClick={() => onDrill(row,c)}>{displayValue(row[c], ar)}</button> : <span className="break-words">{displayValue(row[c], ar)}</span>}</td>;})}</tr>)}</tbody></table></div>;
}

function SimpleChart({rows, columns, type, xKey, yKey, ar}: {rows: Array<Record<string, unknown>>; columns: string[]; type: 'bar'|'line'|'area'|'pie'|'donut'; xKey?: string; yKey?: string; ar: boolean}) {
    const numeric = yKey || columns.find(c => rows.some(r => typeof r[c] === 'number' || !Number.isNaN(Number(r[c]))));
    const label = xKey || columns.find(c => c !== numeric) || columns[0];
    const points = rows.slice(0, 20).map(r => ({label: String(r[label] ?? '—'), value: Number(r[numeric ?? ''] ?? 0)}));
    const max = Math.max(1, ...points.map(p => Math.abs(p.value)));
    if (!numeric) return <div className="mt-4 p-8 text-center text-xs text-[var(--ac-text-muted)]">{ar ? 'لا يوجد حقل رقمي متاح للرسم.' : 'No numeric field available.'}</div>;
    if (type === 'line' || type === 'area') {
        const path = points.map((p,i) => `${i === 0 ? 'M':'L'} ${20 + i * (760 / Math.max(1, points.length - 1))} ${190 - (Math.max(0,p.value) / max) * 160}`).join(' ');
        const areaPath = path + ` L ${20 + Math.max(0, points.length - 1) * (760 / Math.max(1, points.length - 1))} 190 L 20 190 Z`;
        return <div className="mt-4 overflow-x-auto rounded-[14px] border border-[var(--ac-line)] p-4"><svg viewBox="0 0 800 220" className="min-w-[720px]">{type === 'area' && <path d={areaPath} fill="currentColor" opacity="0.12" className="text-[var(--ac-accent)]"/>}<path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--ac-accent)]"/>{points.map((p,i) => <circle key={i} cx={20 + i * (760 / Math.max(1, points.length - 1))} cy={190 - (Math.max(0,p.value) / max) * 160} r="3" fill="currentColor" className="text-[var(--ac-accent)]"/>)}</svg></div>;
    }
    if (type === 'pie' || type === 'donut') {
        const total = Math.max(1, points.reduce((sum,p) => sum + Math.max(0,p.value), 0));
        let cursor = 0;
        const stops = points.map((p,i) => {
            const start = cursor;
            cursor += (Math.max(0,p.value) / total) * 100;
            const hue = (i * 47) % 360;
            return `hsl(${hue} 70% 55%) ${start}% ${cursor}%`;
        }).join(', ');
        return <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]"><div className="mx-auto size-56 rounded-full" style={{background: `conic-gradient(${stops})`, WebkitMask: type === 'donut' ? 'radial-gradient(circle at center, transparent 0 38%, black 39%)' : undefined, mask: type === 'donut' ? 'radial-gradient(circle at center, transparent 0 38%, black 39%)' : undefined}}/><div className="space-y-2">{points.map((p,i) => <div key={i} className="flex items-center justify-between gap-3 text-[9px]"><span className="truncate text-[var(--ac-text-soft)]">{displayValue(p.label, ar)}</span><span className="font-semibold text-[var(--ac-text)]">{displayValue(p.value, ar)} · {((Math.max(0,p.value)/total)*100).toFixed(1)}%</span></div>)}</div></div>;
    }
    return <div className="mt-4 space-y-2">{points.map((p,i) => <div key={i} className="grid grid-cols-[150px_1fr_100px] items-center gap-2 text-[9px]"><span className="truncate text-[var(--ac-text-soft)]">{displayValue(p.label, ar)}</span><div className="h-2 overflow-hidden rounded-full bg-[var(--ac-surface-soft)]"><div className="h-full rounded-full bg-[var(--ac-accent)]" style={{width: Math.max(1,(Math.abs(p.value)/max)*100)+'%'}}/></div><span className="text-end font-semibold text-[var(--ac-text)]">{displayValue(p.value, ar)}</span></div>)}</div>;
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
    const n = Number(value);
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(value)) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
    return String(value);
}
