import { PermanentDeleteControl } from '@/components/data/PermanentDeleteControl';
import type { Product } from '@/features/products/types';
import { t, useLocale } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import { Archive, ArrowUpRight, Pencil, RotateCcw } from 'lucide-react';
import type { MouseEvent as ReactMouseEvent } from 'react';

type StockStatus = 'low' | 'ok' | 'slow';

type ProductTableProps = {
    products: Product[];

    selectedIds: Set<number>;

    selectable: boolean;

    onSelectionChange: (product: Product, selected: boolean) => void;

    canEdit: boolean;

    canArchive: boolean;

    onView: (product: Product) => void;

    onEdit: (product: Product) => void;

    onArchive: (product: Product) => void;

    onRestore: (product: Product) => void;
};

/**
 * Classify tracked finished goods by how long the stock lasts at the recent
 * sales pace: under three months is low, over eighteen months (or no sales at
 * all) is slow moving. Services and raw materials get no sales based status.
 */
function stockStatus(product: Product): StockStatus | null {
    if (product.type !== 'product' || ! product.track_inventory) {
        return null;
    }

    const stock = Number(product.stock_on_hand ?? 0);
    const monthly = Number(product.monthly_sales ?? 0);

    if (stock <= 0) {
        return 'low';
    }

    if (monthly <= 0) {
        return 'slow';
    }

    const cover = stock / monthly;

    if (cover < 3) {
        return 'low';
    }

    return cover > 18 ? 'slow' : 'ok';
}

const statusClass: Record<StockStatus, string> = {
    low: 'bg-[var(--ac-danger)]/12 text-[var(--ac-danger)]',
    ok: 'bg-[var(--ac-success)]/14 text-[var(--ac-success)]',
    slow: 'bg-[var(--ac-warning)]/16 text-[var(--ac-warning)]',
};

const barClass: Record<StockStatus | 'none', string> = {
    low: 'bg-[var(--ac-danger)]',
    ok: 'bg-[var(--ac-success)]',
    slow: 'bg-[var(--ac-warning)]',
    none: 'bg-[var(--ac-accent)]',
};

const iconButton =
    'flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ac-bg-soft)] transition duration-200 hover:bg-[var(--ac-surface-strong)]';

/**
 * Compact catalog table: one dense row per item with price, stock on hand,
 * recent monthly sales, how long the stock lasts and a status pill.
 */
