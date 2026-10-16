import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Search,
    WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type Kind = 'payment' | 'bonus' | 'allowance' | 'deduction' | 'advance';

type Row = {
    id: number;
    name: string;
    job_title: string | null;
    basis: 'hour' | 'day' | 'month' | 'piece';
    currency: string;
    active: boolean;
    balance: string;
};

type RosterResponse = {
    data: Row[];
    pagination: {
        current_page: number;
        last_page: number;
        total: number;
        from: number | null;
        to: number | null;
    };
    departments: { id: number; name: string }[];
};

type SaveResponse = {
    created: number;
    skipped: { id: number; name: string | null; reason: string }[];
};

const field =
    'h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)]';
const button =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3.5 text-xs font-semibold transition hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50';
const primary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50';

function localDate(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fieldLabel(key: string, ar: boolean): string {
    if (key.startsWith('rows.') && key.endsWith('.amount')) {
        return ar ? 'المبلغ' : 'Amount';
    }

    const labels: Record<string, [string, string]> = {
        occurred_on: ['التاريخ', 'Date'],
        kind: ['نوع العملية', 'Operation type'],
        notes: ['الملاحظة', 'Note'],
        rows: ['المبالغ', 'Amounts'],
    };
    const pair = labels[key];

    return pair ? (ar ? pair[0] : pair[1]) : key;
}

/** Name the field behind every server message so "this field is required" is never anonymous. */
function errorText(error: unknown, ar = false): string {
    if (error instanceof ApiError) {
        const details = Object.entries(error.errors)
            .map(([key, messages]) => fieldLabel(key, ar) + ': ' + messages.join(' '));

        return [error.message, ...details].filter(Boolean).join(' ');
    }

    return error instanceof Error ? error.message : 'Failed';
}

function format(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function StaffBulkTransactions() {
    const ar = useLocale() === 'ar';
    const [kind, setKind] = useState<Kind>('payment');
    const [date, setDate] = useState(localDate());
    const [notes, setNotes] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [onlyDue, setOnlyDue] = useState(false);
    const [page, setPage] = useState(1);
    const [roster, setRoster] = useState<RosterResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [revision, setRevision] = useState(0);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [amounts, setAmounts] = useState<Record<number, string>>({});
    const [known, setKnown] = useState<Record<number, Row>>({});
    const [sameAmount, setSameAmount] = useState('');
    const batchId = useRef<string>(crypto.randomUUID());

    const kinds: { value: Kind; label: string }[] = [
        { value: 'payment', label: ar ? 'دفعة للموظف' : 'Payment' },
        { value: 'bonus', label: ar ? 'مكافأة' : 'Bonus' },
        { value: 'allowance', label: ar ? 'بدل' : 'Allowance' },
        { value: 'deduction', label: ar ? 'خصم' : 'Deduction' },
        { value: 'advance', label: ar ? 'سلفة' : 'Advance' },
    ];

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, department, onlyDue]);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ page: String(page), per_page: '50' });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (department) params.set('department_id', department);
        if (onlyDue) params.set('only_due', '1');

        setLoading(true);

        apiRequest<RosterResponse>(`/api/staff-transactions/bulk?${params.toString()}`, {
            signal: controller.signal,
        })
            .then((response) => {
                setRoster(response);
                setKnown((current) => {
                    const next = { ...current };
                    response.data.forEach((row) => {
                        next[row.id] = row;
                    });
                    return next;
                });
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) setError(errorText(failure, ar));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [page, debouncedSearch, department, onlyDue, revision]);

    const filled = useMemo(
        () =>
            Object.entries(amounts)
                .map(([id, value]) => ({ id: Number(id), amount: Number(value) }))
                .filter((item) => item.amount > 0 && known[item.id]),
        [amounts, known],
    );

    const totals = useMemo(() => {
        const byCurrency: Record<string, number> = {};
        filled.forEach((item) => {
            const currency = known[item.id].currency;
            byCurrency[currency] = (byCurrency[currency] ?? 0) + item.amount;
        });
        return Object.entries(byCurrency);
    }, [filled, known]);

    function setAmount(id: number, value: string): void {
        setAmounts((current) => ({ ...current, [id]: value }));
    }

    function fillRemaining(): void {
        setAmounts((current) => {
            const next = { ...current };
            roster?.data.forEach((row) => {
                const due = Number(row.balance);
                if (due > 0) next[row.id] = String(due);
            });
            return next;
        });
    }

    function fillSame(): void {
        if (!(Number(sameAmount) > 0)) return;
        setAmounts((current) => {
            const next = { ...current };
            roster?.data.forEach((row) => {
                next[row.id] = sameAmount;
            });
            return next;
        });
    }

    async function save(): Promise<void> {
        if (!filled.length || saving) return;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localDate()) {
            setError(
                ar
                    ? 'التاريخ غير صالح: اختر تاريخاً موجوداً في التقويم وليس في المستقبل.'
                    : 'The date is not valid: pick a real calendar date that is not in the future.',
            );
            return;
        }

        if (filled.length > 100) {
            setError(ar ? 'الحد الأقصى 100 موظف في العملية الواحدة.' : 'You can save at most 100 employees at once.');
            return;
        }

        const label = kinds.find((item) => item.value === kind)?.label ?? kind;
        const summary = totals.map(([currency, total]) => `${format(total)} ${currency}`).join(' + ');

        if (
            !window.confirm(
                ar
                    ? `تسجيل «${label}» لعدد ${filled.length} موظف بإجمالي ${summary}؟`
                    : `Record "${label}" for ${filled.length} employees totalling ${summary}?`,
            )
        ) {
            return;
        }

        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const response = await apiRequest<SaveResponse>('/api/staff-transactions/bulk', {
                method: 'POST',
                body: JSON.stringify({
                    batch_id: batchId.current,
                    kind,
                    occurred_on: date,
                    notes: notes || null,
                    rows: filled.map((item) => ({ staff_id: item.id, amount: String(item.amount) })),
                }),
            });

            setSuccess(
                ar
                    ? `تم تسجيل ${response.created} عملية${response.skipped.length ? ` · تم تخطي ${response.skipped.length}` : ''}.`
                    : `Saved ${response.created} transactions${response.skipped.length ? ` · ${response.skipped.length} skipped` : ''}.`,
            );
            setAmounts({});
            setSameAmount('');
            batchId.current = crypto.randomUUID();
            setRevision((value) => value + 1);
            window.dispatchEvent(new Event('staff:transaction-saved'));
        } catch (failure) {
            setError(errorText(failure, ar));
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
            <div className="border-b border-[var(--ac-line)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <WalletCards size={18} />
                        </span>
                        <div>
                            <h2 className="text-sm font-semibold">{ar ? 'تسجيل عمليات جماعي' : 'Bulk transactions'}</h2>
                            <p className="mt-1 text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'اختر نوع العملية، اكتب مبلغ كل موظف، ثم سجّل الكل دفعة واحدة. الصفوف الفارغة تُتجاهل.'
                                    : 'Pick the transaction type, type each employee’s amount, then save everything at once. Empty rows are ignored.'}
                            </p>
                        </div>
                    </div>

                    <button type="button" className={primary} onClick={() => void save()} disabled={saving || !filled.length}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <WalletCards size={14} />}
                        {ar ? `تسجيل (${filled.length})` : `Save (${filled.length})`}
                    </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    <label className="text-[10px] font-semibold">
                        {ar ? 'نوع العملية' : 'Transaction type'}
                        <select value={kind} onChange={(event) => setKind(event.target.value as Kind)} className={`${field} mt-1`}>
                            {kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                    </label>
                    <label className="text-[10px] font-semibold">
                        {ar ? 'التاريخ' : 'Date'}
                        <input type="date" value={date} max={localDate()} aria-invalid={date === ''} onChange={(event) => setDate(event.target.value)} className={`${field} mt-1 ${date === '' ? '!border-red-400' : ''}`} />
                    </label>
                    <label className="text-[10px] font-semibold xl:col-span-2">
                        {ar ? 'ملاحظة للجميع (اختياري)' : 'Note for all (optional)'}
                        <input value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} className={`${field} mt-1`} />
                    </label>
                    <label className="text-[10px] font-semibold">
                        {ar ? 'القسم' : 'Department'}
                        <select value={department} onChange={(event) => setDepartment(event.target.value)} className={`${field} mt-1`}>
                            <option value="">{ar ? 'كل الأقسام' : 'All departments'}</option>
                            {roster?.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                    </label>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="min-w-[220px] flex-1 text-[10px] font-semibold">
                        {ar ? 'بحث' : 'Search'}
                        <span className="relative mt-1 block">
                            <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]" />
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'اسم أو وظيفة…' : 'Name or role…'} className={`${field} ps-8`} />
                        </span>
                    </label>
                    <label className="flex min-h-10 items-center gap-2 text-[11px] font-semibold">
                        <input type="checkbox" checked={onlyDue} onChange={(event) => setOnlyDue(event.target.checked)} />
                        {ar ? 'من له مستحق فقط' : 'Only with a balance due'}
                    </label>
                    <label className="w-32 text-[10px] font-semibold">
                        {ar ? 'مبلغ موحد' : 'Same amount'}
                        <input type="number" min="0" step="0.01" value={sameAmount} onChange={(event) => setSameAmount(event.target.value)} className={`${field} mt-1`} />
                    </label>
                    <button type="button" className={button} onClick={fillSame} disabled={!(Number(sameAmount) > 0) || !roster?.data.length}>
                        {ar ? 'تطبيق على الصفحة' : 'Apply to page'}
                    </button>
                    <button type="button" className={button} onClick={fillRemaining} disabled={!roster?.data.length}>
                        {ar ? 'تعبئة المتبقي لكل موظف' : 'Fill each balance due'}
                    </button>
                    <button type="button" className={button} onClick={() => setAmounts({})} disabled={!Object.keys(amounts).length}>
                        {ar ? 'مسح المبالغ' : 'Clear amounts'}
                    </button>
                </div>

                {filled.length > 0 && (
                    <p className="mt-3 text-[11px] text-[var(--ac-text-muted)]">
                        {ar ? `${filled.length} موظف · الإجمالي: ` : `${filled.length} employees · total: `}
                        <strong className="text-[var(--ac-text)]">
                            {totals.map(([currency, total]) => `${format(total)} ${currency}`).join(' + ')}
                        </strong>
                    </p>
                )}
                {error && <p className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                {success && <p className="mt-3 rounded-[12px] bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p>}
            </div>

            {loading ? (
                <div className="p-10 text-center text-xs text-[var(--ac-text-muted)]"><Loader2 className="mx-auto animate-spin" size={18} /></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-start text-xs">
                        <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                            <tr>
                                <th className="px-4 py-3 text-start">{ar ? 'الموظف' : 'Employee'}</th>
                                <th className="px-4 py-3 text-start">{ar ? 'المتبقي له' : 'Balance due'}</th>
                                <th className="px-4 py-3 text-start">{ar ? 'المبلغ' : 'Amount'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--ac-line)]">
                            {roster?.data.map((row) => {
                                const due = Number(row.balance);
                                return (
                                    <tr key={row.id} className={Number(amounts[row.id]) > 0 ? 'bg-[var(--ac-accent-soft)]/40' : 'hover:bg-[var(--ac-surface-soft)]'}>
                                        <td className="px-4 py-3">
                                            <strong className="block">{row.name}</strong>
                                            <span className="mt-0.5 block text-[9px] text-[var(--ac-text-muted)]">
                                                {row.job_title ?? '—'}
                                                {!row.active && <span className="ms-2 rounded-full bg-[var(--ac-surface-soft)] px-1.5 py-0.5">{ar ? 'متوقف' : 'Stopped'}</span>}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                type="button"
                                                disabled={due <= 0}
                                                title={ar ? 'استخدم المتبقي كمبلغ' : 'Use the balance as the amount'}
                                                onClick={() => setAmount(row.id, String(due))}
                                                className={`tabular-nums font-semibold ${due > 0 ? 'text-emerald-700 underline decoration-dotted' : due < 0 ? 'text-red-700' : 'text-[var(--ac-text-muted)]'}`}
                                            >
                                                {format(due)} {row.currency}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                inputMode="decimal"
                                                value={amounts[row.id] ?? ''}
                                                onChange={(event) => setAmount(row.id, event.target.value)}
                                                aria-label={`${row.name} ${ar ? 'المبلغ' : 'amount'}`}
                                                className={`${field} max-w-[180px]`}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                            {!roster?.data.length && <tr><td colSpan={3} className="p-10 text-center text-xs text-[var(--ac-text-muted)]">{ar ? 'لا يوجد موظفون مطابقون.' : 'No matching employees.'}</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {roster && roster.pagination.total > 0 && (
                <div className="flex flex-col gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] text-[var(--ac-text-muted)]">
                        {roster.pagination.from ?? 0}–{roster.pagination.to ?? 0} / {roster.pagination.total}
                        {' · '}{ar ? 'صفحة' : 'Page'} {roster.pagination.current_page} / {Math.max(1, roster.pagination.last_page)}
                    </span>
                    <div className="flex gap-2">
                        <button type="button" className={button} disabled={page <= 1 || loading || saving} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                            {ar ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}{ar ? 'السابق' : 'Previous'}
                        </button>
                        <button type="button" className={button} disabled={page >= roster.pagination.last_page || loading || saving} onClick={() => setPage((value) => Math.min(roster.pagination.last_page, value + 1))}>
                            {ar ? 'التالي' : 'Next'}{ar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
