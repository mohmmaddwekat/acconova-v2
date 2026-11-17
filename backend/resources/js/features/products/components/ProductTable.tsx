import { InlineEditValue } from '@/components/data/InlineEditValue';
import { Select } from '@/components/ui/Select';
import { PermanentDeleteControl } from '@/components/data/PermanentDeleteControl';
import {
    ColumnFilterText,
    SortableTh,
    type TableSort,
} from '@/components/data/SortableHeader';
import type { ProductSort } from '@/features/products/api';
import type { Product, ProductUsage } from '@/features/products/types';
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

    /** Saves one edited field straight from its table cell. */
    onInlineUpdate?: (product: Product, patch: Partial<Product>) => void | Promise<void>;

    /** Sets the on-hand stock to a new total straight from its table cell. */
    onStockChange?: (product: Product, quantity: string) => void | Promise<void>;

    sort: ProductSort;

    onSort: (sort: ProductSort) => void;

    search: string;

    onSearch: (value: string) => void;
};

/** Header sort keys mapped to the catalog's ascending and descending sorts. */
const SORTS: Record<string, [ProductSort, ProductSort]> = {
    name: ['name_asc', 'name_desc'],
    price: ['price_low', 'price_high'],
    stock: ['stock_low', 'stock_high'],
    sales: ['sales_low', 'sales_high'],
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
    onInlineUpdate,
    onStockChange,
    sort,
    onSort,
    search,
    onSearch,
}: ProductTableProps) {
    useLocale();

    const tableSort: TableSort = (() => {
        for (const [key, [ascending, descending]] of Object.entries(SORTS)) {
            if (sort === ascending) {
                return { key, direction: 'asc' as const };
            }

            if (sort === descending) {
                return { key, direction: 'desc' as const };
            }
        }

        return null;
    })();

    function changeSort(next: TableSort): void {
        onSort(next ? SORTS[next.key][next.direction === 'asc' ? 0 : 1] : 'name_asc');
    }

    const ar = getLocale() === 'ar';
    const number = (value: number): string => Math.round(value).toLocaleString('en-US');
    const maxStock = Math.max(
        1,
        ...products.map((product) => Number(product.stock_on_hand ?? 0)),
    );

    const label = {
        product: ar ? 'المنتج' : 'Item',
        price: ar ? 'سعر البيع' : 'Selling price',
        cost: ar ? 'سعر الشراء' : 'Purchase price',
        sku: ar ? 'الرمز SKU' : 'SKU',
        usage: ar ? 'الاستخدام' : 'Used for',
        both: ar ? 'بيع وشراء' : 'Sale and purchase',
        sale: ar ? 'للبيع فقط' : 'Sale only',
        purchase: ar ? 'للشراء فقط' : 'Purchase only',
        notForSale: ar ? 'هذا العنصر للشراء فقط، فلا سعر بيع له' : 'Purchase-only item: no selling price',
        notForPurchase: ar ? 'هذا العنصر للبيع فقط، فلا سعر شراء له' : 'Sale-only item: no purchase price',
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

    const editable = (product: Product): boolean => product.deleted_at === null && canEdit && Boolean(onInlineUpdate);

    /** Runs an inline save from a dropdown, where a failure is already shown as a message. */
    const saveFromSelect = (product: Product, patch: Partial<Product>): void => {
        void Promise.resolve(onInlineUpdate?.(product, patch)).catch(() => undefined);
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
                        <SortableTh
                            ar={ar}
                            label={label.product}
                            sortKey="name"
                            sort={tableSort}
                            onSort={changeSort}
                            className="py-2.5 font-medium"
                            filterActive={search !== ''}
                            filter={<ColumnFilterText ar={ar} value={search} onChange={onSearch} placeholder={ar ? 'اسم المنتج أو الرمز' : 'Name or SKU'} />}
                        />
                        <th className="px-3 py-2.5 text-start font-medium">{label.usage}</th>
                        <th className="px-3 py-2.5 text-start font-medium">{label.sku}</th>
                        <SortableTh ar={ar} label={label.price} sortKey="price" sort={tableSort} onSort={changeSort} className="py-2.5 font-medium" />
                        <th className="px-3 py-2.5 text-start font-medium">{label.cost}</th>
                        <SortableTh ar={ar} label={label.stock} sortKey="stock" sort={tableSort} onSort={changeSort} className="py-2.5 font-medium" />
                        <SortableTh ar={ar} label={label.sales} sortKey="sales" sort={tableSort} onSort={changeSort} className="py-2.5 font-medium" />
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
                                    <InlineEditValue
                                        value={product.name}
                                        display={(
                                            <button
                                                type="button"
                                                onClick={() => onView(product)}
                                                className="block max-w-full truncate text-start font-medium hover:text-[var(--ac-accent-strong)]"
                                            >
                                                {product.name}
                                            </button>
                                        )}
                                        editable={! archived && canEdit && Boolean(onInlineUpdate)}
                                        onSave={(value) => onInlineUpdate?.(product, { name: value })}
                                    />
                                    {archived && (
                                        <span className="block truncate text-[11px] text-[var(--ac-text-soft)]">
                                            {ar ? 'مؤرشف' : 'Archived'}
                                        </span>
                                    )}
                                </td>

                                <td className="px-3 py-2">
                                    {editable(product) ? (
                                        <Select
                                            className="h-8 w-[124px] text-xs"
                                            value={product.usage ?? 'both'}
                                            aria-label={label.usage}
                                            onChange={(event) => saveFromSelect(product, { usage: event.target.value as ProductUsage })}
                                        >
                                            <option value="both">{label.both}</option>
                                            <option value="sale">{label.sale}</option>
                                            <option value="purchase">{label.purchase}</option>
                                        </Select>
                                    ) : (
                                        <span className="text-xs">{label[product.usage ?? 'both']}</span>
                                    )}
                                </td>

                                <td className="px-3 py-2 text-xs">
                                    <InlineEditValue
                                        value={product.sku ?? ''}
                                        display={<bdi dir="ltr">{product.sku ?? '—'}</bdi>}
                                        editable={editable(product)}
                                        onSave={(value) => onInlineUpdate?.(product, { sku: value.trim() === '' ? null : value.trim() })}
                                    />
                                </td>

                                <td className="px-3 py-2 tabular-nums">
                                    {product.usage === 'purchase' ? (
                                        <span className="text-[var(--ac-text-soft)]" title={label.notForSale}>—</span>
                                    ) : (
                                        <InlineEditValue
                                            value={product.unit_price}
                                            display={<bdi>{Number(product.unit_price) > 0 ? Number(product.unit_price).toFixed(2) : '—'}</bdi>}
                                            type="number"
                                            inputMode="decimal"
                                            editable={editable(product)}
                                            onSave={(value) => onInlineUpdate?.(product, { unit_price: value })}
                                        />
                                    )}
                                </td>

                                <td className="px-3 py-2 tabular-nums">
                                    {product.usage === 'sale' ? (
                                        <span className="text-[var(--ac-text-soft)]" title={label.notForPurchase}>—</span>
                                    ) : (
                                        <InlineEditValue
                                            value={product.cost_price ?? ''}
                                            display={<bdi>{Number(product.cost_price ?? 0) > 0 ? Number(product.cost_price).toFixed(2) : '—'}</bdi>}
                                            type="number"
                                            inputMode="decimal"
                                            editable={editable(product)}
                                            onSave={(value) => onInlineUpdate?.(product, { cost_price: value.trim() === '' ? null : value })}
                                        />
                                    )}
                                </td>

                                <td className="px-3 py-2">
                                    {tracked ? (
                                        <InlineEditValue
                                            value={String(stock)}
                                            display={(
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
                                            )}
                                            type="number"
                                            inputMode="decimal"
                                            editable={product.deleted_at === null && canEdit && Boolean(onStockChange)}
                                            onSave={(value) => onStockChange?.(product, value)}
                                        />
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
