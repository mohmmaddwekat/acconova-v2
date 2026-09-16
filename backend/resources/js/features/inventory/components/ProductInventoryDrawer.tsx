import {
    useDialog,
} from '@/components/feedback/useDialog';
import {
    useToast,
} from '@/components/feedback/ToastProvider';
import {
    adjustInventoryStock,
    fetchInventoryProduct,
    recordOpeningStock,
    transferInventoryStock,
    updateInventorySettings,
} from '@/features/inventory/api';
import type {
    InventoryProductDetail,
} from '@/features/inventory/types';
import {
    ApiError,
} from '@/lib/http';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    getLocale,
} from '@/lib/locale';
import {
    ArrowRightLeft,
    Boxes,
    PackageOpen,
    Save,
    SlidersHorizontal,
    Warehouse,
    X,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useState,
    type FormEvent,
} from 'react';
import {
    createPortal,
} from 'react-dom';

type InventoryAction =
    | 'opening'
    | 'adjust'
    | 'transfer';

type ProductInventoryDrawerProps = {
    open: boolean;

    productId:
        | number
        | null;

    initialWarehouseId?:
        | number
        | null;

    canManage: boolean;

    onClose: () => void;

    onChanged?: () => void;
};

/**
 * Render Product inventory settings, warehouse balances, and stock operations
 * in one full-height surface.
 */
