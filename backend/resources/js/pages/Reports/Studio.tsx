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

type Feature = { number: number; key: string; title: string; category: string };
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
    snapshots: Array<Record<string, unknown>>;
    presets: Array<Record<string, unknown>>;
    boards: Array<Record<string, unknown>>;
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

export default function ReportStudio() {
    const ar = useLocale() === 'ar';
    const t = (arabic: string, english: string) => ar ? arabic : english;
    const [data, setData] = useState<StudioIndex>({ features: [], snapshots: [], presets: [], boards: [] });
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
    const [chartType, setChartType] = useState<'table' | 'bar' | 'line'>('table');
    const [pivotRows, setPivotRows] = useState('');
    const [pivotCols, setPivotCols] = useState('');
    const [pivotValue, setPivotValue] = useState('');
    const [formulaName, setFormulaName] = useState('Calculated');
    const [formulaLeft, setFormulaLeft] = useState('');
    const [formulaRight, setFormulaRight] = useState('');
    const [formulaOp, setFormulaOp] = useState<'+' | '-' | '*' | '/'>('-');
    const [formula, setFormula] = useState<{ name: string; left: string; right: string; op: string } | null>(null);
    const [scenarioSales, setScenarioSales] = useState(0);
    const [scenarioCost, setScenarioCost] = useState(0);
    const [exceptionMetric, setExceptionMetric] = useState('margin');
    const [exceptionOperator, setExceptionOperator] = useState('lt');
    const [exceptionValue, setExceptionValue] = useState(10);
    const [drill, setDrill] = useState<{ row: Record<string, unknown>; key: string } | null>(null);
    const [note, setNote] = useState('');
    const [comment, setComment] = useState('');
    const [boardName, setBoardName] = useState('');
    const [boardFeatures, setBoardFeatures] = useState<string[]>([]);

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
    const filtered = useMemo(() => data.features.filter(item =>
        !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.category.includes(search.toLowerCase())
    ), [data.features, search]);

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
                    name: feature?.title ?? 'Report snapshot',
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
                body: JSON.stringify({ name: feature?.title + ' · ' + dateFrom, scope: selected, filters: { dateFrom, dateTo, dimension } }),
            });
            await load();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر حفظ الفلتر.', 'Could not save preset.'));
        } finally { setBusy(false); }
    }

    async function saveBoard() {
        if (!boardName.trim() || boardFeatures.length === 0) return;
        setBusy(true);
        try {
            await apiRequest('/api/report-studio/boards', {
                method: 'POST',
                body: JSON.stringify({ name: boardName.trim(), shared: false, layout: boardFeatures.slice(0, 8).map((key, index) => ({ key, order: index })) }),
            });
            setBoardName(''); setBoardFeatures([]); await load();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : t('تعذر حفظ لوحة التقارير.', 'Could not save report board.'));
        } finally { setBusy(false); }
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
                                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">REPORT INTELLIGENCE</p>
                                <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">{t('Report Studio المتقدم', 'Advanced Report Studio')}</h1>
                                <p className="mt-2 max-w-4xl text-xs leading-6 text-[var(--ac-text-muted)]">
                                    {t('40 أداة للتقارير والتحليل والربحية والمخزون والكاش والتعاون، مبنية فوق بيانات AccoNova الفعلية.', '40 reporting, analytics, profitability, inventory, cash and collaboration capabilities powered by live AccoNova data.')}
                                </p>
                            </div>
                        </div>
                        <Link href="/app/reports/builder" className={button}><Table2 size={13}/>{t('فتح Report Builder', 'Open Report Builder')}</Link>
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
                                        <span className="min-w-0 flex-1 text-[10px] font-semibold text-[var(--ac-text)]">{item.title}</span>
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
                                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ac-accent)]">{feature?.category ?? 'report'}</p>
                                    <h2 className="mt-1 text-lg font-bold text-[var(--ac-text)]">{feature?.title ?? t('اختر تقريراً', 'Choose a report')}</h2>
                                </div>
                                <button className={button} disabled={busy || !feature} onClick={() => void run()}><Play size={13}/>{t('تشغيل التقرير', 'Run report')}</button>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">{t('من', 'From')}</span><input type="date" className={input + ' w-full'} value={dateFrom} onChange={e => setDateFrom(e.target.value)}/></label>
                                <label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">{t('إلى', 'To')}</span><input type="date" className={input + ' w-full'} value={dateTo} onChange={e => setDateTo(e.target.value)}/></label>
                                <label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">Dimension</span><select className={input + ' w-full'} value={dimension} onChange={e => setDimension(e.target.value)}><option value="customer">Customer</option><option value="product">Product</option><option value="supplier">Supplier</option><option value="employee">Employee</option><option value="branch">Branch</option><option value="warehouse">Warehouse</option><option value="month">Month</option></select></label>
                                <div className="flex items-end"><button className={button + ' w-full'} onClick={() => void savePreset()}><Bookmark size={13}/>{t('حفظ الفلتر', 'Save preset')}</button></div>
                            </div>

                            {selected === 'scenario-reports' && <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">Sales %</span><input type="number" className={input + ' w-full'} value={scenarioSales} onChange={e => setScenarioSales(Number(e.target.value))}/></label><label className="space-y-1"><span className="text-[9px] text-[var(--ac-text-muted)]">Cost %</span><input type="number" className={input + ' w-full'} value={scenarioCost} onChange={e => setScenarioCost(Number(e.target.value))}/></label></div>}
                            {selected === 'exception-builder' && <div className="mt-4 grid gap-3 md:grid-cols-3"><select className={input} value={exceptionMetric} onChange={e => setExceptionMetric(e.target.value)}><option value="margin">Margin</option><option value="stock">Stock</option><option value="discount">Discount</option></select><select className={input} value={exceptionOperator} onChange={e => setExceptionOperator(e.target.value)}><option value="lt">&lt;</option><option value="lte">≤</option><option value="gt">&gt;</option><option value="gte">≥</option></select><input type="number" className={input} value={exceptionValue} onChange={e => setExceptionValue(Number(e.target.value))}/></div>}
                        </section>

                        {result && <>
                            <section className={panel + ' p-4'}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2"><LineChart size={14} className="text-[var(--ac-accent)]"/><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('النتيجة والتحليل', 'Result & visualization')}</h3></div>
                                    <div className="flex gap-2">
                                        {(['table','bar','line'] as const).map(type => <button key={type} className={button + (chartType === type ? ' border-[var(--ac-accent)] text-[var(--ac-accent)]' : '')} onClick={() => setChartType(type)}>{type}</button>)}
                                        <button className={button} onClick={() => void saveSnapshot()}><Snowflake size={13}/>{t('Freeze Snapshot', 'Freeze Snapshot')}</button>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2 text-[9px] text-[var(--ac-text-muted)]"><span>{result.date_from} → {result.date_to}</span><span>•</span><span>{displayedRows.length} {t('صف', 'rows')}</span>{result.meta && Object.entries(result.meta).slice(0,4).map(([k,v]) => <span key={k}>• {k}: {String(v)}</span>)}</div>
                                {chartType === 'table' ? <ResultTable columns={displayedColumns} rows={displayedRows} onDrill={(row,key) => setDrill({row,key})}/> : <SimpleChart rows={displayedRows} columns={displayedColumns} type={chartType}/>}
                            </section>

                            <section className="grid gap-4 2xl:grid-cols-2">
                                <div className={panel + ' p-4'}>
                                    <div className="flex items-center gap-2"><Calculator size={14} className="text-[var(--ac-accent)]"/><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('Formula Builder', 'Formula Builder')}</h3></div>
                                    <div className="mt-3 grid gap-2 md:grid-cols-5">
                                        <input className={input} value={formulaName} onChange={e => setFormulaName(e.target.value)} placeholder="Profit"/>
                                        <select className={input} value={formulaLeft} onChange={e => setFormulaLeft(e.target.value)}>{result.columns.map(c => <option key={c}>{c}</option>)}</select>
                                        <select className={input} value={formulaOp} onChange={e => setFormulaOp(e.target.value as '+'|'-'|'*'|'/')}><option>+</option><option>-</option><option>*</option><option>/</option></select>
                                        <select className={input} value={formulaRight} onChange={e => setFormulaRight(e.target.value)}>{result.columns.map(c => <option key={c}>{c}</option>)}</select>
                                        <button className={button} onClick={() => setFormula({name: formulaName || 'Calculated', left: formulaLeft, right: formulaRight, op: formulaOp})}>{t('تطبيق', 'Apply')}</button>
                                    </div>
                                </div>
                                <div className={panel + ' p-4'}>
                                    <div className="flex items-center gap-2"><Table2 size={14} className="text-[var(--ac-accent)]"/><h3 className="text-xs font-bold text-[var(--ac-text)]">Pivot</h3></div>
                                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                                        <select className={input} value={pivotRows} onChange={e => setPivotRows(e.target.value)}><option value="">Rows</option>{displayedColumns.map(c => <option key={c}>{c}</option>)}</select>
                                        <select className={input} value={pivotCols} onChange={e => setPivotCols(e.target.value)}><option value="">No columns</option>{displayedColumns.map(c => <option key={c}>{c}</option>)}</select>
                                        <select className={input} value={pivotValue} onChange={e => setPivotValue(e.target.value)}><option value="">Values</option>{displayedColumns.map(c => <option key={c}>{c}</option>)}</select>
                                    </div>
                                    {pivot && <div className="mt-3 max-h-[300px] overflow-auto"><table className="w-full text-[9px]"><thead><tr><th className="p-2 text-start">{pivotRows}</th>{pivot.columns.map(c => <th key={c} className="p-2 text-end">{c}</th>)}</tr></thead><tbody>{pivot.rows.map(([r,values]) => <tr key={r} className="border-t border-[var(--ac-line)]"><td className="p-2 text-[var(--ac-text)]">{r}</td>{pivot.columns.map(c => <td key={c} className="p-2 text-end text-[var(--ac-text-soft)]">{formatValue(values[c] ?? 0)}</td>)}</tr>)}</tbody></table></div>}
                                </div>
                            </section>

                            <section className="grid gap-4 xl:grid-cols-3">
                                <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('ملاحظة على التقرير', 'Report annotation')}</h3><textarea className="mt-3 min-h-24 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs text-[var(--ac-text)] outline-none" value={note} onChange={e => setNote(e.target.value)}/><button className={button + ' mt-2 w-full'} disabled={!note.trim()} onClick={() => void saveText('annotations', note)}><Save size={13}/>{t('حفظ الملاحظة', 'Save annotation')}</button></div>
                                <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('تعليق وتعاون', 'Comment & collaborate')}</h3><textarea className="mt-3 min-h-24 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs text-[var(--ac-text)] outline-none" value={comment} onChange={e => setComment(e.target.value)} placeholder="@Ahmad ..."/><button className={button + ' mt-2 w-full'} disabled={!comment.trim()} onClick={() => void saveText('comments', comment)}><MessageSquareText size={13}/>{t('إضافة تعليق', 'Add comment')}</button></div>
                                <div className={panel + ' p-4'}><h3 className="text-xs font-bold text-[var(--ac-text)]">{t('Executive Report Board', 'Executive Report Board')}</h3><input className={input + ' mt-3 w-full'} value={boardName} onChange={e => setBoardName(e.target.value)} placeholder={t('اسم اللوحة', 'Board name')}/><div className="mt-2 max-h-24 overflow-auto text-[9px]">{data.features.slice(0,32).map(f => <label key={f.key} className="flex items-center gap-2 py-1 text-[var(--ac-text-soft)]"><input type="checkbox" checked={boardFeatures.includes(f.key)} disabled={!boardFeatures.includes(f.key) && boardFeatures.length >= 8} onChange={() => setBoardFeatures(v => v.includes(f.key) ? v.filter(k => k !== f.key) : [...v, f.key])}/>{f.title}</label>)}</div><button className={button + ' mt-2 w-full'} onClick={() => void saveBoard()} disabled={!boardName.trim() || boardFeatures.length === 0}><Save size={13}/>{t('حفظ اللوحة', 'Save board')}</button></div>
                            </section>
                        </>}
                    </section>
                </div>

                {drill && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDrill(null)}><div className={panel + ' max-h-[80vh] w-full max-w-2xl overflow-auto p-5'} onClick={e => e.stopPropagation()}><h3 className="text-sm font-bold text-[var(--ac-text)]">{t('Drill-Down', 'Drill-Down')} · {drill.key}</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{Object.entries(drill.row).map(([k,v]) => <div key={k} className="rounded-[11px] border border-[var(--ac-line)] p-3"><p className="text-[9px] text-[var(--ac-text-muted)]">{k}</p><p className="mt-1 break-words text-xs font-semibold text-[var(--ac-text)]">{formatValue(v)}</p></div>)}</div><button className={button + ' mt-4 w-full'} onClick={() => setDrill(null)}>{t('إغلاق', 'Close')}</button></div></div>}
            </main>
        </AppShell>
    );
}

