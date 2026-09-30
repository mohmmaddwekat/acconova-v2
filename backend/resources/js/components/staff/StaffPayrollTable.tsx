import { apiRequest } from '@/lib/http';
import type { AppPageProps } from '@/types/app';
import { usePage } from '@inertiajs/react';
import {
    ChevronLeft,
    ChevronRight,
    Pencil,
    Printer,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import './StaffPayrollTable.css';

export type StaffPayrollEmployee = {
    id: number;
    name: string;
    job_title: string | null;
    basis: 'hour' | 'day' | 'month' | 'piece';
    unit: string | null;
    rate: string;
    started_on: string;
};

export type StaffPayrollPayment = {
    id: number;
    occurred_on: string;
    amount: string;
    notes: string | null;
};

export type StaffPayrollRow = {
    period: string;
    basis: 'hour' | 'day' | 'month' | 'piece';
    unit: string | null;
    present: number;
    absent: number;
    attendance_quantity: string;
    attendance_overtime_hours: string;
    work: string;
    overtime: string;
    bonus: string;
    allowances: string;
    gross_earnings: string;
    deductions: string;
    advances: string;
    net_entitlement: string;
    payments: string;
    payment_entries?: StaffPayrollPayment[];
    remaining: string;
    status: 'empty' | 'due' | 'partial' | 'paid' | 'advance' | 'overpaid';
};

type Props = {
    employee?: StaffPayrollEmployee;
    rows: StaffPayrollRow[];
    currency: string;
    ar: boolean;
    loading?: boolean;
    canPay?: boolean;
    onChanged?: () => void;
};

type PaymentCorrection = {
    payment: StaffPayrollPayment;
    action: 'edit' | 'delete';
};

const selectClass =
    'h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)]';

const buttonClass =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3.5 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40';

const inputClass =
    'mt-2 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2.5 text-sm outline-none focus:border-[var(--ac-accent)]';

/** Display-only rounding. Stored payroll values remain untouched. */
function money(value: string | number, currency: string): string {
    const amount = Number(value);

    return `${Number.isFinite(amount)
        ? Math.round(amount).toLocaleString(undefined, {
              maximumFractionDigits: 0,
          })
        : value} ${currency}`;
}

function periodLabel(period: string, ar: boolean): string {
    const [year, month] = period.split('-').map(Number);
    const date = new Date(year, Math.max(0, month - 1), 1);

    return new Intl.DateTimeFormat(ar ? 'ar' : 'en', {
        month: 'long',
        year: 'numeric',
    }).format(date);
}

function quantityLabel(row: StaffPayrollRow, ar: boolean): string {
    const quantity = Number(row.attendance_quantity || 0).toLocaleString(undefined, {
        maximumFractionDigits: 4,
    });

    if (row.basis === 'hour') return `${quantity} ${ar ? 'ساعة' : 'hours'}`;
    if (row.basis === 'day') return `${row.present} ${ar ? 'يوم' : 'days'}`;
    if (row.basis === 'piece') return `${quantity} ${row.unit || (ar ? 'وحدة' : 'units')}`;

    return `${row.present} ${ar ? 'يوم حضور' : 'present days'}`;
}

function basisLabel(basis: StaffPayrollEmployee['basis'], ar: boolean): string {
    const labels: Record<StaffPayrollEmployee['basis'], [string, string]> = {
        hour: ['بالساعة', 'Hourly'],
        day: ['باليوم', 'Daily'],
        month: ['شهري', 'Monthly'],
        piece: ['بالقطعة', 'Piece rate'],
    };

    return labels[basis][ar ? 0 : 1];
}

export function StaffPayrollTable({
    employee,
    rows,
    currency,
    ar,
    loading = false,
    canPay = true,
    onChanged,
}: Props) {
    const organizationName =
        usePage<AppPageProps>().props.workspace.activeOrganization?.name
        ?? 'AccoNova';
    const [liveRows, setLiveRows] = useState<StaffPayrollRow[]>(rows);
    const [year, setYear] = useState('all');
    const [showEmpty, setShowEmpty] = useState(false);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState<10 | 20 | 50 | 100>(10);
    const [paymentRow, setPaymentRow] = useState<StaffPayrollRow | null>(null);
    const [paymentCorrection, setPaymentCorrection] = useState<PaymentCorrection | null>(null);
    const [paymentBusy, setPaymentBusy] = useState(false);
    const [paymentError, setPaymentError] = useState('');

    useEffect(() => {
        setLiveRows(rows);
    }, [rows]);

    const years = useMemo(
        () =>
            Array.from(new Set(liveRows.map((row) => row.period.slice(0, 4))))
                .sort((a, b) => Number(b) - Number(a)),
        [liveRows],
    );

    const filteredRows = useMemo(() => {
        return liveRows.filter((row) => {
            if (year !== 'all' && !row.period.startsWith(`${year}-`)) return false;
            if (!showEmpty && row.status === 'empty') return false;
            return true;
        });
    }, [liveRows, year, showEmpty]);

    const pageCount = Math.max(1, Math.ceil(filteredRows.length / perPage));
    const visibleRows = filteredRows.slice((page - 1) * perPage, page * perPage);

    useEffect(() => {
        setPage(1);
    }, [year, showEmpty, liveRows, perPage]);

    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);

    const totals = useMemo(
        () =>
            filteredRows.reduce(
                (result, row) => ({
                    work: result.work + Number(row.work || 0),
                    overtime: result.overtime + Number(row.overtime || 0),
                    bonus: result.bonus + Number(row.bonus || 0),
                    allowances: result.allowances + Number(row.allowances || 0),
                    gross: result.gross + Number(row.gross_earnings || 0),
                    deductions: result.deductions + Number(row.deductions || 0),
                    advances: result.advances + Number(row.advances || 0),
                    net: result.net + Number(row.net_entitlement || 0),
                    paid: result.paid + Number(row.payments || 0),
                    remaining: result.remaining + Number(row.remaining || 0),
                }),
                {
                    work: 0,
                    overtime: 0,
                    bonus: 0,
                    allowances: 0,
                    gross: 0,
                    deductions: 0,
                    advances: 0,
                    net: 0,
                    paid: 0,
                    remaining: 0,
                },
            ),
        [filteredRows],
    );

    const statusLabel: Record<StaffPayrollRow['status'], string> = {
        empty: ar ? 'بدون حركة' : 'No activity',
        due: ar ? 'مستحق' : 'Due',
        partial: ar ? 'مدفوع جزئيًا' : 'Partially paid',
        paid: ar ? 'مسدد' : 'Paid',
        advance: ar ? 'سلفة أعلى من المستحق' : 'Advance exceeds due',
        overpaid: ar ? 'مدفوع زيادة' : 'Overpaid',
    };

    const statusClass: Record<StaffPayrollRow['status'], string> = {
        empty: 'bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]',
        due: 'bg-amber-50 text-amber-700',
        partial: 'bg-sky-50 text-sky-700',
        paid: 'bg-emerald-50 text-emerald-700',
        advance: 'bg-orange-50 text-orange-700',
        overpaid: 'bg-violet-50 text-violet-700',
    };

    const start = filteredRows.length ? (page - 1) * perPage + 1 : 0;
    const end = Math.min(page * perPage, filteredRows.length);
    const printPeriod = year === 'all'
        ? (ar ? 'كل السنوات' : 'All years')
        : year;

    async function submitPaymentCorrection(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!employee || !paymentCorrection || paymentBusy) return;

        const values = Object.fromEntries(new FormData(event.currentTarget));
        const payload: Record<string, unknown> = {
            reason: values.reason,
        };

        if (paymentCorrection.action === 'edit') {
            payload.amount = values.amount;
            payload.notes = values.notes ?? '';
        }

        setPaymentBusy(true);
        setPaymentError('');

        try {
            await apiRequest(
                `/api/staff/${employee.id}/entries/${paymentCorrection.payment.id}`,
                {
                    method: paymentCorrection.action === 'delete' ? 'DELETE' : 'PATCH',
                    body: JSON.stringify(payload),
                },
            );

            const refreshed = await apiRequest<{
                payroll?: {
                    rows: StaffPayrollRow[];
                };
            }>(`/api/staff/${employee.id}/workforce?page=1&per_page=10&sort=desc`);

            if (refreshed.payroll?.rows) {
                setLiveRows(refreshed.payroll.rows);
            }

            setPaymentCorrection(null);
            setPaymentRow(null);
            onChanged?.();
        } catch (failure) {
            setPaymentError(
                failure instanceof Error
                    ? failure.message
                    : (ar ? 'تعذر تصحيح الدفعة.' : 'Failed to correct payment.'),
            );
        } finally {
            setPaymentBusy(false);
        }
    }

    return (
        <>
            <section className="ac-payroll-table overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                <div className="border-b border-[var(--ac-line)] p-4 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                            <h3 className="text-base font-semibold">
                                {ar ? 'كشف الرواتب الشهري' : 'Monthly payroll statement'}
                            </h3>
                            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'كل عنصر ظاهر لوحده. اضغط على المدفوع في أي شهر لعرض الدفعات الفردية وتعديلها أو حذفها.'
                                    : 'Each payroll component is separate. Open Paid in any month to manage individual payments.'}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-xs font-semibold">
                                <span>{ar ? 'السنة' : 'Year'}</span>
                                <select value={year} onChange={(event) => setYear(event.target.value)} className={selectClass}>
                                    <option value="all">{ar ? 'كل السنوات' : 'All years'}</option>
                                    {years.map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </label>

                            <label className="flex items-center gap-2 text-xs font-semibold">
                                <span>{ar ? 'الصفوف' : 'Rows'}</span>
                                <select
                                    value={perPage}
                                    onChange={(event) => setPerPage(Number(event.target.value) as 10 | 20 | 50 | 100)}
                                    className={selectClass}
                                >
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </label>

                            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold">
                                <input type="checkbox" checked={showEmpty} onChange={(event) => setShowEmpty(event.target.checked)} />
                                {ar ? 'إظهار الأشهر بدون حركة' : 'Show empty months'}
                            </label>

                            <button
                                type="button"
                                className={buttonClass}
                                disabled={!filteredRows.length || loading}
                                onClick={() => window.print()}
                            >
                                <Printer size={14} />
                                {ar ? 'طباعة كشف الراتب' : 'Print payslip'}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <PayrollMetric label={ar ? 'إجمالي الكسب' : 'Gross earnings'} value={money(totals.gross, currency)} />
                        <PayrollMetric
                            label={ar ? 'خصومات + سلف' : 'Deductions + advances'}
                            value={money(totals.deductions + totals.advances, currency)}
                            danger={totals.deductions + totals.advances > 0}
                        />
                        <PayrollMetric label={ar ? 'صافي المستحق' : 'Net entitlement'} value={money(totals.net, currency)} />
                        <PayrollMetric label={ar ? 'المدفوع' : 'Paid'} value={money(totals.paid, currency)} />
                        <PayrollMetric label={ar ? 'المتبقي' : 'Remaining'} value={money(totals.remaining, currency)} accent />
                    </div>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-xs text-[var(--ac-text-muted)]">
                        {ar ? 'جاري تحميل الرواتب…' : 'Loading payroll…'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1840px] text-start text-xs">
                            <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                                <tr>
                                    <th className="ac-payroll-period px-4 py-3 text-start font-semibold">{ar ? 'الشهر' : 'Month'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'الحضور / الكمية' : 'Attendance / quantity'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'الشغل / الراتب' : 'Work / salary'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'الإضافي' : 'Overtime'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'المكافآت' : 'Bonuses'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'البدلات' : 'Allowances'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'إجمالي الكسب' : 'Gross'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'الخصومات' : 'Deductions'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'السلف' : 'Advances'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'صافي المستحق' : 'Net entitlement'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'المدفوع' : 'Paid'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'المتبقي' : 'Remaining'}</th>
                                    <th className="px-4 py-3 text-start font-semibold">{ar ? 'الحالة' : 'Status'}</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-[var(--ac-line)]">
                                {visibleRows.map((row) => (
                                    <tr key={row.period} className="transition hover:bg-[var(--ac-surface-soft)]">
                                        <td className="ac-payroll-period whitespace-nowrap px-4 py-3.5 font-semibold">
                                            <div>{periodLabel(row.period, ar)}</div>
                                            <div className="mt-0.5 text-[9px] font-normal text-[var(--ac-text-muted)]">{row.period}</div>
                                        </td>

                                        <td className="whitespace-nowrap px-4 py-3.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">
                                                    {ar ? 'ح' : 'P'} {row.present}
                                                </span>
                                                <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-semibold text-red-700">
                                                    {ar ? 'غ' : 'A'} {row.absent}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 text-[10px] text-[var(--ac-text-muted)]">{quantityLabel(row, ar)}</div>
                                        </td>

                                        <MoneyCell value={row.work} currency={currency} strong />
                                        <MoneyCell
                                            value={row.overtime}
                                            currency={currency}
                                            note={Number(row.attendance_overtime_hours) > 0
                                                ? `${row.attendance_overtime_hours} ${ar ? 'ساعة' : 'h'}`
                                                : undefined}
                                        />
                                        <MoneyCell value={row.bonus} currency={currency} positive />
                                        <MoneyCell value={row.allowances} currency={currency} positive />
                                        <MoneyCell value={row.gross_earnings} currency={currency} strong />
                                        <MoneyCell value={row.deductions} currency={currency} negative />
                                        <MoneyCell value={row.advances} currency={currency} negative />
                                        <MoneyCell value={row.net_entitlement} currency={currency} strong />

                                        <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">
                                            {Number(row.payments || 0) > 0 && canPay ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPaymentError('');
                                                        setPaymentRow(row);
                                                    }}
                                                    className="rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 py-2 text-start transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)]"
                                                >
                                                    <strong className="block">{money(row.payments, currency)}</strong>
                                                    <span className="mt-0.5 block text-[9px] text-[var(--ac-accent-strong)]">
                                                        {(row.payment_entries?.length ?? 0)} {ar ? 'دفعة · إدارة' : 'payments · manage'}
                                                    </span>
                                                </button>
                                            ) : (
                                                <div>{money(row.payments, currency)}</div>
                                            )}
                                        </td>

                                        <MoneyCell value={row.remaining} currency={currency} strong balance />

                                        <td className="whitespace-nowrap px-4 py-3.5">
                                            <span className={`rounded-full px-2.5 py-1.5 text-[9px] font-semibold ${statusClass[row.status]}`}>
                                                {statusLabel[row.status]}
                                            </span>
                                        </td>
                                    </tr>
                                ))}

                                {!visibleRows.length && (
                                    <tr>
                                        <td colSpan={13} className="p-10 text-center text-xs text-[var(--ac-text-muted)]">
                                            {ar
                                                ? 'لا توجد حركة رواتب مطابقة. فعّل «إظهار الأشهر بدون حركة» إذا أردت رؤية الأشهر الفارغة.'
                                                : 'No matching payroll activity. Enable “Show empty months” to include empty periods.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {filteredRows.length > 0 && (
                    <div className="flex flex-col gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[10px] text-[var(--ac-text-muted)]">
                            {ar ? 'عرض' : 'Showing'} {start}–{end} {ar ? 'من' : 'of'} {filteredRows.length}
                            {' · '}{ar ? 'صفحة' : 'Page'} {page} / {pageCount}
                        </p>
                        <div className="flex gap-2">
                            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className={buttonClass}>
                                {ar ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                                {ar ? 'السابق' : 'Previous'}
                            </button>
                            <button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className={buttonClass}>
                                {ar ? 'التالي' : 'Next'}
                                {ar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <PayrollPrintSheet
                organizationName={organizationName}
                employee={employee}
                rows={filteredRows}
                currency={currency}
                totals={totals}
                period={printPeriod}
                ar={ar}
                statusLabel={statusLabel}
            />

            {paymentRow && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
                    <section className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-[var(--ac-surface)] p-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-base font-semibold">{ar ? 'دفعات الشهر' : 'Month payments'}</h3>
                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {periodLabel(paymentRow.period, ar)} · {money(paymentRow.payments, currency)}
                                </p>
                            </div>
                            <button type="button" onClick={() => setPaymentRow(null)} className="flex size-9 items-center justify-center rounded-xl bg-[var(--ac-surface-soft)]">
                                <X size={16} />
                            </button>
                        </div>

                        {paymentError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{paymentError}</p>}

                        <div className="mt-5 space-y-2">
                            {(paymentRow.payment_entries ?? []).map((payment) => (
                                <div key={payment.id} className="flex flex-col gap-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <strong className="text-sm tabular-nums">{money(payment.amount, currency)}</strong>
                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">{payment.occurred_on}</p>
                                        {payment.notes && <p className="mt-1 text-xs text-[var(--ac-text-soft)]">{payment.notes}</p>}
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" className={buttonClass} onClick={() => setPaymentCorrection({ payment, action: 'edit' })}>
                                            <Pencil size={13} />
                                            {ar ? 'تعديل' : 'Edit'}
                                        </button>
                                        <button
                                            type="button"
                                            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                                            onClick={() => setPaymentCorrection({ payment, action: 'delete' })}
                                        >
                                            <Trash2 size={13} />
                                            {ar ? 'حذف' : 'Delete'}
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {!paymentRow.payment_entries?.length && (
                                <p className="rounded-xl border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                                    {ar ? 'لا توجد دفعات فردية لهذا الشهر.' : 'No individual payments for this month.'}
                                </p>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {paymentCorrection && (
                <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
                    <form onSubmit={(event) => void submitPaymentCorrection(event)} className="w-full max-w-md rounded-[24px] bg-[var(--ac-surface)] p-6 shadow-2xl">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-base font-semibold">
                                    {paymentCorrection.action === 'edit'
                                        ? (ar ? 'تعديل الدفعة' : 'Edit payment')
                                        : (ar ? 'حذف الدفعة' : 'Delete payment')}
                                </h3>
                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {paymentCorrection.payment.occurred_on}
                                </p>
                            </div>
                            <button type="button" onClick={() => setPaymentCorrection(null)}><X size={16} /></button>
                        </div>

                        {paymentCorrection.action === 'edit' && (
                            <div className="mt-5 space-y-3">
                                <label className="block text-xs font-semibold">
                                    {ar ? 'المبلغ' : 'Amount'} ({currency})
                                    <input
                                        required
                                        type="number"
                                        min="0.0001"
                                        max="999999999"
                                        step="0.0001"
                                        name="amount"
                                        defaultValue={paymentCorrection.payment.amount}
                                        className={inputClass}
                                    />
                                </label>
                                <label className="block text-xs font-semibold">
                                    {ar ? 'ملاحظة' : 'Note'}
                                    <textarea name="notes" rows={2} defaultValue={paymentCorrection.payment.notes ?? ''} className={`${inputClass} resize-none`} />
                                </label>
                            </div>
                        )}

                        <label className="mt-4 block text-xs font-semibold">
                            {ar ? 'سبب التصحيح' : 'Correction reason'}
                            <textarea required minLength={3} maxLength={1000} name="reason" rows={3} className={`${inputClass} resize-none`} />
                        </label>

                        {paymentError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{paymentError}</p>}

                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" className={buttonClass} onClick={() => setPaymentCorrection(null)}>
                                {ar ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                disabled={paymentBusy}
                                className={paymentCorrection.action === 'delete'
                                    ? 'rounded-[12px] bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'
                                    : 'rounded-[12px] bg-[var(--ac-accent-solid)] px-4 py-2.5 text-sm font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-50'}
                            >
                                {paymentCorrection.action === 'delete'
                                    ? (ar ? 'حذف الدفعة' : 'Delete payment')
                                    : (ar ? 'حفظ التعديل' : 'Save changes')}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}

function PayrollPrintSheet({
    organizationName,
    employee,
    rows,
    currency,
    totals,
    period,
    ar,
    statusLabel,
}: {
    organizationName: string;
    employee?: StaffPayrollEmployee;
    rows: StaffPayrollRow[];
    currency: string;
    totals: {
        work: number;
        overtime: number;
        bonus: number;
        allowances: number;
        gross: number;
        deductions: number;
        advances: number;
        net: number;
        paid: number;
        remaining: number;
    };
    period: string;
    ar: boolean;
    statusLabel: Record<StaffPayrollRow['status'], string>;
}) {
    const generatedAt = new Intl.DateTimeFormat(ar ? 'ar' : 'en', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date());

    return (
        <section className="ac-payroll-print-sheet" dir={ar ? 'rtl' : 'ltr'}>
            <header className="ac-print-header">
                <div>
                    <div className="ac-print-company">{organizationName}</div>
                    <h1>{ar ? 'كشف راتب ومستحقات الموظف' : 'Employee payroll & entitlement statement'}</h1>
                    <p>{ar ? `الفترة: ${period}` : `Period: ${period}`}</p>
                </div>
                <div className="ac-print-meta">
                    <strong>AccoNova</strong>
                    <span>{ar ? 'تاريخ الطباعة' : 'Printed'}: {generatedAt}</span>
                    <span>{ar ? 'العملة' : 'Currency'}: {currency}</span>
                </div>
            </header>

            <div className="ac-print-employee">
                <div><span>{ar ? 'الموظف' : 'Employee'}</span><strong>{employee?.name ?? '—'}</strong></div>
                <div><span>{ar ? 'الوظيفة' : 'Job title'}</span><strong>{employee?.job_title ?? '—'}</strong></div>
                <div><span>{ar ? 'رقم الموظف' : 'Employee ID'}</span><strong>{employee?.id ?? '—'}</strong></div>
                <div><span>{ar ? 'أساس الأجر' : 'Pay basis'}</span><strong>{employee ? basisLabel(employee.basis, ar) : '—'}</strong></div>
                <div><span>{ar ? 'الأجر الحالي' : 'Current rate'}</span><strong>{employee ? money(employee.rate, currency) : '—'}</strong></div>
                <div><span>{ar ? 'تاريخ البدء' : 'Start date'}</span><strong>{employee?.started_on ?? '—'}</strong></div>
            </div>

            <div className="ac-print-totals">
                <div><span>{ar ? 'إجمالي الكسب' : 'Gross earnings'}</span><strong>{money(totals.gross, currency)}</strong></div>
                <div><span>{ar ? 'الخصومات' : 'Deductions'}</span><strong>{money(totals.deductions, currency)}</strong></div>
                <div><span>{ar ? 'السلف' : 'Advances'}</span><strong>{money(totals.advances, currency)}</strong></div>
                <div><span>{ar ? 'صافي المستحق' : 'Net entitlement'}</span><strong>{money(totals.net, currency)}</strong></div>
                <div><span>{ar ? 'المدفوع' : 'Paid'}</span><strong>{money(totals.paid, currency)}</strong></div>
                <div><span>{ar ? 'المتبقي' : 'Remaining'}</span><strong>{money(totals.remaining, currency)}</strong></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>{ar ? 'الشهر' : 'Month'}</th>
                        <th>{ar ? 'حضور/غياب' : 'P/A'}</th>
                        <th>{ar ? 'الكمية' : 'Qty'}</th>
                        <th>{ar ? 'الشغل/الراتب' : 'Work'}</th>
                        <th>{ar ? 'الإضافي' : 'OT'}</th>
                        <th>{ar ? 'مكافآت' : 'Bonus'}</th>
                        <th>{ar ? 'بدلات' : 'Allow.'}</th>
                        <th>{ar ? 'الإجمالي' : 'Gross'}</th>
                        <th>{ar ? 'خصومات' : 'Deduct.'}</th>
                        <th>{ar ? 'سلف' : 'Advance'}</th>
                        <th>{ar ? 'الصافي' : 'Net'}</th>
                        <th>{ar ? 'مدفوع' : 'Paid'}</th>
                        <th>{ar ? 'متبقي' : 'Remain.'}</th>
                        <th>{ar ? 'الحالة' : 'Status'}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.period}>
                            <td>{row.period}</td>
                            <td>{row.present} / {row.absent}</td>
                            <td>{quantityLabel(row, ar)}</td>
                            <td>{money(row.work, currency)}</td>
                            <td>{money(row.overtime, currency)}</td>
                            <td>{money(row.bonus, currency)}</td>
                            <td>{money(row.allowances, currency)}</td>
                            <td>{money(row.gross_earnings, currency)}</td>
                            <td>{money(row.deductions, currency)}</td>
                            <td>{money(row.advances, currency)}</td>
                            <td>{money(row.net_entitlement, currency)}</td>
                            <td>{money(row.payments, currency)}</td>
                            <td>{money(row.remaining, currency)}</td>
                            <td>{statusLabel[row.status]}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <footer className="ac-print-footer">
                <div>
                    <span>{ar ? 'توقيع المسؤول' : 'Authorized signature'}</span>
                    <strong>________________________</strong>
                </div>
                <div>
                    <span>{ar ? 'توقيع الموظف' : 'Employee signature'}</span>
                    <strong>________________________</strong>
                </div>
            </footer>
        </section>
    );
}

function PayrollMetric({
    label,
    value,
    accent = false,
    danger = false,
}: {
    label: string;
    value: string;
    accent?: boolean;
    danger?: boolean;
}) {
    return (
        <div
            className={[
                'rounded-[14px] border px-3.5 py-3',
                accent
                    ? 'border-transparent bg-[var(--ac-accent-soft)]'
                    : danger
                      ? 'border-red-100 bg-red-50/60'
                      : 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)]',
            ].join(' ')}
        >
            <span className="block text-[9px] text-[var(--ac-text-muted)]">{label}</span>
            <strong className={`mt-1 block text-sm tabular-nums ${danger ? 'text-red-700' : ''}`}>{value}</strong>
        </div>
    );
}

function MoneyCell({
    value,
    currency,
    negative = false,
    positive = false,
    strong = false,
    balance = false,
    note,
}: {
    value: string;
    currency: string;
    negative?: boolean;
    positive?: boolean;
    strong?: boolean;
    balance?: boolean;
    note?: string;
}) {
    const numeric = Number(value || 0);
    const className = balance
        ? numeric > 0
            ? 'text-amber-700'
            : numeric < 0
              ? 'text-violet-700'
              : 'text-emerald-700'
        : negative && numeric > 0
          ? 'text-red-700'
          : positive && numeric > 0
            ? 'text-emerald-700'
            : '';

    return (
        <td className={`whitespace-nowrap px-4 py-3.5 tabular-nums ${strong ? 'font-semibold' : ''} ${className}`}>
            <div>{money(value, currency)}</div>
            {note && <div className="mt-1 text-[9px] font-normal text-[var(--ac-text-muted)]">{note}</div>}
        </td>
    );
}
