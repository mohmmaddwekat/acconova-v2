import { useEffect, useMemo, useState } from 'react';
import './StaffPayrollTable.css';

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
    remaining: string;
    status: 'empty' | 'due' | 'partial' | 'paid' | 'advance' | 'overpaid';
};

type Props = {
    rows: StaffPayrollRow[];
    currency: string;
    ar: boolean;
    loading?: boolean;
};

const selectClass =
    'h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)]';

const PAGE_SIZE = 8;

function money(value: string | number, currency: string): string {
    const amount = Number(value);

    return `${Number.isFinite(amount)
        ? amount.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 4,
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

export function StaffPayrollTable({
    rows,
    currency,
    ar,
    loading = false,
}: Props) {
    const [year, setYear] = useState('all');
    const [showEmpty, setShowEmpty] = useState(false);
    const [page, setPage] = useState(1);

    const years = useMemo(
        () =>
            Array.from(new Set(rows.map((row) => row.period.slice(0, 4))))
                .sort((a, b) => Number(b) - Number(a)),
        [rows],
    );

    const filteredRows = useMemo(() => {
        return rows.filter((row) => {
            if (year !== 'all' && !row.period.startsWith(`${year}-`)) return false;
            if (!showEmpty && row.status === 'empty') return false;
            return true;
        });
    }, [rows, year, showEmpty]);

    const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    useEffect(() => {
        setPage(1);
    }, [year, showEmpty, rows]);

    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);

    const totals = useMemo(
        () =>
            filteredRows.reduce(
                (result, row) => ({
                    gross: result.gross + Number(row.gross_earnings || 0),
                    reductions:
                        result.reductions
                        + Number(row.deductions || 0)
                        + Number(row.advances || 0),
                    net: result.net + Number(row.net_entitlement || 0),
                    paid: result.paid + Number(row.payments || 0),
                    remaining: result.remaining + Number(row.remaining || 0),
                }),
                { gross: 0, reductions: 0, net: 0, paid: 0, remaining: 0 },
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

    return (
        <section className="ac-payroll-table overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
            <div className="border-b border-[var(--ac-line)] p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <h3 className="text-base font-semibold">
                            {ar ? 'كشف الرواتب الشهري' : 'Monthly payroll statement'}
                        </h3>
                        <p className="mt-1.5 max-w-3xl text-xs leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'الحسبة: الشغل + الإضافي + المكافآت + البدلات − الخصومات − السلف = صافي المستحق، ثم تُطرح الدفعات لإظهار المتبقي.'
                                : 'Work + overtime + bonuses + allowances − deductions − advances = net entitlement, then payments reduce the remaining balance.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs font-semibold">
                            <span>{ar ? 'السنة' : 'Year'}</span>
                            <select
                                value={year}
                                onChange={(event) => setYear(event.target.value)}
                                className={selectClass}
                            >
                                <option value="all">{ar ? 'كل السنوات' : 'All years'}</option>
                                {years.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </select>
                        </label>

                        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold">
                            <input
                                type="checkbox"
                                checked={showEmpty}
                                onChange={(event) => setShowEmpty(event.target.checked)}
                            />
                            {ar ? 'إظهار الأشهر بدون حركة' : 'Show empty months'}
                        </label>
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <PayrollMetric
                        label={ar ? 'إجمالي الكسب' : 'Gross earnings'}
                        value={money(totals.gross, currency)}
                    />
                    <PayrollMetric
                        label={ar ? 'خصومات + سلف' : 'Deductions + advances'}
                        value={money(totals.reductions, currency)}
                        danger={totals.reductions > 0}
                    />
                    <PayrollMetric
                        label={ar ? 'صافي المستحق' : 'Net entitlement'}
                        value={money(totals.net, currency)}
                    />
                    <PayrollMetric
                        label={ar ? 'المدفوع' : 'Paid'}
                        value={money(totals.paid, currency)}
                    />
                    <PayrollMetric
                        label={ar ? 'المتبقي' : 'Remaining'}
                        value={money(totals.remaining, currency)}
                        accent
                    />
                </div>
            </div>

            {loading ? (
                <div className="p-10 text-center text-xs text-[var(--ac-text-muted)]">
                    {ar ? 'جاري تحميل الرواتب…' : 'Loading payroll…'}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1260px] text-start text-xs">
                        <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                            <tr>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'الشهر' : 'Month'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'الحضور / الكمية' : 'Attendance / quantity'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'الشغل / الراتب' : 'Work / salary'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'الإضافات' : 'Additions'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'الخصومات' : 'Deductions'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'السلف' : 'Advances'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'صافي المستحق' : 'Net entitlement'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'المدفوع' : 'Paid'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'المتبقي' : 'Remaining'}</th>
                                <th className="px-4 py-3 text-start font-semibold">{ar ? 'الحالة' : 'Status'}</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-[var(--ac-line)]">
                            {visibleRows.map((row) => {
                                const additions =
                                    Number(row.overtime || 0)
                                    + Number(row.bonus || 0)
                                    + Number(row.allowances || 0);

                                return (
                                    <tr key={row.period} className="transition hover:bg-[var(--ac-surface-soft)]">
                                        <td className="whitespace-nowrap px-4 py-3.5 font-semibold">
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
                                            <div className="mt-1.5 text-[10px] text-[var(--ac-text-muted)]">
                                                {quantityLabel(row, ar)}
                                            </div>
                                        </td>

                                        <MoneyCell value={row.work} currency={currency} strong />

                                        <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">
                                            <div className={additions > 0 ? 'font-semibold text-emerald-700' : ''}>
                                                {money(additions, currency)}
                                            </div>
                                            {additions > 0 && (
                                                <div className="mt-1 text-[9px] leading-4 text-[var(--ac-text-muted)]">
                                                    {Number(row.overtime) > 0 && <span>{ar ? 'إضافي' : 'OT'} {money(row.overtime, currency)} · </span>}
                                                    {Number(row.bonus) > 0 && <span>{ar ? 'مكافأة' : 'Bonus'} {money(row.bonus, currency)} · </span>}
                                                    {Number(row.allowances) > 0 && <span>{ar ? 'بدل' : 'Allowance'} {money(row.allowances, currency)}</span>}
                                                </div>
                                            )}
                                        </td>

                                        <MoneyCell value={row.deductions} currency={currency} negative />
                                        <MoneyCell value={row.advances} currency={currency} negative />
                                        <MoneyCell value={row.net_entitlement} currency={currency} strong />
                                        <MoneyCell value={row.payments} currency={currency} />
                                        <MoneyCell value={row.remaining} currency={currency} strong balance />

                                        <td className="whitespace-nowrap px-4 py-3.5">
                                            <span className={`rounded-full px-2.5 py-1.5 text-[9px] font-semibold ${statusClass[row.status]}`}>
                                                {statusLabel[row.status]}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!visibleRows.length && (
                                <tr>
                                    <td colSpan={10} className="p-10 text-center text-xs text-[var(--ac-text-muted)]">
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

            {filteredRows.length > PAGE_SIZE && (
                <div className="flex flex-col gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[10px] text-[var(--ac-text-muted)]">
                        {ar ? 'عرض' : 'Showing'} {' '}
                        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} {' '}
                        {ar ? 'من' : 'of'} {filteredRows.length}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                            className="rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                        >
                            {ar ? 'السابق' : 'Previous'}
                        </button>
                        <span className="flex min-w-16 items-center justify-center text-[10px] text-[var(--ac-text-muted)]">
                            {page} / {pageCount}
                        </span>
                        <button
                            type="button"
                            disabled={page >= pageCount}
                            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                            className="rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 py-2 text-xs font-semibold disabled:opacity-40"
                        >
                            {ar ? 'التالي' : 'Next'}
                        </button>
                    </div>
                </div>
            )}
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
    strong = false,
    balance = false,
}: {
    value: string;
    currency: string;
    negative?: boolean;
    strong?: boolean;
    balance?: boolean;
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
          : '';

    return (
        <td className={`whitespace-nowrap px-4 py-3.5 tabular-nums ${strong ? 'font-semibold' : ''} ${className}`}>
            {money(value, currency)}
        </td>
    );
}
