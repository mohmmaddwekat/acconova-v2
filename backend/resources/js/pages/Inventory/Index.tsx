import { SmartEmptyState } from '@/components/data/SmartEmptyState';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Archive,
    ArrowRightLeft,
    Boxes,
    Pencil,
    Plus,
    RotateCcw,
    Sparkles,
    Star,
    Trash2,
    TrendingDown,
    Warehouse as WarehouseIcon,
    type LucideIcon,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useState,
    type KeyboardEvent,
} from 'react';

import {
    ConfirmDialog,
} from '@/components/feedback/ConfirmDialog';
import {
    useToast,
} from '@/components/feedback/ToastProvider';
import {
    archiveWarehouse,
    fetchInventoryOverview,
    fetchWarehouses,
    permanentlyDeleteWarehouse,
    restoreWarehouse,
    setDefaultWarehouse,
} from '@/features/inventory/api';
import {
    WarehouseDetailDrawer,
} from '@/features/inventory/components/WarehouseDetailDrawer';
import {
    InventoryIntelligencePanel,
} from '@/features/inventory/components/InventoryIntelligencePanel';
import {
    WarehouseEditorDrawer,
} from '@/features/inventory/components/WarehouseEditorDrawer';
import type {
    InventoryOverview,
    StockMovementType,
    Warehouse,
    WarehouseStatus,
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
    AppShell,
} from '@/layouts/AppShell';
import type {
    AppPageProps,
} from '@/types/app';

type PendingWarehouseAction = {
    kind:
        | 'archive'
        | 'restore'
        | 'delete';

    warehouse: Warehouse;
};

/**
 * Render the current organization's Inventory operating surface.
 */
export default function InventoryIndex() {
    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    return (
        <InventoryWorkspace
            key={
                workspace
                    .activeOrganization
                    ?.id ??
                'none'
            }
        />
    );
}

/**
 * Keep Inventory transient state isolated to one selected organization.
 */
