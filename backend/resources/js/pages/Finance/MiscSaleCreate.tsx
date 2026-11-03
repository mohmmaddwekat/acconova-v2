import { apiRequest } from '@/lib/http';
import { Link } from '@inertiajs/react';
import {
    Check,
    Minus,
    PackageSearch,
    Plus,
    Search,
    ShieldCheck,
    ShoppingBasket,
    Trash2,
    UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FinanceNav } from './FinanceNav';
import {
    FPanel,
    FinanceHeader,
    Money,
    apiErrorText,
    financeButton,
    financeInput,
    financePrimary,
    todayValue,
} from './shared';
import type { FinanceLookups } from './types';

type CartLine = {
    key: string;
    product_id: number | null;
    description: string;
    unit: string | null;
    quantity: number;
    unit_price: number;
    tax_rate: number;
};

type SavedSale = {
    id: number;
    number: string;
    total: string;
};

const PIN_LIMIT = 6;

/**
 * Walk-in (متفرقات) sale entry: no customer, no payment step. Saving issues the
 * invoice and records a same-day cash receipt for the whole amount.
 */
export function MiscSaleCreate({
    lookups,
    ar,
}: {
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const currency = lookups.currency;
    const searchRef = useRef<HTMLInputElement | null>(null);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    const [lines, setLines] = useState<CartLine[]>([]);
    const [issueDate, setIssueDate] = useState(todayValue());
    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('fixed');
    const [discountValue, setDiscountValue] = useState('0');
    const [received, setReceived] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState<SavedSale[]>([]);

    const products = lookups.products;

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();

        if (! needle) {
            return [];
        }

        return products
            .filter(product =>
                product.name.toLowerCase().includes(needle)
                || (product.sku ?? '').toLowerCase().includes(needle),
            )
            .slice(0, 8);
    }, [products, query]);

    const pinned = useMemo(
        () => products.slice(0, PIN_LIMIT),
        [products],
    );

    const totals = useMemo(() => {
        const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
        const value = Math.max(Number(discountValue) || 0, 0);
        const discount = Math.min(
            discountType === 'fixed' ? value : subtotal * (Math.min(value, 100) / 100),
            subtotal,
        );
        const tax = subtotal > 0
            ? lines.reduce((sum, line) => {
                const net = line.quantity * line.unit_price;
                const share = net - (discount * (net / subtotal));

                return sum + (share * (line.tax_rate / 100));
            }, 0)
            : 0;
        const total = subtotal - discount + tax;
        const cash = Number(received) || 0;

        return {
            subtotal,
            discount,
            tax,
            total,
            change: cash > total ? cash - total : 0,
        };
    }, [lines, discountType, discountValue, received]);

    function addProduct(id: number): void {
        const product = products.find(item => item.id === id);

        if (! product) {
            return;
        }

        setLines(current => {
            const existing = current.find(line => line.product_id === id);

            if (existing) {
                return current.map(line =>
                    line === existing ? { ...line, quantity: line.quantity + 1 } : line,
                );
            }

            return [
                ...current,
                {
                    key: 'p' + String(id),
                    product_id: id,
                    description: product.name,
                    unit: product.unit,
                    quantity: 1,
                    unit_price: Number(product.unit_price) || 0,
                    tax_rate: Number(product.tax_rate) || 0,
                },
            ];
        });
        setQuery('');
        setHighlight(0);
        searchRef.current?.focus();
    }

    function addFreeLine(): void {
        const label = query.trim();

        if (! label) {
            return;
        }

        setLines(current => [
            ...current,
            {
                key: 'f' + String(Date.now()),
                product_id: null,
                description: label,
                unit: null,
                quantity: 1,
                unit_price: 0,
                tax_rate: 0,
            },
        ]);
        setQuery('');
        searchRef.current?.focus();
    }

    function changeLine(key: string, patch: Partial<CartLine>): void {
        setLines(current => current.map(line =>
            line.key === key ? { ...line, ...patch } : line,
        ));
    }

    async function save(): Promise<void> {
        if (busy || lines.length === 0) {
            return;
        }

        if (lines.some(line => line.quantity <= 0)) {
            setError(text('الكمية يجب أن تكون أكبر من صفر.', 'Quantity must be greater than zero.'));

            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{ data: SavedSale }>(
                '/api/finance/misc-sales',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        issue_date: issueDate,
                        document_discount_type: discountType,
                        document_discount_value: discountValue || '0',
                        lines: lines.map(line => ({
                            product_id: line.product_id,
                            description: line.description,
                            unit: line.unit,
                            quantity: String(line.quantity),
                            unit_price: String(line.unit_price),
                            tax_rate: String(line.tax_rate),
                        })),
                    }),
                },
            );

            setSaved(current => [response.data, ...current].slice(0, 5));
            setLines([]);
            setDiscountValue('0');
            setReceived('');
            searchRef.current?.focus();
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        const handler = (event: KeyboardEvent): void => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void save();
            }
        };

        window.addEventListener('keydown', handler);

        return () => window.removeEventListener('keydown', handler);
    });

    const quickCash = [totals.total, Math.ceil(totals.total / 10) * 10, 50, 100, 200]
        .filter((amount, index, all) => amount >= totals.total && amount > 0 && all.indexOf(amount) === index)
        .slice(0, 4);

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={text('إضافة فاتورة متفرقات', 'Add walk-in sale')}
                subtitle={text(
                    'بيع سريع بدون زبون محدد. تُحفظ الفاتورة مدفوعة نقداً ويُنشأ قبض نقدي تلقائياً.',
                    'Quick sale with no named customer. Saved as paid in cash with a receipt created automatically.',
                )}
                actions={
                    <Link href="/app/misc-sales" className={financeButton}>
                        {text('الفواتير', 'Invoices')}
                    </Link>
                }
            />

            <FinanceNav lookups={lookups} ar={ar} active="misc" />

            {error && (
                <div
                    role="alert"
                    className="rounded-[14px] border border-red-400/30 bg-red-500/10 p-4 text-sm text-[var(--ac-danger)]"
                >
                    {error}
                </div>
            )}

            {saved.length > 0 && (
                <ul
                    role="status"
                    className="space-y-1 rounded-[14px] border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs"
                >
                    {saved.map(sale => (
                        <li key={sale.id} className="flex items-center gap-2">
                            <Check size={14} className="text-emerald-600" />
                            <strong>{sale.number}</strong>
                            <span className="text-[var(--ac-text-muted)]">
                                <Money value={sale.total} currency={currency} />
                                {' · '}
                                {text('مدفوعة نقداً', 'Paid in cash')}
                            </span>
                            <Link
                                href={'/app/invoices/sales/' + String(sale.id)}
                                className="ms-auto text-[var(--ac-accent)] underline"
                            >
                                {text('عرض', 'Open')}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <FPanel
                    title={text('البنود', 'Items')}
                    icon={ShoppingBasket}
                    action={
                        <input
                            type="date"
                            value={issueDate}
                            onChange={event => setIssueDate(event.target.value)}
                            aria-label={text('تاريخ البيع', 'Sale date')}
                            className={financeInput + ' !h-9 !w-40'}
                        />
                    }
                >
                    <div className="relative border-b border-[var(--ac-line)] p-4">
                        <div className="flex items-center gap-3 rounded-[14px] border border-[var(--ac-line-strong)] bg-[var(--ac-surface-soft)] px-3 focus-within:border-[var(--ac-accent)]">
                            <Search size={16} className="text-[var(--ac-accent)]" />
                            <input
                                ref={searchRef}
                                autoFocus
                                value={query}
                                onChange={event => {
                                    setQuery(event.target.value);
                                    setHighlight(0);
                                }}
                                onKeyDown={event => {
                                    if (event.key === 'ArrowDown' && matches.length) {
                                        event.preventDefault();
                                        setHighlight(value => (value + 1) % matches.length);
                                    } else if (event.key === 'ArrowUp' && matches.length) {
                                        event.preventDefault();
                                        setHighlight(value => (value - 1 + matches.length) % matches.length);
                                    } else if (event.key === 'Enter' && ! event.ctrlKey && ! event.metaKey) {
                                        event.preventDefault();

                                        if (matches[highlight]) {
                                            addProduct(matches[highlight].id);
                                        } else {
                                            addFreeLine();
                                        }
                                    } else if (event.key === 'Escape') {
                                        setQuery('');
                                    }
                                }}
                                placeholder={text(
                                    'ابحث عن صنف ثم Enter للإضافة (أو اكتب اسماً حراً)',
                                    'Search an item, press Enter to add (or type a free name)',
                                )}
                                className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                        </div>

                        {matches.length > 0 && (
                            <ul className="absolute inset-x-4 top-[4.25rem] z-20 max-h-72 overflow-auto rounded-[14px] border border-[var(--ac-line-strong)] bg-[var(--ac-surface)] shadow-[0_18px_50px_rgba(1,20,35,.2)]">
                                {matches.map((product, index) => (
                                    <li key={product.id}>
                                        <button
                                            type="button"
                                            onClick={() => addProduct(product.id)}
                                            className={[
                                                'flex w-full items-center gap-3 px-4 py-3 text-start text-sm',
                                                index === highlight ? 'bg-[var(--ac-accent-soft)]' : 'hover:bg-[var(--ac-surface-soft)]',
                                            ].join(' ')}
                                        >
                                            <span className="min-w-0 flex-1 truncate font-medium">{product.name}</span>
                                            <strong className="text-[var(--ac-accent)]">
                                                <Money value={product.unit_price} currency={currency} />
                                            </strong>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {pinned.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-[var(--ac-text-muted)]">
                                    {text('أصناف سريعة:', 'Quick items:')}
                                </span>
                                {pinned.map(product => (
                                    <button
                                        key={product.id}
                                        type="button"
                                        onClick={() => addProduct(product.id)}
                                        className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--ac-line-strong)] bg-[var(--ac-surface)] px-3 text-xs font-medium transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)]"
                                    >
                                        {product.name}
                                        <b className="text-[var(--ac-accent)]">
                                            <Money value={product.unit_price} currency={currency} />
                                        </b>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {lines.length === 0 ? (
                        <div className="px-6 py-14 text-center text-sm text-[var(--ac-text-muted)]">
                            <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                <PackageSearch size={26} />
                            </span>
                            <strong className="block text-[var(--ac-text)]">
                                {text('الفاتورة فارغة', 'The sale is empty')}
                            </strong>
                            {text('ابحث عن صنف أو اضغط على صنف سريع لتبدأ', 'Search an item or tap a quick item to begin')}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px] text-sm">
                                <thead>
                                    <tr className="bg-[var(--ac-surface-soft)] text-[11px] text-[var(--ac-text-muted)]">
                                        <th className="px-4 py-2.5 text-start font-semibold">{text('الصنف', 'Item')}</th>
                                        <th className="px-4 py-2.5 text-start font-semibold">{text('السعر', 'Price')}</th>
                                        <th className="px-4 py-2.5 text-start font-semibold">{text('الكمية', 'Qty')}</th>
                                        <th className="px-4 py-2.5 text-start font-semibold">{text('الإجمالي', 'Total')}</th>
                                        <th className="w-12" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map(line => (
                                        <tr key={line.key} className="border-t border-[var(--ac-line)]">
                                            <td className="px-4 py-3 font-medium">{line.description}</td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={line.unit_price}
                                                    onChange={event => changeLine(line.key, { unit_price: Math.max(Number(event.target.value) || 0, 0) })}
                                                    aria-label={text('السعر', 'Price')}
                                                    className="h-10 w-24 rounded-[10px] border border-transparent bg-transparent px-2 text-center hover:border-[var(--ac-line-strong)] focus:border-[var(--ac-accent)] focus:bg-[var(--ac-surface-soft)] focus:outline-none"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="inline-flex items-center overflow-hidden rounded-[10px] border border-[var(--ac-line-strong)]">
                                                    <button
                                                        type="button"
                                                        aria-label={text('إنقاص', 'Decrease')}
                                                        onClick={() => line.quantity <= 1
                                                            ? setLines(current => current.filter(item => item.key !== line.key))
                                                            : changeLine(line.key, { quantity: line.quantity - 1 })}
                                                        className="flex size-10 items-center justify-center hover:bg-[var(--ac-accent-soft)]"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={line.quantity}
                                                        onChange={event => changeLine(line.key, { quantity: Math.max(Number(event.target.value) || 1, 1) })}
                                                        aria-label={text('الكمية', 'Quantity')}
                                                        className="h-10 w-14 border-x border-[var(--ac-line)] bg-transparent text-center font-semibold focus:outline-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        aria-label={text('زيادة', 'Increase')}
                                                        onClick={() => changeLine(line.key, { quantity: line.quantity + 1 })}
                                                        className="flex size-10 items-center justify-center hover:bg-[var(--ac-accent-soft)]"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-semibold">
                                                <Money value={line.quantity * line.unit_price} currency={currency} />
                                            </td>
                                            <td className="px-2">
                                                <button
                                                    type="button"
                                                    aria-label={text('حذف', 'Remove')}
                                                    onClick={() => setLines(current => current.filter(item => item.key !== line.key))}
                                                    className="flex size-9 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] hover:bg-red-500/10 hover:text-red-500"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </FPanel>

                <aside className="space-y-4 xl:sticky xl:top-24">
                    <FPanel>
                        <div className="flex items-center gap-3 border-b border-[var(--ac-line)] p-4">
                            <span className="flex size-10 items-center justify-center rounded-xl border border-[var(--ac-line-strong)] bg-[var(--ac-surface)] text-[var(--ac-accent)]">
                                <UserRound size={18} />
                            </span>
                            <div>
                                <strong className="block text-sm">{text('زبون متفرقات', 'Walk-in customer')}</strong>
                                <span className="text-[11px] text-[var(--ac-text-muted)]">
                                    {text('بدون اسم · لا يحتاج بيانات', 'No name · no details needed')}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-3 p-4 text-xs">
                            <div className="flex justify-between">
                                <span className="text-[var(--ac-text-muted)]">{text('المجموع قبل الخصم', 'Subtotal')}</span>
                                <strong><Money value={totals.subtotal} currency={currency} /></strong>
                            </div>

                            <div className="space-y-2 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <strong>{text('خصم عام على الفاتورة', 'Invoice discount')}</strong>
                                    <div role="group" className="inline-flex rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-0.5">
                                        {(['percent', 'fixed'] as const).map(option => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => setDiscountType(option)}
                                                className={[
                                                    'h-7 min-w-9 rounded-[8px] px-2 text-[11px] font-bold',
                                                    discountType === option
                                                        ? 'bg-[var(--ac-accent-solid)] text-[var(--ac-accent-solid-text)]'
                                                        : 'text-[var(--ac-text-muted)]',
                                                ].join(' ')}
                                            >
                                                {option === 'percent' ? '%' : currency}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className={financeInput}
                                    value={discountValue}
                                    onChange={event => setDiscountValue(event.target.value)}
                                    aria-label={text('قيمة الخصم', 'Discount value')}
                                />
                            </div>

                            {totals.discount > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-[var(--ac-text-muted)]">{text('الخصم', 'Discount')}</span>
                                    <strong className="text-red-500">-<Money value={totals.discount} currency={currency} /></strong>
                                </div>
                            )}

                            {totals.tax > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-[var(--ac-text-muted)]">{text('الضريبة', 'Tax')}</span>
                                    <strong><Money value={totals.tax} currency={currency} /></strong>
                                </div>
                            )}

                            <div className="flex items-end justify-between border-y border-dashed border-[var(--ac-line-strong)] py-4">
                                <span className="font-bold">{text('الإجمالي المستحق', 'Amount due')}</span>
                                <strong className="text-3xl text-[var(--ac-accent)]">
                                    <Money value={totals.total} currency={currency} />
                                </strong>
                            </div>

                            <label className="block font-semibold text-[var(--ac-text-soft)]">
                                {text('المبلغ المستلم (اختياري)', 'Cash received (optional)')}
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className={financeInput + ' mt-1'}
                                    value={received}
                                    onChange={event => setReceived(event.target.value)}
                                />
                            </label>

                            {quickCash.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {quickCash.map(amount => (
                                        <button
                                            key={amount}
                                            type="button"
                                            onClick={() => setReceived(String(amount))}
                                            className="h-9 min-w-14 flex-1 rounded-[10px] border border-[var(--ac-line-strong)] text-xs font-semibold hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)]"
                                        >
                                            {amount.toFixed(2)}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {totals.change > 0 && (
                                <div className="flex justify-between rounded-[10px] bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-700">
                                    <span>{text('الباقي للزبون', 'Change due')}</span>
                                    <span><Money value={totals.change} currency={currency} /></span>
                                </div>
                            )}

                            <p className="flex items-start gap-2 rounded-[10px] bg-emerald-500/10 p-3 leading-6 text-emerald-700">
                                <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                                {text(
                                    'تُحفظ الفاتورة مدفوعة بالكامل ويُنشأ قبض نقدي في الصندوق تلقائياً — لا حاجة لإضافة دفعة.',
                                    'Saved as fully paid; a cash receipt is created automatically. No payment step.',
                                )}
                            </p>

                            <button
                                type="button"
                                onClick={() => void save()}
                                disabled={busy || lines.length === 0}
                                className={financePrimary + ' !h-12 w-full justify-center text-sm disabled:opacity-50'}
                            >
                                <Check size={16} />
                                {busy
                                    ? text('جارٍ الحفظ...', 'Saving...')
                                    : text('حفظ وقبض نقدي', 'Save & receive cash')}
                                <kbd className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px]">Ctrl+↵</kbd>
                            </button>
                        </div>
                    </FPanel>
                </aside>
            </div>
        </div>
    );
}
