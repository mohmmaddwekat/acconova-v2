import { usePage } from '@inertiajs/react';
import type { AppPageProps } from '@/types/app';
import { fetchParties } from '@/features/parties/api';
import type { Party } from '@/features/parties/types';
import type { Product } from '@/features/products/types';
import { ApiError, apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import { useEffect, useState, type FormEvent } from 'react';

type ServiceOperation = {
    id: number;
    customer_name: string;
    service_name: string;
    performed_on: string;
    unit: string;
    quantity: string;
    unit_price: string;
    subtotal: string;
    notes: string | null;
};

type OperationsResponse = {
    data: ServiceOperation[];
    meta: { current_page: number; last_page: number };
};

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--ac-accent)]';
const buttonClass = 'rounded-xl border border-[var(--ac-line)] px-3 py-2 text-sm disabled:opacity-50';

/** Preview the same four-decimal multiplication and half-up rounding as the server. */
function previewSubtotal(quantity: string, price: string): string | null {
    if (!/^\d{1,6}(?:\.\d{1,4})?$/.test(quantity) || !/^\d{1,6}(?:\.\d{1,4})?$/.test(price)) {
        return null;
    }
    const scaled = (value: string): bigint => {
        const [whole, fraction = ''] = value.split('.');
        return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
    };
    const total = (scaled(quantity) * scaled(price) + 5000n) / 10000n;
    return `${total / 10000n}.${(total % 10000n).toString().padStart(4, '0')}`;
}

