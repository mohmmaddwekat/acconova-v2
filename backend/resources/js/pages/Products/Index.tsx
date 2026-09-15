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
import {
    FeedbackToast,
} from '@/components/feedback/FeedbackToast';
import {
    archiveProduct,
    fetchProducts,
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
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const activeOrganization =
        workspace.activeOrganization;

    const role =
        activeOrganization?.role;

    const allowEdit =
        canEditProducts(
            role,
        );

    const allowArchive =
        canArchiveProducts(
            role,
        );

    const [
        response,
        setResponse,
    ] =
        useState<ProductIndexResponse | null>(
            null,
        );

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

    const [
        toast,
        setToast,
    ] =
        useState<string | null>(
            null,
        );

    const [error, setError] =
        useState<string | null>(
            null,
        );

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
                            : 'AccoNova could not load the catalog.',
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
        setEditingProduct(
            product,
        );
        setEditorOpen(true);
    }

    /**
     * Execute the confirmed archive or restore operation.
     */
    async function confirmAction(): Promise<void> {
        if (! pendingAction) {
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

                setToast(
                    'Catalog item archived.',
                );
            } else {
                await restoreProduct(
                    pendingAction
                        .product.id,
                );

                setToast(
                    'Catalog item restored.',
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
                    : 'The catalog action could not be completed.',
            );
        }
    }

    const products =
        response?.data ??
        [];

    const total =
        response?.meta.total ??
        0;

    return (
        <AppShell>
            <Head title="Products & Services · AccoNova" />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-9">
                <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--ac-accent)] opacity-30" />

                                <span className="relative inline-flex size-2 rounded-full bg-[var(--ac-accent)]" />
                            </span>

                            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)]">
                                Business catalog
                            </p>
                        </div>

                        <h1 className="mt-3 max-w-[880px] text-[2rem] font-medium leading-[0.94] tracking-[-0.055em] sm:text-[2.8rem] md:text-[3.5rem] lg:text-[4.2rem]">
                            Sell once. Reuse
                            everywhere.
                        </h1>

                        <p className="mt-4 max-w-[650px] text-[13px] leading-6 text-[var(--ac-text-soft)] sm:text-sm">
                            Products and services become
                            reusable pricing building
                            blocks for quotes, invoices,
                            automation, and revenue
                            intelligence.
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
                                Catalog view
                            </p>

                            <p className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                                {total} items
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mt-7 overflow-visible rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] shadow-[var(--ac-shadow-soft)] lg:mt-10 lg:rounded-[28px]">
                    <div className="rounded-t-[22px] border-b border-[var(--ac-line)] bg-white p-3 sm:p-5 lg:rounded-t-[28px] lg:p-6">
                        <div className="grid gap-2 xl:grid-cols-[minmax(280px,1fr)_auto_auto]">
                            <div className="relative">
                                <Search
                                    size={15}
                                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
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
                                    placeholder="Search name, SKU, description, unit…"
                                    className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] pl-10 pr-11 text-sm outline-none focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
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
                                        className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center"
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

                            {allowEdit && (
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

                                    New item
                                </button>
                            )}
                        </div>

                        {(search ||
                            countProductFilters(
                                filters,
                            ) > 0) && (
                            <p className="mt-3 text-[11px] text-[var(--ac-text-muted)]">
                                Refined catalog view ·{' '}
                                {countProductFilters(
                                    filters,
                                )}{' '}
                                filters
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
                        <div className="px-4 py-16 text-center">
                            <div className="mx-auto flex size-12 items-center justify-center rounded-[18px] bg-[var(--ac-bg-soft)]">
                                <Package
                                    size={19}
                                />
                            </div>

                            <h2 className="mt-5 text-xl font-semibold">
                                Your catalog is ready
                                to grow.
                            </h2>

                            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ac-text-soft)]">
                                Add reusable products
                                and services now, then
                                pull them directly into
                                future quotes and
                                invoices.
                            </p>
                        </div>
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
                                        product={
                                            product
                                        }
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
                    onClose={() => {
                        setEditorOpen(
                            false,
                        );

                        setEditingProduct(
                            null,
                        );
                    }}
                    onSaved={(
                        saved,
                    ) => {
                        setToast(
                            editingProduct
                                ? 'Catalog item updated.'
                                : 'Catalog item created.',
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

                <ConfirmDialog
                    open={
                        pendingAction !==
                        null
                    }
                    title={
                        pendingAction?.kind ===
                        'restore'
                            ? 'Restore this catalog item?'
                            : 'Archive this catalog item?'
                    }
                    description={
                        pendingAction?.kind ===
                        'restore'
                            ? 'It will become available for new quotes and invoices again.'
                            : 'Historical documents remain intact, but this item will no longer be available for new business.'
                    }
                    confirmLabel={
                        pendingAction?.kind ===
                        'restore'
                            ? 'Restore'
                            : 'Archive'
                    }
                    tone={
                        pendingAction?.kind ===
                        'restore'
                            ? 'positive'
                            : 'danger'
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

                <FeedbackToast
                    message={
                        toast
                    }
                    onDismiss={() =>
                        setToast(
                            null,
                        )
                    }
                />
            </main>
        </AppShell>
    );
}