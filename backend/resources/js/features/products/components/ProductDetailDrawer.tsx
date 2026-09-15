import {
    Archive,
    Package,
    Pencil,
    RotateCcw,
    Wrench,
    X,
} from 'lucide-react';

import type {
    Product,
} from '@/features/products/types';

type ProductDetailDrawerProps = {
    open: boolean;

    product:
        | Product
        | null;

    canEdit: boolean;

    canArchive: boolean;

    onClose: () => void;

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
 * Render a read-oriented Product or Service context surface.
 */
export function ProductDetailDrawer({
    open,
    product,
    canEdit,
    canArchive,
    onClose,
    onEdit,
    onArchive,
    onRestore,
}: ProductDetailDrawerProps) {
    if (
        ! open ||
        ! product
    ) {
        return null;
    }

    const resolvedProduct:
        Product = product;

    const archived =
        resolvedProduct.deleted_at !==
        null;

    return (
        <div className="fixed inset-0 z-[120]">
            <button
                type="button"
                aria-label="Close catalog details"
                onClick={
                    onClose
                }
                className="absolute inset-0 bg-[var(--ac-text)]/20 backdrop-blur-[3px]"
            />

            <aside className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[580px]">
                <header className="border-b border-[var(--ac-line)] p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 gap-3">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-[var(--ac-surface-strong)]">
                                {resolvedProduct.type ===
                                'service' ? (
                                    <Wrench
                                        size={20}
                                    />
                                ) : (
                                    <Package
                                        size={20}
                                    />
                                )}
                            </div>

                            <div className="min-w-0">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                                    Catalog context
                                </p>

                                <h2 className="mt-1 break-words text-2xl font-semibold tracking-[-0.045em]">
                                    {
                                        resolvedProduct.name
                                    }
                                </h2>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={
                                onClose
                            }
                            className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)]"
                        >
                            <X size={17} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Metric
                            label="Selling price"
                            value={Number(
                                resolvedProduct.unit_price,
                            ).toLocaleString()}
                        />

                        <Metric
                            label="Cost"
                            value={
                                resolvedProduct.cost_price
                                    ? Number(
                                          resolvedProduct.cost_price,
                                      ).toLocaleString()
                                    : 'Not provided'
                            }
                        />

                        <Metric
                            label="Unit"
                            value={
                                resolvedProduct.unit
                            }
                        />

                        <Metric
                            label="Tax"
                            value={`${Number(
                                resolvedProduct.tax_rate,
                            )}%`}
                        />
                    </div>

                    <section className="mt-7">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            Identity
                        </p>

                        <div className="mt-3 overflow-hidden rounded-[18px] border border-[var(--ac-line)]">
                            <Row
                                label="Type"
                                value={
                                    resolvedProduct.type ===
                                    'service'
                                        ? 'Service'
                                        : 'Product'
                                }
                            />

                            <Row
                                label="SKU"
                                value={
                                    resolvedProduct.sku ??
                                    'Not provided'
                                }
                            />

                            <Row
                                label="Status"
                                value={
                                    archived
                                        ? 'Archived'
                                        : 'Active'
                                }
                            />
                        </div>
                    </section>

                    <section className="mt-7">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            Description
                        </p>

                        <div className="mt-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 text-sm leading-6 text-[var(--ac-text-soft)]">
                            {resolvedProduct.description ??
                                'No description has been added.'}
                        </div>
                    </section>

                    {archived && (
                        <div className="mt-7 rounded-[18px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 p-4">
                            <p className="text-sm font-semibold text-[var(--ac-danger)]">
                                Archived catalog item
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[var(--ac-text-soft)]">
                                Historical documents may
                                still reference it, but it
                                must not be used on new
                                quotes or invoices until
                                restored.
                            </p>
                        </div>
                    )}
                </div>

                <footer className="grid gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:flex sm:justify-end sm:px-6">
                    {! archived &&
                        canEdit && (
                            <button
                                type="button"
                                onClick={() =>
                                    onEdit(
                                        resolvedProduct,
                                    )
                                }
                                className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white px-5 text-sm font-semibold"
                            >
                                <Pencil
                                    size={15}
                                />

                                Edit
                            </button>
                        )}

                    {! archived &&
                        canArchive && (
                            <button
                                type="button"
                                onClick={() =>
                                    onArchive(
                                        resolvedProduct,
                                    )
                                }
                                className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white"
                            >
                                <Archive
                                    size={15}
                                />

                                Archive
                            </button>
                        )}

                    {archived &&
                        canArchive && (
                            <button
                                type="button"
                                onClick={() =>
                                    onRestore(
                                        resolvedProduct,
                                    )
                                }
                                className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-accent-strong)] px-5 text-sm font-semibold text-white"
                            >
                                <RotateCcw
                                    size={15}
                                />

                                Restore
                            </button>
                        )}
                </footer>
            </aside>
        </div>
    );
}

type MetricProps = {
    label: string;

    value: string;
};

/**
 * Render one compact catalog metric.
 */
function Metric({
    label,
    value,
}: MetricProps) {
    return (
        <div className="rounded-[17px] border border-[var(--ac-line)] bg-white p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                {label}
            </p>

            <p className="mt-2 text-lg font-semibold tracking-[-0.035em]">
                {value}
            </p>
        </div>
    );
}

type RowProps = {
    label: string;

    value: string;
};

/**
 * Render one Product identity row.
 */
function Row({
    label,
    value,
}: RowProps) {
    return (
        <div className="flex justify-between gap-5 border-b border-[var(--ac-line)] px-4 py-3.5 last:border-b-0">
            <span className="text-xs text-[var(--ac-text-muted)]">
                {label}
            </span>

            <span className="text-right text-xs font-semibold">
                {value}
            </span>
        </div>
    );
}