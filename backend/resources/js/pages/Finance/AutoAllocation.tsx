import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    Check,
    Eye,
    Layers,
    Sparkles,
    WalletCards,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    FPanel,
    FinanceHeader,
    Money,
    SummaryCard,
    apiErrorText,
    financeButton,
    financePrimary,
} from './shared';

type Movement = {
    id: number;
    number: string;
    kind: 'sale' | 'purchase';
    date: string;
    party_id: number | null;
    party: string | null;
    amount: string;
    unallocated: string;
    currency: string;
    method: string;
    url: string;
};

type PlanLine = {
    document_id: number;
    number: string;
    issue_date: string;
    total: string;
    balance_before: string;
    amount: string;
    full: boolean;
};

type PlanResult = {
    movement: Movement;
    lines: PlanLine[];
    remaining: string;
    warning: 'no_party' | 'no_open_invoices' | 'advance_left' | null;
};

type Summary = {
    movements: number;
    lines: number;
    allocated: string;
    advance_left: string;
};

type KindFilter = 'all' | 'sale' | 'purchase';

const PAGE_SIZES = [20, 50, 100, 500, 1000];
const APPLY_BATCH = 200;

export default function AutoAllocation() {
    const ar = useLocale() === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const [movements, setMovements] = useState<Movement[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [kind, setKind] = useState<KindFilter>('all');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [continueNewer, setContinueNewer] = useState(false);
    const [plan, setPlan] = useState<PlanResult[] | null>(null);
    const [done, setDone] = useState<Summary | null>(null);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [progress, setProgress] = useState('');

    const load = useCallback(async (): Promise<void> => {
        try {
            const response = await apiRequest<{ data: Movement[] }>(
                '/api/finance/auto-allocation',
            );

            setMovements(response.data);
            setSelected((current) => new Set(
                response.data
                    .filter((movement) => current.has(movement.id))
                    .map((movement) => movement.id),
            ));
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const visible = useMemo(
        () => movements.filter((movement) => kind === 'all' || movement.kind === kind),
        [movements, kind],
    );

    const pageCount = Math.max(Math.ceil(visible.length / pageSize), 1);
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    // Oldest movements first, the same order the server plans in.
    const selectedIds = useMemo(
        () => visible
            .filter((movement) => selected.has(movement.id))
            .map((movement) => movement.id)
            .reverse(),
        [visible, selected],
    );

    const allSelected = pageRows.length > 0
        && pageRows.every((movement) => selected.has(movement.id));

    const totals = useMemo(() => ({
        sale: movements
            .filter((movement) => movement.kind === 'sale')
            .reduce((sum, movement) => sum + Number(movement.unallocated), 0),
        purchase: movements
            .filter((movement) => movement.kind === 'purchase')
            .reduce((sum, movement) => sum + Number(movement.unallocated), 0),
    }), [movements]);

    const planById = useMemo(
        () => new Map((plan ?? []).map((result) => [result.movement.id, result])),
        [plan],
    );

    function resetPlan(): void {
        setPlan(null);
        setDone(null);
    }

    function toggle(id: number): void {
        resetPlan();
        setSelected((current) => {
            const next = new Set(current);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    function toggleAll(): void {
        resetPlan();
        setSelected((current) => {
            const next = new Set(current);

            pageRows.forEach((movement) => {
                if (allSelected) {
                    next.delete(movement.id);
                } else {
                    next.add(movement.id);
                }
            });

            return next;
        });
    }

    async function request<T>(path: string, ids: number[]): Promise<T> {
        const response = await apiRequest<{ data: T }>(path, {
            method: 'POST',
            body: JSON.stringify({
                movement_ids: ids,
                continue_newer: continueNewer,
            }),
        });

        return response.data;
    }

    async function preview(): Promise<void> {
        setDone(null);
        setBusy(true);
        setError('');

        try {
            setPlan(await request<PlanResult[]>('/api/finance/auto-allocation/preview', selectedIds));
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    async function apply(): Promise<void> {
        const total: Summary = {
            movements: 0,
            lines: 0,
            allocated: '0',
            advance_left: '0',
        };

        setBusy(true);
        setError('');

        try {
            for (let start = 0; start < selectedIds.length; start += APPLY_BATCH) {
                setProgress(text(
                    'جارٍ التوزيع… ' + start + ' من ' + selectedIds.length,
                    'Allocating… ' + start + ' of ' + selectedIds.length,
                ));

                const summary = await request<Summary>(
                    '/api/finance/auto-allocation/apply',
                    selectedIds.slice(start, start + APPLY_BATCH),
                );

                total.movements += summary.movements;
                total.lines += summary.lines;
                total.allocated = String(Number(total.allocated) + Number(summary.allocated));
                total.advance_left = String(Number(total.advance_left) + Number(summary.advance_left));
            }

            setPlan(null);
            setSelected(new Set());
        } catch (failure) {
            setError(
                apiErrorText(failure)
                + (total.movements > 0
                    ? text(
                        ' (تم توزيع ' + total.movements + ' حركة قبل التوقف.)',
                        ' (' + total.movements + ' movements were allocated before it stopped.)',
                    )
                    : ''),
            );
        } finally {
            setProgress('');
            setBusy(false);

            if (total.movements > 0) {
                setDone(total);
            }

            await load();
        }
    }

    function warningLabel(warning: PlanResult['warning']): string {
        const labels: Record<string, [string, string]> = {
            no_party: ['بدون طرف', 'No party'],
            no_open_invoices: ['لا فواتير مفتوحة', 'No open invoices'],
            advance_left: ['يبقى رصيداً مقدماً', 'Remainder stays as advance'],
        };

        return warning ? labels[warning][ar ? 0 : 1] : '';
    }

    const plannedLines = (plan ?? []).reduce((sum, result) => sum + result.lines.length, 0);
    const plannedTotal = (plan ?? []).reduce(
        (sum, result) => sum + result.lines.reduce((inner, line) => inner + Number(line.amount), 0),
        0,
    );

    const tab = (value: KindFilter, label: string) => (
        <button
            key={value}
            type="button"
            onClick={() => {
                resetPlan();
                setPage(0);
                setKind(value);
            }}
            className={[
                'min-h-9 rounded-[10px] px-4 text-xs font-semibold transition',
                kind === value
                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                    : 'text-[var(--ac-text-muted)] hover:text-[var(--ac-text)]',
            ].join(' ')}
        >
            {label}
        </button>
    );

    return (
        <AppShell>
            <Head title={text('توزيع تلقائي للمقبوضات والدفعات', 'Automatic allocation')} />
            <main className="mx-auto w-full max-w-[1400px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
                <FinanceHeader
                    title={text('توزيع المقبوضات والدفعات', 'Allocate receipts and payments')}
                    subtitle={text(
                        'حدد الحركات غير الموزعة ثم وزّعها تلقائياً على فواتير نفس الطرف: يبدأ من فواتير بتاريخ الحركة ثم يرجع للأقدم فالأقدم حتى ينتهي المبلغ.',
                        'Select unallocated movements and allocate them to the same party\'s invoices: from invoices dated on the movement date, then back through older ones until the amount is used.',
                    )}
                />

                <section className="grid gap-3 sm:grid-cols-3">
                    <SummaryCard
                        label={text('مقبوضات غير موزعة', 'Unallocated receipts')}
                        value={<Money value={totals.sale} />}
                        icon={WalletCards}
                        tone="green"
                    />
                    <SummaryCard
                        label={text('دفعات غير موزعة', 'Unallocated payments')}
                        value={<Money value={totals.purchase} />}
                        icon={WalletCards}
                        tone="amber"
                    />
                    <SummaryCard
                        label={text('محدد للتوزيع', 'Selected')}
                        value={selectedIds.length}
                        hint={text('من ' + visible.length + ' حركة', 'of ' + visible.length + ' movements')}
                        icon={Layers}
                        tone="blue"
                    />
                </section>

                {error && (
                    <div className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {done && (
                    <div className="rounded-[14px] border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-500">
                        {text(
                            'تم التوزيع: ' + done.lines + ' ربط على ' + done.movements + ' حركة، بإجمالي ',
                            'Allocated ' + done.lines + ' links across ' + done.movements + ' movements, totaling ',
                        )}
                        <Money value={done.allocated} />
                        {Number(done.advance_left) > 0 && (
                            <>
                                {text('، ويبقى رصيداً مقدماً ', '; remaining advance ')}
                                <Money value={done.advance_left} />
                            </>
                        )}
                    </div>
                )}

                <FPanel
                    title={text('حركات غير موزعة', 'Unallocated movements')}
                    icon={WalletCards}
                    action={(
                        <div className="flex gap-1 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-1">
                            {tab('all', text('الكل', 'All'))}
                            {tab('sale', text('مقبوضات', 'Receipts'))}
                            {tab('purchase', text('دفعات', 'Payments'))}
                        </div>
                    )}
                >
                    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--ac-line)] px-4 py-3 text-xs text-[var(--ac-text-muted)]">
                        <label className="flex cursor-pointer items-center gap-2 font-semibold text-[var(--ac-text)]">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                disabled={! pageRows.length}
                                onChange={toggleAll}
                                className="size-4 accent-[var(--ac-accent)]"
                            />
                            {text('تحديد هذه الصفحة', 'Select this page')} ({pageRows.length})
                        </label>
                        <label className="flex cursor-pointer items-center gap-2">
                            <input
                                type="checkbox"
                                checked={continueNewer}
                                onChange={(event) => {
                                    resetPlan();
                                    setContinueNewer(event.target.checked);
                                }}
                                className="size-4 accent-[var(--ac-accent)]"
                            />
                            {text(
                                'بعد استنفاد الأقدم، كمّل على الفواتير الأحدث',
                                'After older invoices, continue on newer ones',
                            )}
                        </label>
                    </div>

                    {loading ? (
                        <p className="p-10 text-center text-sm text-[var(--ac-text-muted)]">
                            {text('جارٍ التحميل…', 'Loading…')}
                        </p>
                    ) : ! visible.length ? (
                        <p className="p-10 text-center text-sm text-[var(--ac-text-muted)]">
                            {text('لا توجد حركات غير موزعة.', 'There are no unallocated movements.')}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-start text-xs">
                                <thead>
                                    <tr className="border-b border-[var(--ac-line)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                        <th className="w-10 px-4 py-3" />
                                        <th className="px-3 py-3 text-start">{text('الحركة', 'Movement')}</th>
                                        <th className="px-3 py-3 text-start">{text('الطرف', 'Party')}</th>
                                        <th className="px-3 py-3 text-start">{text('التاريخ', 'Date')}</th>
                                        <th className="px-3 py-3 text-start">{text('غير موزع', 'Unallocated')}</th>
                                        <th className="px-3 py-3 text-start">{text('الحالة', 'Status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageRows.map((movement) => {
                                        const result = planById.get(movement.id);

                                        return (
                                            <PlanRows
                                                key={movement.id}
                                                movement={movement}
                                                result={result}
                                                checked={selected.has(movement.id)}
                                                onToggle={() => toggle(movement.id)}
                                                warningLabel={warningLabel}
                                                text={text}
                                            />
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {visible.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ac-line)] px-4 py-2.5 text-xs text-[var(--ac-text-muted)]">
                            <label className="flex items-center gap-2">
                                {text('عدد الصفوف', 'Rows per page')}
                                <select
                                    value={pageSize}
                                    onChange={(event) => {
                                        setPageSize(Number(event.target.value));
                                        setPage(0);
                                    }}
                                    className="rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 py-1.5 text-xs text-[var(--ac-text)]"
                                >
                                    {PAGE_SIZES.map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                className={financeButton}
                                disabled={currentPage === 0}
                                onClick={() => setPage(currentPage - 1)}
                            >
                                {text('السابق', 'Previous')}
                            </button>
                            <span>
                                {text('صفحة ', 'Page ')}{currentPage + 1}{text(' من ', ' of ')}{pageCount}
                                {' · '}{visible.length} {text('حركة', 'movements')}
                            </span>
                            <button
                                type="button"
                                className={financeButton}
                                disabled={currentPage >= pageCount - 1}
                                onClick={() => setPage(currentPage + 1)}
                            >
                                {text('التالي', 'Next')}
                            </button>
                        </div>
                    )}

                    <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--ac-line)] px-4 py-3.5">
                        <p className="text-xs text-[var(--ac-text-muted)]">
                            {progress
                                ? progress
                                : plan
                                ? text(
                                    'المعاينة: ' + plannedLines + ' ربط بإجمالي ',
                                    'Preview: ' + plannedLines + ' links totaling ',
                                )
                                : text(
                                    'اختر حركات ثم اضغط معاينة التوزيع. لن يتغير شيء قبل التأكيد.',
                                    'Select movements and preview. Nothing changes until you confirm.',
                                )}
                            {plan && <strong className="text-[var(--ac-text)]"><Money value={plannedTotal} /></strong>}
                        </p>
                        <div className="ms-auto flex flex-wrap gap-2">
                            <button
                                type="button"
                                className={financeButton}
                                disabled={busy || ! selectedIds.length}
                                onClick={() => void preview()}
                            >
                                <Eye size={14} />
                                {text('معاينة التوزيع', 'Preview allocation')}
                            </button>
                            <button
                                type="button"
                                className={financePrimary}
                                disabled={busy || ! plan || plannedLines === 0}
                                onClick={() => void apply()}
                            >
                                <Sparkles size={14} />
                                {text('تأكيد وتنفيذ التوزيع', 'Confirm and allocate')}
                            </button>
                        </div>
                    </footer>
                </FPanel>
            </main>
        </AppShell>
    );
}

function PlanRows({
    movement,
    result,
    checked,
    onToggle,
    warningLabel,
    text,
}: {
    movement: Movement;
    result: PlanResult | undefined;
    checked: boolean;
    onToggle: () => void;
    warningLabel: (warning: PlanResult['warning']) => string;
    text: (arabic: string, english: string) => string;
}) {
    const badge = (tone: 'green' | 'amber' | 'red' | 'blue', label: string) => (
        <span
            className={[
                'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold',
                tone === 'green' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
                tone === 'amber' && 'border-amber-500/20 bg-amber-500/10 text-amber-500',
                tone === 'red' && 'border-red-500/20 bg-red-500/10 text-red-500',
                tone === 'blue' && 'border-blue-500/20 bg-blue-500/10 text-blue-500',
            ].filter(Boolean).join(' ')}
        >
            {label}
        </span>
    );

    return (
        <>
            <tr className="border-b border-[var(--ac-line)] transition hover:bg-[var(--ac-surface-soft)]">
                <td className="px-4 py-3">
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={onToggle}
                        aria-label={movement.number}
                        className="size-4 accent-[var(--ac-accent)]"
                    />
                </td>
                <td className="px-3 py-3">
                    <Link
                        href={movement.url}
                        className="font-semibold text-[var(--ac-accent)] hover:underline"
                    >
                        {movement.number}
                    </Link>
                    <span className="ms-2">
                        {badge(
                            movement.kind === 'sale' ? 'green' : 'blue',
                            movement.kind === 'sale' ? text('قبض', 'Receipt') : text('دفع', 'Payment'),
                        )}
                    </span>
                </td>
                <td className="px-3 py-3 text-[var(--ac-text)]">{movement.party ?? '—'}</td>
                <td className="px-3 py-3 text-[var(--ac-text-muted)]">{movement.date}</td>
                <td className="px-3 py-3 font-semibold text-[var(--ac-text)]">
                    <Money value={movement.unallocated} currency={movement.currency} />
                </td>
                <td className="px-3 py-3">
                    {! result
                        ? badge('blue', text('غير معاين', 'Not previewed'))
                        : result.warning && result.warning !== 'advance_left'
                            ? badge('red', warningLabel(result.warning))
                            : result.warning === 'advance_left'
                                ? badge('amber', warningLabel(result.warning))
                                : badge('green', text('جاهز', 'Ready'))}
                </td>
            </tr>
            {result && result.lines.length > 0 && (
                <tr className="border-b border-[var(--ac-line)] bg-[var(--ac-surface-soft)]">
                    <td />
                    <td colSpan={5} className="px-3 py-3">
                        <ul className="space-y-1.5">
                            {result.lines.map((line) => (
                                <li
                                    key={line.document_id}
                                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--ac-text-muted)]"
                                >
                                    <span className="font-semibold text-[var(--ac-text)]">{line.number}</span>
                                    <span>{line.issue_date}</span>
                                    <span>
                                        <Money value={line.amount} currency={movement.currency} />
                                        {' / '}
                                        <Money value={line.balance_before} />
                                    </span>
                                    {badge(
                                        line.full ? 'green' : 'amber',
                                        line.full ? text('تسديد كامل', 'Fully paid') : text('تسديد جزئي', 'Partial'),
                                    )}
                                </li>
                            ))}
                            {Number(result.remaining) > 0 && (
                                <li className="flex items-center gap-2 text-[11px] text-amber-500">
                                    <Check size={12} />
                                    {text('الباقي رصيد مقدم: ', 'Remaining advance: ')}
                                    <Money value={result.remaining} currency={movement.currency} />
                                </li>
                            )}
                        </ul>
                    </td>
                </tr>
            )}
        </>
    );
}
