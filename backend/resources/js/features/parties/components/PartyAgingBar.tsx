import type {
    PartyAging,
} from '@/features/parties/types';

type PartyAgingBarProps = {
    aging: PartyAging | null | undefined;

    currency: string;

    ar: boolean;
};

const buckets = [
    {
        key: 'current',
        color: 'var(--ac-success)',
        labelAr: 'أقل من 30 يوم',
        labelEn: 'Under 30 days',
    },
    {
        key: 'days_31_60',
        color: 'var(--ac-warning)',
        labelAr: '30–60 يوم',
        labelEn: '30–60 days',
    },
    {
        key: 'over_60',
        color: 'var(--ac-danger)',
        labelAr: 'أكثر من 60 يوم',
        labelEn: 'Over 60 days',
    },
] as const;

/**
 * Show how old an open balance is as one stacked bar with a short status line.
 */
export function PartyAgingBar({
    aging,
    currency,
    ar,
}: PartyAgingBarProps) {
    const total = aging
        ? aging.current + aging.days_31_60 + aging.over_60
        : 0;

    if (! aging || total <= 0) {
        return (
            <span className="text-xs text-[var(--ac-text-muted)]">—</span>
        );
    }

    const format = (value: number): string =>
        Math.round(value).toLocaleString(ar ? 'ar' : 'en');

    const status = aging.over_60 > 0
        ? (ar ? 'متأخر' : 'Overdue')
        : aging.days_31_60 > 0
            ? (ar ? 'يقترب' : 'Due soon')
            : (ar ? 'جديد' : 'Recent');

    const title = buckets
        .filter((bucket) => aging[bucket.key] > 0)
        .map((bucket) => `${ar ? bucket.labelAr : bucket.labelEn}: ${format(aging[bucket.key])} ${currency}`)
        .join('\n');

    return (
        <div
            className="min-w-0 max-w-[150px]"
            title={title}
        >
            <div
                className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-[var(--ac-line)]"
                role="img"
                aria-label={title}
            >
                {buckets.map((bucket) =>
                    aging[bucket.key] > 0 ? (
                        <span
                            key={bucket.key}
                            style={{
                                flexGrow: aging[bucket.key],
                                background: bucket.color,
                                opacity: 0.75,
                            }}
                        />
                    ) : null,
                )}
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-[var(--ac-text-muted)]">
                <span
                    className={aging.over_60 > 0 ? 'font-semibold text-[var(--ac-danger)]' : ''}
                >
                    {status}
                </span>

                <span className="tabular-nums">
                    {ar
                        ? `${aging.oldest_days} يوم`
                        : `${aging.oldest_days}d`}
                </span>
            </div>
        </div>
    );
}

/**
 * Explain the three aging colours under the Party list.
 */
export function PartyAgingLegend({
    ar,
}: {
    ar: boolean;
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ac-text-muted)]">
            {buckets.map((bucket) => (
                <span
                    key={bucket.key}
                    className="inline-flex items-center gap-1.5"
                >
                    <span
                        className="size-2 rounded-full"
                        style={{ background: bucket.color }}
                    />
                    {ar ? bucket.labelAr : bucket.labelEn}
                </span>
            ))}
        </div>
    );
}
