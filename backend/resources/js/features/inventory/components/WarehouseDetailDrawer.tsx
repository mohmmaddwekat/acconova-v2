import {
    useDialog,
} from '@/components/feedback/useDialog';
import {
    fetchWarehouseInventoryProducts,
} from '@/features/inventory/api';
import {
    ProductInventoryDrawer,
} from '@/features/inventory/components/ProductInventoryDrawer';
import type {
    Warehouse,
    WarehouseInventoryProduct,
} from '@/features/inventory/types';
import {
    ApiError,
} from '@/lib/http';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    Archive,
    Boxes,
    History,
    Package,
    Pencil,
    RotateCcw,
    Search,
    Star,
    Trash2,
    Warehouse as WarehouseIcon,
    X,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useState,
} from 'react';
import {
    createPortal,
} from 'react-dom';

type WarehouseDetailDrawerProps = {
    open: boolean;

    warehouse:
        | Warehouse
        | null;

    canManage: boolean;

    canPermanentlyDelete: boolean;

    onClose: () => void;

    onEdit: (
        warehouse: Warehouse,
    ) => void;

    onSetDefault: (
        warehouse: Warehouse,
    ) => void;

    onArchive: (
        warehouse: Warehouse,
    ) => void;

    onRestore: (
        warehouse: Warehouse,
    ) => void;

    onDelete: (
        warehouse: Warehouse,
    ) => void;
};

/**
 * Render one warehouse lifecycle and Inventory summary with direct Product
 * drill-down.
 */
