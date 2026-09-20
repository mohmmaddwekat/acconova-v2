import { ProductDataActions } from '@/features/products/components/ProductDataActions';
import { ProductImportDialog } from '@/features/products/components/ProductImportDialog';
import { BulkActionBar } from '@/components/data/BulkActionBar';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    Package,
    Plus,
    Search,
    X,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useState,
} from 'react';

import {
    DataPagination,
} from '@/components/data/DataPagination';
import {
    ConfirmDialog,
} from '@/components/feedback/ConfirmDialog';
import { useToast } from '@/components/feedback/ToastProvider';
import {
    archiveProduct,
    fetchProducts,
    fetchProduct,
    restoreProduct,
    type ProductFilters,
} from '@/features/products/api';
import {
    ProductDetailDrawer,
} from '@/features/products/components/ProductDetailDrawer';
import {
    ProductEditorDrawer,
} from '@/features/products/components/ProductEditorDrawer';
import {
    countProductFilters,
    ProductFilterPopover,
    type ProductFilterState,
} from '@/features/products/components/ProductFilterPopover';
import {
    ProductListItem,
} from '@/features/products/components/ProductListItem';
import {
    canArchiveProducts,
    canEditProducts,
} from '@/features/products/permissions';
import type {
    Product,
    ProductIndexResponse,
} from '@/features/products/types';
import {
    ApiError,
} from '@/lib/http';
import {
    AppShell,
} from '@/layouts/AppShell';
import type {
    AppPageProps,
} from '@/types/app';

type PendingAction = {
    kind:
        | 'archive'
        | 'restore';

    product: Product;
};

/**
 * Render the complete responsive Product and Service catalog workspace.
 */
export default function ProductsIndex() {
    const { workspace } = usePage<AppPageProps>().props;
    return <ProductsWorkspace key={workspace.activeOrganization?.id ?? 'none'} />;
}

