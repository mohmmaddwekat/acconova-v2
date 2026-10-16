import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Search,
    UsersRound,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Basis = 'hour' | 'day' | 'month' | 'piece';
type Status = 'present' | 'absent';

type Attendance = {
    status: Status;
    quantity: string;
    overtime_hours: string;
    overtime_rate: string;
    notes: string | null;
    deduction_override: string | null;
    day_amount_override: string | null;
};

type Row = {
    id: number;
    name: string;
    job_title: string | null;
    department_id: number | null;
    basis: Basis;
    unit: string | null;
    rate: string;
    currency: string;
    attendance: Attendance | null;
    auto_day_amount: string | null;
};

type RosterResponse = {
    date: string;
    data: Row[];
    pagination: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
        from: number | null;
        to: number | null;
    };
    departments: { id: number; name: string }[];
};

type SaveResponse = {
    days: number;
    processed: number;
    requested: number;
    skipped: { id: number; name: string; reason: string }[];
    next_cursor: number | null;
    has_more: boolean;
    chunk_size: number;
};

type Override = {
    status: Status;
    quantity: string;
    overtime_hours: string;
    overtime_rate: string;
    notes: string;
    deduction_override: string;
    day_amount_override: string;
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

function monthDays(date: string): { iso: string; day: number; friday: boolean }[] {
    const [year, month] = date.split('-').map(Number);
    const total = new Date(year, month, 0).getDate();

    return Array.from({ length: total }, (_, index) => {
        const day = index + 1;
        return {
            iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            day,
            friday: new Date(year, month - 1, day).getDay() === 5,
        };
    });
}

function errorText(error: unknown): string {
    if (error instanceof ApiError) {
        return [error.message, ...Object.values(error.errors).flat()]
            .filter(Boolean)
            .join(' ');
    }

    return error instanceof Error ? error.message : 'Failed';
}

export function StaffBulkAttendance() {
    const ar = useLocale() === 'ar';
    const [date, setDate] = useState(localDate());
    const [multiDay, setMultiDay] = useState(false);
    const [days, setDays] = useState<Map<string, Status>>(new Map());
    const [brush, setBrush] = useState<Status>('present');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [department, setDepartment] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState<20 | 50 | 100>(50);
    const [roster, setRoster] = useState<RosterResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [revision, setRevision] = useState(0);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [overrides, setOverrides] = useState<Record<number, Partial<Override>>>({});
    const [status, setStatus] = useState<Status>('present');
    const [quantity, setQuantity] = useState('8');
    const [overtimeHours, setOvertimeHours] = useState('0');
    const [overtimeRate, setOvertimeRate] = useState('0');
    const [notes, setNotes] = useState('');
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        setDays(new Map());
    }, [date.slice(0, 7)]);

    useEffect(() => {
        setPage(1);
        setSelected(new Set());
        setOverrides({});
    }, [date, debouncedSearch, department, perPage]);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({
            date,
            page: String(page),
            per_page: String(perPage),
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (department) params.set('department_id', department);

        setLoading(true);
        setError('');

        apiRequest<RosterResponse>(`/api/staff-attendance/bulk?${params.toString()}`, {
            signal: controller.signal,
        })
            .then((response) => {
                setRoster(response);
                if (page > response.pagination.last_page) {
                    setPage(Math.max(1, response.pagination.last_page));
                }
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) setError(errorText(failure));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [date, page, perPage, debouncedSearch, department, revision]);

    const pageIds = useMemo(
        () => roster?.data.map((row) => row.id) ?? [],
        [roster?.data],
    );
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

    function valuesFor(row: Row): Override {
        const custom = overrides[row.id] ?? {};
        return {
            status: custom.status ?? status,
            quantity: custom.quantity ?? quantity,
            overtime_hours: custom.overtime_hours ?? '0',
            overtime_rate: custom.overtime_rate ?? '0',
            notes: custom.notes ?? notes,
            deduction_override: custom.deduction_override ?? '',
            day_amount_override: custom.day_amount_override ?? row.attendance?.day_amount_override ?? '',
        };
    }

    /** What the day earns when no amount is typed, so the box can show it as a hint. */
    function autoAmountHint(row: Row, values: Override): string {
        if (row.basis === 'hour') {
            const total = Number(values.quantity) * Number(row.rate);

            return Number.isFinite(total) && total > 0 ? total.toFixed(2) : '';
        }

        return row.auto_day_amount ?? '';
    }

    function fillOvertimeForSelected(): void {
        if (!selected.size) return;
        setOverrides((current) => {
            const next = { ...current };
            selected.forEach((id) => {
                next[id] = {
                    ...(next[id] ?? {}),
                    overtime_hours: overtimeHours,
                    overtime_rate: overtimeRate,
                };
            });
            return next;
        });
    }

    function setRow(rowId: number, patch: Partial<Override>): void {
        setOverrides((current) => ({
            ...current,
            [rowId]: {
                ...(current[rowId] ?? {}),
                ...patch,
            },
        }));
    }

    function togglePage(): void {
        setSelected((current) => {
            const next = new Set(current);
            if (allPageSelected) pageIds.forEach((id) => next.delete(id));
            else pageIds.forEach((id) => next.add(id));
            return next;
        });
    }

    function defaultsPayload() {
        return {
            occurred_on: date,
            dates: multiDay && days.size ? Array.from(days.keys()).sort() : null,
            absent_dates: multiDay && days.size
                ? Array.from(days.entries()).filter(([, value]) => value === 'absent').map(([key]) => key).sort()
                : null,
            status,
            quantity,
            overtime_hours: '0',
            overtime_rate: '0',
            notes: notes || null,
            search: debouncedSearch || null,
            department_id: department ? Number(department) : null,
        };
    }

    const today = localDate();
    const calendar = useMemo(() => monthDays(date), [date]);
    const selectableDays = calendar.filter((item) => item.iso <= today);
    const multiDayBlocked = multiDay && days.size === 0;

    function toggleDay(iso: string): void {
        setDays((current) => {
            const next = new Map(current);
            if (next.get(iso) === brush) next.delete(iso);
            else next.set(iso, brush);
            return next;
        });
    }

    function paintDays(list: { iso: string }[]): void {
        setDays((current) => {
            const next = new Map(current);
            list.forEach((item) => next.set(item.iso, brush));
            return next;
        });
    }

    const presentDaysCount = Array.from(days.values()).filter((value) => value === 'present').length;
    const absentDaysCount = days.size - presentDaysCount;

    function daysSuffix(response: { days?: number }): string {
        const count = response.days ?? 1;
        if (count <= 1) return '';
        return ar ? ` · ${count} أيام` : ` · ${count} days`;
    }

    async function saveSelected(): Promise<void> {
        if (!selected.size || saving || multiDayBlocked) return;
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const selectedRows = (roster?.data ?? []).filter((row) => selected.has(row.id));
            const response = await apiRequest<SaveResponse>('/api/staff-attendance/bulk', {
                method: 'POST',
                body: JSON.stringify({
                    scope: 'selected',
                    ...defaultsPayload(),
                    staff_ids: Array.from(selected),
                    overrides: selectedRows.map((row) => ({
                        staff_id: row.id,
                        ...valuesFor(row),
                    })),
                }),
            });

            setSuccess(
                ar
                    ? `تم تسجيل ${response.processed} سجل${daysSuffix(response)}${response.skipped.length ? ` · تم تخطي ${response.skipped.length}` : ''}.`
                    : `Saved ${response.processed} records${daysSuffix(response)}${response.skipped.length ? ` · ${response.skipped.length} skipped` : ''}.`,
            );
            setSelected(new Set());
            setOverrides({});
            setRevision((value) => value + 1);
        } catch (failure) {
            setError(errorText(failure));
        } finally {
            setSaving(false);
        }
    }

    async function saveAllMatching(): Promise<void> {
        if (saving || !roster?.pagination.total || multiDayBlocked) return;

        const total = roster.pagination.total;
        const confirmed = window.confirm(
            ar
                ? `سيتم تسجيل الحضور لكل ${total} موظف مطابق للفلاتر الحالية. متابعة؟`
                : `Attendance will be saved for all ${total} matching employees. Continue?`,
        );
        if (!confirmed) return;

        setSaving(true);
        setError('');
        setSuccess('');
        setProgress({ done: 0, total });

        let cursor = 0;
        let done = 0;
        let skipped = 0;
        let handled = 0;
        let dayCount = 1;

        try {
            while (true) {
                const response = await apiRequest<SaveResponse>('/api/staff-attendance/bulk', {
                    method: 'POST',
                    body: JSON.stringify({
                        scope: 'all',
                        ...defaultsPayload(),
                        cursor,
                    }),
                });

                done += response.processed;
                skipped += response.skipped.length;
                handled += response.requested;
                dayCount = response.days ?? 1;
                setProgress({ done: Math.min(total, handled), total });

                if (!response.has_more || response.next_cursor === null) break;
                cursor = response.next_cursor;
            }

            setSuccess(
                ar
                    ? `تم تسجيل ${done} سجل${daysSuffix({ days: dayCount })}${skipped ? ` · تم تخطي ${skipped}` : ''}.`
                    : `Saved ${done} records${daysSuffix({ days: dayCount })}${skipped ? ` · ${skipped} skipped` : ''}.`,
            );
            setSelected(new Set());
            setOverrides({});
            setRevision((value) => value + 1);
        } catch (failure) {
            setError(errorText(failure));
        } finally {
            setSaving(false);
            setProgress(null);
        }
    }

    return (
        <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
            <div className="border-b border-[var(--ac-line)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <UsersRound size={18} />
                        </span>
                        <div>
                            <h2 className="text-sm font-semibold">{ar ? 'تسجيل حضور جماعي' : 'Bulk attendance'}</h2>
                            <p className="mt-1 text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'حدد الموظفين أو طبّق على كل النتائج. الحفظ يتم بدفعات 100 موظف ويحدّث السجل الموجود لنفس التاريخ.'
                                    : 'Select employees or apply to all results. Saves run in 100-person chunks and update existing attendance for the same date.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={button} onClick={togglePage} disabled={loading || !pageIds.length}>
                            {allPageSelected ? <X size={14} /> : <Check size={14} />}
                            {allPageSelected
                                ? ar ? 'إلغاء تحديد الصفحة' : 'Unselect page'
                                : ar ? 'تحديد الصفحة' : 'Select page'}
                        </button>
                        <button type="button" className={primary} onClick={() => void saveSelected()} disabled={saving || !selected.size || multiDayBlocked}>
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {ar ? `تسجيل المحددين (${selected.size})` : `Save selected (${selected.size})`}
                        </button>
                        <button type="button" className={button} onClick={() => void saveAllMatching()} disabled={saving || !roster?.pagination.total || multiDayBlocked}>
                            <UsersRound size={14} />
                            {ar ? `تطبيق على كل النتائج (${roster?.pagination.total ?? 0})` : `Apply to all (${roster?.pagination.total ?? 0})`}
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
                    <label className="text-[10px] font-semibold">
                        {ar ? 'التاريخ' : 'Date'}
                        <input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} className={`${field} mt-1`} />
                    </label>
                    <label className="text-[10px] font-semibold xl:col-span-2">
                        {ar ? 'بحث' : 'Search'}
                        <span className="relative mt-1 block">
                            <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]" />
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'اسم أو وظيفة…' : 'Name or role…'} className={`${field} ps-8`} />
                        </span>
                    </label>
                    <label className="text-[10px] font-semibold">
                        {ar ? 'القسم' : 'Department'}
                        <select value={department} onChange={(event) => setDepartment(event.target.value)} className={`${field} mt-1`}>
                            <option value="">{ar ? 'كل الأقسام' : 'All departments'}</option>
                            {roster?.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                    </label>
                    <label className="text-[10px] font-semibold">
                        {ar ? 'الحالة الافتراضية' : 'Default status'}
                        <select value={status} onChange={(event) => setStatus(event.target.value as Status)} className={`${field} mt-1`}>
                            <option value="present">{ar ? 'حاضر' : 'Present'}</option>
                            <option value="absent">{ar ? 'غائب' : 'Absent'}</option>
                        </select>
                    </label>
                    <label className="text-[10px] font-semibold">
                        {ar ? 'ساعات / كمية' : 'Hours / quantity'}
                        <input type="number" min="0.0001" max="9999" step="0.0001" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={status === 'absent'} className={`${field} mt-1`} />
                    </label>
                    <label className="text-[10px] font-semibold">
                        {ar ? 'عدد الصفوف' : 'Rows'}
                        <select value={perPage} onChange={(event) => setPerPage(Number(event.target.value) as 20 | 50 | 100)} className={`${field} mt-1`}>
                            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                        </select>
                    </label>
                </div>

                <div className="mt-3 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                        <input type="checkbox" checked={multiDay} onChange={(event) => setMultiDay(event.target.checked)} />
                        {ar ? 'تسجيل عدة أيام من نفس الشهر دفعة واحدة' : 'Record several days of this month at once'}
                    </label>

                    {multiDay && (
                        <div className="mt-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-semibold">
                                    {ar ? 'عند الضغط على يوم، سجّله:' : 'Clicking a day marks it as:'}
                                </span>
                                <div className="inline-flex overflow-hidden rounded-[12px] border border-[var(--ac-line)]">
                                    <button
                                        type="button"
                                        aria-pressed={brush === 'present'}
                                        onClick={() => setBrush('present')}
                                        className={`min-h-10 px-4 text-xs font-semibold transition ${brush === 'present' ? 'bg-emerald-600 text-white' : 'bg-[var(--ac-surface)] hover:bg-[var(--ac-surface-soft)]'}`}
                                    >
                                        {ar ? 'حاضر' : 'Present'}
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={brush === 'absent'}
                                        onClick={() => setBrush('absent')}
                                        className={`min-h-10 px-4 text-xs font-semibold transition ${brush === 'absent' ? 'bg-red-600 text-white' : 'bg-[var(--ac-surface)] hover:bg-[var(--ac-surface-soft)]'}`}
                                    >
                                        {ar ? 'غائب' : 'Absent'}
                                    </button>
                                </div>
                                <button type="button" className={button} onClick={() => paintDays(selectableDays.filter((item) => !item.friday))}>
                                    {ar ? 'كل أيام الشهر (بدون الجمعة)' : 'All days (no Fridays)'}
                                </button>
                                <button type="button" className={button} onClick={() => paintDays(selectableDays)}>
                                    {ar ? 'كل الأيام' : 'Every day'}
                                </button>
                                <button type="button" className={button} onClick={() => setDays(new Map())} disabled={!days.size}>
                                    {ar ? 'مسح' : 'Clear'}
                                </button>
                            </div>
                            <p className="mt-2 text-[10px] text-[var(--ac-text-muted)]">
                                {ar
                                    ? `حاضر ${presentDaysCount} يوم · غائب ${absentDaysCount} يوم · الشهر حسب حقل التاريخ. الضغط على يوم بنفس اللون يلغيه.`
                                    : `Present ${presentDaysCount} · Absent ${absentDaysCount} · month follows the date field. Click a day again with the same color to clear it.`}
                            </p>

                            <div className="mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-10 lg:grid-cols-[repeat(16,minmax(0,1fr))]">
                                {calendar.map((item) => {
                                    const future = item.iso > today;
                                    const dayStatus = days.get(item.iso);
                                    const active = dayStatus !== undefined;
                                    return (
                                        <button
                                            key={item.iso}
                                            type="button"
                                            disabled={future}
                                            aria-pressed={active}
                                            onClick={() => toggleDay(item.iso)}
                                            className={[
                                                'h-9 rounded-[10px] border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                                                dayStatus === 'present'
                                                    ? 'border-transparent bg-emerald-600 text-white'
                                                    : dayStatus === 'absent'
                                                        ? 'border-transparent bg-red-600 text-white'
                                                        : 'border-[var(--ac-line)] bg-[var(--ac-surface)] hover:bg-[var(--ac-accent-soft)]',
                                                item.friday && !active ? 'text-[var(--ac-text-muted)]' : '',
                                            ].join(' ')}
                                        >
                                            {item.day}
                                        </button>
                                    );
                                })}
                            </div>

                            {multiDayBlocked && (
                                <p className="mt-2 text-[10px] text-amber-700">
                                    {ar ? 'اختر يومًا واحدًا على الأقل.' : 'Pick at least one day.'}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div>
                        <p className="text-[10px] font-semibold">{ar ? 'تعبئة سريعة للإضافي' : 'Quick overtime fill'}</p>
                        <p className="mb-1 text-[9px] text-[var(--ac-text-muted)]">
                            {ar ? 'اكتب القيم ثم اضغط "تطبيق على المحددين" — لا تُطبَّق تلقائياً.' : 'Enter values then press "Apply to selected" — not applied automatically.'}
                        </p>
                        <div className="flex gap-1">
                            <input aria-label={ar ? 'ساعات إضافية للتعبئة' : 'Overtime hours to fill'} type="number" min="0" max="24" step="0.0001" value={overtimeHours} onChange={(event) => setOvertimeHours(event.target.value)} placeholder={ar ? 'ساعات' : 'Hours'} className={`${field} w-20`} />
                            <input aria-label={ar ? 'أجر الإضافي للتعبئة' : 'Overtime rate to fill'} type="number" min="0" max="999999" step="0.0001" value={overtimeRate} onChange={(event) => setOvertimeRate(event.target.value)} placeholder={ar ? 'الأجر' : 'Rate'} className={`${field}`} />
                        </div>
                        <button
                            type="button"
                            className={`${button} mt-1 w-full`}
                            disabled={!selected.size || status === 'absent' || multiDay}
                            onClick={fillOvertimeForSelected}
                        >
                            {ar ? `تطبيق على المحددين (${selected.size})` : `Apply to selected (${selected.size})`}
                        </button>
                        {multiDay && (
                            <p className="mt-1 text-[9px] text-amber-700">
                                {ar ? 'الوقت الإضافي غير متاح في وضع الأيام المتعددة — سجّل اليوم منفرداً.' : 'Overtime is unavailable in multi-day mode — use single-day mode.'}
                            </p>
                        )}
                    </div>
                    <label className="text-[10px] font-semibold sm:col-span-2">
                        {ar ? 'ملاحظة للجميع' : 'Note for all'}
                        <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className={`${field} mt-1`} />
                    </label>
                </div>

                {progress && (
                    <div className="mt-4 rounded-[12px] bg-[var(--ac-surface-soft)] p-3">
                        <div className="flex items-center justify-between text-[10px] font-semibold">
                            <span>{ar ? 'جاري تسجيل الحضور…' : 'Saving attendance…'}</span>
                            <span>{progress.done} / {progress.total}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ac-line)]">
                            <div className="h-full rounded-full bg-[var(--ac-accent-solid)] transition-all" style={{ width: `${Math.min(100, progress.total ? (progress.done / progress.total) * 100 : 0)}%` }} />
                        </div>
                    </div>
                )}
                {error && <p className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                {success && <p className="mt-3 rounded-[12px] bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p>}
            </div>

            {loading ? (
                <div className="p-10 text-center text-xs text-[var(--ac-text-muted)]"><Loader2 className="mx-auto animate-spin" size={18} /></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1240px] text-start text-xs">
                        <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                            <tr>
                                <th className="w-12 px-4 py-3"><input type="checkbox" checked={allPageSelected} onChange={togglePage} /></th>
                                <th className="px-4 py-3 text-start">{ar ? 'الموظف' : 'Employee'}</th>
                                <th className="px-4 py-3 text-start">{ar ? 'أساس الأجر' : 'Pay basis'}</th>
                                <th className="px-4 py-3 text-start">{ar ? 'المسجل حاليًا' : 'Current'}</th>
                                <th className="px-4 py-3 text-start">{ar ? 'الحالة الجديدة' : 'New status'}</th>
                                <th className="px-4 py-3 text-start">{ar ? 'ساعات / كمية' : 'Hours / qty'}</th>
                                <th className="px-4 py-3 text-start">
                                    {ar ? 'مبلغ اليوم' : 'Day amount'}
                                    <span className="mt-0.5 block text-[9px] font-normal">{ar ? 'اتركه فارغاً = تلقائي من الراتب' : 'Leave empty = automatic from salary'}</span>
                                </th>
                                <th className="px-4 py-3 text-start">
                                    {ar ? 'وقت إضافي' : 'Overtime'}
                                    <span className="mt-0.5 block text-[9px] font-normal">{ar ? 'عدد الساعات × أجر الساعة الإضافية' : 'Hours × overtime hourly rate'}</span>
                                </th>
                                <th className="px-4 py-3 text-start">
                                    {ar ? 'خصم الغياب' : 'Absence deduction'}
                                    <span className="mt-0.5 block text-[9px] font-normal">{ar ? 'للشهري عند الغياب فقط' : 'Monthly staff, when absent'}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--ac-line)]">
                            {roster?.data.map((row) => {
                                const values = valuesFor(row);
                                const checked = selected.has(row.id);
                                const quantityAutomatic = row.basis === 'day' || row.basis === 'month';
                                return (
                                    <tr key={row.id} className={checked ? 'bg-[var(--ac-accent-soft)]/40' : 'hover:bg-[var(--ac-surface-soft)]'}>
                                        <td className="px-4 py-3"><input type="checkbox" checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })} /></td>
                                        <td className="px-4 py-3">
                                            <strong className="block">{row.name}</strong>
                                            <span className="mt-0.5 block text-[9px] text-[var(--ac-text-muted)]">{row.job_title ?? '—'}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="rounded-full bg-[var(--ac-surface-soft)] px-2 py-1 text-[9px]">
                                                {row.basis === 'hour' ? (ar ? 'ساعة' : 'Hour') : row.basis === 'day' ? (ar ? 'يوم' : 'Day') : row.basis === 'month' ? (ar ? 'شهر' : 'Month') : (ar ? 'قطعة' : 'Piece')}
                                            </span>
                                            <span className="ms-2 text-[9px] text-[var(--ac-text-muted)]">{row.rate} {row.currency}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {row.attendance ? (
                                                <span className={row.attendance.status === 'present' ? 'text-emerald-700' : 'text-red-700'}>
                                                    {row.attendance.status === 'present' ? (ar ? 'حاضر' : 'Present') : (ar ? 'غائب' : 'Absent')}
                                                    {row.attendance.status === 'present' && row.basis === 'hour' ? ` · ${row.attendance.quantity}` : ''}
                                                </span>
                                            ) : <span className="text-[var(--ac-text-muted)]">{ar ? 'غير مسجل' : 'Not recorded'}</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <select value={values.status} onChange={(event) => setRow(row.id, { status: event.target.value as Status })} className={field}>
                                                <option value="present">{ar ? 'حاضر' : 'Present'}</option>
                                                <option value="absent">{ar ? 'غائب' : 'Absent'}</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3">
                                            {quantityAutomatic ? (
                                                <span className="text-[10px] text-[var(--ac-text-muted)]">{ar ? 'تلقائي = 1' : 'Automatic = 1'}</span>
                                            ) : (
                                                <input type="number" min="0.0001" max="9999" step="0.0001" value={values.quantity} disabled={values.status === 'absent'} onChange={(event) => setRow(row.id, { quantity: event.target.value })} className={field} />
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {values.status === 'absent' ? (
                                                <span className="text-[10px] text-[var(--ac-text-muted)]">—</span>
                                            ) : (
                                                <input
                                                    aria-label={ar ? 'مبلغ اليوم' : 'Day amount'}
                                                    type="number"
                                                    min="0"
                                                    max="999999999"
                                                    step="0.01"
                                                    value={values.day_amount_override}
                                                    placeholder={autoAmountHint(row, values) ? (ar ? 'تلقائي ' : 'Auto ') + autoAmountHint(row, values) : (ar ? 'تلقائي' : 'Auto')}
                                                    onChange={(event) => setRow(row.id, { day_amount_override: event.target.value })}
                                                    className={`${field} w-28`}
                                                />
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {multiDay ? (
                                                <span className="text-[9px] text-[var(--ac-text-muted)]">
                                                    {ar ? 'سجّل اليوم منفرداً' : 'Use single-day mode'}
                                                </span>
                                            ) : (
                                                <div className="flex gap-1">
                                                    <input aria-label={ar ? 'ساعات إضافية' : 'Overtime hours'} type="number" min="0" max="24" step="0.0001" value={values.overtime_hours === '0' ? '' : values.overtime_hours} placeholder={ar ? 'ساعات' : 'Hours'} title={ar ? 'عدد ساعات العمل الإضافي' : 'Overtime hours worked'} disabled={values.status === 'absent'} onChange={(event) => setRow(row.id, { overtime_hours: event.target.value === '' ? '0' : event.target.value })} className={`${field} w-20`} />
                                                    <input aria-label={ar ? 'أجر الإضافي' : 'Overtime rate'} type="number" min="0" max="999999" step="0.0001" value={values.overtime_rate === '0' ? '' : values.overtime_rate} placeholder={ar ? 'أجر الساعة' : 'Per hour'} title={ar ? 'أجر الساعة الإضافية' : 'Pay per overtime hour'} disabled={values.status === 'absent'} onChange={(event) => setRow(row.id, { overtime_rate: event.target.value === '' ? '0' : event.target.value })} className={`${field} w-24`} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {row.basis === 'month' && (multiDay || values.status === 'absent') ? (
                                                <input
                                                    aria-label={ar ? 'خصم الغياب' : 'Absence deduction'}
                                                    type="number"
                                                    min="0"
                                                    max="999999"
                                                    step="0.01"
                                                    value={values.deduction_override}
                                                    placeholder={ar ? 'تلقائي' : 'Auto'}
                                                    onChange={(event) => setRow(row.id, { deduction_override: event.target.value })}
                                                    className={`${field} w-28`}
                                                />
                                            ) : (
                                                <span className="text-[10px] text-[var(--ac-text-muted)]">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!roster?.data.length && <tr><td colSpan={9} className="p-10 text-center text-xs text-[var(--ac-text-muted)]">{ar ? 'لا يوجد موظفون مطابقون.' : 'No matching employees.'}</td></tr>}
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
