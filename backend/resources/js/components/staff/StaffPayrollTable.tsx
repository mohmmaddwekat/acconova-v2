import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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

const smallButton =
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-[11px] font-semibold text-[var(--ac-text)] transition hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40';

const PAGE_SIZE = 12;

function money(value: string | number, currency: string): string {
    const amount = Number(value);

    return `${Number.isFinite(amount)
        ? amount.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
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

function hasActivity(row: StaffPayrollRow): boolean {
    return row.present > 0
        || row.absent > 0
        || Number(row.work) !== 0
        || Number(row.overtime) !== 0
        || Number(row.bonus) !== 0
        || Number(row.allowances) !== 0
        || Number(row.deductions) !== 0
        || Number(row.payments) !== 0
        || Number(row.advances) !== 0
        || Number(row.remaining) !== 0;
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

    const activityRows = useMemo(
        () => rows.filter(hasActivity),
        [rows],
    );

    const sourceRows = showEmpty ? rows : activityRows;

    const years = useMemo(
        () =>
            Array.from(
                new Set(sourceRows.map((row) => row.period.slice(0, 4))),
            ).sort((a, b) => Number(b) - Number(a)),
        [sourceRows],
    );

    const filteredRows = useMemo(
        () =>
            year === 'all'
                ? sourceRows
                : sourceRows.filter((row) => row.period.startsWith(`${year}-`)),
        [sourceRows, year],
    );

    useEffect(() => {
        setPage(1);
    }, [year, showEmpty, rows]);

    useEffect(() => {
        if (year !== 'all' && !years.includes(year)) {
            setYear('all');
        }
    }, [year, years]);

    const lastPage = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    const safePage = Math.min(page, lastPage);
    const visibleRows = filteredRows.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
    );

    const totals = useMemo(
        () =>
            filteredRows.reduce(
                (result, row) => ({
                    earned: result.earned + Number(row.net_before_payment || 0),
                    settled: result.settled + Number(row.settled || 0),
                    remaining: result.remaining + Number(row.remaining || 0),
                }),
                { earned: 0, settled: 0, remaining: 0 },
            ),
        [filteredRows],
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
        <section className="w-full overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
            <div className="border-b border-[var(--ac-line)] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h3 className="font-semibold">
                            {ar ? 'جدول الرواتب الشهري' : 'Monthly payroll'}
                        </h3>
                        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'يعرض الأشهر التي فيها حضور أو استحقاق أو خصم أو دفعة. الأشهر الفارغة مخفية تلقائيًا.'
                                : 'Shows months with attendance, earnings, deductions or payments. Empty months are hidden by default.'}
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
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button
                            type="button"
                            className={smallButton}
                            onClick={() => setShowEmpty((current) => !current)}
                        >
                            {showEmpty
                                ? ar
                                    ? 'إخفاء الأشهر الفارغة'
                                    : 'Hide empty months'
                                : ar
                                  ? 'إظهار الأشهر الفارغة'
                                  : 'Show empty months'}
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <PayrollMetric
                        label={ar ? 'صافي المستحق' : 'Net entitlement'}
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
                    {ar ? 'جاري تحميل الرواتب…' : 'Loading payroll…'}
                </div>
            ) : !filteredRows.length ? (
                <div className="p-10 text-center">
                    <p className="text-sm font-semibold text-[var(--ac-text)]">
                        {ar ? 'لا توجد حركات رواتب بعد' : 'No payroll activity yet'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                        {ar
                            ? 'سجّل حضورًا أو مكافأة أو خصمًا أو دفعة وسيظهر الشهر هنا تلقائيًا.'
                            : 'Record attendance, an adjustment or a payment and the month will appear here.'}
                    </p>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1020px] text-start text-xs">
                            <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                                <tr>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'الشهر' : 'Month'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'ح/غ' : 'P/A'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'العمل' : 'Work'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'إضافي' : 'OT'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'بدلات + مكافآت' : 'Benefits + bonus'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'خصومات' : 'Deductions'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'صافي المستحق' : 'Net due'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'مدفوع + سلف' : 'Paid + advances'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'المتبقي' : 'Remaining'}</th>
                                    <th className="px-3 py-3 font-semibold">{ar ? 'الحالة' : 'Status'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--ac-line)]">
                                {visibleRows.map((row) => (
                                    <tr key={row.period} className="transition hover:bg-[var(--ac-surface-soft)]">
                                        <td className="whitespace-nowrap px-3 py-3 font-semibold">
                                            <div>{periodLabel(row.period, ar)}</div>
                                            <div className="mt-0.5 text-[9px] font-normal text-[var(--ac-text-muted)]">{row.period}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-3">
                                            <span className="text-emerald-700">{ar ? 'ح' : 'P'} {row.present}</span>
                                            <span className="mx-1 text-[var(--ac-line-strong)]">/</span>
                                            <span className="text-red-700">{ar ? 'غ' : 'A'} {row.absent}</span>
                                        </td>
                                        <MoneyCell value={row.work} currency={currency} />
                                        <MoneyCell value={row.overtime} currency={currency} />
                                        <MoneyCell value={Number(row.allowances) + Number(row.bonus)} currency={currency} />
                                        <MoneyCell value={row.deductions} currency={currency} negative />
                                        <MoneyCell value={row.net_before_payment} currency={currency} strong />
                                        <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                                            <div>{money(row.settled, currency)}</div>
                                            {Number(row.advances) > 0 && (
                                                <div className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                                    {ar ? 'منها سلف' : 'Advances'} {money(row.advances, currency)}
                                                </div>
                                            )}
                                        </td>
                                        <MoneyCell value={row.remaining} currency={currency} strong balance />
                                        <td className="whitespace-nowrap px-3 py-3">
                                            <span className={`rounded-full px-2.5 py-1.5 text-[9px] font-semibold ${statusClass[row.status]}`}>
                                                {statusLabel[row.status]}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[10px] text-[var(--ac-text-muted)]">
                            {ar ? 'عرض' : 'Showing'}{' '}
                            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)}{' '}
                            {ar ? 'من' : 'of'} {filteredRows.length}
                        </p>

                        {lastPage > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className={smallButton}
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                >
                                    {ar ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
                                    {ar ? 'السابق' : 'Previous'}
                                </button>
                                <span className="text-[10px] text-[var(--ac-text-muted)]">
                                    {safePage} / {lastPage}
                                </span>
                                <button
                                    type="button"
                                    className={smallButton}
                                    disabled={safePage >= lastPage}
                                    onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
                                >
                                    {ar ? 'التالي' : 'Next'}
                                    {ar ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
                                </button>
                            </div>
                        )}
                    </div>
                </>
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
    value: string | number;
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
        <td className={`whitespace-nowrap px-3 py-3 tabular-nums ${strong ? 'font-semibold' : ''} ${className}`}>
            {money(value, currency)}
        </td>
    );
}
