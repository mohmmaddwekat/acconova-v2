import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowLeftRight,
    Boxes,
    CalendarClock,
    PackageSearch,
    RefreshCw,
    TrendingDown,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type InventorySignal = {
    product_id: number;
    name: string;
    sku: string | null;
    unit: string | null;
    on_hand: string;
    reserved: string;
    available: string;
    cost_price: string | null;
    frozen_capital: string;
    sales_30_days: string;
    sales_90_days: string;
    production_consumption_30_days: string;
    production_consumption_90_days: string;
    demand_30_days: string;
    demand_90_days: string;
    daily_demand: string;
    reorder_quantity: string;
    stockout_days: number | null;
    last_outbound_at: string | null;
    last_movement_at: string | null;
    first_inbound_at: string | null;
    dead_stock_days: number | null;
    dead_stock_bucket: string;
    inventory_age_days: number | null;
};

type IntelligenceResponse = {
    settings: {
        lead_days: number;
        safety_days: number;
    };
    summary: {
        dead_stock_products: number;
        dead_stock_capital: string;
        reorder_products: number;
        stockout_30_days: number;
    };
    dead_stock: InventorySignal[];
    reorder_suggestions: InventorySignal[];
    stockout_forecast: InventorySignal[];
    aging: InventorySignal[];
};

type Tab =
    | 'reorder'
    | 'stockout'
    | 'dead'
    | 'aging';

