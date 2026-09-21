import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import {
    BarChart3,
    Filter,
    Play,
    Plus,
    Save,
    Trash2,
    History,
    CheckCircle2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react';

type Column = {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date';
};

type Dataset = {
    key: string;
    label: string;
    columns: Column[];
};

type FilterRow = {
    field: string;
    operator: 'eq' | 'neq' | 'contains' | 'gte' | 'lte';
    value: string;
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
};

type ReportVersion = {
    id: number;
    version: number;
    created_at: string;
    definition: Record<string, unknown>;
};

type RunResult = {
    columns: Column[];
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

const control =
    'h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';

const outline =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40';

const datasetLabels: Record<string, [string, string]> = {
    sales_invoices: ['فواتير المبيعات', 'Sales invoices'],
    purchase_invoices: ['فواتير المشتريات', 'Purchase invoices'],
    cash_movements: ['الحركات النقدية', 'Cash movements'],
    parties: ['العملاء والموردون', 'Customers & suppliers'],
    products: ['المنتجات', 'Products'],
};

const builderColumnLabels: Record<string, [string, string]> = {
    number: ['رقم المستند', 'Document number'],
    party: ['العميل / المورد', 'Customer / supplier'],
    issue_date: ['تاريخ الإصدار', 'Issue date'],
    due_date: ['تاريخ الاستحقاق', 'Due date'],
    status: ['الحالة', 'Status'],
    subtotal: ['المجموع قبل الضريبة', 'Subtotal'],
    discount_total: ['الخصم', 'Discount'],
    tax_total: ['الضريبة', 'Tax'],
    total: ['الإجمالي', 'Total'],
    paid_total: ['المدفوع', 'Paid'],
    balance_due: ['الرصيد المستحق', 'Balance due'],
    currency: ['العملة', 'Currency'],
    movement_date: ['التاريخ', 'Date'],
    direction: ['الاتجاه', 'Direction'],
    category: ['التصنيف', 'Category'],
    amount: ['القيمة', 'Amount'],
    method: ['طريقة الدفع', 'Method'],
    reference: ['المرجع', 'Reference'],
    name: ['الاسم', 'Name'],
    type: ['النوع', 'Type'],
    email: ['البريد الإلكتروني', 'Email'],
    phone: ['الهاتف', 'Phone'],
    city: ['المدينة', 'City'],
    country_code: ['الدولة', 'Country'],
    credit_limit: ['الحد الائتماني', 'Credit limit'],
    created_at: ['تاريخ الإنشاء', 'Created at'],
    sku: ['رمز SKU', 'SKU'],
    unit: ['الوحدة', 'Unit'],
    unit_price: ['سعر البيع', 'Selling price'],
    cost_price: ['سعر التكلفة', 'Cost price'],
    tax_rate: ['نسبة الضريبة', 'Tax rate'],
    track_inventory: ['تتبع المخزون', 'Tracks inventory'],
};

function datasetLabel(key: string, fallback: string, ar: boolean): string {
    const label = datasetLabels[key];
    return label ? (ar ? label[0] : label[1]) : fallback;
}

function builderColumnLabel(key: string, fallback: string, ar: boolean): string {
    const label = builderColumnLabels[key];
    return label ? (ar ? label[0] : label[1]) : fallback;
}

export default function ReportBuilder() {
    const ar = useLocale() === 'ar';
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [reports, setReports] = useState<SavedReport[]>([]);
    const [datasetKey, setDatasetKey] = useState('');
    const [columns, setColumns] = useState<string[]>([]);
    const [filters, setFilters] = useState<FilterRow[]>([]);
    const [groupBy, setGroupBy] = useState('');
    const [sortBy, setSortBy] = useState('');
    const [sortDirection, setSortDirection] =
        useState<'asc' | 'desc'>('asc');
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [shared, setShared] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [versions, setVersions] = useState<ReportVersion[]>([]);
    const [versionReportId, setVersionReportId] = useState<number | null>(null);

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const dataset = useMemo(
        () => datasets.find(item => item.key === datasetKey) ?? null,
        [datasets, datasetKey],
    );

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response = await apiRequest<{
                datasets: Dataset[];
                reports: SavedReport[];
            }>('/api/report-builder');

            setDatasets(response.datasets);
            setReports(response.reports);

            if (! datasetKey && response.datasets.length > 0) {
                const first = response.datasets[0];
                setDatasetKey(first.key);
                setColumns(first.columns.slice(0, 5).map(column => column.key));
            }
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر تحميل منشئ التقارير.',
                        'Could not load Report Builder.',
                    ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    function chooseDataset(key: string): void {
        const next = datasets.find(item => item.key === key);
        setDatasetKey(key);
        setColumns(next?.columns.slice(0, 5).map(column => column.key) ?? []);
        setFilters([]);
        setGroupBy('');
        setSortBy('');
        setResult(null);
    }

    function toggleColumn(key: string): void {
        setColumns(current =>
            current.includes(key)
                ? (
                    current.length === 1
                        ? current
                        : current.filter(item => item !== key)
                )
                : [...current, key],
        );

        if (groupBy === key && columns.includes(key)) {
            setGroupBy('');
        }

        if (sortBy === key && columns.includes(key)) {
            setSortBy('');
        }
    }

    function payload(): Record<string, unknown> {
        return {
            dataset: datasetKey,
            columns,
            filters: filters.filter(filter => filter.field && filter.value !== ''),
            group_by: groupBy || null,
            sort_by: sortBy || null,
            sort_direction: sortDirection,
        };
    }

    async function run(): Promise<void> {
        if (! datasetKey || columns.length === 0 || busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{
                data: RunResult;
            }>('/api/report-builder/run', {
                method: 'POST',
                body: JSON.stringify(payload()),
            });

            setResult(response.data);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر تشغيل التقرير.', 'Could not run report.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function save(event: FormEvent): Promise<void> {
        event.preventDefault();

        if (! name.trim() || busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                editingId
                    ? '/api/report-builder/' + editingId
                    : '/api/report-builder',
                {
                    method: editingId
                        ? 'PATCH'
                        : 'POST',
                    body: JSON.stringify({
                        ...payload(),
                        name: name.trim(),
                        shared,
                    }),
                },
            );

            setName('');
            setEditingId(null);
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر حفظ التقرير.', 'Could not save report.'),
            );
        } finally {
            setBusy(false);
        }
    }

    function openSaved(report: SavedReport): void {
        setDatasetKey(report.dataset);
        setColumns(report.columns);
        setFilters(report.filters ?? []);
        setGroupBy(report.group_by ?? '');
        setSortBy(report.sort_by ?? '');
        setSortDirection(report.sort_direction ?? 'asc');
        setName(report.name);
        setEditingId(
            report.can_edit
                ? report.id
                : null,
        );
        setShared(Boolean(report.shared));
        setResult(null);
    }

    async function removeReport(id: number): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest('/api/report-builder/' + id, {
                method: 'DELETE',
            });

            if (editingId === id) {
                setEditingId(null);
                setName('');
            }

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر حذف التقرير.', 'Could not delete report.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function loadVersions(reportId: number): Promise<void> {
        setBusy(true);
        setError('');
        try {
            const response = await apiRequest<{ data: ReportVersion[] }>(
                '/api/report-builder/' + reportId + '/versions',
            );
            setVersions(response.data);
            setVersionReportId(reportId);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر تحميل سجل النسخ.', 'Could not load version history.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function restoreVersion(version: number): Promise<void> {
        if (! versionReportId || busy) return;
        setBusy(true);
        setError('');
        try {
            const response = await apiRequest<{ data: SavedReport }>(
                '/api/report-builder/' + versionReportId + '/versions/' + version + '/restore',
                { method: 'POST' },
            );
            openSaved(response.data);
            await load();
            await loadVersions(versionReportId);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر استرجاع النسخة.', 'Could not restore version.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function approveReport(reportId: number): Promise<void> {
        setBusy(true);
        setError('');
        try {
            await apiRequest('/api/report-studio/approvals', {
                method: 'POST',
                body: JSON.stringify({
                    report_id: reportId,
                    status: 'approved',
                    note: null,
                }),
            });
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر اعتماد التقرير.', 'Could not approve report.'),
            );
        } finally {
            setBusy(false);
        }
    }

    const selectedColumns =
        dataset?.columns.filter(column => columns.includes(column.key)) ?? [];

    return (
        <AppShell>
            <Head title={text('منشئ التقارير', 'Report Builder')} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex items-start gap-3">
                        <span className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <BarChart3 size={18} />
                        </span>
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                {text('التقارير', 'Reports')}
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {text('منشئ التقارير', 'Report Builder')}
                            </h1>
                            <p className="mt-2 max-w-4xl text-xs leading-6 text-[var(--ac-text-muted)]">
                                {text(
                                    'اختر مصدر البيانات والأعمدة والفلاتر والتجميع، شغّل التقرير فوراً واحفظه لإعادة استخدامه بدون برمجة.',
                                    'Choose a dataset, columns, filters and grouping, run it instantly, then save the definition for reuse without code.',
                                )}
                            </p>
                        </div>
                    </div>
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">
                        {error}
                    </div>
                )}

                <div className="mt-4 grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className="space-y-4">
                        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                            <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                {text('مصدر البيانات', 'Dataset')}
                            </h2>
                            <select
                                className={control + ' mt-3'}
                                value={datasetKey}
                                disabled={loading}
                                onChange={event => chooseDataset(event.target.value)}
                            >
                                {datasets.map(item => (
                                    <option key={item.key} value={item.key}>
                                        {datasetLabel(item.key, item.label, ar)}
                                    </option>
                                ))}
                            </select>
                        </section>

                        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                            <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                {text('الأعمدة', 'Columns')}
                            </h2>
                            <div className="mt-3 space-y-1.5">
                                {dataset?.columns.map(column => {
                                    const active = columns.includes(column.key);

                                    return (
                                        <button
                                            type="button"
                                            key={column.key}
                                            onClick={() => toggleColumn(column.key)}
                                            className={[
                                                'flex w-full items-center justify-between rounded-[10px] border px-3 py-2 text-start text-[10px] transition',
                                                active
                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                    : 'border-[var(--ac-line)] text-[var(--ac-text-soft)]',
                                            ].join(' ')}
                                        >
                                            <span>{builderColumnLabel(column.key, column.label, ar)}</span>
                                            <span>{active ? '✓' : '+'}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        <form
                            onSubmit={event => void save(event)}
                            className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                    {editingId
                                        ? text('تعديل التقرير', 'Update report')
                                        : text('حفظ التقرير', 'Save report')}
                                </h2>
                                {editingId && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingId(null);
                                            setName('');
                                        }}
                                        className="text-[9px] font-semibold text-[var(--ac-accent)]"
                                    >
                                        {text('تقرير جديد', 'New report')}
                                    </button>
                                )}
                            </div>
                            <input
                                className={control + ' mt-3'}
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                                placeholder={text('اسم التقرير', 'Report name')}
                            />
                            <label className="mt-3 flex items-center gap-2 text-[10px] text-[var(--ac-text-soft)]">
                                <input
                                    type="checkbox"
                                    checked={shared}
                                    onChange={event => setShared(event.target.checked)}
                                />
                                {text('مشارك مع مساحة العمل', 'Shared with workspace')}
                            </label>
                            <button
                                type="submit"
                                disabled={busy || columns.length === 0}
                                className={outline + ' mt-3 w-full'}
                            >
                                <Save size={13} />
                                {editingId
                                    ? text('حفظ التعديلات', 'Update report')
                                    : text('حفظ', 'Save')}
                            </button>
                        </form>

                        {reports.length > 0 && (
                            <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                    {text('تقاريري', 'Saved reports')}
                                </h2>
                                <div className="mt-3 space-y-2">
                                    {reports.map(report => (
                                        <div
                                            key={report.id}
                                            className="flex items-center gap-2 rounded-[11px] border border-[var(--ac-line)] p-2"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => openSaved(report)}
                                                className="min-w-0 flex-1 truncate text-start text-[10px] font-semibold text-[var(--ac-text)]"
                                            >
                                                {report.name}
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => void loadVersions(report.id)}
                                                title={text('سجل النسخ', 'Version history')}
                                                className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                                            >
                                                <History size={12} />
                                            </button>
                                            {report.can_edit && (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void approveReport(report.id)}
                                                    title={text('اعتماد التقرير', 'Approve report')}
                                                    className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                                                >
                                                    <CheckCircle2 size={12} />
                                                </button>
                                            )}
                                            {report.can_edit && (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void removeReport(report.id)}
                                                    className="flex size-8 items-center justify-center rounded-[9px] border border-red-400/30 text-red-300"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                        {versionReportId && (
                            <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                        {text('سجل نسخ التقرير', 'Report version history')}
                                    </h2>
                                    <button
                                        type="button"
                                        className="text-[9px] font-semibold text-[var(--ac-accent)]"
                                        onClick={() => {
                                            setVersionReportId(null);
                                            setVersions([]);
                                        }}
                                    >
                                        {text('إغلاق', 'Close')}
                                    </button>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {versions.length === 0 ? (
                                        <p className="text-[10px] text-[var(--ac-text-muted)]">
                                            {text('لا توجد نسخ محفوظة بعد.', 'No saved versions yet.')}
                                        </p>
                                    ) : versions.map(version => (
                                        <div
                                            key={version.id}
                                            className="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--ac-line)] p-2"
                                        >
                                            <div>
                                                <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                    {text('النسخة', 'Version')} {version.version}
                                                </p>
                                                <p className="text-[8px] text-[var(--ac-text-muted)]">
                                                    {version.created_at}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                className={outline + ' h-8 px-2'}
                                                onClick={() => void restoreVersion(version.version)}
                                            >
                                                {text('استرجاع', 'Restore')}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </aside>

                    <section className="space-y-4">
                        <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                            <div className="flex items-center gap-2">
                                <Filter size={14} className="text-[var(--ac-accent)]" />
                                <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                    {text('الفلاتر + التجميع + الترتيب', 'Filters + Grouping + Sort')}
                                </h2>
                            </div>

                            <div className="mt-4 space-y-2">
                                {filters.map((filter, index) => (
                                    <div
                                        key={index}
                                        className="grid gap-2 md:grid-cols-[1fr_150px_1fr_auto]"
                                    >
                                        <select
                                            className={control}
                                            value={filter.field}
                                            onChange={event =>
                                                setFilters(current =>
                                                    current.map((item, itemIndex) =>
                                                        itemIndex === index
                                                            ? { ...item, field: event.target.value }
                                                            : item,
                                                    ),
                                                )
                                            }
                                        >
                                            <option value="">
                                                {text('اختر الحقل', 'Choose field')}
                                            </option>
                                            {dataset?.columns.map(column => (
                                                <option key={column.key} value={column.key}>
                                                    {builderColumnLabel(column.key, column.label, ar)}
                                                </option>
                                            ))}
                                        </select>

                                        <select
                                            className={control}
                                            value={filter.operator}
                                            onChange={event =>
                                                setFilters(current =>
                                                    current.map((item, itemIndex) =>
                                                        itemIndex === index
                                                            ? {
                                                                ...item,
                                                                operator: event.target.value as FilterRow['operator'],
                                                            }
                                                            : item,
                                                    ),
                                                )
                                            }
                                        >
                                            <option value="eq">=</option>
                                            <option value="neq">!=</option>
                                            <option value="contains">{text('يحتوي', 'contains')}</option>
                                            <option value="gte">≥</option>
                                            <option value="lte">≤</option>
                                        </select>

                                        <input
                                            className={control}
                                            value={filter.value}
                                            onChange={event =>
                                                setFilters(current =>
                                                    current.map((item, itemIndex) =>
                                                        itemIndex === index
                                                            ? { ...item, value: event.target.value }
                                                            : item,
                                                    ),
                                                )
                                            }
                                            placeholder={text('القيمة', 'Value')}
                                        />

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFilters(current =>
                                                    current.filter((_, itemIndex) => itemIndex !== index),
                                                )
                                            }
                                            className="flex size-10 items-center justify-center rounded-[11px] border border-red-400/30 text-red-300"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setFilters(current => [
                                        ...current,
                                        { field: '', operator: 'eq', value: '' },
                                    ])
                                }
                                className={outline + ' mt-3'}
                            >
                                <Plus size={13} />
                                {text('فلتر', 'Filter')}
                            </button>

                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                                <label className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                    {text('تجميع حسب', 'Group by')}
                                    <select
                                        className={control + ' mt-1'}
                                        value={groupBy}
                                        onChange={event => setGroupBy(event.target.value)}
                                    >
                                        <option value="">—</option>
                                        {selectedColumns.map(column => (
                                            <option key={column.key} value={column.key}>
                                                {column.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                    {text('ترتيب حسب', 'Sort by')}
                                    <select
                                        className={control + ' mt-1'}
                                        value={sortBy}
                                        onChange={event => setSortBy(event.target.value)}
                                    >
                                        <option value="">—</option>
                                        {dataset?.columns.map(column => (
                                            <option key={column.key} value={column.key}>
                                                {column.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                    {text('الاتجاه', 'Direction')}
                                    <select
                                        className={control + ' mt-1'}
                                        value={sortDirection}
                                        onChange={event =>
                                            setSortDirection(event.target.value as 'asc' | 'desc')
                                        }
                                    >
                                        <option value="asc">{text('تصاعدي', 'ASC')}</option>
                                        <option value="desc">{text('تنازلي', 'DESC')}</option>
                                    </select>
                                </label>
                            </div>

                            <div className="mt-4 flex justify-end">
                                <button
                                    type="button"
                                    disabled={busy || columns.length === 0}
                                    onClick={() => void run()}
                                    className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-4 text-xs font-bold text-[var(--ac-accent)] disabled:opacity-40"
                                >
                                    <Play size={13} />
                                    {text('تشغيل التقرير', 'Run report')}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <h2 className="text-xs font-bold text-[var(--ac-text)]">
                                    {text('النتيجة', 'Result')}
                                </h2>
                                {result?.limited && (
                                    <span className="text-[9px] text-amber-300">
                                        {text('أول 1000 سجل فقط', 'First 1000 rows only')}
                                    </span>
                                )}
                            </div>

                            {! result ? (
                                <div className="mt-4 rounded-[14px] border border-dashed border-[var(--ac-line)] p-10 text-center text-xs text-[var(--ac-text-muted)]">
                                    {text('شغّل التقرير لعرض البيانات.', 'Run the report to see data.')}
                                </div>
                            ) : result.group_by && result.groups.length > 0 ? (
                                <div className="mt-4 space-y-4">
                                    {result.groups.map(group => (
                                        <div
                                            key={group.key}
                                            className="overflow-hidden rounded-[14px] border border-[var(--ac-line)]"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--ac-surface-soft)] px-3 py-2">
                                                <div>
                                                    <strong className="text-[10px] text-[var(--ac-text)]">
                                                        {group.key || '—'}
                                                    </strong>
                                                    <span className="ms-2 text-[9px] text-[var(--ac-text-muted)]">
                                                        {group.count} {text('سجل', 'rows')}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap gap-1.5">
                                                    {Object.entries(group.totals).map(([key, value]) => {
                                                        const column = result.columns.find(
                                                            item => item.key === key,
                                                        );

                                                        return (
                                                            <span
                                                                key={key}
                                                                className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 py-1 text-[8px] text-[var(--ac-text-soft)]"
                                                            >
                                                                {builderColumnLabel(key, column?.label ?? key, ar)}: {value}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <ResultTable columns={result.columns} rows={group.rows} ar={ar} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--ac-line)]">
                                    <ResultTable columns={result.columns} rows={result.rows} ar={ar} />
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </main>
        </AppShell>
    );
}

function ResultTable({
    columns,
    rows,
    ar,
}: {
    columns: Column[];
    rows: Array<Record<string, unknown>>;
    ar: boolean;
}) {
    return (
        <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[720px] text-start text-[10px]">
                <thead className="sticky top-0 bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                    <tr>
                        {columns.map(column => (
                            <th
                                key={column.key}
                                className="border-b border-[var(--ac-line)] px-3 py-2 text-start font-semibold"
                            >
                                {builderColumnLabel(column.key, column.label, ar)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ac-line)]">
                    {rows.map((row, index) => (
                        <tr key={index} className="hover:bg-[var(--ac-surface-soft)]">
                            {columns.map(column => (
                                <td
                                    key={column.key}
                                    className="max-w-[260px] truncate px-3 py-2 text-[var(--ac-text-soft)]"
                                >
                                    {String(row[column.key] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
