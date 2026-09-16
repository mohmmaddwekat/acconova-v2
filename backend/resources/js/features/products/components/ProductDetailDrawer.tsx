import { useDialog } from '@/components/feedback/useDialog';
import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
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
    useLocale();
    const dialogRef = useDialog(open, onClose, false);
    /** Keep the current editor visible until its mutation has finished. */
    function closeDialog(): void { if (!false) onClose(); }

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
                aria-label={t('ui.close_catalog_details')}
                onClick={closeDialog}
                className="absolute inset-0 bg-[var(--ac-text)]/20 backdrop-blur-[3px]"
            />

            <aside ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('ui.catalog_context')} className="absolute inset-y-0 end-0 z-10 flex w-full flex-col border-s border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[580px]">
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
                                    {t('ui.catalog_context')}
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
                            onClick={closeDialog}
                            className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)]"
                        >
                            <X size={17} />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Metric
                            label={t('ui.selling_price')}
                            value={Number(
                                resolvedProduct.unit_price,
                            ).toLocaleString()}
                        />

                        <Metric
                            label={t('ui.cost')}
                            value={
                                resolvedProduct.cost_price
                                    ? Number(
                                          resolvedProduct.cost_price,
                                      ).toLocaleString()
                                    : t('ui.not_provided')
                            }
                        />

                        <Metric
                            label={t('ui.unit')}
                            value={
                                resolvedProduct.unit
                            }
                        />

                        <Metric
                            label={t('ui.tax')}
                            value={`${Number(
                                resolvedProduct.tax_rate,
                            )}%`}
                        />
                    </div>

                    <section className="mt-7">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            {t('ui.identity')}
                        </p>

                        <div className="mt-3 overflow-hidden rounded-[18px] border border-[var(--ac-line)]">
                            <Row
                                label={t('ui.type')}
                                value={
                                    resolvedProduct.type ===
                                    'service'
                                        ? t('ui.service')
                                        : t('ui.product')
                                }
                            />

                            <Row
                                label={t('ui.sku')}
                                value={
                                    resolvedProduct.sku ??
                                    t('ui.not_provided')
                                }
                            />

                            <Row
                                label={t('ui.status')}
                                value={
                                    archived
                                        ? t('ui.archived')
                                        : t('ui.active')
                                }
                            />
                        </div>
                    </section>

                    <section className="mt-7">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            {t('ui.description')}
                        </p>

                        <div className="mt-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 text-sm leading-6 text-[var(--ac-text-soft)]">
                            {resolvedProduct.description ??
                                t('ui.no_description_has_been_added')}
                        </div>
                    </section>

                    {archived && (
                        <div className="mt-7 rounded-[18px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 p-4">
                            <p className="text-sm font-semibold text-[var(--ac-danger)]">
                                {t('ui.archived_catalog_item')}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[var(--ac-text-soft)]">
                                {t('ui.historical_documents_may_still_reference_it_but_it_must_not_be_used_on_new_quotes_or_')}
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

                                {t('ui.edit')}
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

                                {t('ui.archive')}
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

                                {t('ui.restore')}
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
    useLocale();
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
    useLocale();
    return (
        <div className="flex justify-between gap-5 border-b border-[var(--ac-line)] px-4 py-3.5 last:border-b-0">
            <span className="text-xs text-[var(--ac-text-muted)]">
                {label}
            </span>

            <span className="text-end text-xs font-semibold">
                {value}
            </span>
        </div>
    );
}