/** Record customer-specific service work and read its immutable history. */
export function ServiceOperationsPanel({ product, canEdit }: { product: Product; canEdit: boolean }) {
    useLocale();
    const permissions=usePage<AppPageProps>().props.workspace.activeOrganization?.permissions;
    const canRecord = (permissions ? permissions.some(p=>['products.manage','products.service'].includes(p)) : canEdit) && product.type === 'service' && !product.deleted_at;
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [history, setHistory] = useState<OperationsResponse | null>(null);
    const [historyError, setHistoryError] = useState('');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState<Party[]>([]);
    const [customer, setCustomer] = useState<Party | null>(null);
    const [customerError, setCustomerError] = useState('');
    const [customersLoading, setCustomersLoading] = useState(false);
    const [quantity, setQuantity] = useState('1');
    const [price, setPrice] = useState(product.unit_price);
    const [date, setDate] = useState(() => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    });
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const endpoint = `/api/products/${product.id}/service-operations`;
    const subtotal = previewSubtotal(quantity, price);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setHistoryError('');
        apiRequest<OperationsResponse>(`${endpoint}?page=${page}`, { signal: controller.signal })
            .then(setHistory)
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) {
                    setHistoryError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed'));
                }
            })
            .finally(() => { if (!controller.signal.aborted) { setLoading(false); } });
        return () => controller.abort();
    }, [endpoint, page, revision]);

    useEffect(() => {
        if (!canRecord || customer) { return; }
        let active = true;
        setCustomersLoading(true);
        setCustomerError('');
        const timer = setTimeout(() => {
            fetchParties({ status: 'active', search, perPage: 25 })
                .then((response) => { if (active) { setCustomers(response.data.filter((party) => party.roles.some((role) => role === 'customer' || role === 'supplier' || role === 'contact'))); } })
                .catch((failure: unknown) => {
                    if (active) {
                        setCustomerError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed'));
                    }
                })
                .finally(() => { if (active) { setCustomersLoading(false); } });
        }, 250);
        return () => { active = false; clearTimeout(timer); };
    }, [canRecord, customer, search, revision]);

    async function recordOperation(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (!customer || saving) { return; }
        setSaving(true);
        setError('');
        setSuccess(false);
        try {
            await apiRequest<{ data: ServiceOperation }>(endpoint, {
                method: 'POST',
                body: JSON.stringify({ party_id: customer.id, performed_on: date, quantity, unit_price: price, notes: notes || null }),
            });
            setSuccess(true);
            setQuantity('1');
            setPrice(product.unit_price);
            setNotes('');
            setCustomer(null);
            setSearch('');
            setPage(1);
            setRevision((current) => current + 1);
        } catch (failure) {
            setError(failure instanceof ApiError
                ? [failure.message, ...Object.values(failure.errors).flat()].join(' ')
                : t('catalog.operations.failed'));
        } finally {
            setSaving(false);
        }
    }

    if (product.type !== 'service' && !loading && !historyError && !history?.data.length) { return null; }

    return (
        <section className="mt-7 border-t border-[var(--ac-line)] pt-6" aria-label={t('catalog.operations.title')}>
            <h3 className="text-base font-semibold">{t('catalog.operations.title')}</h3>
            <p className="mt-2 text-xs leading-6 text-[var(--ac-text-soft)]">{t('catalog.operations.help')}</p>

            {canRecord && (
                <form onSubmit={recordOperation} className="mt-4 space-y-4 rounded-2xl bg-[var(--ac-surface-soft)] p-4">
                    <fieldset disabled={saving} className="space-y-4">
                        <legend className="mb-3 text-sm font-semibold">{t('catalog.operations.new')}</legend>
                        <label className="block text-xs">
                            {t('catalog.operations.customer')}
                            <input type="search" value={search} maxLength={255} className={inputClass}
                                placeholder={t('catalog.operations.searchCustomer')}
                                onChange={(event) => { setSearch(event.target.value); setCustomer(null); setCustomers([]); }} />
                        </label>
                        {customer ? (
                            <div role="status" className="rounded-xl border border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)] px-4 py-3">
                                <p className="text-[11px] font-medium text-[var(--ac-text-muted)]">{t('catalog.operations.selected')}</p>
                                <p className="mt-1 break-words text-sm font-semibold text-[var(--ac-text)]"><bdi>{customer.company_name || customer.name}</bdi></p>
                            </div>
                        ) : (
                            <div className="max-h-64 overflow-y-auto overscroll-contain rounded-2xl border border-[var(--ac-line)] bg-white p-1.5 [scrollbar-width:thin]" aria-busy={customersLoading}>
                                {customersLoading ? <p className="p-3 text-xs">{t('catalog.operations.loading')}</p> : customerError ? (
                                    <div className="p-3"><p role="alert" className="text-xs">{customerError}</p><button type="button" className={buttonClass} onClick={() => setRevision((value) => value + 1)}>{t('catalog.operations.retry')}</button></div>
                                ) : customers.length ? customers.map((item) => (
                                    <button key={item.id} type="button" className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-3 py-3 text-start transition-colors hover:bg-[var(--ac-surface-soft)] focus-visible:bg-[var(--ac-accent-soft)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ac-accent)]"
                                        onClick={() => { setCustomer(item); setSearch(item.company_name || item.name || ''); }}>
                                        <span className="min-w-0 break-words text-sm font-medium leading-6 text-[var(--ac-text)]"><bdi>{item.company_name || item.name}</bdi></span>
                                        <span className="flex max-w-28 flex-wrap justify-end gap-1.5">
                                            {item.roles.map((role) => (
                                                <span key={role} className={role === 'supplier'
                                                    ? 'rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium leading-4 text-amber-800 ring-1 ring-inset ring-amber-200/60'
                                                    : 'rounded-md bg-sky-50 px-2 py-1 text-[10px] font-medium leading-4 text-sky-800 ring-1 ring-inset ring-sky-200/60'}>
                                                    {t(role === 'contact' ? 'role.contact' : role === 'supplier' ? 'catalog.operations.supplierRole' : 'catalog.operations.customerRole')}
                                                </span>
                                            ))}
                                        </span>
                                    </button>
                                )) : <p className="p-3 text-xs">{t('catalog.operations.noCustomers')}</p>}
                            </div>
                        )}
                        <label className="block text-xs">{t('catalog.operations.date')}
                            <input required type="date" value={date} className={inputClass} onChange={(event) => setDate(event.target.value)} />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs">{t('catalog.operations.quantity')} ({product.unit})
                                <input required type="number" min="0.0001" max="999999" step="0.0001" dir="ltr" value={quantity} className={inputClass} onChange={(event) => setQuantity(event.target.value)} />
                            </label>
                            <label className="block text-xs">{t('catalog.operations.price')}
                                <input required type="number" min="0" max="999999" step="0.0001" dir="ltr" value={price} className={inputClass} onChange={(event) => setPrice(event.target.value)} />
                            </label>
                        </div>
                        <p className="text-xs leading-5">{t('catalog.operations.priceHelp')}</p>
                        <p className="font-semibold" aria-live="polite">{t('catalog.operations.subtotal')}: <bdi>{subtotal ?? '—'}</bdi></p>
                        <label className="block text-xs">{t('catalog.operations.notes')}
                            <textarea rows={2} maxLength={5000} value={notes} className={inputClass} onChange={(event) => setNotes(event.target.value)} />
                        </label>
                        <button type="submit" disabled={!customer || saving || subtotal === null} className="w-full rounded-xl bg-[var(--ac-accent-strong)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                            {t(saving ? 'catalog.operations.saving' : 'catalog.operations.save')}
                        </button>
                    </fieldset>
                    {error && <p role="alert" className="text-xs text-[var(--ac-danger)]">{error}</p>}
                    {success && <p role="status" className="text-xs text-[var(--ac-accent-strong)]">{t('catalog.operations.saved')}</p>}
                </form>
            )}

            <h4 className="mt-6 text-sm font-semibold">{t('catalog.operations.history')}</h4>
            {loading ? <p role="status" className="mt-3 text-xs">{t('catalog.operations.loading')}</p> : historyError ? (
                <div className="mt-3"><p role="alert" className="text-xs">{historyError}</p><button type="button" className={buttonClass} onClick={() => setRevision((value) => value + 1)}>{t('catalog.operations.retry')}</button></div>
            ) : history?.data.length ? (
                <>
                    <ul className="mt-3 space-y-3">
                        {history.data.map((operation) => (
                            <li key={operation.id} className="rounded-xl border border-[var(--ac-line)] p-3 text-sm">
                                <div className="flex flex-wrap justify-between gap-2"><strong>{operation.customer_name}</strong><time dateTime={operation.performed_on}>{operation.performed_on}</time></div>
                                <p className="mt-2 text-xs">{operation.service_name} · {operation.unit}</p>
                                <p className="mt-2"><bdi>{operation.quantity} × {operation.unit_price} = {operation.subtotal}</bdi></p>
                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">{t('catalog.operations.subtotal')}</p>
                                {operation.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{operation.notes}</p>}
                            </li>
                        ))}
                    </ul>
                    {history.meta.last_page > 1 && <div className="mt-3 flex items-center justify-between gap-2">
                        <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t('catalog.operations.previous')}</button>
                        <span className="text-xs">{page} / {history.meta.last_page}</span>
                        <button type="button" className={buttonClass} disabled={page >= history.meta.last_page} onClick={() => setPage((value) => value + 1)}>{t('catalog.operations.next')}</button>
                    </div>}
                </>
            ) : <p className="mt-3 text-xs text-[var(--ac-text-muted)]">{t('catalog.operations.empty')}</p>}
        </section>
    );
}
