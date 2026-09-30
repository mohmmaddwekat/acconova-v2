import { useMemo, useState } from 'react';

export type StaffPayrollRow = {
    period: string;
    present: number;
    absent: number;
    attendance_overtime_hours: string;
    work: string;
    overtime: string;
    bonus: string;
    allowances: string;
    deductions: string;
    net_before_payment: string;
    payments: string;
    advances: string;
    settled: string;
    remaining: string;
    status: 'empty' | 'due' | 'partial' | 'paid' | 'credit';
};

type Props = {
    rows: StaffPayrollRow[];
    currency: string;
    ar: boolean;
    loading?: boolean;
};

const selectClass =
    'h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)]';

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

export function StaffPayrollTable({
    rows,
    currency,
    ar,
    loading = false,
}: Props) {
    const [year, setYear] = useState('all');

    const years = useMemo(
        () =>
            Array.from(
                new Set(
                    rows.map((row) => row.period.slice(0, 4)),
                ),
            ).sort((a, b) => Number(b) - Number(a)),
        [rows],
    );

    const visibleRows = useMemo(
        () =>
            year === 'all'
                ? rows
                : rows.filter((row) => row.period.startsWith(`${year}-`)),
        [rows, year],
    );

    const totals = useMemo(
        () =>
            visibleRows.reduce(
                (result, row) => ({
                    earned: result.earned + Number(row.net_before_payment || 0),
                    settled: result.settled + Number(row.settled || 0),
                    remaining: result.remaining + Number(row.remaining || 0),
                }),
                { earned: 0, settled: 0, remaining: 0 },
            ),
        [visibleRows],
    );

    const statusLabel: Record<StaffPayrollRow['status'], string> = {
        empty: ar ? 'بدون حركة' : 'No activity',
        due: ar ? 'مستحق' : 'Due',
        partial: ar ? 'جزئي' : 'Partial',
        paid: ar ? 'مسدد' : 'Paid',
        credit: ar ? 'رصيد زائد' : 'Credit',
    };

    const statusClass: Record<StaffPayrollRow['status'], string> = {
        empty: 'bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]',
        due: 'bg-amber-50 text-amber-700',
        partial: 'bg-sky-50 text-sky-700',
        paid: 'bg-emerald-50 text-emerald-700',
        credit: 'bg-violet-50 text-violet-700',
    };

    return (
        <section className="overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
            <div className="border-b border-[var(--ac-line)] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h3 className="font-semibold">
                            {ar ? 'جدول الرواتب الشهري' : 'Monthly payroll table'}
                        </h3>
                        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'ملخص شهري محسوب من الحضور والإضافي والمكافآت والبدلات والخصومات والدفعات والسلف.'
                                : 'Monthly payroll calculated from attendance, overtime, bonuses, allowances, deductions, payments and advances.'}
                        </p>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold">
                        <span>{ar ? 'السنة' : 'Year'}</span>
                        <select
                            value={year}
                            onChange={(event) => setYear(event.target.value)}
                            className={selectClass}
                        >
                            <option value="all">{ar ? 'كل السنوات' : 'All years'}</option>
                            {years.map((item) => (
                                <option key={item} value={item}>
                                    {item}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <PayrollMetric
                        label={ar ? 'الاستحقاق بعد الخصم' : 'Earned after deductions'}
                        value={money(totals.earned, currency)}
                    />
                    <PayrollMetric
                        label={ar ? 'المدفوع + السلف' : 'Paid + advances'}
                        value={money(totals.settled, currency)}
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
                    {ar ? 'جاري تحميل جدول الرواتب…' : 'Loading payroll table…'}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] text-start text-xs">
                        <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                            <tr>
                                <th className="px-4 py-3 font-semibold">{ar ? 'الشهر' : 'Month'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'الحضور' : 'Attendance'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'الراتب / العمل' : 'Salary / work'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'الإضافي' : 'Overtime'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'البدلات' : 'Allowances'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'المكافآت' : 'Bonuses'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'الخصومات' : 'Deductions'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'المستحق' : 'Due before payment'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'المدفوع / السلف' : 'Paid / advances'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'المتبقي' : 'Remaining'}</th>
                                <th className="px-4 py-3 font-semibold">{ar ? 'الحالة' : 'Status'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--ac-line)]">
                            {visibleRows.map((row) => (
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
                                    </td>
                                    <MoneyCell value={row.work} currency={currency} />
                                    <MoneyCell value={row.overtime} currency={currency} />
                                    <MoneyCell value={row.allowances} currency={currency} />
                                    <MoneyCell value={row.bonus} currency={currency} />
                                    <MoneyCell value={row.deductions} currency={currency} negative />
                                    <MoneyCell value={row.net_before_payment} currency={currency} strong />
                                    <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">
                                        <div>{money(row.settled, currency)}</div>
                                        {(Number(row.payments) > 0 || Number(row.advances) > 0) && (
                                            <div className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                {ar ? 'دفعات' : 'Payments'} {money(row.payments, currency)}
                                                {' · '}
                                                {ar ? 'سلف' : 'Advances'} {money(row.advances, currency)}
                                            </div>
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
                                    <td colSpan={11} className="p-10 text-center text-xs text-[var(--ac-text-muted)]">
                                        {ar ? 'لا توجد أشهر مطابقة.' : 'No matching payroll months.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function PayrollMetric({
    label,
    value,
    accent = false,
}: {
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <div className={[
            'rounded-[14px] border px-3.5 py-3',
            accent
                ? 'border-transparent bg-[var(--ac-accent-soft)]'
                : 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)]',
        ].join(' ')}>
            <span className="block text-[9px] text-[var(--ac-text-muted)]">{label}</span>
            <strong className="mt-1 block text-sm tabular-nums">{value}</strong>
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
