import { apiRequest } from '@/lib/http';
import {
    AlertTriangle,
    CalendarClock,
    ClipboardList,
    ContactRound,
    PackageSearch,
    ReceiptText,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';
import { Link } from '@inertiajs/react';

type Brief = {
    overdue_sales: number;
    overdue_purchases: number;
    low_stock: number;
    overdue_tasks: number;
    due_payments: number;
    inactive_customers: number;
    generated_at: string;
};

export function DailyBusinessBrief({
    ar,
}: {
    ar: boolean;
}) {
    const [brief, setBrief] = useState<Brief | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller =
            new AbortController();

        apiRequest<{
            data: Brief;
        }>(
            '/api/business-pulse/brief',
            {
                signal:
                    controller.signal,
            },
        )
            .then((response) =>
                setBrief(
                    response.data,
                ),
            )
            .catch(() =>
                setBrief(
                    null,
                ),
            )
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(
                        false,
                    );
                }
            });

        return () =>
            controller.abort();
    }, []);

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar
            ? arabic
            : english;

    const cards = brief
        ? [
            {
                label:
                    text(
                        'فواتير بيع متأخرة',
                        'Overdue sales invoices',
                    ),
                value:
                    brief.overdue_sales,
                icon:
                    ReceiptText,
                href:
                    '/app/invoices',
                tone:
                    brief.overdue_sales
                        ? 'red'
                        : 'green',
            },
            {
                label:
                    text(
                        'مشتريات متأخرة',
                        'Overdue purchases',
                    ),
                value:
                    brief.overdue_purchases,
                icon:
                    CalendarClock,
                href:
                    '/app/invoices/purchases',
                tone:
                    brief.overdue_purchases
                        ? 'amber'
                        : 'green',
            },
            {
                label:
                    text(
                        'مخزون منخفض',
                        'Low stock',
                    ),
                value:
                    brief.low_stock,
                icon:
                    PackageSearch,
                href:
                    '/app/inventory',
                tone:
                    brief.low_stock
                        ? 'amber'
                        : 'green',
            },
            {
                label:
                    text(
                        'مهام متأخرة',
                        'Overdue tasks',
                    ),
                value:
                    brief.overdue_tasks,
                icon:
                    ClipboardList,
                href:
                    '/app/task-management',
                tone:
                    brief.overdue_tasks
                        ? 'red'
                        : 'green',
            },
            {
                label:
                    text(
                        'مدفوعات مستحقة',
                        'Payments due',
                    ),
                value:
                    brief.due_payments,
                icon:
                    CalendarClock,
                href:
                    '/app/payments?view=recurring',
                tone:
                    brief.due_payments
                        ? 'amber'
                        : 'green',
            },
            {
                label:
                    text(
                        'عملاء غير نشطين',
                        'Inactive customers',
                    ),
                value:
                    brief.inactive_customers,
                icon:
                    ContactRound,
                href:
                    '/app/follow-ups',
                tone:
                    brief.inactive_customers
                        ? 'neutral'
                        : 'green',
            },
        ]
        : [];

    return (
        <section
            id="daily-business-brief"
            className="mt-5 rounded-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)] sm:p-6"
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <AlertTriangle
                            size={15}
                            className="text-[var(--ac-accent)]"
                        />

                        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--ac-accent)]">
                            {text(
                                'موجز اليوم',
                                'Daily brief',
                            )}
                        </p>
                    </div>

                    <h2 className="mt-2 text-xl font-bold tracking-[-0.03em] text-[var(--ac-text)]">
                        {text(
                            'ما يحتاج انتباهك الآن',
                            'What needs your attention now',
                        )}
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                        {text(
                            'أرقام حية من الفواتير والمخزون والمهام والمدفوعات والعلاقات.',
                            'Live signals from invoices, inventory, tasks, payments and relationships.',
                        )}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/app/follow-ups"
                        className="rounded-[11px] border border-[var(--ac-line)] px-3 py-2 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                    >
                        {text(
                            'قائمة المتابعة',
                            'Follow-up queue',
                        )}
                    </Link>

                    <Link
                        href="/app/finance/cashflow"
                        className="rounded-[11px] border border-[var(--ac-line)] px-3 py-2 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                    >
                        {text(
                            'التدفق النقدي',
                            'Cashflow',
                        )}
                    </Link>

                    <Link
                        href="/app/finance/anomalies"
                        className="rounded-[11px] border border-[var(--ac-line)] px-3 py-2 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                    >
                        {text(
                            'مركز المراجعة',
                            'Anomaly center',
                        )}
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {[1, 2, 3, 4, 5, 6].map(
                        (item) => (
                            <div
                                key={item}
                                className="h-24 animate-pulse rounded-[16px] bg-[var(--ac-surface-soft)]"
                            />
                        ),
                    )}
                </div>
            ) : brief ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    {cards.map((card) => {
                        const Icon =
                            card.icon;

                        const tone =
                            card.tone === 'red'
                                ? 'bg-red-50 text-red-700'
                                : card.tone === 'amber'
                                    ? 'bg-amber-50 text-amber-700'
                                    : card.tone === 'green'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]';

                        return (
                            <Link
                                key={card.label}
                                href={card.href}
                                className="group rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 transition hover:border-[var(--ac-line-strong)]"
                            >
                                <span
                                    className={[
                                        'flex size-8 items-center justify-center rounded-[10px]',
                                        tone,
                                    ].join(
                                        ' ',
                                    )}
                                >
                                    <Icon
                                        size={
                                            14
                                        }
                                    />
                                </span>

                                <strong className="mt-4 block text-xl text-[var(--ac-text)]">
                                    {
                                        card.value
                                    }
                                </strong>

                                <span className="mt-1 block text-[9px] leading-4 text-[var(--ac-text-muted)]">
                                    {
                                        card.label
                                    }
                                </span>
                            </Link>
                        );
                    })}
                </div>
            ) : (
                <p className="mt-5 rounded-[14px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                    {text(
                        'تعذر تحميل الموجز الآن.',
                        'The daily brief is temporarily unavailable.',
                    )}
                </p>
            )}
        </section>
    );
}
