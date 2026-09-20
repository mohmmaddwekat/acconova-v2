import { fetchProducts } from '@/features/products/api';
import type { Product } from '@/features/products/types';
import { apiRequest } from '@/lib/http';
import {
    BadgeDollarSign,
    Plus,
    Trash2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type PartyPrice = {
    product_id: number;
    product_name: string;
    sku: string | null;
    unit_price: string;
    currency: string | null;
    note: string | null;
    updated_at: string;
};

export function PartyPricingPanel({
    partyId,
    canEdit,
    ar,
}: {
    partyId: number;
    canEdit: boolean;
    ar: boolean;
}) {
    const [prices, setPrices] = useState<PartyPrice[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [productId, setProductId] = useState('');
    const [unitPrice, setUnitPrice] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    async function load(): Promise<void> {
        const response = await apiRequest<{ data: PartyPrice[] }>(
            '/api/parties/' + String(partyId) + '/prices',
        );
        setPrices(response.data);
    }

    useEffect(() => {
        const controller = new AbortController();

        void Promise.all([
            apiRequest<{ data: PartyPrice[] }>(
                '/api/parties/' + String(partyId) + '/prices',
                { signal: controller.signal },
            ),
            fetchProducts({
                status: 'active',
                page: 1,
                perPage: 100,
            }),
        ])
            .then(([priceResponse, productResponse]) => {
                setPrices(priceResponse.data);
                setProducts(productResponse.data);
            })
            .catch(() => {
                if (! controller.signal.aborted) {
                    setError(
                        text(
                            'تعذر تحميل الأسعار الخاصة.',
                            'Customer-specific prices could not be loaded.',
                        ),
                    );
                }
            });

        return () => controller.abort();
    }, [partyId, ar]);

    const availableProducts = useMemo(
        () => products.filter(
            (product) =>
                ! prices.some(
                    (price) =>
                        price.product_id === product.id,
                ),
        ),
        [products, prices],
    );

    async function save(): Promise<void> {
        if (
            busy
            || ! productId
            || unitPrice.trim() === ''
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/parties/' + String(partyId) + '/prices',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        product_id: Number(productId),
                        unit_price: unitPrice,
                        note: note.trim() || null,
                    }),
                },
            );

            setProductId('');
            setUnitPrice('');
            setNote('');
            await load();
        } catch {
            setError(
                text(
                    'تعذر حفظ السعر الخاص.',
                    'Customer-specific price could not be saved.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function remove(product: number): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/parties/'
                + String(partyId)
                + '/prices/'
                + String(product),
                {
                    method: 'DELETE',
                },
            );

            await load();
        } catch {
            setError(
                text(
                    'تعذر حذف السعر الخاص.',
                    'Customer-specific price could not be removed.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="mt-5 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <div className="flex items-center gap-2">
                <BadgeDollarSign
                    size={15}
                    className="text-[var(--ac-accent)]"
                />
                <div>
                    <h3 className="text-sm font-bold text-[var(--ac-text)]">
                        {text(
                            'تسعير خاص للعميل',
                            'Customer-specific pricing',
                        )}
                    </h3>
                    <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                        {text(
                            'السعر هنا يصبح المرجع الأول تلقائياً عند إنشاء فاتورة بيع لهذا العميل، مع إمكانية تعديله داخل الفاتورة.',
                            'This price becomes the first suggested reference on sales invoices for this customer, while remaining editable on the invoice.',
                        )}
                    </p>
                </div>
            </div>

            {error && (
                <div className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </div>
            )}

            {canEdit && (
                <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_130px_minmax(0,.8fr)_auto]">
                    <select
                        value={productId}
                        onChange={(event) => setProductId(event.target.value)}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                    >
                        <option value="">
                            {text('اختر منتجاً', 'Choose product')}
                        </option>
                        {availableProducts.map((product) => (
                            <option
                                key={product.id}
                                value={product.id}
                            >
                                {product.name}
                                {product.sku ? ' · ' + product.sku : ''}
                            </option>
                        ))}
                    </select>

                    <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={unitPrice}
                        onChange={(event) => setUnitPrice(event.target.value)}
                        placeholder={text('السعر', 'Price')}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                    />

                    <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={text('ملاحظة اختيارية', 'Optional note')}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                    />

                    <button
                        type="button"
                        disabled={
                            busy
                            || ! productId
                            || unitPrice.trim() === ''
                        }
                        onClick={() => void save()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[11px] bg-[var(--ac-accent-solid)] px-3 text-xs font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-45"
                    >
                        <Plus size={13} />
                        {text('إضافة', 'Add')}
                    </button>
                </div>
            )}

            <div className="mt-4 space-y-2">
                {prices.length === 0 ? (
                    <p className="rounded-[12px] border border-dashed border-[var(--ac-line)] p-5 text-center text-xs text-[var(--ac-text-muted)]">
                        {text(
                            'لا توجد أسعار خاصة لهذا العميل بعد.',
                            'No customer-specific prices yet.',
                        )}
                    </p>
                ) : (
                    prices.map((price) => (
                        <div
                            key={price.product_id}
                            className="flex items-center gap-3 rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-[var(--ac-text)]">
                                    {price.product_name}
                                </p>
                                <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                    {[price.sku, price.note]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </p>
                            </div>

                            <strong className="text-xs text-[var(--ac-accent)]">
                                {Number(price.unit_price).toLocaleString()}
                                {price.currency ? ' ' + price.currency : ''}
                            </strong>

                            {canEdit && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void remove(price.product_id)}
                                    className="flex size-8 items-center justify-center rounded-[9px] text-[var(--ac-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </section>
    );
}
