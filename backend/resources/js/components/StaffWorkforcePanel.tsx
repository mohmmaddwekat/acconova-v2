import { StaffPayrollTable, type StaffPayrollRow } from '@/components/staff/StaffPayrollTable';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    ChevronLeft,
    ChevronRight,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

type AttendanceRow = {
    id: number;
    occurred_on: string;
    status: 'present' | 'absent';
    quantity: string;
    overtime_hours: string;
    overtime_rate: string;
    notes: string | null;
};

type Rule = {
    id: number;
    label: string;
    kind: 'allowance' | 'bonus' | 'deduction';
    amount: string;
    starts_on: string;
    ends_on: string | null;
};

type AttendancePage = {
    data: AttendanceRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
};

type Data = {
    attendance: AttendancePage;
    summary?: {
        total: number;
        present: number;
        absent: number;
        quantity: string;
        overtime: string;
    };
    payroll?: {
        rows: StaffPayrollRow[];
        currency: string;
        history_months: number;
    };
    adjustments: Rule[];
    can_attendance?: boolean;
    can_pay?: boolean;
};

type Correction =
    | {
          type: 'attendance';
          action: 'edit' | 'delete';
          row: AttendanceRow;
      }
    | {
          type: 'adjustment';
          action: 'edit' | 'delete';
          row: Rule;
      };

type Props = {
    mode: 'attendance' | 'adjustments';
    id: number;
    basis: string;
    unit: string | null;
    currency: string;
    canPay: boolean;
    onChanged: () => void;
};

const field =
    'mt-2 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)]';

const compactField =
    'h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)]';

const button =
    'inline-flex items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3.5 py-2.5 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50';

const primaryButton =
    'inline-flex items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-solid)] px-4 py-2.5 text-sm font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50';

function dateInput(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function today(): string {
    return dateInput(new Date());
}

function previousCompletedMonth(): string {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - 1);

    return dateInput(date).slice(0, 7);
}

