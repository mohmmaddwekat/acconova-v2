import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    ArrowDownRight,
    ArrowUpRight,
    CircleDollarSign,
    History,
    LoaderCircle,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react';

type Employee = {
    id: number;
    name: string;
    job_title: string | null;
    basis: 'hour' | 'day' | 'month' | 'piece';
    rate: string;
    currency: string;
};

type SalaryChange = {
    id: number;
    effective_on: string;
    old_rate: string;
    new_rate: string;
};

type StaffResponse = {
    data: { data: Employee[] };
    can_manage: boolean;
};

type SalaryHistoryResponse = {
    history: SalaryChange[];
};

function failureText(error: unknown, ar: boolean): string {
    if (error instanceof ApiError) {
        return Object.values(error.errors).flat()[0] ?? error.message;
    }

    return ar
        ? 'تعذر تعديل الراتب. حاول مرة أخرى.'
        : 'Could not update the salary. Try again.';
}

/**
 * Explicit salary-change workflow with an audit trail. It is shared by the
 * staff directory and payroll screens so managers do not need to overwrite a
 * profile silently when somebody receives a raise.
 */
export function StaffSalaryAdjuster() {
    const ar = useLocale() === 'ar';
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [canManage, setCanManage] = useState(false);
    const [open, setOpen] = useState(false);
    const [selectedId, setSelectedId] = useState('');
    const [newRate, setNewRate] = useState('');
    const [notes, setNotes] = useState('');
    const [history, setHistory] = useState<SalaryChange[]>([]);
    const [historyBusy, setHistoryBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const selected = useMemo(
        () => employees.find(item => String(item.id) === selectedId) ?? null,
        [employees, selectedId],
    );

    useEffect(() => {
        const controller = new AbortController();

        apiRequest<StaffResponse>('/api/staff?per_page=100', {
            signal: controller.signal,
        })
            .then(response => {
                setEmployees(response.data.data);
                setCanManage(response.can_manage);
            })
            .catch(() => undefined);

        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (! selected) {
            setNewRate('');
            setHistory([]);
            return;
        }

        setNewRate(selected.rate);
        setError('');
        setHistoryBusy(true);
        const controller = new AbortController();

        apiRequest<SalaryHistoryResponse>(
            `/api/staff/${selected.id}/salary-changes`,
            { signal: controller.signal },
        )
            .then(response => setHistory(response.history))
            .catch(() => setHistory([]))
            .finally(() => setHistoryBusy(false));

        return () => controller.abort();
    }, [selected?.id]);

    if (! canManage) {
        return null;
    }

    const currentRate = Number(selected?.rate ?? 0);
    const requestedRate = Number(newRate || 0);
    const difference = requestedRate - currentRate;

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (! selected || busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{
                data: { rate: string };
            }>(`/api/staff/${selected.id}/salary-changes`, {
                method: 'POST',
                body: JSON.stringify({
                    rate: newRate,
                    notes: notes.trim() || null,
                }),
            });

            setEmployees(items => items.map(item =>
                item.id === selected.id
                    ? { ...item, rate: response.data.rate }
                    : item,
            ));
            setNotes('');
            setOpen(false);

            // Payroll summary is API-driven, so reload it immediately after
            // the successful salary change instead of showing stale totals.
            window.setTimeout(() => window.location.reload(), 200);
        } catch (failure) {
            setError(failureText(failure, ar));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto mt-4 max-w-6xl px-4 sm:px-8"
            >
                <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)] sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <CircleDollarSign size={19} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-[var(--ac-text)]">
                                {ar ? 'تعديل أو زيادة راتب موظف' : 'Adjust an employee salary'}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'الراتب القديم يبقى محفوظًا، والجديد يطبق من اليوم.'
                                    : 'The previous salary stays in history; the new rate applies from today.'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)]"
                    >
                        <CircleDollarSign size={16} />
                        {ar ? 'زيادة / تعديل الراتب' : 'Change salary'}
                    </button>
                </div>
            </div>

            {open && (
                <div
                    dir={ar ? 'rtl' : 'ltr'}
                    className="fixed inset-0 z-[190] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
                >
                    <form
                        data-ac-unsaved-guard="off"
                        onSubmit={submit}
                        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-2xl sm:rounded-[26px] sm:p-6"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-[var(--ac-text)]">
                                    {ar ? 'زيادة / تعديل الراتب' : 'Salary adjustment'}
                                </h2>
                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'التعديل لا يغير حركات الرواتب القديمة.'
                                        : 'Existing payroll entries will not be changed.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    setError('');
                                }}
                                className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--ac-surface-soft)] text-[var(--ac-text)]"
                            >
                                <X size={17} />
                            </button>
                        </div>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="text-xs font-semibold text-[var(--ac-text)] sm:col-span-2">
                                {ar ? 'الموظف' : 'Employee'}
                                <select
                                    required
                                    value={selectedId}
                                    onChange={event => setSelectedId(event.target.value)}
                                    className="mt-2 min-h-11 w-full rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                >
                                    <option value="">
                                        {ar ? 'اختر موظفًا...' : 'Choose an employee...'}
                                    </option>
                                    {employees.map(employee => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name}{employee.job_title ? ` · ${employee.job_title}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {selected && (
                                <>
                                    <div className="rounded-[15px] bg-[var(--ac-surface-soft)] p-4">
                                        <p className="text-[10px] text-[var(--ac-text-muted)]">
                                            {ar
                                                ? selected.basis === 'month' ? 'الراتب الحالي' : 'الأجر الحالي'
                                                : selected.basis === 'month' ? 'Current salary' : 'Current rate'}
                                        </p>
                                        <p className="mt-1 text-lg font-bold text-[var(--ac-text)]">
                                            {selected.rate} {selected.currency}
                                        </p>
                                    </div>

                                    <label className="text-xs font-semibold text-[var(--ac-text)]">
                                        {ar ? 'الراتب / الأجر الجديد' : 'New salary / rate'}
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            max="999999"
                                            step="0.0001"
                                            value={newRate}
                                            onChange={event => setNewRate(event.target.value)}
                                            className="mt-2 min-h-11 w-full rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                        />
                                    </label>

                                    {Number.isFinite(difference) && difference !== 0 && (
                                        <div className="flex items-center gap-2 rounded-[13px] border border-[var(--ac-line)] px-3 py-2 text-xs sm:col-span-2">
                                            {difference > 0
                                                ? <ArrowUpRight size={16} className="text-emerald-500" />
                                                : <ArrowDownRight size={16} className="text-amber-500" />}
                                            <span className="text-[var(--ac-text-soft)]">
                                                {difference > 0
                                                    ? (ar ? 'زيادة' : 'Increase')
                                                    : (ar ? 'تخفيض' : 'Decrease')}
                                                {' '}
                                                <strong>
                                                    {Math.abs(difference).toLocaleString(undefined, {
                                                        maximumFractionDigits: 4,
                                                    })} {selected.currency}
                                                </strong>
                                            </span>
                                        </div>
                                    )}

                                    <label className="text-xs font-semibold text-[var(--ac-text)] sm:col-span-2">
                                        {ar ? 'سبب التعديل (اختياري)' : 'Reason (optional)'}
                                        <textarea
                                            rows={3}
                                            maxLength={1000}
                                            value={notes}
                                            onChange={event => setNotes(event.target.value)}
                                            className="mt-2 w-full resize-none rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2.5 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                        />
                                    </label>

                                    <div className="sm:col-span-2">
                                        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ac-text)]">
                                            <History size={15} />
                                            {ar ? 'سجل تغييرات الراتب' : 'Salary history'}
                                        </div>
                                        <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                                            {historyBusy && (
                                                <p className="flex items-center gap-2 rounded-[12px] bg-[var(--ac-surface-soft)] p-3 text-xs text-[var(--ac-text-muted)]">
                                                    <LoaderCircle size={14} className="animate-spin" />
                                                    {ar ? 'جاري تحميل السجل...' : 'Loading history...'}
                                                </p>
                                            )}
                                            {! historyBusy && history.slice(0, 6).map(change => (
                                                <div
                                                    key={change.id}
                                                    className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2 text-xs"
                                                >
                                                    <span>{change.old_rate} → <strong>{change.new_rate}</strong> {selected.currency}</span>
                                                    <span className="text-[var(--ac-text-muted)]">{change.effective_on}</span>
                                                </div>
                                            ))}
                                            {! historyBusy && history.length === 0 && (
                                                <p className="rounded-[12px] border border-dashed border-[var(--ac-line)] p-3 text-center text-xs text-[var(--ac-text-muted)]">
                                                    {ar ? 'لا توجد تعديلات سابقة.' : 'No previous salary changes.'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {error !== '' && (
                            <p className="mt-4 rounded-[12px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                                {error}
                            </p>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-[var(--ac-line)] px-4 text-xs font-semibold text-[var(--ac-text)] hover:bg-[var(--ac-surface-soft)]"
                            >
                                {ar ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                type="submit"
                                disabled={busy || ! selected || newRate === '' || difference === 0}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy && <LoaderCircle size={15} className="animate-spin" />}
                                {ar ? 'حفظ الراتب الجديد' : 'Save new salary'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