export function ProductInventoryDrawer({
    open,
    productId,
    initialWarehouseId = null,
    canManage,
    onClose,
    onChanged,
}: ProductInventoryDrawerProps) {
    useLocale();

    const {
        showToast,
    } =
        useToast();

    const [
        detail,
        setDetail,
    ] =
        useState<InventoryProductDetail | null>(
            null,
        );

    const [
        loading,
        setLoading,
    ] =
        useState(
            false,
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        error,
        setError,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const [
        tracking,
        setTracking,
    ] =
        useState(
            false,
        );

    const [
        threshold,
        setThreshold,
    ] =
        useState(
            '',
        );

    const [
        action,
        setAction,
    ] =
        useState<InventoryAction | null>(
            null,
        );

    const [
        warehouseId,
        setWarehouseId,
    ] =
        useState(
            '',
        );

    const [
        destinationWarehouseId,
        setDestinationWarehouseId,
    ] =
        useState(
            '',
        );

    const [
        quantity,
        setQuantity,
    ] =
        useState(
            '',
        );

    const [
        note,
        setNote,
    ] =
        useState(
            '',
        );

    const dialogRef =
        useDialog(
            open,
            onClose,
            busy,
        );

    /**
     * Resolve a safe user-facing API error.
     */
    function resolveError(
        exception: unknown,
    ): string {
        if (
            exception instanceof
            ApiError
        ) {
            return (
                exception
                    .errors
                    .inventory?.[0]
                ??
                exception.message
            );
        }

        return t(
            'inventory.stockActionFailed',
        );
    }

    /**
     * Load the latest Product balances, movements, and active warehouses.
     */
    const load =
        useCallback(
            async (): Promise<void> => {
                if (
                    ! open
                    || productId ===
                        null
                ) {
                    return;
                }

                setLoading(
                    true,
                );

                setError(
                    null,
                );

                try {
                    const next =
                        await fetchInventoryProduct(
                            productId,
                        );

                    setDetail(
                        next,
                    );

                    setTracking(
                        next.track_inventory,
                    );

                    setThreshold(
                        next.low_stock_threshold
                        ?? '',
                    );

                    const preferred =
                        next.warehouses.find(
                            (
                                warehouse,
                            ) =>
                                warehouse.id ===
                                initialWarehouseId,
                        )
                        ??
                        next.warehouses.find(
                            (
                                warehouse,
                            ) =>
                                warehouse.is_default,
                        )
                        ??
                        next.warehouses[
                            0
                        ];

                    if (preferred) {
                        setWarehouseId(
                            String(
                                preferred.id,
                            ),
                        );

                        const destination =
                            next.warehouses.find(
                                (
                                    warehouse,
                                ) =>
                                    warehouse.id !==
                                    preferred.id,
                            );

                        setDestinationWarehouseId(
                            destination
                                ? String(
                                      destination.id,
                                  )
                                : '',
                        );
                    }
                } catch (
                    exception
                ) {
                    setError(
                        resolveError(
                            exception,
                        ),
                    );
                } finally {
                    setLoading(
                        false,
                    );
                }
            },
            [
                initialWarehouseId,
                open,
                productId,
            ],
        );

    useEffect(() => {
        void load();
    }, [
        load,
    ]);

    /**
     * Save inventory tracking and low-stock settings.
     */
    async function saveSettings(): Promise<void> {
        if (
            productId ===
                null
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            null,
        );

        try {
            const next =
                await updateInventorySettings(
                    productId,
                    {
                        track_inventory:
                            tracking,

                        low_stock_threshold:
                            tracking
                            && threshold.trim() !==
                                ''
                                ? threshold.trim()
                                : null,
                    },
                );

            setDetail(
                next,
            );

            setTracking(
                next.track_inventory,
            );

            setThreshold(
                next.low_stock_threshold
                ?? '',
            );

            showToast(
                t(
                    'inventory.settingsSaved',
                ),
            );

            onChanged?.();
        } catch (
            exception
        ) {
            const message =
                resolveError(
                    exception,
                );

            setError(
                message,
            );

            showToast(
                message,
                'error',
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Open one stock-operation form with clean transient values.
     */
    function openAction(
        nextAction: InventoryAction,
    ): void {
        setAction(
            nextAction,
        );

        setQuantity(
            '',
        );

        setNote(
            '',
        );

        setError(
            null,
        );
    }

    /**
     * Commit the currently selected stock operation.
     */
    async function submitAction(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            productId ===
                null
            || ! action
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            null,
        );

        try {
            let next:
                InventoryProductDetail;

            if (
                action ===
                'opening'
            ) {
                next =
                    await recordOpeningStock(
                        productId,
                        {
                            warehouse_id:
                                Number(
                                    warehouseId,
                                ),

                            quantity:
                                quantity.trim(),

                            note:
                                note.trim() ||
                                null,
                        },
                    );
            } else if (
                action ===
                'adjust'
            ) {
                next =
                    await adjustInventoryStock(
                        productId,
                        {
                            warehouse_id:
                                Number(
                                    warehouseId,
                                ),

                            quantity:
                                quantity.trim(),

                            note:
                                note.trim() ||
                                null,
                        },
                    );
            } else {
                next =
                    await transferInventoryStock(
                        productId,
                        {
                            source_warehouse_id:
                                Number(
                                    warehouseId,
                                ),

                            destination_warehouse_id:
                                Number(
                                    destinationWarehouseId,
                                ),

                            quantity:
                                quantity.trim(),

                            note:
                                note.trim() ||
                                null,
                        },
                    );
            }

            setDetail(
                next,
            );

            setAction(
                null,
            );

            setQuantity(
                '',
            );

            setNote(
                '',
            );

            showToast(
                t(
                    action ===
                        'opening'
                        ? 'inventory.openingRecorded'
                        : action ===
                            'adjust'
                          ? 'inventory.stockAdjusted'
                          : 'inventory.stockTransferred',
                ),
            );

            onChanged?.();
        } catch (
            exception
        ) {
            const message =
                resolveError(
                    exception,
                );

            setError(
                message,
            );

            showToast(
                message,
                'error',
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    if (
        ! open
        || productId ===
            null
        || typeof document ===
            'undefined'
    ) {
        return null;
    }

    const surface = (
        <div className="fixed inset-0 z-[260]">
            <button
                type="button"
                aria-label={t(
                    'inventory.closeProductInventory',
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
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line)] bg-white shadow-[-50px_0_120px_rgba(20,35,30,0.18)] sm:max-w-[660px]"
            >
                <header className="shrink-0 border-b border-[var(--ac-line)] bg-white p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <Boxes
                                    size={
                                        18
                                    }
                                />
                            </div>

                            <div className="min-w-0">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                                    {t(
                                        'inventory.productInventory',
                                    )}
                                </p>

                                <h2 className="mt-1 truncate text-2xl font-semibold tracking-[-0.04em]">
                                    {detail
                                        ?.name
                                        ?? t(
                                            'inventory.loading',
                                        )}
                                </h2>

                                {detail?.sku && (
                                    <bdi
                                        dir="ltr"
                                        className="mt-1 block text-xs font-semibold text-[var(--ac-text-muted)]"
                                    >
                                        {
                                            detail.sku
                                        }
                                    </bdi>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
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
                    {loading &&
                    ! detail ? (
                        <div className="h-48 animate-pulse rounded-[20px] bg-[var(--ac-bg-soft)]" />
                    ) : detail ? (
                        <>
                            <div className="grid grid-cols-3 gap-3">
                                <StockMetric
                                    label={t(
                                        'inventory.onHand',
                                    )}
                                    value={
                                        detail.on_hand
                                    }
                                />

                                <StockMetric
                                    label={t(
                                        'inventory.reserved',
                                    )}
                                    value={
                                        detail.reserved
                                    }
                                />

                                <StockMetric
                                    label={t(
                                        'inventory.available',
                                    )}
                                    value={
                                        detail.available
                                    }
                                />
                            </div>

                            <section className="mt-6 rounded-[20px] border border-[var(--ac-line)] p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-sm font-semibold">
                                            {t(
                                                'inventory.trackingSettings',
                                            )}
                                        </h3>

                                        <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                            {t(
                                                'inventory.trackingSettingsHelp',
                                            )}
                                        </p>
                                    </div>

                                    <input
                                        type="checkbox"
                                        checked={
                                            tracking
                                        }
                                        disabled={
                                            ! canManage
                                            || busy
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setTracking(
                                                event
                                                    .target
                                                    .checked,
                                            )
                                        }
                                        className="size-5 shrink-0 accent-[var(--ac-accent-strong)]"
                                    />
                                </div>

                                {tracking && (
                                    <label className="mt-4 block">
                                        <span className="mb-2 block text-xs font-semibold">
                                            {t(
                                                'inventory.lowStockThreshold',
                                            )}
                                        </span>

                                        <input
                                            type="number"
                                            min="0"
                                            step="0.0001"
                                            value={
                                                threshold
                                            }
                                            disabled={
                                                ! canManage
                                                || busy
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setThreshold(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                            }
                                            className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] px-3 text-sm outline-none focus:border-[var(--ac-accent)]"
                                        />
                                    </label>
                                )}

                                {canManage && (
                                    <button
                                        type="button"
                                        disabled={
                                            busy
                                        }
                                        onClick={() =>
                                            void saveSettings()
                                        }
                                        className="mt-4 flex h-10 items-center gap-2 rounded-[13px] bg-[var(--ac-text)] px-4 text-xs font-semibold text-white disabled:opacity-50"
                                    >
                                        <Save
                                            size={
                                                14
                                            }
                                        />

                                        {t(
                                            'inventory.saveSettings',
                                        )}
                                    </button>
                                )}
                            </section>

                            {detail.track_inventory &&
                                canManage && (
                                    <section className="mt-6">
                                        <h3 className="text-sm font-semibold">
                                            {t(
                                                'inventory.stockActions',
                                            )}
                                        </h3>

                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            <ActionButton
                                                icon={
                                                    PackageOpen
                                                }
                                                label={t(
                                                    'inventory.openingStock',
                                                )}
                                                active={
                                                    action ===
                                                    'opening'
                                                }
                                                onClick={() =>
                                                    openAction(
                                                        'opening',
                                                    )
                                                }
                                            />

                                            <ActionButton
                                                icon={
                                                    SlidersHorizontal
                                                }
                                                label={t(
                                                    'inventory.adjustStock',
                                                )}
                                                active={
                                                    action ===
                                                    'adjust'
                                                }
                                                onClick={() =>
                                                    openAction(
                                                        'adjust',
                                                    )
                                                }
                                            />

                                            <ActionButton
                                                icon={
                                                    ArrowRightLeft
                                                }
                                                label={t(
                                                    'inventory.transferStock',
                                                )}
                                                active={
                                                    action ===
                                                    'transfer'
                                                }
                                                disabled={
                                                    detail
                                                        .warehouses
                                                        .length <
                                                    2
                                                }
                                                onClick={() =>
                                                    openAction(
                                                        'transfer',
                                                    )
                                                }
                                            />
                                        </div>

                                        {action && (
                                            <form
                                                onSubmit={(
                                                    event,
                                                ) =>
                                                    void submitAction(
                                                        event,
                                                    )
                                                }
                                                className="mt-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4"
                                            >
                                                <label className="block">
                                                    <span className="mb-2 block text-xs font-semibold">
                                                        {t(
                                                            action ===
                                                                'transfer'
                                                                ? 'inventory.sourceWarehouse'
                                                                : 'inventory.warehouse',
                                                        )}
                                                    </span>

                                                    <select
                                                        required
                                                        value={
                                                            warehouseId
                                                        }
                                                        onChange={(
                                                            event,
                                                        ) =>
                                                            setWarehouseId(
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                        }
                                                        className="h-11 w-full rounded-[13px] border border-[var(--ac-line)] bg-white px-3 text-sm"
                                                    >
                                                        {detail.warehouses.map(
                                                            (
                                                                warehouse,
                                                            ) => (
                                                                <option
                                                                    key={
                                                                        warehouse.id
                                                                    }
                                                                    value={
                                                                        warehouse.id
                                                                    }
                                                                >
                                                                    {
                                                                        warehouse.name
                                                                    }{' '}
                                                                    ·{' '}
                                                                    {
                                                                        warehouse.code
                                                                    }
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </label>

                                                {action ===
                                                    'transfer' && (
                                                    <label className="mt-3 block">
                                                        <span className="mb-2 block text-xs font-semibold">
                                                            {t(
                                                                'inventory.destinationWarehouse',
                                                            )}
                                                        </span>

                                                        <select
                                                            required
                                                            value={
                                                                destinationWarehouseId
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) =>
                                                                setDestinationWarehouseId(
                                                                    event
                                                                        .target
                                                                        .value,
                                                                )
                                                            }
                                                            className="h-11 w-full rounded-[13px] border border-[var(--ac-line)] bg-white px-3 text-sm"
                                                        >
                                                            {detail.warehouses
                                                                .filter(
                                                                    (
                                                                        warehouse,
                                                                    ) =>
                                                                        String(
                                                                            warehouse.id,
                                                                        ) !==
                                                                        warehouseId,
                                                                )
                                                                .map(
                                                                    (
                                                                        warehouse,
                                                                    ) => (
                                                                        <option
                                                                            key={
                                                                                warehouse.id
                                                                            }
                                                                            value={
                                                                                warehouse.id
                                                                            }
                                                                        >
                                                                            {
                                                                                warehouse.name
                                                                            }{' '}
                                                                            ·{' '}
                                                                            {
                                                                                warehouse.code
                                                                            }
                                                                        </option>
                                                                    ),
                                                                )}
                                                        </select>
                                                    </label>
                                                )}

                                                <label className="mt-3 block">
                                                    <span className="mb-2 block text-xs font-semibold">
                                                        {t(
                                                            action ===
                                                                'adjust'
                                                                ? 'inventory.adjustmentQuantity'
                                                                : 'inventory.quantity',
                                                        )}
                                                    </span>

                                                    <input
                                                        required
                                                        type="number"
                                                        step="0.0001"
                                                        value={
                                                            quantity
                                                        }
                                                        onChange={(
                                                            event,
                                                        ) =>
                                                            setQuantity(
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                        }
                                                        placeholder={
                                                            action ===
                                                            'adjust'
                                                                ? '-2 or 5'
                                                                : '10'
                                                        }
                                                        className="h-11 w-full rounded-[13px] border border-[var(--ac-line)] bg-white px-3 text-sm"
                                                    />
                                                </label>

                                                <label className="mt-3 block">
                                                    <span className="mb-2 block text-xs font-semibold">
                                                        {t(
                                                            'inventory.note',
                                                        )}
                                                    </span>

                                                    <textarea
                                                        rows={
                                                            3
                                                        }
                                                        value={
                                                            note
                                                        }
                                                        onChange={(
                                                            event,
                                                        ) =>
                                                            setNote(
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                        }
                                                        className="w-full resize-none rounded-[13px] border border-[var(--ac-line)] bg-white p-3 text-sm"
                                                    />
                                                </label>

                                                <div className="mt-4 flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setAction(
                                                                null,
                                                            )
                                                        }
                                                        className="h-10 rounded-[12px] px-4 text-xs font-semibold"
                                                    >
                                                        {t(
                                                            'common.cancel',
                                                        )}
                                                    </button>

                                                    <button
                                                        type="submit"
                                                        disabled={
                                                            busy
                                                        }
                                                        className="h-10 rounded-[12px] bg-[var(--ac-text)] px-4 text-xs font-semibold text-white disabled:opacity-50"
                                                    >
                                                        {t(
                                                            'inventory.applyStockAction',
                                                        )}
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                    </section>
                                )}

                            <section className="mt-6">
                                <h3 className="text-sm font-semibold">
                                    {t(
                                        'inventory.warehouseBalances',
                                    )}
                                </h3>

                                <div className="mt-3 overflow-hidden rounded-[18px] border border-[var(--ac-line)]">
                                    {detail.balances.length ===
                                    0 ? (
                                        <p className="p-4 text-xs text-[var(--ac-text-muted)]">
                                            {t(
                                                'inventory.noProductBalances',
                                            )}
                                        </p>
                                    ) : (
                                        detail.balances.map(
                                            (
                                                balance,
                                                index,
                                            ) => (
                                                <div
                                                    key={
                                                        balance
                                                            .warehouse
                                                            .id
                                                    }
                                                    className={[
                                                        'flex items-center gap-3 px-4 py-3',
                                                        index ===
                                                        detail
                                                            .balances
                                                            .length -
                                                            1
                                                            ? ''
                                                            : 'border-b border-[var(--ac-line)]',
                                                    ].join(
                                                        ' ',
                                                    )}
                                                >
                                                    <Warehouse
                                                        size={
                                                            14
                                                        }
                                                        className="shrink-0 text-[var(--ac-text-muted)]"
                                                    />

                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-xs font-semibold">
                                                            {
                                                                balance
                                                                    .warehouse
                                                                    .name
                                                            }
                                                        </p>

                                                        <bdi
                                                            dir="ltr"
                                                            className="mt-0.5 block text-[10px] text-[var(--ac-text-muted)]"
                                                        >
                                                            {
                                                                balance
                                                                    .warehouse
                                                                    .code
                                                            }
                                                        </bdi>
                                                    </div>

                                                    <div className="text-end">
                                                        <p className="text-xs font-semibold">
                                                            {formatQuantity(
                                                                balance.available,
                                                            )}
                                                        </p>

                                                        <p className="text-[9px] text-[var(--ac-text-muted)]">
                                                            {t(
                                                                'inventory.available',
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            ),
                                        )
                                    )}
                                </div>
                            </section>

                            <section className="mt-6">
                                <h3 className="text-sm font-semibold">
                                    {t(
                                        'inventory.recentMovements',
                                    )}
                                </h3>

                                <div className="mt-3 divide-y divide-[var(--ac-line)] overflow-hidden rounded-[18px] border border-[var(--ac-line)]">
                                    {detail
                                        .recent_movements
                                        .length ===
                                    0 ? (
                                        <p className="p-4 text-xs text-[var(--ac-text-muted)]">
                                            {t(
                                                'inventory.noMovements',
                                            )}
                                        </p>
                                    ) : (
                                        detail.recent_movements.map(
                                            (
                                                movement,
                                            ) => (
                                                <div
                                                    key={
                                                        movement.id
                                                    }
                                                    className="flex items-center gap-3 px-4 py-3"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-semibold">
                                                            {t(
                                                                `inventory.movement.${movement.type}` as
                                                                    | 'inventory.movement.opening'
                                                                    | 'inventory.movement.adjustment'
                                                                    | 'inventory.movement.transfer_out'
                                                                    | 'inventory.movement.transfer_in'
                                                                    | 'inventory.movement.sale'
                                                                    | 'inventory.movement.purchase'
                                                                    | 'inventory.movement.customer_return'
                                                                    | 'inventory.movement.supplier_return',
                                                            )}
                                                        </p>

                                                        <p className="mt-0.5 truncate text-[10px] text-[var(--ac-text-muted)]">
                                                            {movement
                                                                .warehouse
                                                                ?.name
                                                                ?? '—'}
                                                        </p>
                                                    </div>

                                                    <bdi
                                                        dir="ltr"
                                                        className="text-xs font-semibold"
                                                    >
                                                        {Number(
                                                            movement.quantity,
                                                        ) >
                                                        0
                                                            ? '+'
                                                            : ''}
                                                        {formatQuantity(
                                                            movement.quantity,
                                                        )}
                                                    </bdi>
                                                </div>
                                            ),
                                        )
                                    )}
                                </div>
                            </section>
                        </>
                    ) : null}

                    {error && (
                        <div className="mt-5 rounded-[15px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                            {
                                error
                            }
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );

    return createPortal(
        surface,
        document.body,
    );
}

type StockMetricProps = {
    label: string;

    value: string;
};

/**
 * Render one Product stock total.
 */
function StockMetric({
    label,
    value,
}: StockMetricProps) {
    return (
        <div className="rounded-[17px] border border-[var(--ac-line)] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                {
                    label
                }
            </p>

            <p className="mt-2 text-xl font-semibold">
                {formatQuantity(
                    value,
                )}
            </p>
        </div>
    );
}

type ActionButtonProps = {
    icon:
        typeof Boxes;

    label: string;

    active: boolean;

    disabled?: boolean;

    onClick: () => void;
};

/**
 * Render one Inventory operation selector.
 */
function ActionButton({
    icon: Icon,
    label,
    active,
    disabled = false,
    onClick,
}: ActionButtonProps) {
    return (
        <button
            type="button"
            disabled={
                disabled
            }
            onClick={
                onClick
            }
            className={[
                'flex min-h-20 flex-col items-center justify-center gap-2 rounded-[16px] border px-2 text-center text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                    : 'border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)]',
            ].join(
                ' ',
            )}
        >
            <Icon
                size={
                    16
                }
            />

            {
                label
            }
        </button>
    );
}

/**
 * Format an Inventory decimal using the active UI locale.
 */
function formatQuantity(
    value: string,
): string {
    return Number(
        value,
    ).toLocaleString(
        getLocale(),
        {
            minimumFractionDigits:
                0,

            maximumFractionDigits:
                4,
        },
    );
}