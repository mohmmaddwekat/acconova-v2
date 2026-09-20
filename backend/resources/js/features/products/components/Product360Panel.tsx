import { apiRequest } from '@/lib/http';
import type { Product } from '@/features/products/types';
import type { AppPageProps } from '@/types/app';
import {
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Boxes,
    ChartNoAxesCombined,
    PackageCheck,
    ShoppingCart,
    UsersRound,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

type Product360Data = {
    sales: {
        quantity: string;
        revenue: string;
        last_price: string | null;
        last_document: string | null;
    };
    purchases: {
        quantity: string;
        spend: string;
        last_price: string | null;
        last_document: string | null;
    };
    profitability: {
        current_cost: string;
        gross_profit_estimate: string;
        margin_estimate_percent: string;
    };
    inventory: {
        on_hand: string;
        reserved: string;
        movement_count: number;
        warehouses: Array<{
            id: number;
            name: string | null;
            on_hand: string;
            reserved: string;
        }>;
        recent_movements: Array<{
            id: number;
            type: string;
            quantity: string;
            balance_after: string;
            warehouse: string | null;
            created_at: string | null;
        }>;
    };
    top_customers: Array<{
        party_id: number;
        name: string | null;
        quantity: string;
        total: string;
    }>;
};

function number(value: string): string {
    return Number(value).toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
}

export function Product360Panel({
    product,
    ar,
}: {
    product: Product;
    ar: boolean;
}) {
    const currency =
        usePage<AppPageProps>().props.workspace.activeOrganization?.currency
        ?? '';
    const [data, setData] = useState<Product360Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError('');

        apiRequest<{ data: Product360Data }>(
            '/api/products/' + String(product.id) + '/360',
            {
                signal: controller.signal,
            },
        )
            .then((response) => setData(response.data))
            .catch(() => {
                if (! controller.signal.aborted) {
                    setError(
                        ar
                            ? 'تعذر تحميل Product 360.'
                            : 'Product 360 could not be loaded.',
                    );
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [
        product.id,
        ar,
    ]);

    if (loading) {
        return (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                    <div
                        key={item}
                        className="h-24 animate-pulse rounded-[16px] bg-[var(--ac-surface-soft)]"
                    />
                ))}
            </div>
        );
    }

    if (error || ! data) {
        return (
            <div className="mt-5 rounded-[16px] border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                {error}
            </div>
        );
    }

    return (
        <section className="mt-5 space-y-4">
            <div className="flex items-center gap-2">
                <ChartNoAxesCombined size={15} className="text-[var(--ac-accent)]" />
                <h3 className="text-sm font-bold text-[var(--ac-text)]">
                    Product 360
                </h3>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                    label={ar ? 'كمية المبيعات' : 'Sold quantity'}
                    value={number(data.sales.quantity)}
                />
                <Metric
                    label={ar ? 'إيراد المبيعات' : 'Sales revenue'}
                    value={number(data.sales.revenue) + (currency ? ' ' + currency : '')}
                />
                <Metric
                    label={ar ? 'كمية المشتريات' : 'Purchased quantity'}
                    value={number(data.purchases.quantity)}
                />
                <Metric
                    label={ar ? 'إجمالي المشتريات' : 'Purchase spend'}
                    value={number(data.purchases.spend) + (currency ? ' ' + currency : '')}
                />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <ShoppingCart size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold">
                            {ar ? 'آخر الأسعار' : 'Latest prices'}
                        </h4>
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                        <DataRow
                            label={ar ? 'آخر سعر بيع' : 'Last sale price'}
                            value={
                                data.sales.last_price
                                    ? number(data.sales.last_price)
                                    : '—'
                            }
                        />
                        <DataRow
                            label={ar ? 'آخر سعر شراء' : 'Last purchase price'}
                            value={
                                data.purchases.last_price
                                    ? number(data.purchases.last_price)
                                    : '—'
                            }
                        />
                        <DataRow
                            label={ar ? 'التكلفة الحالية' : 'Current cost'}
                            value={number(data.profitability.current_cost)}
                        />
                    </div>
                </div>

                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <ChartNoAxesCombined size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold">
                            {ar ? 'الربحية التقديرية' : 'Estimated profitability'}
                        </h4>
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                        <DataRow
                            label={ar ? 'الربح الإجمالي التقديري' : 'Estimated gross profit'}
                            value={
                                number(data.profitability.gross_profit_estimate)
                                + (currency ? ' ' + currency : '')
                            }
                        />
                        <DataRow
                            label={ar ? 'هامش الربح التقديري' : 'Estimated margin'}
                            value={
                                number(data.profitability.margin_estimate_percent)
                                + '%'
                            }
                        />
                    </div>
                    <p className="mt-3 text-[9px] leading-4 text-[var(--ac-text-muted)]">
                        {ar
                            ? 'التقدير يستخدم التكلفة الحالية للمنتج، لذلك هو مؤشر تشغيلي وليس قيداً محاسبياً.'
                            : 'Estimate uses the current product cost, so it is an operational indicator rather than an accounting entry.'}
                    </p>
                </div>

                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <PackageCheck size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold">
                            {ar ? 'المخزون' : 'Inventory'}
                        </h4>
                    </div>
                    <div className="mt-3 space-y-2 text-xs">
                        <DataRow
                            label={ar ? 'المتاح' : 'On hand'}
                            value={number(data.inventory.on_hand)}
                        />
                        <DataRow
                            label={ar ? 'المحجوز' : 'Reserved'}
                            value={number(data.inventory.reserved)}
                        />
                        <DataRow
                            label={ar ? 'عدد الحركات' : 'Movement count'}
                            value={String(data.inventory.movement_count)}
                        />
                    </div>
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <UsersRound size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold">
                            {ar ? 'أفضل العملاء لهذا المنتج' : 'Top customers'}
                        </h4>
                    </div>

                    <div className="mt-3 space-y-2">
                        {data.top_customers.length ? (
                            data.top_customers.map((customer) => (
                                <Link
                                    key={customer.party_id}
                                    href={'/app/parties?focus=' + String(customer.party_id)}
                                    className="flex items-center justify-between rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2 hover:bg-[var(--ac-accent-soft)]"
                                >
                                    <div>
                                        <p className="text-[11px] font-semibold">
                                            {customer.name ?? (ar ? 'عميل' : 'Customer')}
                                        </p>
                                        <p className="text-[9px] text-[var(--ac-text-muted)]">
                                            {ar ? 'كمية' : 'Qty'} {number(customer.quantity)}
                                        </p>
                                    </div>
                                    <strong className="text-[11px]">
                                        {number(customer.total)}
                                        {currency ? ' ' + currency : ''}
                                    </strong>
                                </Link>
                            ))
                        ) : (
                            <p className="py-6 text-center text-xs text-[var(--ac-text-muted)]">
                                {ar ? 'لا توجد مبيعات مرتبطة بعد.' : 'No linked sales yet.'}
                            </p>
                        )}
                    </div>
                </div>

                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <Boxes size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold">
                            {ar ? 'المخزون حسب المستودع' : 'Stock by warehouse'}
                        </h4>
                    </div>

                    <div className="mt-3 space-y-2">
                        {data.inventory.warehouses.length ? (
                            data.inventory.warehouses.map((warehouse) => (
                                <div
                                    key={warehouse.id}
                                    className="flex items-center justify-between rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2"
                                >
                                    <span className="text-[11px] font-semibold">
                                        {warehouse.name ?? (ar ? 'مستودع' : 'Warehouse')}
                                    </span>
                                    <span className="text-[10px] text-[var(--ac-text-soft)]">
                                        {number(warehouse.on_hand)}
                                        {' · '}
                                        {ar ? 'محجوز' : 'reserved'} {number(warehouse.reserved)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="py-6 text-center text-xs text-[var(--ac-text-muted)]">
                                {ar ? 'لا توجد أرصدة مستودعات.' : 'No warehouse balances.'}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function Metric({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                {label}
            </p>
            <p className="mt-2 text-base font-bold text-[var(--ac-text)]">
                {value}
            </p>
        </div>
    );
}

function DataRow({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-[11px] bg-[var(--ac-surface-soft)] px-3 py-2">
            <span className="text-[10px] text-[var(--ac-text-muted)]">
                {label}
            </span>
            <strong className="text-[11px] text-[var(--ac-text)]">
                {value}
            </strong>
        </div>
    );
}
