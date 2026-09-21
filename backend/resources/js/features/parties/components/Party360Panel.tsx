import { apiRequest } from '@/lib/http';
import type { Party } from '@/features/parties/types';
import type { AppPageProps } from '@/types/app';
import {
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Banknote,
    Package,
    ReceiptText,
    ShoppingCart,
    Sparkles,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

type Party360Data = {
    customer: {
        invoice_count: number;
        sales_total: string;
        outstanding: string;
        receipts_total: string;
        profitability: {
            revenue: string;
            estimated_cost: string;
            gross_profit_estimate: string;
            margin_estimate_percent: string;
            basis: string;
        };
    };
    supplier: {
        invoice_count: number;
        purchase_total: string;
        outstanding: string;
        payments_total: string;
        performance: {
            score: number;
            price_stability_score: number;
            receipt_speed_score: number;
            completion_score: number;
            returns_score: number;
            average_price_change_percent: number;
            average_receipt_days: number | null;
            delayed_open_lines: number;
            supplier_return_rate_percent: number;
            methodology: string;
        };
    };
    top_products: Array<{
        product_id: number | null;
        label: string | null;
        kind: 'sale_invoice' | 'purchase_invoice';
        quantity: string;
        total: string;
    }>;
    recent_documents: Array<{
        id: number;
        kind: 'sale_invoice' | 'purchase_invoice';
        number: string;
        status: string;
        date: string | null;
        total: string;
        balance_due: string;
        currency: string;
    }>;
    recent_cash: Array<{
        id: number;
        direction: 'incoming' | 'outgoing';
        number: string;
        status: string;
        date: string | null;
        amount: string;
        currency: string;
        method: string;
    }>;
    last_activity_at: string | null;
};

function number(value: string): string {
    return Number(value).toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
}

export function Party360Panel({
    party,
    ar,
}: {
    party: Party;
    ar: boolean;
}) {
    const currency =
        usePage<AppPageProps>().props.workspace.activeOrganization?.currency
        ?? '';

    const money = (value: string): string =>
        number(value)
        + (currency ? ' ' + currency : '');

    const [data, setData] = useState<Party360Data | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError('');

        apiRequest<{ data: Party360Data }>(
            '/api/parties/' + String(party.id) + '/360',
            {
                signal: controller.signal,
            },
        )
            .then((response) => setData(response.data))
            .catch(() => {
                if (! controller.signal.aborted) {
                    setError(
                        ar
                            ? 'تعذر تحميل النظرة التجارية الشاملة.'
                            : 'The commercial 360 view could not be loaded.',
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
        party.id,
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

    const hasCustomer =
        party.roles.includes('customer');
    const hasSupplier =
        party.roles.includes('supplier');

    return (
        <section className="mt-5 space-y-4">
            <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-[var(--ac-accent)]" />
                <h3 className="text-sm font-bold text-[var(--ac-text)]">
                    {ar
                        ? 'نظرة 360 على العلاقة'
                        : 'Relationship 360'}
                </h3>
            </div>

            {hasCustomer && (
                <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                        {ar ? 'Customer 360 — العميل' : 'Customer 360'}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        <Metric
                            label={ar ? 'فواتير البيع' : 'Sales invoices'}
                            value={String(data.customer.invoice_count)}
                        />
                        <Metric
                            label={ar ? 'إجمالي المبيعات' : 'Sales total'}
                            value={money(data.customer.sales_total)}
                        />
                        <Metric
                            label={ar ? 'الرصيد المستحق' : 'Outstanding'}
                            value={money(data.customer.outstanding)}
                        />
                        <Metric
                            label={ar ? 'المقبوضات' : 'Receipts'}
                            value={money(data.customer.receipts_total)}
                        />
                        <Metric
                            label={ar ? 'الحد الائتماني' : 'Credit limit'}
                            value={
                                party.credit_limit
                                    ? money(party.credit_limit)
                                    : (ar ? 'غير محدد' : 'Not set')
                            }
                        />
                    </div>

                    <div className="mt-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold text-[var(--ac-text)]">
                                    {ar ? 'ربحية العميل' : 'Customer profitability'}
                                </p>
                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'تقدير تشغيلي باستخدام التكلفة الحالية للمنتجات.'
                                        : 'Operational estimate using current product cost.'}
                                </p>
                            </div>
                            <strong className="text-lg text-[var(--ac-accent)]">
                                {number(data.customer.profitability.margin_estimate_percent)}%
                            </strong>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <Metric
                                label={ar ? 'الإيراد' : 'Revenue'}
                                value={money(data.customer.profitability.revenue)}
                            />
                            <Metric
                                label={ar ? 'تكلفة تقديرية' : 'Est. cost'}
                                value={money(data.customer.profitability.estimated_cost)}
                            />
                            <Metric
                                label={ar ? 'ربح إجمالي تقديري' : 'Est. gross profit'}
                                value={money(data.customer.profitability.gross_profit_estimate)}
                            />
                        </div>
                    </div>
                </div>
            )}

            {hasSupplier && (
                <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                        {ar ? 'Supplier 360 — المورد' : 'Supplier 360'}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-4">
                        <Metric
                            label={ar ? 'فواتير الشراء' : 'Purchase invoices'}
                            value={String(data.supplier.invoice_count)}
                        />
                        <Metric
                            label={ar ? 'إجمالي المشتريات' : 'Purchases total'}
                            value={money(data.supplier.purchase_total)}
                        />
                        <Metric
                            label={ar ? 'المستحق للمورد' : 'Supplier balance'}
                            value={money(data.supplier.outstanding)}
                        />
                        <Metric
                            label={ar ? 'المدفوعات' : 'Payments'}
                            value={money(data.supplier.payments_total)}
                        />
                    </div>

                    <div className="mt-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold text-[var(--ac-text)]">
                                    {ar ? 'أداء المورد' : 'Supplier performance'}
                                </p>
                                <p className="mt-1 max-w-2xl text-[9px] leading-4 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'تقييم تشغيلي من ثبات السعر، سرعة الاستلام، اكتمال الاستلامات، والمرتجعات المرتبطة.'
                                        : 'Operational score based on price stability, receipt speed, open-line completion and linked supplier returns.'}
                                </p>
                            </div>

                            <div className="rounded-[13px] bg-[var(--ac-accent-soft)] px-4 py-2 text-center">
                                <span className="block text-[9px] text-[var(--ac-text-muted)]">
                                    {ar ? 'النتيجة' : 'Score'}
                                </span>
                                <strong className="text-xl text-[var(--ac-accent)]">
                                    {data.supplier.performance.score.toFixed(1)}
                                </strong>
                            </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Metric
                                label={ar ? 'ثبات السعر' : 'Price stability'}
                                value={data.supplier.performance.price_stability_score.toFixed(0) + '/100'}
                            />
                            <Metric
                                label={ar ? 'سرعة الاستلام' : 'Receipt speed'}
                                value={data.supplier.performance.receipt_speed_score.toFixed(0) + '/100'}
                            />
                            <Metric
                                label={ar ? 'اكتمال الطلبات' : 'Completion'}
                                value={data.supplier.performance.completion_score.toFixed(0) + '/100'}
                            />
                            <Metric
                                label={ar ? 'المرتجعات' : 'Returns'}
                                value={data.supplier.performance.returns_score.toFixed(0) + '/100'}
                            />
                        </div>

                        <p className="mt-3 text-[9px] text-[var(--ac-text-muted)]">
                            {ar
                                ? 'متوسط تغير السعر: '
                                : 'Avg. price change: '}
                            {data.supplier.performance.average_price_change_percent.toFixed(1)}%
                            {' · '}
                            {ar ? 'متوسط الاستلام: ' : 'Avg. receipt: '}
                            {data.supplier.performance.average_receipt_days === null
                                ? '—'
                                : data.supplier.performance.average_receipt_days.toFixed(1) + (ar ? ' يوم' : ' days')}
                            {' · '}
                            {ar ? 'بنود متأخرة: ' : 'Delayed lines: '}
                            {data.supplier.performance.delayed_open_lines}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <Package size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold text-[var(--ac-text)]">
                            {ar ? 'أهم المنتجات في العلاقة' : 'Top products in this relationship'}
                        </h4>
                    </div>

                    <div className="mt-3 space-y-2">
                        {data.top_products.length ? (
                            data.top_products.map((item, index) => (
                                <div
                                    key={[
                                        item.product_id,
                                        item.kind,
                                        index,
                                    ].join('-')}
                                    className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-[11px] font-semibold text-[var(--ac-text)]">
                                            {item.label ?? (ar ? 'بند غير مرتبط' : 'Unlinked line')}
                                        </p>
                                        <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                            {item.kind === 'sale_invoice'
                                                ? (ar ? 'مبيعات' : 'Sales')
                                                : (ar ? 'مشتريات' : 'Purchases')}
                                            {' · '}
                                            {ar ? 'كمية' : 'Qty'} {number(item.quantity)}
                                        </p>
                                    </div>
                                    <strong className="text-[11px] text-[var(--ac-text-soft)]">
                                        {number(item.total)}
                                    </strong>
                                </div>
                            ))
                        ) : (
                            <p className="py-6 text-center text-xs text-[var(--ac-text-muted)]">
                                {ar ? 'لا توجد حركة منتجات بعد.' : 'No product activity yet.'}
                            </p>
                        )}
                    </div>
                </div>

                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <ReceiptText size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold text-[var(--ac-text)]">
                            {ar ? 'آخر المستندات' : 'Recent documents'}
                        </h4>
                    </div>

                    <div className="mt-3 space-y-2">
                        {data.recent_documents.slice(0, 6).map((document) => (
                            <Link
                                key={document.kind + '-' + String(document.id)}
                                href={
                                    document.kind === 'sale_invoice'
                                        ? '/app/invoices/sales/' + String(document.id)
                                        : '/app/invoices/purchases/' + String(document.id)
                                }
                                className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2 transition hover:bg-[var(--ac-accent-soft)]"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-[11px] font-semibold text-[var(--ac-text)]">
                                        {document.number}
                                    </p>
                                    <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                        {document.date ?? '—'} · {document.status}
                                    </p>
                                </div>
                                <strong className="text-[11px] text-[var(--ac-text-soft)]">
                                    {number(document.total)} {document.currency}
                                </strong>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {data.recent_cash.length > 0 && (
                <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                    <div className="flex items-center gap-2">
                        <Banknote size={14} className="text-[var(--ac-accent)]" />
                        <h4 className="text-xs font-bold text-[var(--ac-text)]">
                            {ar ? 'آخر المقبوضات والمدفوعات' : 'Recent receipts & payments'}
                        </h4>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {data.recent_cash.slice(0, 6).map((movement) => (
                            <Link
                                key={movement.direction + '-' + String(movement.id)}
                                href={
                                    movement.direction === 'incoming'
                                        ? '/app/receipts/' + String(movement.id)
                                        : '/app/payments/' + String(movement.id)
                                }
                                className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2 hover:bg-[var(--ac-accent-soft)]"
                            >
                                <div>
                                    <p className="text-[11px] font-semibold text-[var(--ac-text)]">
                                        {movement.number}
                                    </p>
                                    <p className="text-[9px] text-[var(--ac-text-muted)]">
                                        {movement.date ?? '—'} · {movement.method}
                                    </p>
                                </div>
                                <strong className="text-[11px] text-[var(--ac-text-soft)]">
                                    {number(movement.amount)} {movement.currency}
                                </strong>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
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