export function StaffWorkforcePanel({
    mode,
    id,
    basis,
    unit,
    currency,
    canPay,
    onChanged,
}: Props) {
    const ar = useLocale() === 'ar';
    const [data, setData] = useState<Data | null>(null);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [status, setStatus] = useState<'present' | 'absent'>('present');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [correction, setCorrection] = useState<Correction | null>(null);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [historyStatus, setHistoryStatus] = useState<'' | 'present' | 'absent'>('');
    const [historyMonth, setHistoryMonth] = useState('');
    const [historySort, setHistorySort] = useState<'desc' | 'asc'>('desc');
    const [perPage, setPerPage] = useState<20 | 50 | 100>(20);

    const copy = ar
        ? {
              attendance: 'الحضور والإضافي',
              attendanceHelp: 'سجل يوم العمل أو الغياب. ويمكنك الوصول لأي سجل قديم بسرعة من البحث والفلاتر أدناه.',
              present: 'حاضر',
              absent: 'غائب',
              date: 'التاريخ',
              quantity: basis === 'piece' ? 'عدد الوحدات المنجزة' : basis === 'hour' ? 'ساعات العمل' : 'الكمية',
              overtime: 'ساعات إضافية',
              overtimeRate: 'أجر ساعة الإضافي',
              note: 'ملاحظة',
              saveAttendance: 'تسجيل الحضور',
              history: 'سجل الحضور',
              search: 'بحث بالتاريخ أو الملاحظة…',
              month: 'كل الأشهر',
              statusAll: 'كل الحالات',
              newest: 'الأحدث أولًا',
              oldest: 'الأقدم أولًا',
              rows: 'عدد الصفوف',
              clear: 'مسح الفلاتر',
              showing: 'عرض',
              of: 'من',
              record: 'سجل',
              page: 'صفحة',
              previous: 'السابق',
              next: 'التالي',
              filteredTotal: 'النتائج',
              totalPresent: 'حاضر',
              totalAbsent: 'غائب',
              totalQuantity: basis === 'hour' ? 'إجمالي الساعات' : basis === 'piece' ? 'إجمالي الوحدات' : 'إجمالي الكمية',
              totalOvertime: 'إجمالي الإضافي',
              recurring: 'البدلات والخصومات المستمرة',
              recurringHelp: 'أنشئ بندًا يتكرر شهريًا. يمكن تصحيح البند أو حذفه مع الاحتفاظ بسجل التدقيق.',
              name: 'اسم البند',
              kind: 'النوع',
              allowance: 'بدل',
              bonus: 'حافز / مكافأة',
              deduction: 'خصم',
              amount: 'المبلغ الشهري',
              start: 'يبدأ من',
              end: 'ينتهي في',
              add: 'إضافة بند',
              through: 'اعتماد البنود حتى شهر',
              accrue: 'اعتماد المستحقات',
              ongoing: 'مستمر',
              edit: 'تعديل',
              remove: 'حذف',
              reason: 'سبب التصحيح',
              saveCorrection: 'حفظ التصحيح',
              cancel: 'إلغاء',
              empty: 'لا توجد سجلات مطابقة.',
              loading: 'جاري تحميل السجلات…',
          }
        : {
              attendance: 'Attendance & overtime',
              attendanceHelp: 'Record a workday or absence, then use the filters below to find any historical record quickly.',
              present: 'Present',
              absent: 'Absent',
              date: 'Date',
              quantity: basis === 'piece' ? 'Completed units' : basis === 'hour' ? 'Work hours' : 'Quantity',
              overtime: 'Overtime hours',
              overtimeRate: 'Overtime hourly rate',
              note: 'Note',
              saveAttendance: 'Record attendance',
              history: 'Attendance history',
              search: 'Search date or note…',
              month: 'All months',
              statusAll: 'All statuses',
              newest: 'Newest first',
              oldest: 'Oldest first',
              rows: 'Rows',
              clear: 'Clear filters',
              showing: 'Showing',
              of: 'of',
              record: 'records',
              page: 'Page',
              previous: 'Previous',
              next: 'Next',
              filteredTotal: 'Results',
              totalPresent: 'Present',
              totalAbsent: 'Absent',
              totalQuantity: basis === 'hour' ? 'Total hours' : basis === 'piece' ? 'Total units' : 'Total quantity',
              totalOvertime: 'Total overtime',
              recurring: 'Recurring benefits & deductions',
              recurringHelp: 'Create monthly recurring items. Rules can be corrected or removed while preserving audit history.',
              name: 'Item name',
              kind: 'Type',
              allowance: 'Allowance',
              bonus: 'Bonus',
              deduction: 'Deduction',
              amount: 'Monthly amount',
              start: 'Starts on',
              end: 'Ends on',
              add: 'Add item',
              through: 'Approve through month',
              accrue: 'Approve recurring items',
              ongoing: 'Ongoing',
              edit: 'Edit',
              remove: 'Delete',
              reason: 'Correction reason',
              saveCorrection: 'Save correction',
              cancel: 'Cancel',
              empty: 'No matching records.',
              loading: 'Loading records…',
          };

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
        }, 300);

        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        setPage(1);
    }, [id, mode, debouncedSearch, historyStatus, historyMonth, historySort, perPage]);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({
            page: String(page),
            per_page: String(perPage),
            sort: historySort,
        });

        if (mode === 'attendance') {
            if (debouncedSearch) params.set('q', debouncedSearch);
            if (historyStatus) params.set('status', historyStatus);
            if (historyMonth) params.set('month', historyMonth);
        }

        setLoading(true);
        setError('');

        apiRequest<Data>(`/api/staff/${id}/workforce?${params.toString()}`, {
            signal: controller.signal,
        })
            .then((response) => {
                setData(response);
                const lastPage = Math.max(1, response.attendance.last_page || 1);
                if (page > lastPage) setPage(lastPage);
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) {
                    setError(failure instanceof Error ? failure.message : 'Failed');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [id, mode, page, perPage, historySort, historyStatus, historyMonth, debouncedSearch, revision]);

    async function send(
        path: string,
        values: Record<string, unknown>,
        method = 'POST',
    ): Promise<boolean> {
        if (busy) return false;

        setBusy(true);
        setError('');
        setSaved(false);

        try {
            await apiRequest(`/api/staff/${id}/${path}`, {
                method,
                body: JSON.stringify(values),
            });
            setRevision((current) => current + 1);
            setSaved(true);
            onChanged();
            return true;
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? [failure.message, ...Object.values(failure.errors).flat()].filter(Boolean).join(' ')
                    : failure instanceof Error
                      ? failure.message
                      : 'Failed',
            );
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function submitAttendance(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const success = await send('attendance', {
            ...values,
            status,
            quantity: values.quantity || null,
            overtime_hours: values.overtime_hours || '0',
            overtime_rate: values.overtime_rate || '0',
        });

        if (success) {
            form.reset();
            setStatus('present');
            setPage(1);
        }
    }

    async function submitAdjustment(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const success = await send('adjustments', {
            ...values,
            ends_on: values.ends_on || null,
        });

        if (success) form.reset();
    }

    async function submitCorrection(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (!correction) return;

        const values = Object.fromEntries(new FormData(event.currentTarget));
        let path = '';
        let payload: Record<string, unknown> = { reason: values.reason };

        if (correction.type === 'attendance') {
            path = `attendance/${correction.row.id}`;
            if (correction.action === 'edit') {
                payload = {
                    ...payload,
                    occurred_on: values.occurred_on,
                    status: values.status,
                    quantity: values.quantity || null,
                    overtime_hours: values.overtime_hours || '0',
                    overtime_rate: values.overtime_rate || '0',
                    notes: values.notes || null,
                };
            }
        } else {
            path = `adjustments/${correction.row.id}/correct`;
            if (correction.action === 'edit') {
                payload = {
                    ...payload,
                    label: values.label,
                    amount: values.amount,
                    starts_on: values.starts_on,
                    ends_on: values.ends_on || null,
                };
            }
        }

        const success = await send(
            path,
            payload,
            correction.action === 'delete' ? 'DELETE' : 'PATCH',
        );

        if (success) setCorrection(null);
    }

    const canAttendance = data?.can_attendance ?? canPay;
    const canManagePay = data?.can_pay ?? canPay;
    const summary = data?.summary;
    const attendance = data?.attendance;

    function clearAttendanceFilters(): void {
        setSearch('');
        setDebouncedSearch('');
        setHistoryStatus('');
        setHistoryMonth('');
        setHistorySort('desc');
        setPerPage(20);
        setPage(1);
    }

    if (mode === 'attendance') {
        return (
            <div className="space-y-5">
                {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {saved && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{ar ? 'تم الحفظ.' : 'Saved.'}</p>}

                <section className="rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5">
                    <h3 className="font-semibold">{copy.attendance}</h3>
                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">{copy.attendanceHelp}</p>

                    {canAttendance && (
                        <form onSubmit={(event) => void submitAttendance(event)} className="mt-5">
                            <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <label className="text-xs font-semibold">
                                    {copy.date}
                                    <input required type="date" name="occurred_on" max={today()} defaultValue={today()} className={field} />
                                </label>

                                <label className="text-xs font-semibold">
                                    {copy.attendance}
                                    <select value={status} onChange={(event) => setStatus(event.target.value as 'present' | 'absent')} className={field}>
                                        <option value="present">{copy.present}</option>
                                        <option value="absent">{copy.absent}</option>
                                    </select>
                                </label>

                                {status === 'present' && ['hour', 'piece'].includes(basis) && (
                                    <label className="text-xs font-semibold">
                                        {copy.quantity}{basis === 'piece' && unit ? ` (${unit})` : ''}
                                        <input required type="number" min="0.0001" max={basis === 'hour' ? 24 : 9999} step="0.0001" name="quantity" className={field} />
                                    </label>
                                )}

                                {status === 'present' && (
                                    <>
                                        <label className="text-xs font-semibold">
                                            {copy.overtime}
                                            <input type="number" min="0" max="24" step="0.0001" name="overtime_hours" defaultValue="0" className={field} />
                                        </label>
                                        <label className="text-xs font-semibold">
                                            {copy.overtimeRate} ({currency})
                                            <input type="number" min="0" max="999999" step="0.0001" name="overtime_rate" defaultValue="0" className={field} />
                                        </label>
                                    </>
                                )}

                                <label className="text-xs font-semibold sm:col-span-2">
                                    {copy.note}
                                    <input name="notes" maxLength={2000} className={field} />
                                </label>

                                <div className="flex items-end">
                                    <button className={`${primaryButton} w-full`}>{copy.saveAttendance}</button>
                                </div>
                            </fieldset>
                        </form>
                    )}
                </section>

                <section className="overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                    <div className="border-b border-[var(--ac-line)] p-4 sm:p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h3 className="text-sm font-semibold">{copy.history}</h3>
                                <p className="mt-1 text-[11px] text-[var(--ac-text-muted)]">
                                    {attendance?.total ?? 0} {copy.record}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <SummaryPill label={copy.filteredTotal} value={String(summary?.total ?? attendance?.total ?? 0)} />
                                <SummaryPill label={copy.totalPresent} value={String(summary?.present ?? 0)} tone="success" />
                                <SummaryPill label={copy.totalAbsent} value={String(summary?.absent ?? 0)} tone="danger" />
                                <SummaryPill label={copy.totalOvertime} value={String(summary?.overtime ?? '0')} />
                            </div>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(210px,1.6fr)_minmax(150px,.8fr)_minmax(140px,.7fr)_minmax(150px,.8fr)_110px_auto]">
                            <label className="relative block">
                                <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]" size={14} />
                                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className={`${compactField} ps-9`} />
                            </label>

                            <input type="month" value={historyMonth} onChange={(event) => setHistoryMonth(event.target.value)} aria-label={copy.month} className={compactField} />

                            <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as '' | 'present' | 'absent')} className={compactField}>
                                <option value="">{copy.statusAll}</option>
                                <option value="present">{copy.present}</option>
                                <option value="absent">{copy.absent}</option>
                            </select>

                            <select value={historySort} onChange={(event) => setHistorySort(event.target.value as 'desc' | 'asc')} className={compactField}>
                                <option value="desc">{copy.newest}</option>
                                <option value="asc">{copy.oldest}</option>
                            </select>

                            <select value={perPage} onChange={(event) => setPerPage(Number(event.target.value) as 20 | 50 | 100)} className={compactField} aria-label={copy.rows}>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>

                            <button type="button" className={button} onClick={clearAttendanceFilters}>
                                <RotateCcw size={13} />
                                {copy.clear}
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="p-10 text-center text-xs text-[var(--ac-text-muted)]">{copy.loading}</div>
                    ) : (
                        <div className="divide-y divide-[var(--ac-line)]">
                            {attendance?.data.map((row) => (
                                <article key={row.id} className="grid gap-3 p-4 transition hover:bg-[var(--ac-surface-soft)] md:grid-cols-[150px_1fr_auto] md:items-center">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <strong className="text-sm tabular-nums">{row.occurred_on}</strong>
                                            <span className={[
                                                'rounded-full px-2 py-1 text-[9px] font-semibold',
                                                row.status === 'present' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                                            ].join(' ')}>
                                                {row.status === 'present' ? copy.present : copy.absent}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ac-text-muted)]">
                                            <span>{copy.quantity}: <strong className="text-[var(--ac-text)]">{row.quantity}</strong></span>
                                            <span>{copy.overtime}: <strong className="text-[var(--ac-text)]">{row.overtime_hours}</strong></span>
                                            {Number(row.overtime_hours) > 0 && (
                                                <span>{copy.overtimeRate}: <strong className="text-[var(--ac-text)]">{row.overtime_rate} {currency}</strong></span>
                                            )}
                                        </div>
                                        {row.notes && <p className="mt-1 truncate text-[11px] text-[var(--ac-text-soft)]" title={row.notes}>{row.notes}</p>}
                                    </div>

                                    {canAttendance && (
                                        <div className="flex gap-2">
                                            <button type="button" className={button} onClick={() => setCorrection({ type: 'attendance', action: 'edit', row })}>
                                                <Pencil size={13} />
                                                {copy.edit}
                                            </button>
                                            <button type="button" className="inline-flex items-center gap-2 rounded-[13px] border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50" onClick={() => setCorrection({ type: 'attendance', action: 'delete', row })}>
                                                <Trash2 size={13} />
                                                {copy.remove}
                                            </button>
                                        </div>
                                    )}
                                </article>
                            ))}

                            {!attendance?.data.length && (
                                <p className="p-10 text-center text-xs text-[var(--ac-text-muted)]">{copy.empty}</p>
                            )}
                        </div>
                    )}

                    {attendance && attendance.total > 0 && (
                        <div className="flex flex-col gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-[11px] text-[var(--ac-text-muted)]">
                                {copy.showing} {attendance.from ?? 0}–{attendance.to ?? 0} {copy.of} {attendance.total} {copy.record}
                                {' · '}{copy.page} {attendance.current_page} / {Math.max(1, attendance.last_page)}
                            </p>

                            <div className="flex items-center gap-2">
                                <button type="button" className={button} disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                                    {ar ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                                    {copy.previous}
                                </button>
                                <button type="button" className={button} disabled={page >= attendance.last_page || loading} onClick={() => setPage((current) => Math.min(attendance.last_page, current + 1))}>
                                    {copy.next}
                                    {ar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                <CorrectionDialog correction={correction} copy={copy} currency={currency} busy={busy} onClose={() => setCorrection(null)} onSubmit={submitCorrection} />
            </div>
        );
    }

    const through = previousCompletedMonth();

    return (
        <div className="space-y-5">
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {saved && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{ar ? 'تم الحفظ.' : 'Saved.'}</p>}

            <StaffPayrollTable
                rows={data?.payroll?.rows ?? []}
                currency={data?.payroll?.currency ?? currency}
                ar={ar}
                loading={loading}
            />

            <section className="rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5">
                <h3 className="font-semibold">{copy.recurring}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">{copy.recurringHelp}</p>

                {canManagePay && (
                    <form onSubmit={(event) => void submitAdjustment(event)} className="mt-5">
                        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
                            <label className="text-xs font-semibold">
                                {copy.name}
                                <input required maxLength={255} name="label" className={field} />
                            </label>
                            <label className="text-xs font-semibold">
                                {copy.kind}
                                <select name="kind" className={field}>
                                    <option value="allowance">{copy.allowance}</option>
                                    <option value="bonus">{copy.bonus}</option>
                                    <option value="deduction">{copy.deduction}</option>
                                </select>
                            </label>
                            <label className="text-xs font-semibold">
                                {copy.amount} ({currency})
                                <input required type="number" min="0.0001" max="999999999" step="0.0001" name="amount" className={field} />
                            </label>
                            <label className="text-xs font-semibold">
                                {copy.start}
                                <input required type="date" defaultValue={today()} name="starts_on" className={field} />
                            </label>
                            <label className="text-xs font-semibold">
                                {copy.end}
                                <input type="date" name="ends_on" className={field} />
                            </label>
                            <div className="flex items-end">
                                <button className={`${primaryButton} w-full`}>
                                    <Plus size={14} />
                                    {copy.add}
                                </button>
                            </div>
                        </fieldset>
                    </form>
                )}
            </section>

            <section className="rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5">
                <div className="space-y-2">
                    {data?.adjustments.map((rule) => (
                        <div key={rule.id} className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <strong className="text-sm">{rule.label}</strong>
                                    <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                        {copy[rule.kind]} · {rule.amount} {currency}
                                    </p>
                                    <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">{rule.starts_on} — {rule.ends_on ?? copy.ongoing}</p>
                                </div>

                                {canManagePay && (
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" className={button} onClick={() => setCorrection({ type: 'adjustment', action: 'edit', row: rule })}>
                                            <Pencil size={13} />
                                            {copy.edit}
                                        </button>
                                        <button type="button" className="inline-flex items-center gap-2 rounded-[13px] border border-red-200 px-3 py-2 text-xs font-semibold text-red-700" onClick={() => setCorrection({ type: 'adjustment', action: 'delete', row: rule })}>
                                            <Trash2 size={13} />
                                            {copy.remove}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {!data?.adjustments.length && (
                        <p className="rounded-xl border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">{copy.empty}</p>
                    )}
                </div>

                {canManagePay && (
                    <form className="mt-5 flex flex-col gap-3 border-t border-[var(--ac-line)] pt-5 sm:flex-row sm:items-end" onSubmit={(event) => {
                        event.preventDefault();
                        void send('adjustments/accrue', Object.fromEntries(new FormData(event.currentTarget)));
                    }}>
                        <label className="flex-1 text-xs font-semibold">
                            {copy.through}
                            <input required type="month" name="through" defaultValue={through} max={through} className={field} />
                        </label>
                        <button disabled={busy} className={primaryButton}>{copy.accrue}</button>
                    </form>
                )}
            </section>

            <CorrectionDialog correction={correction} copy={copy} currency={currency} busy={busy} onClose={() => setCorrection(null)} onSubmit={submitCorrection} />
        </div>
    );
}

function SummaryPill({
    label,
    value,
    tone = 'neutral',
}: {
    label: string;
    value: string;
    tone?: 'neutral' | 'success' | 'danger';
}) {
    const toneClass = tone === 'success'
        ? 'bg-emerald-50 text-emerald-700'
        : tone === 'danger'
          ? 'bg-red-50 text-red-700'
          : 'bg-[var(--ac-surface-soft)] text-[var(--ac-text)]';

    return (
        <div className={`min-w-[92px] rounded-[12px] px-3 py-2 ${toneClass}`}>
            <span className="block text-[9px] opacity-70">{label}</span>
            <strong className="mt-0.5 block text-xs tabular-nums">{value}</strong>
        </div>
    );
}

function CorrectionDialog({
    correction,
    copy,
    currency,
    busy,
    onClose,
    onSubmit,
}: {
    correction: Correction | null;
    copy: Record<string, string>;
    currency: string;
    busy: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
    if (!correction) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
            <form onSubmit={(event) => void onSubmit(event)} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[24px] bg-[var(--ac-surface)] p-6 shadow-2xl">
                <div className="flex items-center justify-between gap-4">
                    <h3 className="font-semibold">{correction.action === 'edit' ? copy.edit : copy.remove}</h3>
                    <button type="button" onClick={onClose}><X size={17} /></button>
                </div>

                {correction.action === 'edit' && correction.type === 'attendance' && (
                    <div className="mt-4 space-y-3">
                        <label className="block text-xs font-semibold">
                            {copy.date}
                            <input required type="date" max={today()} name="occurred_on" defaultValue={correction.row.occurred_on} className={field} />
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.attendance}
                            <select name="status" defaultValue={correction.row.status} className={field}>
                                <option value="present">{copy.present}</option>
                                <option value="absent">{copy.absent}</option>
                            </select>
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.quantity}
                            <input type="number" min="0" step="0.0001" name="quantity" defaultValue={correction.row.quantity} className={field} />
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.overtime}
                            <input type="number" min="0" max="24" step="0.0001" name="overtime_hours" defaultValue={correction.row.overtime_hours} className={field} />
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.overtimeRate} ({currency})
                            <input type="number" min="0" step="0.0001" name="overtime_rate" defaultValue={correction.row.overtime_rate} className={field} />
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.note}
                            <textarea name="notes" rows={2} defaultValue={correction.row.notes ?? ''} className={`${field} resize-none`} />
                        </label>
                    </div>
                )}

                {correction.action === 'edit' && correction.type === 'adjustment' && (
                    <div className="mt-4 space-y-3">
                        <label className="block text-xs font-semibold">
                            {copy.name}
                            <input required name="label" defaultValue={correction.row.label} className={field} />
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.amount}
                            <input required type="number" min="0.0001" step="0.0001" name="amount" defaultValue={correction.row.amount} className={field} />
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.start}
                            <input required type="date" name="starts_on" defaultValue={correction.row.starts_on} className={field} />
                        </label>
                        <label className="block text-xs font-semibold">
                            {copy.end}
                            <input type="date" name="ends_on" defaultValue={correction.row.ends_on ?? ''} className={field} />
                        </label>
                    </div>
                )}

                <label className="mt-4 block text-xs font-semibold">
                    {copy.reason}
                    <textarea required minLength={3} maxLength={1000} name="reason" rows={3} className={`${field} resize-none`} />
                </label>

                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className={button} onClick={onClose}>{copy.cancel}</button>
                    <button disabled={busy} className={correction.action === 'delete' ? 'rounded-[13px] bg-red-700 px-4 py-2.5 text-sm font-semibold text-white' : primaryButton}>
                        {correction.action === 'delete' ? copy.remove : copy.saveCorrection}
                    </button>
                </div>
            </form>
        </div>
    );
}