/** Reset transient records, dialogs and selections when the authorized workspace changes. */
function ProductsWorkspace() {
    const ar = useLocale() === 'ar';
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const activeOrganization =
        workspace.activeOrganization;

    const role =
        activeOrganization?.role;

    const allowCreate = activeOrganization?.permissions ? activeOrganization.permissions.some(p=>['products.manage','products.create'].includes(p)) : canEditProducts(role);
    const allowEdit = activeOrganization?.permissions ? activeOrganization.permissions.some(p=>['products.manage','products.update'].includes(p)) : canEditProducts(role);

    const allowArchive = activeOrganization?.permissions ? activeOrganization.permissions.includes('products.archive') : canArchiveProducts(role);

    const [
        response,
        setResponse,
    ] =
        useState<ProductIndexResponse | null>(
            null,
        );

    const [importOpen, setImportOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [pendingBulk, setPendingBulk] = useState<{ action: 'archive' | 'restore'; ids: number[] } | null>(null);
    const [actionBusy, setActionBusy] = useState(false);

    const [loading, setLoading] =
        useState(false);

    const [
        draftSearch,
        setDraftSearch,
    ] = useState('');

    const [search, setSearch] =
        useState('');

    const [
        filters,
        setFilters,
    ] =
        useState<ProductFilterState>({
            status: 'active',
            sort: 'name_asc',
        });

    const [page, setPage] =
        useState(1);

    const [perPage, setPerPage] =
        useState(25);

    const [
        editorOpen,
        setEditorOpen,
    ] = useState(false);

    const [
        editingProduct,
        setEditingProduct,
    ] =
        useState<Product | null>(
            null,
        );

    const [
        copyingProduct,
        setCopyingProduct,
    ] =
        useState<Product | null>(
            null,
        );

    const [
        detailProduct,
        setDetailProduct,
    ] =
        useState<Product | null>(
            null,
        );

    const [
        pendingAction,
        setPendingAction,
    ] =
        useState<PendingAction | null>(
            null,
        );

    const { showToast } = useToast();

    const [error, setError] =
        useState<string | null>(
            null,
        );

    /*
     * Global search / quick-create deep links reuse the existing editor and
     * detail drawer rather than creating a second catalog workflow.
     */
    useEffect(() => {
        if (
            typeof window === 'undefined'
            || ! activeOrganization
        ) {
            return;
        }

        const url = new URL(window.location.href);
        const createRequested =
            url.searchParams.get('create') === '1';
        const focusId =
            Number(url.searchParams.get('focus') ?? 0);

        if (createRequested && allowCreate) {
            create();
            url.searchParams.delete('create');
            window.history.replaceState({}, '', url);
        }

        if (Number.isInteger(focusId) && focusId > 0) {
            url.searchParams.delete('focus');
            window.history.replaceState({}, '', url);

            void fetchProduct(focusId)
                .then((product) => {
                    setDetailProduct(product);
                })
                .catch(() => {
                    setError(
                        ar
                            ? 'تعذر فتح عنصر الكتالوج المطلوب.'
                            : 'The requested catalog item could not be opened.',
                    );
                });
        }
    }, [
        activeOrganization?.id,
        allowCreate,
        ar,
    ]);

    const productFilters:
        ProductFilters = {
        search,

        type:
            filters.type,

        status:
            filters.status,

        quality:
            filters.quality,

        sort:
            filters.sort,

        page,

        perPage,
    };

    /**
     * Load the current Product catalog page.
     */
    const loadProducts =
        useCallback(
            async (): Promise<void> => {
                if (
                    ! activeOrganization
                ) {
                    setResponse(null);

                    return;
                }

                setLoading(true);
                setError(null);

                try {
                    setResponse(
                        await fetchProducts(
                            productFilters,
                        ),
                    );
                } catch (
                    exception
                ) {
                    setError(
                        exception instanceof
                        ApiError
                            ? exception.message
                            : t('ui.acconova_could_not_load_the_catalog'),
                    );
                } finally {
                    setLoading(
                        false,
                    );
                }
            },
            [
                activeOrganization,
                filters.quality,
                filters.sort,
                filters.status,
                filters.type,
                page,
                perPage,
                search,
            ],
        );

    useEffect(() => {
        void loadProducts();
    }, [
        loadProducts,
    ]);

    useEffect(() => {
        const timeout =
            window.setTimeout(
                () => {
                    const next =
                        draftSearch.trim();

                    if (
                        next !== search
                    ) {
                        setSearch(
                            next,
                        );

                        setPage(1);
                    }
                },
                350,
            );

        return () => {
            window.clearTimeout(
                timeout,
            );
        };
    }, [
        draftSearch,
        search,
    ]);

    /**
     * Open a clean Product editor.
     */
    function create(): void {
        setEditingProduct(null);
        setCopyingProduct(null);
        setDetailProduct(null);
        setEditorOpen(true);
    }

    function copy(
        product: Product,
    ): void {
        setEditingProduct(null);
        setCopyingProduct(
            product,
        );
        setDetailProduct(null);
        setEditorOpen(true);
    }

    /**
     * Open one Product for editing.
     */
    function edit(
        product: Product,
    ): void {
        setDetailProduct(null);
        setCopyingProduct(null);
        setEditingProduct(
            product,
        );
        setEditorOpen(true);
    }

    /**
     * Execute the confirmed archive or restore operation.
     */
    async function confirmAction(): Promise<void> {
        if (! pendingAction || actionBusy) {
            return;
        }

        try {
            if (
                pendingAction.kind ===
                'archive'
            ) {
                await archiveProduct(
                    pendingAction
                        .product.id,
                );

                const archivedProduct =
                    pendingAction.product;

                showToast(
                    t('ui.catalog_item_archived'),
                    'success',
                    {
                        label:
                            ar
                                ? 'تراجع'
                                : 'Undo',
                        run:
                            async () => {
                                await restoreProduct(
                                    archivedProduct.id,
                                );
                                await loadProducts();
                            },
                    },
                    8000,
                );
            } else {
                await restoreProduct(
                    pendingAction
                        .product.id,
                );

                showToast(
                    t('ui.catalog_item_restored'),
                );
            }

            setPendingAction(null);
            setDetailProduct(null);

            await loadProducts();
        } catch (exception) {
            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : t('ui.the_catalog_action_could_not_be_completed'),
            );
        }
    }

    useEffect(() => {
        setSelectedIds(new Set());
    }, [filters, page, perPage, search, activeOrganization?.id]);

    /** Apply only the confirmed selection; the server authorizes every record atomically. */
    async function confirmBulkAction(): Promise<void> {
        if (!pendingBulk || actionBusy) return;
        setActionBusy(true);
        try {
            const result = await apiRequest<{ data: { affected: number } }>('/api/products/bulk-action', {
                method: 'POST', body: JSON.stringify({ action: pendingBulk.action, product_ids: pendingBulk.ids }),
            });
            showToast(t('products.bulkSuccess', { count: result.data.affected }));
            setPendingBulk(null);
            setSelectedIds(new Set());
            setDetailProduct(null);
            await loadProducts();
        } catch (error) {
            showToast(error instanceof ApiError ? error.message : t('errors.unexpected'), 'error');
        } finally { setActionBusy(false); }
    }

    const products =
        response?.data ??
        [];

    const total =
        response?.meta.total ??
        0;

    return (
        <AppShell>
            <Head title={t('ui.products_services_acconova')} />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-9">
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-[var(--ac-accent)] opacity-30" />

                                <span className="relative inline-flex size-2 rounded-full bg-[var(--ac-accent)]" />
                            </span>

                            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)]">
                                {t('ui.business_catalog')}
                            </p>
                        </div>

                        <h1 className="mt-3 max-w-[880px] text-[2rem] font-medium leading-[0.94] tracking-[-0.055em] sm:text-[2.8rem] md:text-[3.5rem] lg:text-[4.2rem]">
                            {t('ui.sell_once_reuse_everywhere')}
                        </h1>

                        <p className="mt-4 max-w-[650px] text-[13px] leading-6 text-[var(--ac-text-soft)] sm:text-sm">
                            {t('ui.products_and_services_become_reusable_pricing_building_blocks_for_quotes_invoices_aut')}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 rounded-[20px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] xl:flex-col xl:items-start xl:justify-end">
                        <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <Package
                                size={17}
                            />
                        </div>

                        <div>
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                {t('ui.catalog_view')}
                            </p>

                            <p className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                                {t('count.items', { count: total })}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mt-7 overflow-visible rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] shadow-[var(--ac-shadow-soft)] lg:mt-10 lg:rounded-[28px]">
                    <div className="rounded-t-[22px] border-b border-[var(--ac-line)] bg-white p-3 sm:p-5 lg:rounded-t-[28px] lg:p-6">
                        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                            <div className="relative">
                                <Search
                                    size={15}
                                    className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                />

                                <input
                                    value={
                                        draftSearch
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setDraftSearch(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    placeholder={t('ui.search_name_sku_description_unit')}
                                    className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] ps-10 pe-11 text-sm outline-none focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                />

                                {draftSearch && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDraftSearch(
                                                '',
                                            );

                                            setSearch(
                                                '',
                                            );

                                            setPage(
                                                1,
                                            );
                                        }}
                                        className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center"
                                    >
                                        <X
                                            size={14}
                                        />
                                    </button>
                                )}
                            </div>

                            <ProductFilterPopover
                                value={
                                    filters
                                }
                                onChange={(
                                    next,
                                ) => {
                                    setFilters(
                                        next,
                                    );

                                    setPage(
                                        1,
                                    );
                                }}
                            />

                            <SavedViews
                                storageKey={`acconova:saved-views:products:${activeOrganization?.id ?? 'none'}`}
                                ar={ar}
                                value={{
                                    search,
                                    filters,
                                    perPage,
                                }}
                                onApply={(saved) => {
                                    setDraftSearch(saved.search);
                                    setSearch(saved.search);
                                    setFilters(saved.filters);
                                    setPerPage(saved.perPage);
                                    setPage(1);
                                }}
                            />

                            <ProductDataActions filters={productFilters} canImport={allowEdit && allowCreate} onImport={() => setImportOpen(true)} />
                            {allowCreate && (
                                <button
                                    type="button"
                                    onClick={
                                        create
                                    }
                                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white"
                                >
                                    <Plus
                                        size={16}
                                    />

                                    {t('ui.new_item')}
                                </button>
                            )}
                        </div>

                        {(search ||
                            countProductFilters(
                                filters,
                            ) > 0) && (
                            <p className="mt-3 text-[11px] text-[var(--ac-text-muted)]">
                                {t('ui.refined_catalog_view')}{' '}
                                {t('count.filters', { count: countProductFilters(filters) })}
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className="border-b border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="space-y-3 p-3 lg:space-y-0 lg:p-0">
                            {[
                                1,
                                2,
                                3,
                                4,
                            ].map(
                                (
                                    value,
                                ) => (
                                    <div
                                        key={
                                            value
                                        }
                                        className="h-[160px] animate-pulse rounded-[20px] bg-white/60 lg:h-[88px] lg:rounded-none lg:border-b lg:border-[var(--ac-line)]"
                                    />
                                ),
                            )}
                        </div>
                    ) : products.length ===
                      0 ? (
                        <SmartEmptyState
                            icon={Package}
                            title={t('ui.your_catalog_is_ready_to_grow')}
                            description={t('ui.add_reusable_products_and_services_now_then_pull_them_directly_into_future_quotes_and')}
                            primary={allowCreate ? (
                                <button
                                    type="button"
                                    onClick={create}
                                    className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[var(--ac-accent-solid)] px-5 text-sm font-semibold text-[var(--ac-accent-solid-text)]"
                                >
                                    <Plus size={15} />
                                    {t('ui.new_item')}
                                </button>
                            ) : undefined}
                            secondary={(allowEdit && allowCreate) ? (
                                <button
                                    type="button"
                                    onClick={() => setImportOpen(true)}
                                    className="inline-flex h-11 items-center rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-5 text-sm font-semibold text-[var(--ac-text-soft)]"
                                >
                                    {ar ? 'استيراد Excel / CSV' : 'Import Excel / CSV'}
                                </button>
                            ) : undefined}
                        />
                    ) : (
                        <div>
                            {products.map(
                                (
                                    product,
                                ) => (
                                    <ProductListItem
                                        key={
                                            product.id
                                        }
                                        product={product}
                                        selected={selectedIds.has(product.id)}
                                        selectable={allowArchive}
                                        onSelectionChange={(selected) => setSelectedIds((current) => {
                                            const next = new Set(current);
                                            if (selected) next.add(product.id); else next.delete(product.id);
                                            return next;
                                        })}
                                        canEdit={
                                            allowEdit
                                        }
                                        canArchive={
                                            allowArchive
                                        }
                                        onView={
                                            setDetailProduct
                                        }
                                        onEdit={
                                            edit
                                        }
                                        onArchive={(
                                            value,
                                        ) =>
                                            setPendingAction({
                                                kind: 'archive',
                                                product:
                                                    value,
                                            })
                                        }
                                        onRestore={(
                                            value,
                                        ) =>
                                            setPendingAction({
                                                kind: 'restore',
                                                product:
                                                    value,
                                            })
                                        }
                                    />
                                ),
                            )}
                        </div>
                    )}

                    <DataPagination
                        page={
                            response?.meta
                                .current_page ??
                            1
                        }
                        lastPage={
                            response?.meta
                                .last_page ??
                            1
                        }
                        perPage={
                            perPage
                        }
                        total={
                            total
                        }
                        loading={
                            loading
                        }
                        onPageChange={
                            setPage
                        }
                        onPerPageChange={(
                            value,
                        ) => {
                            setPerPage(
                                value,
                            );

                            setPage(
                                1,
                            );
                        }}
                    />
                </section>

                <ProductEditorDrawer
                    open={
                        editorOpen
                    }
                    product={
                        editingProduct
                    }
                    copyFrom={
                        copyingProduct
                    }
                    onClose={() => {
                        setEditorOpen(
                            false,
                        );

                        setEditingProduct(
                            null,
                        );
                        setCopyingProduct(
                            null,
                        );
                    }}
                    onSaved={(
                        saved,
                    ) => {
                        showToast(
                            editingProduct
                                ? t('ui.catalog_item_updated')
                                : copyingProduct
                                    ? (
                                        ar
                                            ? 'تم إنشاء نسخة جديدة من العنصر.'
                                            : 'A new copy of the item was created.'
                                    )
                                    : t('ui.catalog_item_created'),
                        );

                        setDetailProduct(
                            saved,
                        );

                        void loadProducts();
                    }}
                />

                <ProductDetailDrawer
                    open={
                        detailProduct !==
                        null
                    }
                    product={
                        detailProduct
                    }
                    canEdit={
                        allowEdit
                    }
                    canArchive={
                        allowArchive
                    }
                    onClose={() =>
                        setDetailProduct(
                            null,
                        )
                    }
                    onEdit={
                        edit
                    }
                    onCopy={
                        copy
                    }
                    onArchive={(
                        value,
                    ) =>
                        setPendingAction({
                            kind: 'archive',
                            product:
                                value,
                        })
                    }
                    onRestore={(
                        value,
                    ) =>
                        setPendingAction({
                            kind: 'restore',
                            product:
                                value,
                        })
                    }
                />

                <ProductImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={(result) => {
                    showToast(t('import.complete', result)); setPage(1); void loadProducts();
                }} />
                <BulkActionBar selectedCount={selectedIds.size} action={filters.status === 'deleted' ? 'restore' : 'archive'} allPageSelected={products.length > 0 && products.every((item) => selectedIds.has(item.id))}
                    onTogglePage={() => setSelectedIds(products.every((item) => selectedIds.has(item.id)) ? new Set() : new Set(products.map((item) => item.id)))}
                    onClear={() => setSelectedIds(new Set())}
                    onAction={() => setPendingBulk({ action: filters.status === 'deleted' ? 'restore' : 'archive', ids: [...selectedIds] })} />
                <ConfirmDialog open={pendingBulk !== null} title={t(pendingBulk?.action === 'restore' ? 'products.bulkRestore' : 'products.bulkArchive')}
                    description={t('products.bulkDescription', { count: pendingBulk?.ids.length ?? 0 })} confirmLabel={t(pendingBulk?.action === 'restore' ? 'ui.restore_selected' : 'ui.archive_selected')}
                    tone={pendingBulk?.action === 'restore' ? 'positive' : 'warning'} busy={actionBusy} onCancel={() => setPendingBulk(null)} onConfirm={() => void confirmBulkAction()} />
                <ConfirmDialog
                    open={
                        pendingAction !==
                        null
                    }
                    title={
                        pendingAction?.kind ===
                        'restore'
                            ? t('ui.restore_this_catalog_item')
                            : t('ui.archive_this_catalog_item')
                    }
                    description={
                        pendingAction?.kind ===
                        'restore'
                            ? t('ui.it_will_become_available_for_new_quotes_and_invoices_again')
                            : t('ui.historical_documents_remain_intact_but_this_item_will_no_longer_be_available_for_new_')
                    }
                    confirmLabel={
                        pendingAction?.kind ===
                        'restore'
                            ? t('ui.restore')
                            : t('ui.archive')
                    }
                    tone={
                        pendingAction?.kind ===
                        'restore'
                            ? 'positive'
                            : 'warning'
                    }
                    onCancel={() =>
                        setPendingAction(
                            null,
                        )
                    }
                    onConfirm={() =>
                        void confirmAction()
                    }
                />
            </main>
        </AppShell>
    );
}