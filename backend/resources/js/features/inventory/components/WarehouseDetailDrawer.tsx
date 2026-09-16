import {
    useDialog,
} from '@/components/feedback/useDialog';
import type {
    Warehouse,
} from '@/features/inventory/types';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    Archive,
    Boxes,
    History,
    Pencil,
    RotateCcw,
    Star,
    Trash2,
    Warehouse as WarehouseIcon,
    X,
} from 'lucide-react';
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
 * Render one warehouse lifecycle and inventory summary in a full-height Show
 * drawer attached directly to the browser viewport.
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

    const dialogRef =
        useDialog(
            open,
            onClose,
        );

    if (
        ! open ||
        ! warehouse ||
        typeof document ===
            'undefined'
    ) {
        return null;
    }

    const archived =
        warehouse.deleted_at !==
        null;

    const stockedProductsCount =
        Number(
            warehouse.stocked_products_count ??
                0,
        );

    const stockMovementsCount =
        Number(
            warehouse.stock_movements_count ??
                0,
        );

    const safeForPermanentDelete =
        archived &&
        stockedProductsCount ===
            0 &&
        stockMovementsCount ===
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
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[580px]"
            >
                <header className="shrink-0 border-b border-[var(--ac-line)] bg-white p-5 sm:p-6">
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
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)]"
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

                    <section className="mt-6 overflow-hidden rounded-[18px] border border-[var(--ac-line)] bg-white">
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

                    {! archived &&
                        warehouse.is_default && (
                            <div className="mt-5 rounded-[16px] border border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)] p-4 text-xs leading-5 text-[var(--ac-accent-strong)]">
                                {t(
                                    'inventory.currentDefaultHelp',
                                )}
                            </div>
                        )}

                    {! archived &&
                        ! warehouse.is_default &&
                        canManage && (
                            <div className="mt-5 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--ac-accent-strong)] shadow-sm">
                                        <Star
                                            size={
                                                15
                                            }
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold">
                                            {t(
                                                'inventory.makeDefault',
                                            )}
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                            {t(
                                                'inventory.firstWarehouseDefaultHelp',
                                            )}
                                        </p>
                                    </div>
                                </div>
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
                                    className="flex size-11 items-center justify-center rounded-[14px] bg-white text-[var(--ac-text-soft)] shadow-sm transition hover:-translate-y-px hover:text-[var(--ac-text)] motion-reduce:transform-none"
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
                                        className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] transition hover:-translate-y-px motion-reduce:transform-none"
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
                                        className="flex size-11 items-center justify-center rounded-[14px] bg-white text-[var(--ac-text-muted)] transition hover:-translate-y-px hover:bg-[var(--ac-danger)]/8 hover:text-[var(--ac-danger)] motion-reduce:transform-none"
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
                                className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] transition hover:-translate-y-px motion-reduce:transform-none"
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
                                className="flex size-11 items-center justify-center rounded-[14px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/6 text-[var(--ac-danger)] transition hover:-translate-y-px hover:bg-[var(--ac-danger)]/10 motion-reduce:transform-none"
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
 * Render one compact warehouse operating metric.
 */
function Metric({
    icon: Icon,
    label,
    value,
}: MetricProps) {
    return (
        <div className="rounded-[17px] border border-[var(--ac-line)] bg-white p-4">
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
 * Render one warehouse identity or lifecycle value.
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