export function ProductTable({
    products,
    selectedIds,
    selectable,
    onSelectionChange,
    canEdit,
    canArchive,
    onView,
    onEdit,
    onArchive,
    onRestore,
}: ProductTableProps) {
    useLocale();

    const ar = getLocale() === 'ar';
    const number = (value: number): string => Math.round(value).toLocaleString('en-US');
    const maxStock = Math.max(
        1,
        ...products.map((product) => Number(product.stock_on_hand ?? 0)),
    );

    const label = {
        product: ar ? 'المنتج' : 'Item',
        price: ar ? 'السعر' : 'Price',
        stock: ar ? 'المخزون' : 'Stock',
        sales: ar ? 'مبيعات شهرياً' : 'Sales / month',
        cover: ar ? 'يكفي' : 'Lasts',
        status: ar ? 'الحالة' : 'Status',
        low: ar ? 'قارب على النفاد' : 'Running low',
        ok: ar ? 'سليم' : 'Healthy',
        slow: ar ? 'راكد' : 'Slow moving',
        noSales: ar ? 'لا مبيعات' : 'No sales',
        months: ar ? 'شهر' : 'mo',
    };

    function coverText(product: Product): string {
        const stock = Number(product.stock_on_hand ?? 0);
        const monthly = Number(product.monthly_sales ?? 0);

        if (monthly <= 0) {
            return label.noSales;
        }

        const cover = stock / monthly;

        return cover >= 100
            ? `+100 ${label.months}`
            : `${cover < 10 ? cover.toFixed(1) : Math.round(cover)} ${label.months}`;
    }

    function handleDoubleClick(
        event: ReactMouseEvent<HTMLTableRowElement>,
        product: Product,
    ): void {
        const target = event.target instanceof Element ? event.target : null;

        if (target?.closest('button, a, input, textarea, select, label')) {
            return;
        }

        event.preventDefault();
        onView(product);
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                    <tr className="bg-[var(--ac-bg-soft)] text-xs text-[var(--ac-text-soft)]">
                        {selectable && <th className="w-10 px-3 py-2.5" />}
                        <th className="px-3 py-2.5 text-start font-medium">{label.product}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{label.price}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{label.stock}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{label.sales}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{label.cover}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{label.status}</th>
                        <th className="w-px px-3 py-2.5" />
                    </tr>
                </thead>

                <tbody>
                    {products.map((product) => {
                        const archived = product.deleted_at !== null;
                        const status = stockStatus(product);
                        const stock = Number(product.stock_on_hand ?? 0);
                        const tracked = product.track_inventory;

                        return (
                            <tr
                                key={product.id}
                                data-selected={selectedIds.has(product.id) ? 'true' : 'false'}
                                onDoubleClick={(event) => handleDoubleClick(event, product)}
                                className="border-t border-[var(--ac-line)] transition-colors hover:bg-[var(--ac-accent-soft)] data-[selected=true]:bg-[var(--ac-accent-soft)]"
                            >
                                {selectable && (
                                    <td className="px-3 py-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(product.id)}
                                            onChange={(event) => onSelectionChange(product, event.target.checked)}
                                            aria-label={t('action.select', { name: product.name })}
                                            className="size-4 cursor-pointer accent-[var(--ac-accent-strong)]"
                                        />
                                    </td>
                                )}

                                <td className="max-w-[320px] px-3 py-2">
                                    <button
                                        type="button"
                                        onClick={() => onView(product)}
                                        className="block max-w-full truncate text-start font-medium hover:text-[var(--ac-accent-strong)]"
                                    >
                                        {product.name}
                                    </button>
                                    {(product.sku || archived) && (
                                        <span className="block truncate text-[11px] text-[var(--ac-text-soft)]">
                                            {archived ? (ar ? 'مؤرشف' : 'Archived') : ''}
                                            {archived && product.sku ? ' · ' : ''}
                                            {product.sku && <bdi>{product.sku}</bdi>}
                                        </span>
                                    )}
                                </td>

                                <td className="px-3 py-2 tabular-nums">
                                    <bdi>{Number(product.unit_price) > 0 ? Number(product.unit_price).toFixed(2) : '—'}</bdi>
                                </td>

                                <td className="px-3 py-2">
                                    {tracked ? (
                                        <div className="grid min-w-[120px] gap-1">
                                            <span className="tabular-nums">
                                                <bdi>{number(stock)}</bdi>{' '}
                                                <span className="text-[11px] text-[var(--ac-text-soft)]">{product.unit}</span>
                                            </span>
                                            <span className="h-1.5 overflow-hidden rounded-full bg-[var(--ac-bg-soft)]">
                                                <span
                                                    className={`block h-full rounded-full ${barClass[status ?? 'none']}`}
                                                    style={{ width: `${Math.max(2, Math.round((Math.max(stock, 0) / maxStock) * 100))}%` }}
                                                />
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-[var(--ac-text-soft)]">—</span>
                                    )}
                                </td>

                                <td className="px-3 py-2 tabular-nums">
                                    {product.type === 'product' && tracked ? <bdi>{number(Number(product.monthly_sales ?? 0))}</bdi> : '—'}
                                </td>

                                <td className="px-3 py-2">
                                    {product.type === 'product' && tracked ? coverText(product) : '—'}
                                </td>

                                <td className="px-3 py-2">
                                    {status ? (
                                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass[status]}`}>
                                            <span className="size-1.5 rounded-full bg-current" />
                                            {label[status]}
                                        </span>
                                    ) : (
                                        <span className="text-[var(--ac-text-soft)]">—</span>
                                    )}
                                </td>

                                <td className="px-3 py-2">
                                    <div className="flex justify-end gap-1.5">
                                        <button
                                            type="button"
                                            aria-label={t('action.view', { name: product.name })}
                                            onClick={() => onView(product)}
                                            className={iconButton}
                                        >
                                            <ArrowUpRight size={14} />
                                        </button>

                                        {! archived && canEdit && (
                                            <button
                                                type="button"
                                                aria-label={t('action.edit', { name: product.name })}
                                                onClick={() => onEdit(product)}
                                                className={iconButton}
                                            >
                                                <Pencil size={14} />
                                            </button>
                                        )}

                                        {! archived && canArchive && (
                                            <button
                                                type="button"
                                                aria-label={t('action.archive', { name: product.name })}
                                                onClick={() => onArchive(product)}
                                                className={`${iconButton} hover:text-[var(--ac-danger)]`}
                                            >
                                                <Archive size={14} />
                                            </button>
                                        )}

                                        {archived && canArchive && (
                                            <button
                                                type="button"
                                                aria-label={t('action.restore', { name: product.name })}
                                                onClick={() => onRestore(product)}
                                                className={`${iconButton} text-[var(--ac-accent-strong)]`}
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                        )}

                                        {archived && (
                                            <PermanentDeleteControl
                                                resource="products"
                                                recordId={product.id}
                                                recordName={product.name}
                                                onDeleted={() => {
                                                    /*
                                                     * The shared control refreshes the Index after a
                                                     * successful permanent deletion.
                                                     */
                                                }}
                                            />
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