export function WarehouseDetailDrawer({
    open,
    warehouse,
    canManage,
    canPermanentlyDelete,
    onClose,
    onEdit,
    onSetDefault,
    onArchive,
    onRestore,
    onDelete,
}: WarehouseDetailDrawerProps) {
    useLocale();

    const [
        products,
        setProducts,
    ] =
        useState<WarehouseInventoryProduct[]>(
            [],
        );

    const [
        productsTotal,
        setProductsTotal,
    ] =
        useState(
            0,
        );

    const [
        productsLoading,
        setProductsLoading,
    ] =
        useState(
            false,
        );

    const [
        productsError,
        setProductsError,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const [
        search,
        setSearch,
    ] =
        useState(
            '',
        );

    const [
        selectedProductId,
        setSelectedProductId,
    ] =
        useState<
            number | null
        >(
            null,
        );

    const dialogRef =
        useDialog(
            open,
            onClose,
        );

    /**
     * Load physical Products as viewed from this warehouse.
     */
    const loadProducts =
        useCallback(
            async (): Promise<void> => {
                if (
                    ! open
                    || ! warehouse
                ) {
                    return;
                }

                setProductsLoading(
                    true,
                );

                setProductsError(
                    null,
                );

                try {
                    const result =
                        await fetchWarehouseInventoryProducts(
                            warehouse.id,
                            search,
                        );

                    setProducts(
                        result.products,
                    );

                    setProductsTotal(
                        result.total,
                    );
                } catch (
                    exception
                ) {
                    setProductsError(
                        exception instanceof
                        ApiError
                            ? exception.message
                            : t(
                                  'inventory.loadProductsFailed',
                              ),
                    );
                } finally {
                    setProductsLoading(
                        false,
                    );
                }
            },
            [
                open,
                search,
                warehouse,
            ],
        );

    useEffect(() => {
        if (
            ! open
            || ! warehouse
        ) {
            return;
        }

        const timer =
            window.setTimeout(
                () =>
                    void loadProducts(),
                250,
            );

        return () =>
            window.clearTimeout(
                timer,
            );
    }, [
        loadProducts,
        open,
        warehouse,
    ]);

    useEffect(() => {
        if (
            ! open
        ) {
            setSearch(
                '',
            );

            setSelectedProductId(
                null,
            );
        }
    }, [
        open,
    ]);

    if (
        ! open
        || ! warehouse
        || typeof document ===
            'undefined'
    ) {
        return null;
    }

    const archived =
        warehouse.deleted_at !==
        null;

    const stockedProductsCount =
        Number(
            warehouse.stocked_products_count
            ?? 0,
        );

    const stockMovementsCount =
        Number(
            warehouse.stock_movements_count
            ?? 0,
        );

    const safeForPermanentDelete =
        archived
        && stockedProductsCount ===
            0
        && stockMovementsCount ===
            0;

    const surface = (
        <div className="fixed inset-0 z-[220]">
            <button
                type="button"
                aria-label={t(
                    'inventory.closeWarehouse',
                )}
                onClick={
                    onClose
                }
                className="absolute inset-0 bg-[var(--ac-text)]/22 backdrop-blur-[3px]"
            />

            <aside
                ref={
                    dialogRef
                }
                role="dialog"
                aria-modal="true"
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[620px]"
            >
                <header className="shrink-0 border-b border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <WarehouseIcon
                                    size={
                                        18
                                    }
                                />
                            </div>

                            <div className="min-w-0">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                                    {t(
                                        'inventory.warehouseContext',
                                    )}
                                </p>

                                <h2 className="mt-1 truncate text-2xl font-semibold tracking-[-0.04em]">
                                    {
                                        warehouse.name
                                    }
                                </h2>

                                <bdi
                                    dir="ltr"
                                    className="mt-1 block text-xs font-semibold text-[var(--ac-text-muted)]"
                                >
                                    {
                                        warehouse.code
                                    }
                                </bdi>
                            </div>
                        </div>

                        <button
                            type="button"
                            aria-label={t(
                                'inventory.closeWarehouse',
                            )}
                            onClick={
                                onClose
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]"
                        >
                            <X
                                size={
                                    17
                                }
                            />
                        </button>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
                    <div className="grid grid-cols-2 gap-3">
                        <Metric
                            icon={
                                Boxes
                            }
                            label={t(
                                'inventory.stockedProductsLabel',
                            )}
                            value={String(
                                stockedProductsCount,
                            )}
                        />

                        <Metric
                            icon={
                                History
                            }
                            label={t(
                                'inventory.stockHistory',
                            )}
                            value={String(
                                stockMovementsCount,
                            )}
                        />
                    </div>

                    <section className="mt-6 overflow-hidden rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                        <InfoRow
                            label={t(
                                'inventory.code',
                            )}
                            value={
                                warehouse.code
                            }
                            ltr
                        />

                        <InfoRow
                            label={t(
                                'inventory.status',
                            )}
                            value={t(
                                archived
                                    ? 'inventory.archived'
                                    : 'inventory.active',
                            )}
                            last={
                                ! warehouse.is_default
                            }
                        />

                        {warehouse.is_default && (
                            <InfoRow
                                label={t(
                                    'inventory.defaultWarehouse',
                                )}
                                value={t(
                                    'inventory.defaultBadge',
                                )}
                                last
                            />
                        )}
                    </section>

                    <section className="mt-6">
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold">
                                    {t(
                                        'inventory.productsInWarehouse',
                                    )}
                                </h3>

                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                    {t(
                                        'inventory.productsInWarehouseCount',
                                        {
                                            count:
                                                productsTotal,
                                        },
                                    )}
                                </p>
                            </div>
                        </div>

                        <label className="relative mt-3 block">
                            <Search
                                size={
                                    14
                                }
                                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                            />

                            <input
                                value={
                                    search
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setSearch(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                placeholder={t(
                                    'inventory.searchProducts',
                                )}
                                className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] pe-3 ps-9 text-sm outline-none focus:border-[var(--ac-accent)]"
                            />
                        </label>

                        <div className="mt-3 overflow-hidden rounded-[18px] border border-[var(--ac-line)]">
                            {productsLoading ? (
                                <div className="space-y-2 p-3">
                                    {[
                                        1,
                                        2,
                                        3,
                                    ].map(
                                        (
                                            item,
                                        ) => (
                                            <div
                                                key={
                                                    item
                                                }
                                                className="h-14 animate-pulse rounded-[12px] bg-[var(--ac-bg-soft)]"
                                            />
                                        ),
                                    )}
                                </div>
                            ) : products.length ===
                              0 ? (
                                <p className="p-5 text-center text-xs text-[var(--ac-text-muted)]">
                                    {t(
                                        'inventory.noWarehouseProducts',
                                    )}
                                </p>
                            ) : (
                                products.map(
                                    (
                                        product,
                                        index,
                                    ) => (
                                        <button
                                            key={
                                                product.id
                                            }
                                            type="button"
                                            onClick={() =>
                                                setSelectedProductId(
                                                    product.id,
                                                )
                                            }
                                            className={[
                                                'flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-[var(--ac-bg-soft)]',
                                                index ===
                                                products.length -
                                                    1
                                                    ? ''
                                                    : 'border-b border-[var(--ac-line)]',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]">
                                                <Package
                                                    size={
                                                        14
                                                    }
                                                />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-semibold">
                                                    {
                                                        product.name
                                                    }
                                                </p>

                                                <div className="mt-1 flex items-center gap-2">
                                                    {product.sku && (
                                                        <bdi
                                                            dir="ltr"
                                                            className="text-[9px] text-[var(--ac-text-muted)]"
                                                        >
                                                            {
                                                                product.sku
                                                            }
                                                        </bdi>
                                                    )}

                                                    <span
                                                        className={[
                                                            'rounded-full px-2 py-0.5 text-[8px] font-semibold',
                                                            product.track_inventory
                                                                ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                                : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                                                        ].join(
                                                            ' ',
                                                        )}
                                                    >
                                                        {t(
                                                            product.track_inventory
                                                                ? 'inventory.tracked'
                                                                : 'inventory.notTracked',
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-end">
                                                <p className="text-sm font-semibold">
                                                    {
                                                        product.available
                                                    }
                                                </p>

                                                <p className="text-[8px] text-[var(--ac-text-muted)]">
                                                    {t(
                                                        'inventory.available',
                                                    )}
                                                </p>
                                            </div>
                                        </button>
                                    ),
                                )
                            )}
                        </div>

                        {productsError && (
                            <p className="mt-2 text-xs text-[var(--ac-danger)]">
                                {
                                    productsError
                                }
                            </p>
                        )}
                    </section>

                    {! archived &&
                        warehouse.is_default && (
                            <div className="mt-5 rounded-[16px] border border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)] p-4 text-xs leading-5 text-[var(--ac-accent-strong)]">
                                {t(
                                    'inventory.currentDefaultHelp',
                                )}
                            </div>
                        )}

                    {archived &&
                        ! safeForPermanentDelete && (
                            <div className="mt-5 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                                <div className="flex items-start gap-3">
                                    <History
                                        size={
                                            16
                                        }
                                        className="mt-0.5 shrink-0 text-[var(--ac-text-muted)]"
                                    />

                                    <div>
                                        <p className="text-xs font-semibold">
                                            {t(
                                                'inventory.historyProtected',
                                            )}
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                            {t(
                                                'inventory.historyProtectedHelp',
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                </div>

                <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:px-6">
                    {! archived &&
                        canManage && (
                            <>
                                <button
                                    type="button"
                                    title={t(
                                        'inventory.editWarehouseAction',
                                    )}
                                    aria-label={t(
                                        'inventory.editWarehouseAction',
                                    )}
                                    onClick={() =>
                                        onEdit(
                                            warehouse,
                                        )
                                    }
                                    className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-surface)] text-[var(--ac-text-soft)] shadow-sm"
                                >
                                    <Pencil
                                        size={
                                            16
                                        }
                                    />
                                </button>

                                {! warehouse.is_default && (
                                    <button
                                        type="button"
                                        title={t(
                                            'inventory.makeDefault',
                                        )}
                                        aria-label={t(
                                            'inventory.makeDefault',
                                        )}
                                        onClick={() =>
                                            onSetDefault(
                                                warehouse,
                                            )
                                        }
                                        className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"
                                    >
                                        <Star
                                            size={
                                                16
                                            }
                                        />
                                    </button>
                                )}

                                {! warehouse.is_default && (
                                    <button
                                        type="button"
                                        title={t(
                                            'inventory.archiveWarehouse',
                                        )}
                                        aria-label={t(
                                            'inventory.archiveWarehouse',
                                        )}
                                        onClick={() =>
                                            onArchive(
                                                warehouse,
                                            )
                                        }
                                        className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-surface)] text-[var(--ac-text-muted)] hover:bg-[var(--ac-danger)]/8 hover:text-[var(--ac-danger)]"
                                    >
                                        <Archive
                                            size={
                                                16
                                            }
                                        />
                                    </button>
                                )}
                            </>
                        )}

                    {archived &&
                        canManage && (
                            <button
                                type="button"
                                title={t(
                                    'inventory.restoreWarehouse',
                                )}
                                aria-label={t(
                                    'inventory.restoreWarehouse',
                                )}
                                onClick={() =>
                                    onRestore(
                                        warehouse,
                                    )
                                }
                                className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"
                            >
                                <RotateCcw
                                    size={
                                        16
                                    }
                                />
                            </button>
                        )}

                    {archived &&
                        canPermanentlyDelete &&
                        safeForPermanentDelete && (
                            <button
                                type="button"
                                title={t(
                                    'inventory.permanentDeleteWarehouse',
                                )}
                                aria-label={t(
                                    'inventory.permanentDeleteWarehouse',
                                )}
                                onClick={() =>
                                    onDelete(
                                        warehouse,
                                    )
                                }
                                className="flex size-11 items-center justify-center rounded-[14px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/6 text-[var(--ac-danger)]"
                            >
                                <Trash2
                                    size={
                                        16
                                    }
                                />
                            </button>
                        )}
                </footer>
            </aside>

            <ProductInventoryDrawer
                open={
                    selectedProductId !==
                    null
                }
                productId={
                    selectedProductId
                }
                initialWarehouseId={
                    warehouse.deleted_at ===
                        null
                        ? warehouse.id
                        : null
                }
                canManage={
                    canManage
                }
                onClose={() =>
                    setSelectedProductId(
                        null,
                    )
                }
                onChanged={() =>
                    void loadProducts()
                }
            />
        </div>
    );

    return createPortal(
        surface,
        document.body,
    );
}

type MetricProps = {
    icon:
        typeof Boxes;

    label: string;

    value: string;
};

/**
 * Render one compact warehouse metric.
 */
function Metric({
    icon: Icon,
    label,
    value,
}: MetricProps) {
    return (
        <div className="rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <Icon
                size={
                    15
                }
                className="text-[var(--ac-text-muted)]"
            />

            <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                {
                    label
                }
            </p>

            <p className="mt-1 text-xl font-semibold tracking-[-0.03em]">
                {
                    value
                }
            </p>
        </div>
    );
}

type InfoRowProps = {
    label: string;

    value: string;

    ltr?: boolean;

    last?: boolean;
};

/**
 * Render one warehouse identity or lifecycle field.
 */
function InfoRow({
    label,
    value,
    ltr = false,
    last = false,
}: InfoRowProps) {
    return (
        <div
            className={[
                'flex items-center justify-between gap-4 px-4 py-3',
                last
                    ? ''
                    : 'border-b border-[var(--ac-line)]',
            ].join(
                ' ',
            )}
        >
            <span className="text-xs text-[var(--ac-text-muted)]">
                {
                    label
                }
            </span>

            {ltr ? (
                <bdi
                    dir="ltr"
                    className="text-xs font-semibold"
                >
                    {
                        value
                    }
                </bdi>
            ) : (
                <span className="text-xs font-semibold">
                    {
                        value
                    }
                </span>
            )}
        </div>
    );
}