function ResultTable({columns, rows, onDrill}: {columns: string[]; rows: Array<Record<string, unknown>>; onDrill: (row: Record<string, unknown>, key: string) => void}) {
    return <div className="mt-4 max-h-[580px] overflow-auto rounded-[14px] border border-[var(--ac-line)]"><table className="w-full min-w-[800px] text-[10px]"><thead className="sticky top-0 bg-[var(--ac-surface-soft)]"><tr>{columns.map(c => <th key={c} className="border-b border-[var(--ac-line)] px-3 py-2 text-start font-semibold text-[var(--ac-text-muted)]">{c.replaceAll('_',' ')}</th>)}</tr></thead><tbody className="divide-y divide-[var(--ac-line)]">{rows.map((row,i) => <tr key={i} className="hover:bg-[var(--ac-surface-soft)]">{columns.map(c => { const numeric = typeof row[c] === 'number' || (row[c] !== null && row[c] !== '' && !Number.isNaN(Number(row[c]))); return <td key={c} className="max-w-[300px] px-3 py-2 text-[var(--ac-text-soft)]">{numeric ? <button className="font-semibold text-[var(--ac-accent)] hover:underline" onClick={() => onDrill(row,c)}>{formatValue(row[c])}</button> : <span className="break-words">{formatValue(row[c])}</span>}</td>;})}</tr>)}</tbody></table></div>;
}

