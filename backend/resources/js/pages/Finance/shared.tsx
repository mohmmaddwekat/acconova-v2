import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export const financePanel =
    'rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]';

export const financeInput =
    'w-full rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 py-2.5 text-sm text-[var(--ac-text)] outline-none transition placeholder:text-[var(--ac-text-faint)] hover:border-[var(--ac-line-strong)] focus:border-[var(--ac-accent)] focus:bg-[var(--ac-surface)] focus:ring-4 focus:ring-[var(--ac-accent)]/10 disabled:bg-[var(--ac-surface-soft)] disabled:text-[var(--ac-text-muted)]';

export const financeButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[var(--ac-line)] bg-transparent px-4 text-xs font-semibold text-[var(--ac-accent)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45';

export const financePrimary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[var(--ac-accent)] bg-[var(--ac-accent)] px-4 text-xs font-semibold text-white shadow-[var(--ac-shadow-soft)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45';

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
                <header className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] px-4 py-3.5">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--ac-text)]">
                        {Icon && <Icon size={17} className="text-[var(--ac-accent)]" />}
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
        blue: 'border border-blue-500/15 bg-blue-500/10 text-blue-500',
        green: 'border border-emerald-500/15 bg-emerald-500/10 text-emerald-500',
        amber: 'border border-amber-500/15 bg-amber-500/10 text-amber-500',
        red: 'border border-red-500/15 bg-red-500/10 text-red-500',
        violet: 'border border-violet-500/15 bg-violet-500/10 text-violet-500',
    }[tone];

    return (
        <div className={financePanel + ' flex items-center gap-4 p-4'}>
            <span className={'flex size-11 shrink-0 items-center justify-center rounded-[13px] ' + toneClass}>
                <Icon size={21} />
            </span>
            <div className="min-w-0">
                <p className="text-[10px] font-medium text-[var(--ac-text-muted)]">{label}</p>
                <strong className="mt-1 block truncate text-xl text-[var(--ac-text)]">{value}</strong>
                {hint && <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">{hint}</p>}
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
            ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
            : ['partially_paid', 'partial', 'pending', 'draft'].includes(status)
              ? 'border border-amber-500/20 bg-amber-500/10 text-amber-500'
              : ['voided', 'reversed', 'bounced', 'cancelled'].includes(status)
                ? 'border border-red-500/20 bg-red-500/10 text-red-500'
                : ['overpaid'].includes(status)
                  ? 'border border-violet-500/20 bg-violet-500/10 text-violet-500'
                  : 'border border-blue-500/20 bg-blue-500/10 text-blue-500';

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
                <h1 className="text-2xl font-bold tracking-[-0.04em] text-[var(--ac-text)] sm:text-3xl">
                    {title}
                </h1>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ac-text-muted)]">
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
