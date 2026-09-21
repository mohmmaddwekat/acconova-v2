import { apiRequest } from '@/lib/http';
import { Link } from '@inertiajs/react';
import {
    Boxes,
    Clock3,
    PackageSearch,
    ShoppingCart,
    TrendingDown,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type InventoryIntelligenceRow = {
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
    daily_demand: string;
    reorder_quantity: string;
    stockout_days: number | null;
    last_outbound_at: string | null;
    last_movement_at: string | null;
    first_inbound_at: string | null;
    dead_stock_days: number | null;
    dead_stock_bucket: 'none' | 'unknown' | 'active' | '30-59' | '60-89' | '90+';
    inventory_age_days: number | null;
};

type InventoryIntelligence = {
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
    dead_stock: InventoryIntelligenceRow[];
    reorder_suggestions: InventoryIntelligenceRow[];
    stockout_forecast: InventoryIntelligenceRow[];
    aging: InventoryIntelligenceRow[];
};

type View =
    | 'dead'
    | 'reorder'
    | 'stockout'
    | 'aging';

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

function quantity(
    value: string,
): string {
    return Number(value).toLocaleString(
        undefined,
        {
            maximumFractionDigits: 4,
        },
    );
}

export function InventoryIntelligencePanel({
    ar,
    currency = '',
}: {
    ar: boolean;
    currency?: string;
}) {
    const [
        data,
        setData,
    ] = useState<InventoryIntelligence | null>(
        null,
    );
    const [
        view,
        setView,
    ] = useState<View>(
        'dead',
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
            data: InventoryIntelligence;
        }>(
            '/api/inventory/intelligence',
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
                            ? 'تعذر تحميل ذكاء المخزون.'
                            : 'Inventory intelligence could not be loaded.',
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

    const rows =
        useMemo(
            () => {
                if (! data) {
                    return [];
                }

                return {
                    dead:
                        data.dead_stock,
                    reorder:
                        data.reorder_suggestions,
                    stockout:
                        data.stockout_forecast,
                    aging:
                        data.aging,
                }[view];
            },
            [
                data,
                view,
            ],
        );

    if (loading) {
        return (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            </div>
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
            key:
                'dead',
            label:
                ar
                    ? 'مخزون راكد'
                    : 'Dead stock',
            value:
                data.summary
                    .dead_stock_products,
            detail:
                money(
                    data.summary
                        .dead_stock_capital,
                    currency,
                ),
            icon:
                PackageSearch,
        },
        {
            key:
                'reorder',
            label:
                ar
                    ? 'اقتراحات إعادة الطلب'
                    : 'Reorder suggestions',
            value:
                data.summary
                    .reorder_products,
            detail:
                ar
                    ? 'حسب معدل الطلب'
                    : 'Based on demand rate',
            icon:
                ShoppingCart,
        },
        {
            key:
                'stockout',
            label:
                ar
                    ? 'قد ينفد خلال 30 يوم'
                    : 'Stockout ≤ 30 days',
            value:
                data.summary
                    .stockout_30_days,
            detail:
                ar
                    ? 'توقع تشغيلي'
                    : 'Operational forecast',
            icon:
                TrendingDown,
        },
        {
            key:
                'aging',
            label:
                ar
                    ? 'تقادم المخزون'
                    : 'Inventory aging',
            value:
                data.aging.length,
            detail:
                ar
                    ? 'منتجات برصيد قائم'
                    : 'Products with stock',
            icon:
                Clock3,
        },
    ];

    return (
        <section className="mt-5 rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                        <Boxes
                            size={
                                17
                            }
                        />
                    </div>

                    <div>
                        <h2 className="text-sm font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'ذكاء المخزون'
                                : 'Inventory intelligence'}
                        </h2>

                        <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'يكشف المخزون الراكد، يقترح إعادة الطلب، ويتوقع النفاد اعتماداً على حركة البيع الحالية.'
                                : 'Detects dead stock, recommends replenishment and forecasts stockout from current sales velocity.'}
                        </p>
                    </div>
                </div>

                <Link
                    href="/app/inventory/transfers"
                    className="rounded-[11px] border border-[var(--ac-line)] px-3 py-2 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                >
                    {ar
                        ? 'تحويلات المستودعات'
                        : 'Warehouse transfers'}
                </Link>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map(
                    card => {
                        const Icon =
                            card.icon;

                        return (
                            <button
                                type="button"
                                key={
                                    card.key
                                }
                                onClick={() =>
                                    setView(
                                        card.key as View,
                                    )
                                }
                                className={[
                                    'rounded-[15px] border p-3 text-start transition',
                                    view ===
                                    card.key
                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                        : 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)] hover:border-[var(--ac-line-strong)]',
                                ].join(
                                    ' ',
                                )}
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

                                <span className="mt-1 block text-[9px] text-[var(--ac-text-muted)]">
                                    {
                                        card.detail
                                    }
                                </span>
                            </button>
                        );
                    },
                )}
            </div>

            <div className="mt-4 overflow-hidden rounded-[16px] border border-[var(--ac-line)]">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--ac-surface-soft)] px-4 py-3">
                    <strong className="text-xs text-[var(--ac-text)]">
                        {view ===
                        'dead'
                            ? (
                                ar
                                    ? 'المخزون الراكد'
                                    : 'Dead stock'
                            )
                            : view ===
                                'reorder'
                                ? (
                                    ar
                                        ? 'إعادة الطلب المقترحة'
                                        : 'Suggested replenishment'
                                )
                                : view ===
                                    'stockout'
                                    ? (
                                        ar
                                            ? 'توقع النفاد'
                                            : 'Stockout forecast'
                                    )
                                    : (
                                        ar
                                            ? 'تقادم المخزون'
                                            : 'Inventory aging'
                                    )}
                    </strong>

                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                        {ar
                            ? 'Lead time '
                            : 'Lead time '}
                        {
                            data.settings
                                .lead_days
                        }
                        {ar
                            ? ' يوم · Safety '
                            : ' days · Safety '}
                        {
                            data.settings
                                .safety_days
                        }
                        {ar
                            ? ' يوم'
                            : ' days'}
                    </span>
                </div>

                {rows.length ===
                0 ? (
                    <p className="p-7 text-center text-xs text-[var(--ac-text-muted)]">
                        {ar
                            ? 'لا توجد إشارات في هذه الفئة حالياً.'
                            : 'No signals in this category right now.'}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[820px] text-xs">
                            <thead className="text-[9px] uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                <tr>
                                    <th className="px-4 py-3 text-start">
                                        {ar
                                            ? 'المنتج'
                                            : 'Product'}
                                    </th>
                                    <th className="px-4 py-3 text-start">
                                        {ar
                                            ? 'المتاح'
                                            : 'Available'}
                                    </th>
                                    <th className="px-4 py-3 text-start">
                                        {view ===
                                        'reorder'
                                            ? (
                                                ar
                                                    ? 'الكمية المقترحة'
                                                    : 'Suggested qty'
                                            )
                                            : view ===
                                                'stockout'
                                                ? (
                                                    ar
                                                        ? 'أيام حتى النفاد'
                                                        : 'Days to stockout'
                                                )
                                                : view ===
                                                    'aging'
                                                    ? (
                                                        ar
                                                            ? 'العمر التشغيلي'
                                                            : 'Operational age'
                                                    )
                                                    : (
                                                        ar
                                                            ? 'بدون حركة بيع'
                                                            : 'No outbound movement'
                                                    )}
                                    </th>
                                    <th className="px-4 py-3 text-start">
                                        {ar
                                            ? 'رأس المال'
                                            : 'Capital'}
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map(
                                    row => (
                                        <tr
                                            key={
                                                row.product_id
                                            }
                                            className="border-t border-[var(--ac-line)]"
                                        >
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={
                                                        '/app/products?focus='
                                                        + String(
                                                            row.product_id,
                                                        )
                                                    }
                                                    className="font-semibold text-[var(--ac-text)] hover:text-[var(--ac-accent)]"
                                                >
                                                    {
                                                        row.name
                                                    }
                                                </Link>

                                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                    {row.sku
                                                        ?? '—'}
                                                </p>
                                            </td>

                                            <td className="px-4 py-3 font-semibold text-[var(--ac-text-soft)]">
                                                {quantity(
                                                    row.available,
                                                )}
                                                {row.unit
                                                    ? ' '
                                                        + row.unit
                                                    : ''}
                                            </td>

                                            <td className="px-4 py-3">
                                                {view ===
                                                'reorder'
                                                    ? quantity(
                                                        row.reorder_quantity,
                                                    )
                                                    : view ===
                                                        'stockout'
                                                        ? (
                                                            row.stockout_days ===
                                                            null
                                                                ? '—'
                                                                : row.stockout_days.toFixed(
                                                                    1,
                                                                )
                                                                    + (
                                                                        ar
                                                                            ? ' يوم'
                                                                            : ' days'
                                                                    )
                                                        )
                                                        : view ===
                                                            'aging'
                                                            ? (
                                                                row.inventory_age_days ===
                                                                null
                                                                    ? '—'
                                                                    : String(
                                                                        row.inventory_age_days,
                                                                    )
                                                                        + (
                                                                            ar
                                                                                ? ' يوم'
                                                                                : ' days'
                                                                        )
                                                            )
                                                            : (
                                                                row.dead_stock_days ===
                                                                null
                                                                    ? '—'
                                                                    : String(
                                                                        row.dead_stock_days,
                                                                    )
                                                                        + (
                                                                            ar
                                                                                ? ' يوم'
                                                                                : ' days'
                                                                        )
                                                            )}
                                            </td>

                                            <td className="px-4 py-3 font-semibold text-[var(--ac-text)]">
                                                {money(
                                                    row.frozen_capital,
                                                    currency,
                                                )}
                                            </td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="mt-3 text-[9px] leading-5 text-[var(--ac-text-muted)]">
                {ar
                    ? 'ملاحظة: تقادم المخزون تقدير تشغيلي مبني على تاريخ حركات المخزون الحالية، وليس FIFO محاسبي للطبقات.'
                    : 'Note: inventory aging is an operational estimate based on stock movement history, not accounting FIFO layer aging.'}
            </p>
        </section>
    );
}