function InventoryWorkspace() {
    const ar =
        useLocale() ===
        'ar';

    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    const role =
        workspace
            .activeOrganization
            ?.role;

    const canManage = workspace.activeOrganization?.permissions ? workspace.activeOrganization.permissions.includes('inventory.manage') : ['owner','admin','manager'].includes(role ?? '');

    const canPermanentlyDelete =
        role ===
            'owner'
        ||
        role ===
            'admin';

    const [
        status,
        setStatus,
    ] =
        useState<WarehouseStatus>(
            'active',
        );

    const [
        overview,
        setOverview,
    ] =
        useState<InventoryOverview | null>(
            null,
        );

    const [
        warehouses,
        setWarehouses,
    ] =
        useState<Warehouse[]>(
            [],
        );

    const [
        selectedWarehouse,
        setSelectedWarehouse,
    ] =
        useState<Warehouse | null>(
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
        error,
        setError,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const [
        editorOpen,
        setEditorOpen,
    ] =
        useState(
            false,
        );

    const [
        editingWarehouse,
        setEditingWarehouse,
    ] =
        useState<Warehouse | null>(
            null,
        );

    const [
        pendingAction,
        setPendingAction,
    ] =
        useState<PendingWarehouseAction | null>(
            null,
        );

    const [
        actionBusy,
        setActionBusy,
    ] =
        useState(
            false,
        );

    const [
        defaultBusy,
        setDefaultBusy,
    ] =
        useState(
            false,
        );

    const {
        showToast,
    } =
        useToast();

    /**
     * Load overview metrics and warehouse locations for the selected lifecycle
     * tab.
     */
    const loadInventory =
        useCallback(
            async (): Promise<void> => {
                if (
                    ! workspace
                        .activeOrganization
                ) {
                    setOverview(
                        null,
                    );

                    setWarehouses(
                        [],
                    );

                    return;
                }

                setLoading(
                    true,
                );

                setError(
                    null,
                );

                try {
                    const [
                        nextOverview,
                        nextWarehouses,
                    ] =
                        await Promise.all([
                            fetchInventoryOverview(),

                            fetchWarehouses(
                                status,
                            ),
                        ]);

                    setOverview(
                        nextOverview,
                    );

                    setWarehouses(
                        nextWarehouses,
                    );
                } catch (
                    exception
                ) {
                    setError(
                        exception instanceof
                        ApiError
                            ? exception.message
                            : t(
                                  'inventory.loadFailed',
                              ),
                    );
                } finally {
                    setLoading(
                        false,
                    );
                }
            },
            [
                status,
                workspace
                    .activeOrganization,
            ],
        );

    useEffect(() => {
        void loadInventory();
    }, [
        loadInventory,
    ]);

    /**
     * Open a clean warehouse creator.
     */
    function createWarehouse(): void {
        setEditingWarehouse(
            null,
        );

        setEditorOpen(
            true,
        );
    }

    /**
     * Open one warehouse in the shared Show drawer.
     */
    function showWarehouse(
        warehouse: Warehouse,
    ): void {
        setSelectedWarehouse(
            warehouse,
        );
    }

    /**
     * Open one active warehouse for renaming.
     */
    function editWarehouse(
        warehouse: Warehouse,
    ): void {
        setEditingWarehouse(
            warehouse,
        );

        setEditorOpen(
            true,
        );
    }

    /**
     * Explicitly promote one existing warehouse to default.
     */
    async function makeWarehouseDefault(
        warehouse: Warehouse,
    ): Promise<void> {
        if (
            defaultBusy ||
            warehouse.is_default
        ) {
            return;
        }

        setDefaultBusy(
            true,
        );

        try {
            const saved =
                await setDefaultWarehouse(
                    warehouse.id,
                );

            setSelectedWarehouse(
                (
                    current,
                ) =>
                    current?.id ===
                    saved.id
                        ? saved
                        : current,
            );

            showToast(
                t(
                    'inventory.defaultChanged',
                ),
            );

            await loadInventory();
        } catch (
            exception
        ) {
            showToast(
                exception instanceof
                ApiError
                    ? exception.message
                    : t(
                          'inventory.actionFailed',
                      ),
                'error',
            );
        } finally {
            setDefaultBusy(
                false,
            );
        }
    }

    /**
     * Execute one confirmed warehouse lifecycle operation.
     */
    async function confirmWarehouseAction(): Promise<void> {
        if (
            ! pendingAction ||
            actionBusy
        ) {
            return;
        }

        setActionBusy(
            true,
        );

        try {
            if (
                pendingAction.kind ===
                'archive'
            ) {
                await archiveWarehouse(
                    pendingAction
                        .warehouse.id,
                );

                showToast(
                    t(
                        'inventory.warehouseArchived',
                    ),
                );
            } else if (
                pendingAction.kind ===
                'restore'
            ) {
                await restoreWarehouse(
                    pendingAction
                        .warehouse.id,
                );

                showToast(
                    t(
                        'inventory.warehouseRestored',
                    ),
                );
            } else {
                await permanentlyDeleteWarehouse(
                    pendingAction
                        .warehouse.id,
                );

                showToast(
                    t(
                        'inventory.warehouseDeleted',
                    ),
                );
            }

            setPendingAction(
                null,
            );

            setSelectedWarehouse(
                null,
            );

            await loadInventory();
        } catch (
            exception
        ) {
            showToast(
                exception instanceof
                ApiError
                    ? (
                          exception
                              .errors
                              .warehouse?.[0]
                          ??
                          exception.message
                      )
                    : t(
                          'inventory.actionFailed',
                      ),
                'error',
            );
        } finally {
            setActionBusy(
                false,
            );
        }
    }

    const metrics =
        overview?.metrics;

    const confirmTone =
        pendingAction?.kind ===
        'restore'
            ? 'positive'
            : pendingAction?.kind ===
                'delete'
              ? 'danger'
              : 'warning';

    const confirmTitle =
        t(
            pendingAction?.kind ===
                'restore'
                ? 'inventory.restoreWarehouseTitle'
                : pendingAction?.kind ===
                    'delete'
                  ? 'inventory.deleteWarehouseTitle'
                  : 'inventory.archiveWarehouseTitle',
        );

    const confirmDescription =
        t(
            pendingAction?.kind ===
                'restore'
                ? 'inventory.restoreWarehouseDescription'
                : pendingAction?.kind ===
                    'delete'
                  ? 'inventory.deleteWarehouseDescription'
                  : 'inventory.archiveWarehouseDescription',
            {
                name:
                    pendingAction
                        ?.warehouse
                        .name ??
                    '',
            },
        );

    const confirmLabel =
        t(
            pendingAction?.kind ===
                'restore'
                ? 'inventory.restoreWarehouse'
                : pendingAction?.kind ===
                    'delete'
                  ? 'inventory.permanentDeleteWarehouse'
                  : 'inventory.archiveWarehouse',
        );

    return (
        <AppShell>
            <Head
                title={`${t(
                    'inventory.nav',
                )} · AccoNova`}
            />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-9">
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--ac-accent)] opacity-30" />

                                <span className="relative inline-flex size-2 rounded-full bg-[var(--ac-accent)]" />
                            </span>

                            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)]">
                                {t(
                                    'inventory.eyebrow',
                                )}
                            </p>
                        </div>

                        <h1 className="mt-3 max-w-[950px] text-[2rem] font-medium leading-[0.96] tracking-[-0.055em] sm:text-[2.8rem] md:text-[3.5rem] lg:text-[4.2rem]">
                            {t(
                                'inventory.title',
                            )}
                        </h1>

                        <p className="mt-4 max-w-[760px] text-[13px] leading-6 text-[var(--ac-text-soft)] sm:text-sm">
                            {t(
                                'inventory.subtitle',
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 rounded-[20px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] xl:flex-col xl:items-start xl:justify-end">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <WarehouseIcon
                                size={
                                    18
                                }
                            />
                        </div>

                        <div>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                {t(
                                    'inventory.activeWarehouses',
                                )}
                            </p>

                            <p className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
                                {metrics
                                    ?.active_warehouses ??
                                    0}
                            </p>
                        </div>
                    </div>
                </section>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Link
                        href="/app/inventory/intelligence"
                        className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] px-3 text-xs font-semibold text-[var(--ac-accent)] transition hover:-translate-y-px"
                    >
                        <Sparkles size={14} />
                        {ar ? 'ذكاء المخزون' : 'Inventory intelligence'}
                    </Link>

                    {canManage && (
                        <Link
                            href="/app/inventory/transfers"
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                        >
                            <ArrowRightLeft size={14} />
                            {ar ? 'طلبات نقل المستودعات' : 'Warehouse transfers'}
                        </Link>
                    )}

                    <Link
                        href="/app/inventory/production"
                        className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                    >
                        <Boxes size={14} />
                        {ar ? 'الإنتاج' : 'Production'}
                    </Link>
                </div>

                <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                        icon={
                            WarehouseIcon
                        }
                        label={t(
                            'inventory.activeWarehouses',
                        )}
                        value={String(
                            metrics
                                ?.active_warehouses ??
                                0,
                        )}
                    />

                    <MetricCard
                        icon={
                            Boxes
                        }
                        label={t(
                            'inventory.trackedProducts',
                        )}
                        value={String(
                            metrics
                                ?.tracked_products ??
                                0,
                        )}
                    />

                    <MetricCard
                        icon={
                            TrendingDown
                        }
                        label={t(
                            'inventory.lowStock',
                        )}
                        value={String(
                            metrics
                                ?.low_stock_products ??
                                0,
                        )}
                    />

                    <MetricCard
                        icon={
                            Archive
                        }
                        label={t(
                            'inventory.outOfStock',
                        )}
                        value={String(
                            metrics
                                ?.out_of_stock_products ??
                                0,
                        )}
                    />

                    <MetricCard
                        icon={
                            Boxes
                        }
                        label={t(
                            'inventory.inventoryValue',
                        )}
                        value={Number(
                            metrics
                                ?.inventory_value ??
                                0,
                        ).toLocaleString(
                            getLocale(),
                            {
                                minimumFractionDigits:
                                    2,

                                maximumFractionDigits:
                                    4,
                            },
                        )}
                    />
                </section>

                {workspace.activeOrganization && (
                    <InventoryIntelligencePanel
                        ar={ar}
                        currency={workspace.activeOrganization.currency ?? ''}
                    />
                )}

                {error && (
                    <div className="mt-5 rounded-[16px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                        {
                            error
                        }
                    </div>
                )}

                <section className="mt-8 overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-soft)]">
                    <header className="flex flex-col gap-4 border-b border-[var(--ac-line)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                        <div>
                            <h2 className="text-lg font-semibold tracking-[-0.035em]">
                                {t(
                                    'inventory.locations',
                                )}
                            </h2>

                            <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                {t(
                                    'inventory.locationsHelp',
                                )}
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex rounded-[13px] bg-[var(--ac-bg-soft)] p-1">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setStatus(
                                            'active',
                                        )
                                    }
                                    className={[
                                        'h-9 rounded-[10px] px-3 text-xs font-semibold',
                                        status ===
                                        'active'
                                            ? 'bg-white shadow-sm'
                                            : 'text-[var(--ac-text-muted)]',
                                    ].join(
                                        ' ',
                                    )}
                                >
                                    {t(
                                        'inventory.active',
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setStatus(
                                            'deleted',
                                        )
                                    }
                                    className={[
                                        'h-9 rounded-[10px] px-3 text-xs font-semibold',
                                        status ===
                                        'deleted'
                                            ? 'bg-white shadow-sm'
                                            : 'text-[var(--ac-text-muted)]',
                                    ].join(
                                        ' ',
                                    )}
                                >
                                    {t(
                                        'inventory.archived',
                                    )}
                                </button>
                            </div>

                            {canManage && (
                                <button
                                    type="button"
                                    onClick={
                                        createWarehouse
                                    }
                                    className="flex h-11 items-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-4 text-sm font-semibold text-white"
                                >
                                    <Plus
                                        size={
                                            15
                                        }
                                    />

                                    {t(
                                        'inventory.newWarehouse',
                                    )}
                                </button>
                            )}
                        </div>
                    </header>

                    {loading ? (
                        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
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
                                        className="h-[150px] animate-pulse rounded-[20px] bg-[var(--ac-bg-soft)]"
                                    />
                                ),
                            )}
                        </div>
                    ) : warehouses.length ===
                      0 ? (
                        <SmartEmptyState
                            icon={WarehouseIcon}
                            title={
                                status === 'deleted'
                                    ? t('inventory.noArchivedWarehouses')
                                    : t('inventory.noWarehouses')
                            }
                            description={
                                status === 'deleted'
                                    ? (
                                        ar
                                            ? 'لا توجد مستودعات مؤرشفة في هذا العرض.'
                                            : 'There are no archived warehouses in this view.'
                                    )
                                    : (
                                        ar
                                            ? 'أنشئ أول مستودع لتبدأ تتبع المخزون والحركات والكميات.'
                                            : 'Create the first warehouse to start tracking stock, movements, and quantities.'
                                    )
                            }
                            primary={
                                status !== 'deleted' && canManage
                                    ? (
                                        <button
                                            type="button"
                                            onClick={
                                                createWarehouse
                                            }
                                            className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[var(--ac-accent-solid)] px-5 text-sm font-semibold text-[var(--ac-accent-solid-text)]"
                                        >
                                            <Plus size={15} />
                                            {t('inventory.newWarehouse')}
                                        </button>
                                    )
                                    : undefined
                            }
                        />
                    ) : (
                        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
                            {warehouses.map(
                                (
                                    warehouse,
                                ) => (
                                    <WarehouseCard
                                        key={
                                            warehouse.id
                                        }
                                        warehouse={
                                            warehouse
                                        }
                                        canManage={
                                            canManage
                                        }
                                        canPermanentlyDelete={
                                            canPermanentlyDelete
                                        }
                                        onOpen={
                                            showWarehouse
                                        }
                                        onEdit={
                                            editWarehouse
                                        }
                                        onDefault={(
                                            selected,
                                        ) =>
                                            void makeWarehouseDefault(
                                                selected,
                                            )
                                        }
                                        onArchive={(
                                            selected,
                                        ) =>
                                            setPendingAction(
                                                {
                                                    kind:
                                                        'archive',

                                                    warehouse:
                                                        selected,
                                                },
                                            )
                                        }
                                        onRestore={(
                                            selected,
                                        ) =>
                                            setPendingAction(
                                                {
                                                    kind:
                                                        'restore',

                                                    warehouse:
                                                        selected,
                                                },
                                            )
                                        }
                                        onDelete={(
                                            selected,
                                        ) =>
                                            setPendingAction(
                                                {
                                                    kind:
                                                        'delete',

                                                    warehouse:
                                                        selected,
                                                },
                                            )
                                        }
                                    />
                                ),
                            )}
                        </div>
                    )}
                </section>

                <section className="mt-6 rounded-[24px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] sm:p-5">
                    <h2 className="text-lg font-semibold">
                        {t(
                            'inventory.recentMovements',
                        )}
                    </h2>

                    <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                        {t(
                            'inventory.recentMovementsHelp',
                        )}
                    </p>

                    {(
                        overview
                            ?.recent_movements
                            .length ??
                        0
                    ) === 0 ? (
                        <div className="mt-5 rounded-[18px] bg-[var(--ac-surface-soft)] px-4 py-8 text-center">
                            <p className="text-sm font-semibold">
                                {t(
                                    'inventory.noMovements',
                                )}
                            </p>

                            <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-[var(--ac-text-muted)]">
                                {t(
                                    'inventory.noMovementsHelp',
                                )}
                            </p>
                        </div>
                    ) : (
                        <div className="mt-4 divide-y divide-[var(--ac-line)]">
                            {overview?.recent_movements.map(
                                (
                                    movement,
                                ) => (
                                    <div
                                        key={
                                            movement.id
                                        }
                                        className="flex items-center gap-4 py-3"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold">
                                                {movement
                                                    .product
                                                    ?.name ??
                                                    '—'}
                                            </p>

                                            <p className="mt-0.5 text-[10px] text-[var(--ac-text-muted)]">
                                                {movementLabel(
                                                    movement.type,
                                                )}
                                                {' · '}
                                                {movement
                                                    .warehouse
                                                    ?.name ??
                                                    '—'}
                                            </p>
                                        </div>

                                        <bdi
                                            dir="ltr"
                                            className="text-sm font-semibold"
                                        >
                                            {Number(
                                                movement.quantity,
                                            ) >
                                            0
                                                ? '+'
                                                : ''}
                                            {
                                                movement.quantity
                                            }
                                        </bdi>
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </section>
            </main>

            <WarehouseEditorDrawer
                open={
                    editorOpen
                }
                warehouse={
                    editingWarehouse
                }
                onClose={() => {
                    setEditorOpen(
                        false,
                    );

                    setEditingWarehouse(
                        null,
                    );
                }}
                onSaved={(
                    saved,
                    created,
                ) => {
                    setSelectedWarehouse(
                        saved,
                    );

                    showToast(
                        t(
                            created
                                ? 'inventory.warehouseCreated'
                                : 'inventory.warehouseUpdated',
                        ),
                    );

                    void loadInventory();
                }}
            />

            <WarehouseDetailDrawer
                open={
                    selectedWarehouse !==
                    null
                }
                warehouse={
                    selectedWarehouse
                }
                canManage={
                    canManage
                }
                canPermanentlyDelete={
                    canPermanentlyDelete
                }
                onClose={() =>
                    setSelectedWarehouse(
                        null,
                    )
                }
                onEdit={(
                    warehouse,
                ) =>
                    editWarehouse(
                        warehouse,
                    )
                }
                onSetDefault={(
                    warehouse,
                ) =>
                    void makeWarehouseDefault(
                        warehouse,
                    )
                }
                onArchive={(
                    warehouse,
                ) =>
                    setPendingAction({
                        kind:
                            'archive',

                        warehouse,
                    })
                }
                onRestore={(
                    warehouse,
                ) =>
                    setPendingAction({
                        kind:
                            'restore',

                        warehouse,
                    })
                }
                onDelete={(
                    warehouse,
                ) =>
                    setPendingAction({
                        kind:
                            'delete',

                        warehouse,
                    })
                }
            />

            <ConfirmDialog
                open={
                    pendingAction !==
                    null
                }
                busy={
                    actionBusy
                }
                tone={
                    confirmTone
                }
                title={
                    confirmTitle
                }
                description={
                    confirmDescription
                }
                confirmLabel={
                    confirmLabel
                }
                onCancel={() =>
                    setPendingAction(
                        null,
                    )
                }
                onConfirm={
                    confirmWarehouseAction
                }
            />
        </AppShell>
    );
}

type MetricCardProps = {
    icon: LucideIcon;

    label: string;

    value: string;
};

/**
 * Render one Inventory operating metric.
 */
function MetricCard({
    icon: Icon,
    label,
    value,
}: MetricCardProps) {
    return (
        <div className="rounded-[19px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)]">
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

            <p className="mt-1 text-xl font-semibold">
                {
                    value
                }
            </p>
        </div>
    );
}

type WarehouseCardProps = {
    warehouse: Warehouse;

    canManage: boolean;

    canPermanentlyDelete: boolean;

    onOpen: (
        warehouse: Warehouse,
    ) => void;

    onEdit: (
        warehouse: Warehouse,
    ) => void;

    onDefault: (
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
 * Render one clickable warehouse card with compact lifecycle actions.
 */
function WarehouseCard({
    warehouse,
    canManage,
    canPermanentlyDelete,
    onOpen,
    onEdit,
    onDefault,
    onArchive,
    onRestore,
    onDelete,
}: WarehouseCardProps) {
    useLocale();

    const archived =
        warehouse.deleted_at !==
        null;

    const safeForPermanentDelete =
        archived &&
        warehouse.stocked_products_count ===
            0 &&
        warehouse.stock_movements_count ===
            0;

    /**
     * Open Show by keyboard without stealing keys from action buttons.
     */
    function handleKeyDown(
        event:
            KeyboardEvent<HTMLElement>,
    ): void {
        if (
            event.target !==
            event.currentTarget
        ) {
            return;
        }

        if (
            event.key ===
                'Enter'
            ||
            event.key ===
                ' '
        ) {
            event.preventDefault();

            onOpen(
                warehouse,
            );
        }
    }

    return (
        <article
            role="button"
            tabIndex={
                0
            }
            onClick={() =>
                onOpen(
                    warehouse,
                )
            }
            onKeyDown={
                handleKeyDown
            }
            className="cursor-pointer rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 outline-none transition hover:-translate-y-px hover:border-[var(--ac-accent)]/30 hover:shadow-[var(--ac-shadow-soft)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-white shadow-sm">
                        <WarehouseIcon
                            size={
                                16
                            }
                        />
                    </div>

                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">
                            {
                                warehouse.name
                            }
                        </h3>

                        <bdi
                            dir="ltr"
                            className="mt-1 block text-[10px] font-semibold text-[var(--ac-text-muted)]"
                        >
                            {
                                warehouse.code
                            }
                        </bdi>
                    </div>
                </div>

                {warehouse.is_default && (
                    <span className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--ac-accent-strong)]">
                        {t(
                            'inventory.defaultBadge',
                        )}
                    </span>
                )}
            </div>

            <div className="mt-5 flex items-end justify-between gap-3 border-t border-[var(--ac-line)] pt-4">
                <div>
                    <p className="text-xs text-[var(--ac-text-soft)]">
                        {t(
                            'inventory.stockedProducts',
                            {
                                count:
                                    warehouse.stocked_products_count,
                            },
                        )}
                    </p>

                    {warehouse.stock_movements_count >
                        0 && (
                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                            {t(
                                'inventory.stockHistory',
                            )}
                            :{' '}
                            {
                                warehouse.stock_movements_count
                            }
                        </p>
                    )}
                </div>

                {canManage && (
                    <div
                        className="flex gap-2"
                        onClick={(
                            event,
                        ) =>
                            event.stopPropagation()
                        }
                    >
                        {! archived &&
                            ! warehouse.is_default && (
                                <button
                                    type="button"
                                    title={t(
                                        'inventory.makeDefault',
                                    )}
                                    aria-label={t(
                                        'inventory.makeDefault',
                                    )}
                                    onClick={() =>
                                        onDefault(
                                            warehouse,
                                        )
                                    }
                                    className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"
                                >
                                    <Star
                                        size={
                                            14
                                        }
                                    />
                                </button>
                            )}

                        {! archived && (
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
                                className="flex size-9 items-center justify-center rounded-[12px] bg-white text-[var(--ac-text-soft)]"
                            >
                                <Pencil
                                    size={
                                        14
                                    }
                                />
                            </button>
                        )}

                        {! archived &&
                            ! warehouse.is_default && (
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
                                    className="flex size-9 items-center justify-center rounded-[12px] bg-white text-[var(--ac-text-muted)] hover:text-[var(--ac-danger)]"
                                >
                                    <Archive
                                        size={
                                            14
                                        }
                                    />
                                </button>
                            )}

                        {archived && (
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
                                className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"
                            >
                                <RotateCcw
                                    size={
                                        14
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
                                    className="flex size-9 items-center justify-center rounded-[12px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/6 text-[var(--ac-danger)]"
                                >
                                    <Trash2
                                        size={
                                            14
                                        }
                                    />
                                </button>
                            )}
                    </div>
                )}
            </div>
        </article>
    );
}

/**
 * Translate one stock movement type.
 */
function movementLabel(
    type: StockMovementType,
): string {
    return t(
        `inventory.movement.${type}` as
            | 'inventory.movement.opening'
            | 'inventory.movement.adjustment'
            | 'inventory.movement.transfer_out'
            | 'inventory.movement.transfer_in'
            | 'inventory.movement.sale'
            | 'inventory.movement.purchase'
            | 'inventory.movement.customer_return'
            | 'inventory.movement.supplier_return',
    );
}