function SimpleChart({rows, columns, type}: {rows: Array<Record<string, unknown>>; columns: string[]; type: 'bar'|'line'}) {
    const numeric = columns.find(c => rows.some(r => typeof r[c] === 'number' || !Number.isNaN(Number(r[c]))));
    const label = columns.find(c => c !== numeric) ?? columns[0];
    const points = rows.slice(0, 20).map(r => ({label: String(r[label] ?? '—'), value: Number(r[numeric ?? ''] ?? 0)}));
    const max = Math.max(1, ...points.map(p => Math.abs(p.value)));
    if (!numeric) return <div className="mt-4 p-8 text-center text-xs text-[var(--ac-text-muted)]">No numeric field available.</div>;
    if (type === 'line') {
        const path = points.map((p,i) => `${i === 0 ? 'M':'L'} ${20 + i * (760 / Math.max(1, points.length - 1))} ${190 - (Math.max(0,p.value) / max) * 160}`).join(' ');
        return <div className="mt-4 overflow-x-auto rounded-[14px] border border-[var(--ac-line)] p-4"><svg viewBox="0 0 800 220" className="min-w-[720px]"><path d={path} fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--ac-accent)]"/>{points.map((p,i) => <circle key={i} cx={20 + i * (760 / Math.max(1, points.length - 1))} cy={190 - (Math.max(0,p.value) / max) * 160} r="3" fill="currentColor" className="text-[var(--ac-accent)]"/>)}</svg></div>;
    }
    return <div className="mt-4 space-y-2">{points.map((p,i) => <div key={i} className="grid grid-cols-[150px_1fr_100px] items-center gap-2 text-[9px]"><span className="truncate text-[var(--ac-text-soft)]">{p.label}</span><div className="h-2 overflow-hidden rounded-full bg-[var(--ac-surface-soft)]"><div className="h-full rounded-full bg-[var(--ac-accent)]" style={{width: Math.max(1,(Math.abs(p.value)/max)*100)+'%'}}/></div><span className="text-end font-semibold text-[var(--ac-text)]">{formatValue(p.value)}</span></div>)}</div>;
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'number') return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
    const n = Number(value);
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(value)) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
    return String(value);
}
