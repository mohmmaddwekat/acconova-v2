import type {
    PartyBalanceFilter,
    PartyOverview,
    PartyRole,
} from '@/features/parties/types';
import {
    AlertTriangle,
    ArrowDownLeft,
    ArrowUpRight,
    UsersRound,
    type LucideIcon,
} from 'lucide-react';

export type PartyQuickTab =
    | 'all'
    | 'customer'
    | 'supplier'
    | 'overdue';

type PartyOverviewCardsProps = {
    overview: PartyOverview | null;

    balance: PartyBalanceFilter | undefined;

    ar: boolean;

    onBalanceChange: (
        balance: PartyBalanceFilter | undefined,
    ) => void;
};

type PartyQuickTabsProps = {
    overview: PartyOverview | null;

    active: PartyQuickTab;

    ar: boolean;

    onChange: (
        tab: PartyQuickTab,
    ) => void;
};

/**
 * Resolve which quick tab matches the current role and balance filters.
 */
export function activeQuickTab(
    role: PartyRole | undefined,
    balance: PartyBalanceFilter | undefined,
): PartyQuickTab {
    if (balance === 'overdue') {
        return 'overdue';
    }

    if (role === 'customer' || role === 'supplier') {
        return role;
    }

    return 'all';
}

/**
 * Workspace-wide balance cards. Each money card doubles as a list filter.
 */
export function PartyOverviewCards({
    overview,
    balance,
    ar,
    onBalanceChange,
}: PartyOverviewCardsProps) {
    const format = (value: number): string =>
        Math.round(Math.abs(value)).toLocaleString(ar ? 'ar' : 'en');

    const currency = overview?.currency ?? '';

    const cards: Array<{
        key: PartyBalanceFilter | 'count';
        icon: LucideIcon;
        label: string;
        value: string;
        hint: string;
        tone: string;
    }> = [];

    if (overview?.balances_visible) {
        cards.push(
            {
                key: 'receivable',
                icon: ArrowDownLeft,
                label: ar ? 'لي عند الناس' : 'Owed to me',
                value: `${format(overview.owed_to_us)} ${currency}`,
                hint: ar ? `${overview.counts.receivable} جهة` : `${overview.counts.receivable} parties`,
                tone: 'var(--ac-success)',
            },
            {
                key: 'payable',
                icon: ArrowUpRight,
                label: ar ? 'علي للناس' : 'I owe',
                value: `${format(overview.we_owe)} ${currency}`,
                hint: ar ? `${overview.counts.payable} جهة` : `${overview.counts.payable} parties`,
                tone: 'var(--ac-danger)',
            },
            {
                key: 'overdue',
                icon: AlertTriangle,
                label: ar
                    ? `متأخر أكثر من ${overview.aging_days.late} يوم`
                    : `Overdue ${overview.aging_days.late}+ days`,
                value: `${format(overview.overdue)} ${currency}`,
                hint: ar ? `${overview.counts.overdue} جهة` : `${overview.counts.overdue} parties`,
                tone: 'var(--ac-warning)',
            },
        );
    }

    cards.push({
        key: 'count',
        icon: UsersRound,
        label: ar ? 'عدد الجهات' : 'Parties',
        value: overview ? format(overview.counts.all) : '—',
        hint: overview
            ? (ar
                ? `${overview.counts.customers} عميل · ${overview.counts.suppliers} مورد`
                : `${overview.counts.customers} customers · ${overview.counts.suppliers} suppliers`)
            : '',
        tone: 'var(--ac-text)',
    });

    return (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((card) => {
                const Icon = card.icon;
                const interactive = card.key !== 'count';
                const pressed = interactive && balance === card.key;

                const body = (
                    <>
                        <span className="flex items-center gap-1.5 text-xs text-[var(--ac-text-soft)]">
                            <Icon
                                size={14}
                                style={{ color: card.tone }}
                            />
                            {card.label}
                        </span>

                        <bdi
                            className="mt-2 block truncate text-xl font-semibold tabular-nums tracking-[-0.03em] sm:text-2xl"
                            style={{ color: card.tone }}
                        >
                            {overview ? card.value : '—'}
                        </bdi>

                        <span className="mt-1 block truncate text-[11px] text-[var(--ac-text-muted)]">
                            {card.hint}
                            {interactive && (ar ? ' · اضغط للفلترة' : ' · click to filter')}
                        </span>
                    </>
                );

                const className = [
                    'min-w-0 rounded-[18px] border bg-[var(--ac-surface)] p-4 text-start transition',
                    pressed
                        ? 'border-[var(--ac-accent)] ring-4 ring-[var(--ac-accent-soft)]'
                        : 'border-[var(--ac-line)]',
                    interactive ? 'hover:border-[var(--ac-line-strong)]' : '',
                ].join(' ');

                return interactive ? (
                    <button
                        key={card.key}
                        type="button"
                        aria-pressed={pressed}
                        onClick={() =>
                            onBalanceChange(
                                pressed ? undefined : (card.key as PartyBalanceFilter),
                            )
                        }
                        className={className}
                    >
                        {body}
                    </button>
                ) : (
                    <div
                        key={card.key}
                        className={className}
                    >
                        {body}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Role and overdue tabs shown above the Party list.
 */
export function PartyQuickTabs({
    overview,
    active,
    ar,
    onChange,
}: PartyQuickTabsProps) {
    const tabs: Array<{
        key: PartyQuickTab;
        label: string;
        count: number | undefined;
    }> = [
        { key: 'all', label: ar ? 'الكل' : 'All', count: overview?.counts.all },
        { key: 'customer', label: ar ? 'عملاء' : 'Customers', count: overview?.counts.customers },
        { key: 'supplier', label: ar ? 'موردين' : 'Suppliers', count: overview?.counts.suppliers },
    ];

    if (overview?.balances_visible) {
        tabs.push({ key: 'overdue', label: ar ? 'متأخر' : 'Overdue', count: overview.counts.overdue });
    }

    return (
        <div
            className="flex flex-wrap gap-1.5"
            role="tablist"
            aria-label={ar ? 'تصفية سريعة' : 'Quick filters'}
        >
            {tabs.map((tab) => {
                const selected = active === tab.key;
                const late = tab.key === 'overdue';

                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(tab.key)}
                        className={[
                            'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition',
                            selected && late
                                ? 'border-transparent bg-[var(--ac-danger)] text-white'
                                : selected
                                    ? 'border-transparent bg-[var(--ac-text)] text-[var(--ac-surface)]'
                                    : late
                                        ? 'border-[var(--ac-danger)]/40 text-[var(--ac-danger)] hover:bg-[var(--ac-danger)]/8'
                                        : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
                        ].join(' ')}
                    >
                        {tab.label}

                        {tab.count !== undefined && (
                            <span className="tabular-nums opacity-70">
                                {tab.count.toLocaleString(ar ? 'ar' : 'en')}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