export default function InventoryIntelligence() {
    const ar = useLocale() === 'ar';
    const { workspace } =
        usePage<AppPageProps>().props;
    const currency =
        workspace.activeOrganization?.currency
        ?? '';

    const [data, setData] =
        useState<IntelligenceResponse | null>(
            null,
        );
    const [loading, setLoading] =
        useState(true);
    const [error, setError] =
        useState('');
    const [tab, setTab] =
        useState<Tab>('reorder');

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: IntelligenceResponse;
                }>(
                    '/api/inventory/intelligence',
                );

            setData(response.data);
        } catch {
            setError(
                ar
                    ? 'تعذر تحميل ذكاء المخزون.'
                    : 'Inventory intelligence could not be loaded.',
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [ar]);

    const rows = useMemo(
        () =>
            tab === 'reorder'
                ? data?.reorder_suggestions ?? []
                : tab === 'stockout'
                    ? data?.stockout_forecast ?? []
                    : tab === 'dead'
                        ? data?.dead_stock ?? []
                        : data?.aging ?? [],
        [data, tab],
    );

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar ? arabic : english;

    const money = (value: string): string =>
        Number(value).toLocaleString(
            undefined,
            {
                maximumFractionDigits: 2,
            },
        )
        + (
            currency
                ? ' ' + currency
                : ''
        );

    return (
        <AppShell>
            <Head
                title={
                    text(
                        'ذكاء المخزون — AccoNova',
                        'Inventory Intelligence — AccoNova',
                    )
                }
            />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ac-accent)]">
                            {text(
                                'Inventory Intelligence',
                                'Inventory Intelligence',
                            )}
                        </p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[var(--ac-text)]">
                            {text(
                                'قرارات مخزون قبل ما تصير المشكلة',
                                'See inventory problems before they happen',
                            )}
                        </h1>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                            {text(
                                'كشف المخزون الراكد، اقتراحات إعادة الطلب، توقع النفاد وعمر المخزون بالاعتماد على حركة البيع الفعلية.',
                                'Dead stock, reorder suggestions, stockout forecasting and inventory aging based on real sales movement.',
                            )}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/app/inventory/transfers"
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                        >
                            <ArrowLeftRight size={14} />
                            {text(
                                'طلبات النقل',
                                'Transfer requests',
                            )}
                        </Link>

                        <button
                            type="button"
                            onClick={() => void load()}
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                        >
                            <RefreshCw
                                size={14}
                                className={
                                    loading
                                        ? 'animate-spin'
                                        : ''
                                }
                            />
                            {text(
                                'تحديث',
                                'Refresh',
                            )}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mt-5 rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {data && (
                    <>
                        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                                {
                                    label: text(
                                        'يحتاج إعادة طلب',
                                        'Need reorder',
                                    ),
                                    value:
                                        data.summary
                                            .reorder_products,
                                    icon: PackageSearch,
                                    hint: text(
                                        `مهلة ${data.settings.lead_days} يوم + أمان ${data.settings.safety_days} يوم`,
                                        `${data.settings.lead_days}d lead + ${data.settings.safety_days}d safety`,
                                    ),
                                },
                                {
                                    label: text(
                                        'خطر نفاد خلال 30 يوم',
                                        'Stockout within 30 days',
                                    ),
                                    value:
                                        data.summary
                                            .stockout_30_days,
                                    icon: TrendingDown,
                                    hint: text(
                                        'مرتبة حسب أقرب نفاد',
                                        'Sorted by nearest stockout',
                                    ),
                                },
                                {
                                    label: text(
                                        'مخزون راكد 30+ يوم',
                                        'Dead stock 30+ days',
                                    ),
                                    value:
                                        data.summary
                                            .dead_stock_products,
                                    icon: AlertTriangle,
                                    hint: money(
                                        data.summary
                                            .dead_stock_capital,
                                    ),
                                },
                                {
                                    label: text(
                                        'تحليل عمر المخزون',
                                        'Inventory aging',
                                    ),
                                    value:
                                        data.aging.length,
                                    icon: CalendarClock,
                                    hint: text(
                                        'أقدم رصيد متوفر أولاً',
                                        'Oldest available stock first',
                                    ),
                                },
                            ].map((card) => {
                                const Icon =
                                    card.icon;

                                return (
                                    <article
                                        key={card.label}
                                        className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                                <Icon size={15} />
                                            </div>
                                            <span className="text-2xl font-bold text-[var(--ac-text)]">
                                                {card.value}
                                            </span>
                                        </div>
                                        <p className="mt-4 text-xs font-semibold text-[var(--ac-text)]">
                                            {card.label}
                                        </p>
                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {card.hint}
                                        </p>
                                    </article>
                                );
                            })}
                        </section>

                        <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
                            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ac-line)] p-3 sm:p-4">
                                {([
                                    [
                                        'reorder',
                                        text(
                                            'إعادة الطلب',
                                            'Reorder',
                                        ),
                                        PackageSearch,
                                    ],
                                    [
                                        'stockout',
                                        text(
                                            'توقع النفاد',
                                            'Stockout',
                                        ),
                                        TrendingDown,
                                    ],
                                    [
                                        'dead',
                                        text(
                                            'المخزون الراكد',
                                            'Dead stock',
                                        ),
                                        AlertTriangle,
                                    ],
                                    [
                                        'aging',
                                        text(
                                            'عمر المخزون',
                                            'Aging',
                                        ),
                                        CalendarClock,
                                    ],
                                ] as const).map(
                                    (
                                        [
                                            key,
                                            label,
                                            Icon,
                                        ],
                                    ) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() =>
                                                setTab(
                                                    key,
                                                )
                                            }
                                            className={[
                                                'inline-flex h-9 items-center gap-2 rounded-[11px] border px-3 text-[10px] font-semibold transition',
                                                tab === key
                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                    : 'border-[var(--ac-line)] text-[var(--ac-text-muted)] hover:text-[var(--ac-text)]',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            <Icon
                                                size={12}
                                            />
                                            {label}
                                        </button>
                                    ),
                                )}
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1050px] text-xs">
                                    <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                        <tr>
                                            {[
                                                text(
                                                    'المنتج',
                                                    'Product',
                                                ),
                                                text(
                                                    'المتاح',
                                                    'Available',
                                                ),
                                                text(
                                                    'طلب 30 يوم',
                                                    '30d demand',
                                                ),
                                                text(
                                                    'طلب يومي',
                                                    'Daily demand',
                                                ),
                                                text(
                                                    'إعادة الطلب',
                                                    'Reorder qty',
                                                ),
                                                text(
                                                    'أيام للنفاد',
                                                    'Days to stockout',
                                                ),
                                                text(
                                                    'أيام بلا حركة',
                                                    'Idle days',
                                                ),
                                                text(
                                                    'رأس مال مجمد',
                                                    'Frozen capital',
                                                ),
                                            ].map(
                                                label => (
                                                    <th
                                                        key={label}
                                                        className="px-4 py-3 text-start font-semibold"
                                                    >
                                                        {label}
                                                    </th>
                                                ),
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={
                                                        8
                                                    }
                                                    className="px-4 py-12 text-center text-sm text-[var(--ac-text-muted)]"
                                                >
                                                    {text(
                                                        'لا توجد إشارات ضمن هذه الفئة.',
                                                        'No signals in this category.',
                                                    )}
                                                </td>
                                            </tr>
                                        ) : rows.map(
                                            row => (
                                                <tr
                                                    key={
                                                        row.product_id
                                                    }
                                                    className="border-t border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex size-8 items-center justify-center rounded-[10px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                                                <Boxes
                                                                    size={
                                                                        13
                                                                    }
                                                                />
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-[var(--ac-text)]">
                                                                    {
                                                                        row.name
                                                                    }
                                                                </p>
                                                                <p className="text-[9px] text-[var(--ac-text-muted)]">
                                                                    {
                                                                        row.sku
                                                                        ?? '—'
                                                                    }
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold">
                                                        {Number(
                                                            row.available,
                                                        ).toLocaleString()}
                                                        {' '}
                                                        {row.unit
                                                            ?? ''}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {Number(
                                                            row.demand_30_days,
                                                        ).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {Number(
                                                            row.daily_demand,
                                                        ).toLocaleString(
                                                            undefined,
                                                            {
                                                                maximumFractionDigits:
                                                                    2,
                                                            },
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold text-[var(--ac-accent)]">
                                                        {Number(
                                                            row.reorder_quantity,
                                                        ).toLocaleString(
                                                            undefined,
                                                            {
                                                                maximumFractionDigits:
                                                                    2,
                                                            },
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {row.stockout_days ===
                                                        null
                                                            ? '—'
                                                            : row.stockout_days.toFixed(
                                                                1,
                                                            )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {row.dead_stock_days
                                                            ?? '—'}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {money(
                                                            row.frozen_capital,
                                                        )}
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </main>
        </AppShell>
    );
}
