import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export const financePanel =
    'rounded-[18px] border border-[#dbe6f5] bg-white shadow-[0_8px_28px_rgba(30,75,140,.055)]';

export const financeInput =
    'w-full rounded-[10px] border border-[#d8e4f4] bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-300 focus:border-[#2f80ed] focus:ring-4 focus:ring-blue-50 disabled:bg-slate-50 disabled:text-slate-400';

export const financeButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#d8e4f4] bg-white px-4 text-xs font-semibold text-[#1958a6] transition hover:border-[#8dbcf8] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45';

export const financePrimary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#1265d8] bg-[#1265d8] px-4 text-xs font-semibold text-white shadow-[0_6px_16px_rgba(18,101,216,.18)] transition hover:bg-[#0e57bd] disabled:cursor-not-allowed disabled:opacity-45';

export function FPanel({
    title,
    icon: Icon,
    action,
    children,
    className = '',
}: {
    title?: string;
    icon?: LucideIcon;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={financePanel + ' ' + className}>
            {(title || action) && (
                <header className="flex items-center justify-between gap-3 border-b border-[#edf3fa] px-4 py-3.5">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-[#102c62]">
                        {Icon && <Icon size={17} className="text-[#1265d8]" />}
                        {title}
                    </h2>
                    {action}
                </header>
            )}
            {children}
        </section>
    );
}

export function SummaryCard({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'blue',
}: {
    label: string;
    value: ReactNode;
    hint?: string;
    icon: LucideIcon;
    tone?: 'blue' | 'green' | 'amber' | 'red' | 'violet';
}) {
    const toneClass = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        red: 'bg-red-50 text-red-500',
        violet: 'bg-violet-50 text-violet-600',
    }[tone];

    return (
        <div className={financePanel + ' flex items-center gap-4 p-4'}>
            <span className={'flex size-11 shrink-0 items-center justify-center rounded-[13px] ' + toneClass}>
                <Icon size={21} />
            </span>
            <div className="min-w-0">
                <p className="text-[10px] font-medium text-slate-500">{label}</p>
                <strong className="mt-1 block truncate text-xl text-[#102c62]">{value}</strong>
                {hint && <p className="mt-1 text-[9px] text-slate-400">{hint}</p>}
            </div>
        </div>
    );
}

export function StatusBadge({
    status,
    ar,
}: {
    status: string;
    ar: boolean;
}) {
    const labels: Record<string, [string, string]> = {
        draft: ['مسودة', 'Draft'],
        issued: ['غير مدفوعة', 'Issued'],
        partially_paid: ['مدفوعة جزئياً', 'Partially paid'],
        paid: ['مدفوعة', 'Paid'],
        overpaid: ['مدفوعة بزيادة', 'Overpaid'],
        superseded: ['مصححة', 'Superseded'],
        voided: ['ملغاة', 'Voided'],
        posted: ['مؤكدة', 'Posted'],
        reversed: ['معكوسة', 'Reversed'],
        open: ['مفتوحة', 'Open'],
        partial: ['جزئية', 'Partial'],
        pending: ['قيد التحصيل', 'Pending'],
        cleared: ['محصل', 'Cleared'],
        bounced: ['مرتجع', 'Bounced'],
        cancelled: ['ملغي', 'Cancelled'],
    };

    const tone =
        ['paid', 'posted', 'cleared'].includes(status)
            ? 'bg-emerald-50 text-emerald-700'
            : ['partially_paid', 'partial', 'pending', 'draft'].includes(status)
              ? 'bg-amber-50 text-amber-700'
              : ['voided', 'reversed', 'bounced', 'cancelled'].includes(status)
                ? 'bg-red-50 text-red-600'
                : ['overpaid'].includes(status)
                  ? 'bg-violet-50 text-violet-700'
                  : 'bg-blue-50 text-blue-700';

    return (
        <span className={'inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ' + tone}>
            {labels[status]?.[ar ? 0 : 1] ?? status}
        </span>
    );
}

export function Money({
    value,
    currency,
    compact = false,
}: {
    value: string | number;
    currency?: string | null;
    compact?: boolean;
}) {
    const number = Number(value || 0);
    const configuredDecimals =
        typeof document !== 'undefined'
            ? Number(document.documentElement.dataset.acFinanceDecimals)
            : 2;
    const decimals = Number.isInteger(configuredDecimals)
        ? Math.min(Math.max(configuredDecimals, 1), 10)
        : 2;

    return (
        <bdi className={compact ? 'text-xs' : undefined}>
            {new Intl.NumberFormat(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: decimals,
            }).format(number)}
            {currency ? ' ' + currency : ''}
        </bdi>
    );
}

export function FinanceHeader({
    title,
    subtitle,
    actions,
}: {
    title: string;
    subtitle: string;
    actions?: ReactNode;
}) {
    return (
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-[-0.04em] text-[#0b2d67] sm:text-3xl">
                    {title}
                </h1>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-[#7890b1]">
                    {subtitle}
                </p>
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
    );
}

export function downloadCsv(
    filename: string,
    rows: (string | number | null | undefined)[][],
): void {
    const csv = '\uFEFF' + rows
        .map((row) => row.map((value) => {
            const valueText = String(value ?? '');
            const safe = /^[=+@\-\t\r]/.test(valueText)
                ? "'" + valueText
                : valueText;
            return '"' + safe.replaceAll('"', '""') + '"';
        }).join(','))
        .join('\r\n');

    const url = URL.createObjectURL(
        new Blob([csv], {
            type: 'text/csv;charset=utf-8;',
        }),
    );

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayValue(): string {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
}

export function addDays(value: string, days: number): string {
    const date = new Date(value + 'T12:00:00');
    date.setDate(date.getDate() + days);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

export function apiErrorText(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
        const candidate = error as {
            message?: string;
            errors?: Record<string, string[]>;
        };

        return [
            candidate.message,
            ...Object.values(candidate.errors ?? {}).flat(),
        ].filter(Boolean).join(' ');
    }

    return error instanceof Error
        ? error.message
        : 'Request failed';
}
