import { ModalPortal } from '@/components/feedback/ModalPortal';
import { Select } from '@/components/ui/Select';
import type { Warehouse } from '@/features/inventory/types';
import {
    quickProductionEntry,
    type QuickProductionResult,
} from '@/features/production/api';
import type { Product } from '@/features/products/types';
import { apiErrorText } from '@/pages/Finance/shared';
import { CheckCircle2, Plus, Trash2, TriangleAlert, X, Zap } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

type Row = {
    key: number;
    date: string;
    productName: string;
    quantity: string;
};

const today = (): string => new Date().toISOString().slice(0, 10);

const fieldClass =
    'h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';

/**
 * Fast keyboard entry for paper records: one row per run (date, product,
 * quantity). Materials come from each Product's active Recipe.
 */
export function QuickProductionEntry({
    products,
    warehouses,
    ar,
    onClose,
    onDone,
}: {
    products: Product[];
    warehouses: Warehouse[];
    ar: boolean;
    onClose: () => void;
    onDone: () => void;
}) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;

    const nextKey = useRef(2);
    const tableRef = useRef<HTMLDivElement>(null);
    const [warehouseId, setWarehouseId] = useState(
        String(warehouses.find((warehouse) => warehouse.is_default)?.id ?? warehouses[0]?.id ?? ''),
    );
    const [post, setPost] = useState(true);
    const [rows, setRows] = useState<Row[]>([
        { key: 1, date: today(), productName: '', quantity: '' },
    ]);
    const [results, setResults] = useState<Record<number, QuickProductionResult>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [savedCount, setSavedCount] = useState(0);

    const productByName = useMemo(() => {
        const map = new Map<string, Product>();

        products.forEach((product) => map.set(product.name.trim(), product));

        return map;
    }, [products]);

    const messageFor = (code: string | null): string => {
        const known: Record<string, [string, string]> = {
            no_active_recipe: ['لا توجد وصفة معتمدة لهذا المنتج', 'No active recipe for this product'],
            no_materials_available: ['لا توجد مواد متوفرة للوصفة', 'No recipe materials available'],
            product_not_found: ['المنتج غير موجود', 'Product not found'],
        };

        if (! code) {
            return '';
        }

        return known[code] ? text(...known[code]) : code;
    };

    function update(key: number, patch: Partial<Row>): void {
        setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
    }

    function addRow(focus = false): void {
        const key = nextKey.current++;

        setRows((current) => [
            ...current,
            { key, date: current[current.length - 1]?.date ?? today(), productName: '', quantity: '' },
        ]);

        if (focus) {
            window.setTimeout(() => {
                tableRef.current
                    ?.querySelector<HTMLInputElement>(`[data-row="${key}"][data-field="product"]`)
                    ?.focus();
            }, 30);
        }
    }

    const rowProduct = (row: Row): Product | undefined => productByName.get(row.productName.trim());
    const rowReady = (row: Row): boolean => Boolean(rowProduct(row)) && Number(row.quantity) > 0 && row.date !== '';
    const readyRows = rows.filter(rowReady);

    async function save(): Promise<void> {
        setError('');

        if (readyRows.length === 0) {
            setError(text('أدخل صفاً واحداً على الأقل (تاريخ ومنتج وكمية).', 'Enter at least one complete row (date, product, quantity).'));

            return;
        }

        if (! warehouseId) {
            setError(text('اختر المستودع.', 'Select a warehouse.'));

            return;
        }

        setBusy(true);

        try {
            const response = await quickProductionEntry({
                warehouse_id: Number(warehouseId),
                post,
                rows: readyRows.map((row) => ({
                    occurred_on: row.date,
                    product_id: rowProduct(row)!.id,
                    quantity: row.quantity,
                })),
            });

            const byRowKey: Record<number, QuickProductionResult> = {};
            let saved = 0;

            response.forEach((result) => {
                const row = readyRows[result.index];

                if (row) {
                    byRowKey[row.key] = result;
                }

                if (result.status !== 'failed') {
                    saved++;
                }
            });

            setResults(byRowKey);
            setSavedCount((count) => count + saved);

            // Rows that were saved leave the table; rows with problems stay to fix.
            setRows((current) => {
                const remaining = current.filter((row) => {
                    const result = byRowKey[row.key];

                    // A draft that was meant to be posted stays so the shortage can be fixed.
                    return ! result || result.status === 'failed' || (result.status === 'draft' && post);
                });

                return remaining.length > 0
                    ? remaining
                    : [{ key: nextKey.current++, date: today(), productName: '', quantity: '' }];
            });

            if (saved > 0) {
                onDone();
            }
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
                <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-2xl sm:rounded-[26px]">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <Zap size={18} />
                            </div>
                            <div>
                                <strong className="text-base">{text('إدخال إنتاج سريع', 'Quick production entry')}</strong>
                                <p className="mt-0.5 text-xs text-[var(--ac-text-muted)]">
                                    {text(
                                        'صف لكل عملية: التاريخ والمنتج والكمية. المواد تُحسب من الوصفة المعتمدة. Enter في الكمية يضيف صفاً جديداً.',
                                        'One row per run: date, product, quantity. Materials come from the active recipe. Enter in the quantity adds a new row.',
                                    )}
                                </p>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} aria-label={text('إغلاق', 'Close')} className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)]">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="space-y-4 overflow-y-auto p-4">
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                            <label className="block text-xs font-semibold text-[var(--ac-text-muted)]">
                                {text('المستودع (للمنتج والمواد)', 'Warehouse (product and materials)')}
                                <Select className={fieldClass + ' mt-1'} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                                    {warehouses.map((warehouse) => (
                                        <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                                    ))}
                                </Select>
                            </label>
                            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
                                <input type="checkbox" checked={post} onChange={(event) => setPost(event.target.checked)} className="size-4 accent-[var(--ac-accent)]" />
                                {text('ترحيل للمخزون مباشرة', 'Post to inventory immediately')}
                            </label>
                        </div>

                        <datalist id="quick-production-products">
                            {products.map((product) => (
                                <option key={product.id} value={product.name.trim()} />
                            ))}
                        </datalist>

                        <div ref={tableRef} className="space-y-2">
                            <div className="hidden grid-cols-[150px_1fr_130px_40px] gap-2 px-1 text-[11px] font-bold text-[var(--ac-text-muted)] sm:grid">
                                <span>{text('التاريخ', 'Date')}</span>
                                <span>{text('المنتج', 'Product')}</span>
                                <span>{text('الكمية', 'Quantity')}</span>
                                <span />
                            </div>

                            {rows.map((row, index) => {
                                const result = results[row.key];
                                const unknownProduct = row.productName.trim() !== '' && ! rowProduct(row);

                                return (
                                    <div key={row.key} className="space-y-1">
                                        <div className="grid gap-2 sm:grid-cols-[150px_1fr_130px_40px]">
                                            <input
                                                type="date"
                                                max={today()}
                                                className={fieldClass}
                                                aria-label={text('التاريخ', 'Date')}
                                                data-row={row.key}
                                                data-field="date"
                                                value={row.date}
                                                onChange={(event) => update(row.key, { date: event.target.value })}
                                            />
                                            <input
                                                list="quick-production-products"
                                                className={fieldClass + (unknownProduct ? ' !border-red-400' : '')}
                                                aria-label={text('المنتج', 'Product')}
                                                placeholder={text('ابدأ بكتابة اسم المنتج…', 'Start typing a product…')}
                                                data-row={row.key}
                                                data-field="product"
                                                value={row.productName}
                                                onChange={(event) => update(row.key, { productName: event.target.value })}
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                inputMode="decimal"
                                                className={fieldClass}
                                                aria-label={text('الكمية', 'Quantity')}
                                                placeholder={text('الكمية', 'Quantity')}
                                                data-row={row.key}
                                                data-field="quantity"
                                                value={row.quantity}
                                                onChange={(event) => update(row.key, { quantity: event.target.value })}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' && index === rows.length - 1 && rowReady(row)) {
                                                        event.preventDefault();
                                                        addRow(true);
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                aria-label={text('حذف الصف', 'Remove row')}
                                                disabled={rows.length === 1}
                                                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                                                className="flex h-10 items-center justify-center rounded-[12px] border border-[var(--ac-line)] text-red-600 disabled:opacity-40"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                        {unknownProduct && (
                                            <p className="px-1 text-[11px] text-red-600">{text('اختر اسماً من القائمة المقترحة.', 'Pick a name from the suggested list.')}</p>
                                        )}
                                        {result && result.status === 'failed' && (
                                            <p className="flex items-center gap-1 px-1 text-[11px] text-red-600"><TriangleAlert size={12} />{messageFor(result.message)}</p>
                                        )}
                                        {result && result.status === 'draft' && result.message && (
                                            <p className="flex items-center gap-1 px-1 text-[11px] text-amber-700"><TriangleAlert size={12} />{result.run_number}: {text('حُفظت كمسودة ولم تُرحَّل — ', 'Saved as a draft, not posted — ')}{messageFor(result.message)}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => addRow(true)} className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-4 text-sm font-semibold">
                                <Plus size={15} />{text('إضافة صف', 'Add row')}
                            </button>
                            <button type="button" onClick={() => { for (let i = 0; i < 5; i++) { addRow(); } }} className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-4 text-sm font-semibold">
                                <Plus size={15} />{text('5 صفوف', '5 rows')}
                            </button>
                        </div>

                        {error && (
                            <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                        )}

                        {savedCount > 0 && (
                            <div role="status" className="flex items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                                <CheckCircle2 size={16} />
                                {text('تم حفظ ' + savedCount + ' عملية.', savedCount + ' run(s) saved.')}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                        <span className="text-xs text-[var(--ac-text-muted)]">
                            {text('صفوف جاهزة: ', 'Ready rows: ')}<strong>{readyRows.length}</strong>
                        </span>
                        <div className="flex gap-2">
                            <button type="button" onClick={onClose} className="h-11 rounded-[14px] border border-[var(--ac-line)] px-5 text-sm font-semibold">
                                {text('إغلاق', 'Close')}
                            </button>
                            <button type="button" disabled={busy || readyRows.length === 0} onClick={() => void save()} className="h-11 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white disabled:opacity-50">
                                {busy
                                    ? text('جارٍ الحفظ…', 'Saving…')
                                    : text('حفظ ' + readyRows.length + ' عملية', 'Save ' + readyRows.length + ' run(s)')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
