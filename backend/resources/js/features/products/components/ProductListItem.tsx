import {
    Archive,
    ArrowUpRight,
    Package,
    Pencil,
    RotateCcw,
    Wrench,
} from 'lucide-react';

import type {
    Product,
} from '@/features/products/types';

type ProductListItemProps = {
    product: Product;

    canEdit: boolean;

    canArchive: boolean;

    onView: (
        product: Product,
    ) => void;

    onEdit: (
        product: Product,
    ) => void;

    onArchive: (
        product: Product,
    ) => void;

    onRestore: (
        product: Product,
    ) => void;
};

/**
 * Render one responsive Product or Service catalog row.
 */
export function ProductListItem({
    product,
    canEdit,
    canArchive,
    onView,
    onEdit,
    onArchive,
    onRestore,
}: ProductListItemProps) {
    const archived =
        product.deleted_at !==
        null;

    return (
        <article className="mx-3 my-3 grid gap-4 rounded-[20px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] transition hover:border-[var(--ac-line-strong)] sm:mx-4 sm:p-5 lg:m-0 lg:grid-cols-[minmax(240px,1.4fr)_minmax(120px,.6fr)_minmax(140px,.7fr)_minmax(120px,.6fr)_auto] lg:items-center lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none">
            <button
                type="button"
                onClick={() =>
                    onView(
                        product,
                    )
                }
                className="flex min-w-0 items-start gap-3 text-left lg:items-center"
            >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-surface-strong)] text-[var(--ac-text-soft)]">
                    {product.type ===
                    'service' ? (
                        <Wrench
                            size={17}
                        />
                    ) : (
                        <Package
                            size={17}
                        />
                    )}
                </div>

                <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold tracking-[-0.025em]">
                        {product.name}
                    </p>

                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--ac-accent-strong)]">
                            {product.type}
                        </span>

                        {archived && (
                            <span className="rounded-full bg-[var(--ac-danger)]/8 px-2.5 py-1 text-[9px] font-semibold uppercase text-[var(--ac-danger)]">
                                Archived
                            </span>
                        )}
                    </div>
                </div>
            </button>

            <div className="text-xs">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                    SKU
                </p>

                <p className="mt-1 font-semibold">
                    {product.sku ??
                        'No SKU'}
                </p>
            </div>

            <div className="text-xs">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                    Selling price
                </p>

                <p className="mt-1 text-base font-semibold tracking-[-0.03em]">
                    {Number(
                        product.unit_price,
                    ).toLocaleString(
                        undefined,
                        {
                            minimumFractionDigits:
                                2,
                            maximumFractionDigits:
                                4,
                        },
                    )}
                </p>
            </div>

            <div className="text-xs">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                    Unit · Tax
                </p>

                <p className="mt-1 font-semibold">
                    {product.unit} ·{' '}
                    {Number(
                        product.tax_rate,
                    )}%
                </p>
            </div>

            <div className="flex gap-2 border-t border-[var(--ac-line)] pt-3 lg:justify-end lg:border-0 lg:pt-0">
                <button
                    type="button"
                    onClick={() =>
                        onView(
                            product,
                        )
                    }
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] text-xs font-semibold lg:size-9 lg:flex-none"
                >
                    <ArrowUpRight
                        size={15}
                    />

                    <span className="lg:hidden">
                        View
                    </span>
                </button>

                {! archived &&
                    canEdit && (
                        <button
                            type="button"
                            onClick={() =>
                                onEdit(
                                    product,
                                )
                            }
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] text-xs font-semibold lg:size-9 lg:flex-none"
                        >
                            <Pencil
                                size={15}
                            />

                            <span className="lg:hidden">
                                Edit
                            </span>
                        </button>
                    )}

                {! archived &&
                    canArchive && (
                        <button
                            type="button"
                            onClick={() =>
                                onArchive(
                                    product,
                                )
                            }
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] text-xs font-semibold hover:text-[var(--ac-danger)] lg:size-9 lg:flex-none"
                        >
                            <Archive
                                size={15}
                            />

                            <span className="lg:hidden">
                                Archive
                            </span>
                        </button>
                    )}

                {archived &&
                    canArchive && (
                        <button
                            type="button"
                            onClick={() =>
                                onRestore(
                                    product,
                                )
                            }
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-soft)] px-3 text-xs font-semibold text-[var(--ac-accent-strong)]"
                        >
                            <RotateCcw
                                size={15}
                            />

                            Restore
                        </button>
                    )}
            </div>
        </article>
    );
}