import { apiRequest } from '@/lib/http';
import { Link } from '@inertiajs/react';
import {
    AlertTriangle,
    Crown,
    Gem,
    HeartPulse,
    TrendingUp,
    UsersRound,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

export type CustomerIntelligenceRow = {
    party_id: number;
    name: string;
    segments: string[];
    invoice_count: number;
    revenue: string;
    outstanding: string;
    overdue_balance: string;
    overdue_count: number;
    last_sale_date: string | null;
    days_since_sale: number | null;
    estimated_cost: string;
    gross_profit_estimate: string;
    margin_estimate_percent: string;
};

type CustomerIntelligence = {
    summary: {
        vip: number;
        active: number;
        at_risk: number;
        inactive: number;
        overdue: number;
        high_profitability: number;
        total_customers: number;
        vip_revenue_threshold: string;
    };
    customers: CustomerIntelligenceRow[];
    methodology: Record<string, string>;
};

const segmentMeta: Record<
    string,
    {
        ar: string;
        en: string;
        className: string;
    }
> = {
    vip: {
        ar: 'VIP',
        en: 'VIP',
        className:
            'bg-violet-100 text-violet-700',
    },
    active: {
        ar: 'نشط',
        en: 'Active',
        className:
            'bg-emerald-100 text-emerald-700',
    },
    at_risk: {
        ar: 'معرض للفقد',
        en: 'At risk',
        className:
            'bg-amber-100 text-amber-800',
    },
    inactive: {
        ar: 'غير نشط',
        en: 'Inactive',
        className:
            'bg-slate-100 text-slate-600',
    },
    overdue: {
        ar: 'متأخر بالدفع',
        en: 'Overdue',
        className:
            'bg-red-100 text-red-700',
    },
    high_profitability: {
        ar: 'عالي الربحية',
        en: 'High profitability',
        className:
            'bg-sky-100 text-sky-700',
    },
};

function money(
    value: string,
    currency: string,
): string {
    return Number(value).toLocaleString(
        undefined,
        {
            maximumFractionDigits: 2,
        },
    ) + (
        currency
            ? ' ' + currency
            : ''
    );
}

export function CustomerSegmentsPanel({
    ar,
    currency = '',
    full = false,
}: {
    ar: boolean;
    currency?: string;
    full?: boolean;
}) {
    const [
        data,
        setData,
    ] = useState<CustomerIntelligence | null>(
        null,
    );
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        error,
        setError,
    ] = useState('');

    useEffect(() => {
        const controller =
            new AbortController();

        setLoading(true);
        setError('');

        apiRequest<{
            data: CustomerIntelligence;
        }>(
            '/api/customer-intelligence',
            {
                signal:
                    controller.signal,
            },
        )
            .then(
                response =>
                    setData(
                        response.data,
                    ),
            )
            .catch(() => {
                if (
                    ! controller
                        .signal
                        .aborted
                ) {
                    setError(
                        ar
                            ? 'تعذر تحميل تقسيم العملاء.'
                            : 'Customer segmentation could not be loaded.',
                    );
                }
            })
            .finally(() => {
                if (
                    ! controller
                        .signal
                        .aborted
                ) {
                    setLoading(false);
                }
            });

        return () =>
            controller.abort();
    }, [
        ar,
    ]);

    const priorityRows =
        useMemo(
            () =>
                data?.customers
                    .filter(
                        row =>
                            row.segments.includes(
                                'overdue',
                            )
                            || row.segments.includes(
                                'at_risk',
                            ),
                    )
                    .slice(
                        0,
                        full
                            ? 100
                            : 6,
                    )
                ?? [],
            [
                data,
                full,
            ],
        );

    if (loading) {
        return (
            <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map(
                    item => (
                        <div
                            key={
                                item
                            }
                            className="h-24 animate-pulse rounded-[18px] bg-[var(--ac-surface-soft)]"
                        />
                    ),
                )}
            </section>
        );
    }

    if (
        error
        || ! data
    ) {
        return (
            <div className="mt-5 rounded-[16px] border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                {
                    error
                }
            </div>
        );
    }

    const cards = [
        {
            label:
                ar
                    ? 'عملاء VIP'
                    : 'VIP customers',
            value:
                data.summary.vip,
            icon:
                Crown,
        },
        {
            label:
                ar
                    ? 'نشطون'
                    : 'Active',
            value:
                data.summary.active,
            icon:
                HeartPulse,
        },
        {
            label:
                ar
                    ? 'معرضون للفقد'
                    : 'At risk',
            value:
                data.summary.at_risk,
            icon:
                AlertTriangle,
        },
        {
            label:
                ar
                    ? 'عالي الربحية'
                    : 'High profitability',
            value:
                data.summary
                    .high_profitability,
            icon:
                Gem,
        },
        {
            label:
                ar
                    ? 'متأخرون بالدفع'
                    : 'Overdue',
            value:
                data.summary.overdue,
            icon:
                TrendingUp,
        },
    ];

    return (
        <section className="mt-5 rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                        <UsersRound
                            size={
                                17
                            }
                        />
                    </div>

                    <div>
                        <h2 className="text-sm font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'تقسيم العملاء الذكي'
                                : 'Smart customer segmentation'}
                        </h2>

                        <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'تقسيم تلقائي مبني على نشاط آخر 12 شهراً، التأخر بالدفع، وتقدير الربحية. يمكن أن ينتمي العميل لأكثر من فئة.'
                                : 'Automatic rule-based segmentation using trailing-12-month activity, overdue balances and estimated profitability. A customer can belong to multiple segments.'}
                        </p>
                    </div>
                </div>

                {! full && (
                    <Link
                        href="/app/parties/intelligence"
                        className="rounded-[11px] border border-[var(--ac-line)] px-3 py-2 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                    >
                        {ar
                            ? 'فتح التفاصيل'
                            : 'Open details'}
                    </Link>
                )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {cards.map(
                    card => {
                        const Icon =
                            card.icon;

                        return (
                            <div
                                key={
                                    card.label
                                }
                                className="rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                        {
                                            card.label
                                        }
                                    </span>

                                    <Icon
                                        size={
                                            13
                                        }
                                        className="text-[var(--ac-accent)]"
                                    />
                                </div>

                                <strong className="mt-2 block text-xl text-[var(--ac-text)]">
                                    {
                                        card.value
                                    }
                                </strong>
                            </div>
                        );
                    },
                )}
            </div>

            <div className="mt-4 overflow-hidden rounded-[16px] border border-[var(--ac-line)]">
                <div className="flex items-center justify-between bg-[var(--ac-surface-soft)] px-4 py-3">
                    <strong className="text-xs text-[var(--ac-text)]">
                        {ar
                            ? 'العملاء الذين يحتاجون انتباهاً'
                            : 'Customers needing attention'}
                    </strong>

                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                        {data.summary.total_customers}
                        {' '}
                        {ar
                            ? 'عميل'
                            : 'customers'}
                    </span>
                </div>

                {priorityRows.length ===
                0 ? (
                    <p className="p-6 text-center text-xs text-[var(--ac-text-muted)]">
                        {ar
                            ? 'لا توجد إشارات متابعة حالياً.'
                            : 'No follow-up signals right now.'}
                    </p>
                ) : (
                    <div className="divide-y divide-[var(--ac-line)]">
                        {priorityRows.map(
                            row => (
                                <Link
                                    key={
                                        row.party_id
                                    }
                                    href={
                                        '/app/parties?focus='
                                        + String(
                                            row.party_id,
                                        )
                                    }
                                    className="grid gap-3 px-4 py-3 transition hover:bg-[var(--ac-surface-soft)] md:grid-cols-[minmax(0,1fr)_auto_auto]"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-[var(--ac-text)]">
                                            {
                                                row.name
                                            }
                                        </p>

                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {row.segments.map(
                                                segment => {
                                                    const meta =
                                                        segmentMeta[
                                                            segment
                                                        ];

                                                    return meta ? (
                                                        <span
                                                            key={
                                                                segment
                                                            }
                                                            className={
                                                                'rounded-full px-2 py-0.5 text-[8px] font-semibold '
                                                                + meta.className
                                                            }
                                                        >
                                                            {ar
                                                                ? meta.ar
                                                                : meta.en}
                                                        </span>
                                                    ) : null;
                                                },
                                            )}
                                        </div>
                                    </div>

                                    <div className="text-start md:text-end">
                                        <p className="text-[9px] text-[var(--ac-text-muted)]">
                                            {ar
                                                ? 'المبيعات'
                                                : 'Revenue'}
                                        </p>
                                        <strong className="text-[11px] text-[var(--ac-text)]">
                                            {money(
                                                row.revenue,
                                                currency,
                                            )}
                                        </strong>
                                    </div>

                                    <div className="text-start md:text-end">
                                        <p className="text-[9px] text-[var(--ac-text-muted)]">
                                            {ar
                                                ? 'ربح تقديري'
                                                : 'Est. profit'}
                                        </p>
                                        <strong className="text-[11px] text-[var(--ac-accent)]">
                                            {money(
                                                row.gross_profit_estimate,
                                                currency,
                                            )}
                                        </strong>
                                    </div>
                                </Link>
                            ),
                        )}
                    </div>
                )}
            </div>

            {full && (
                <p className="mt-3 text-[9px] leading-5 text-[var(--ac-text-muted)]">
                    {ar
                        ? 'الربحية تقديرية لأنها تستخدم التكلفة الحالية للمنتج، وليست Cost Snapshot تاريخية لكل فاتورة.'
                        : 'Profitability is estimated using current product cost, not a historical cost snapshot per invoice.'}
                </p>
            )}
        </section>
    );
}
