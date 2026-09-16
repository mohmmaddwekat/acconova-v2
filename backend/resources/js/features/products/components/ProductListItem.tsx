import {
    PermanentDeleteControl,
} from '@/components/data/PermanentDeleteControl';
import type {
    Product,
} from '@/features/products/types';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    getLocale,
} from '@/lib/locale';
import {
    Archive,
    ArrowUpRight,
    Package,
    Pencil,
    RotateCcw,
    Wrench,
} from 'lucide-react';
import type {
    MouseEvent as ReactMouseEvent,
} from 'react';

type ProductListItemProps = {
    product: Product;

    selected?: boolean;

    selectable?: boolean;

    onSelectionChange?: (
        selected: boolean,
    ) => void;

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
 * Render one responsive Product or Service operating row.
 *
 * Directional identifiers such as SKU values preserve their LTR character
 * order without changing the surrounding RTL column alignment.
 */
export function ProductListItem({
    product,
    selected = false,
    selectable = false,
    onSelectionChange,
    canEdit,
    canArchive,
    onView,
    onEdit,
    onArchive,
    onRestore,
}: ProductListItemProps) {
    useLocale();

    const archived =
        product.deleted_at !==
        null;

    /**
     * Open Product details from a deliberate double-click without
     * intercepting interactive controls.
     */
    function handleRowDoubleClick(
        event: ReactMouseEvent<HTMLElement>,
    ): void {
        const target =
            event.target instanceof
            Element
                ? event.target
                : null;

        if (
            target?.closest(
                'button, a, input, textarea, select, label',
            )
        ) {
            return;
        }

        event.preventDefault();

        onView(
            product,
        );
    }

    const restoreLabel =
        t(
            'action.restore',
            {
                name:
                    product.name,
            },
        );

    return (
        <article
            data-selected={
                selected
                    ? 'true'
                    : 'false'
            }
            onDoubleClick={
                handleRowDoubleClick
            }
            className="ac-index-row group mx-3 my-3 grid gap-4 rounded-[20px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] sm:mx-4 sm:p-5 lg:m-0 lg:grid-cols-[minmax(240px,1.4fr)_minmax(120px,.6fr)_minmax(140px,.7fr)_minmax(120px,.6fr)_auto] lg:items-center lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none"
        >
            <div className="flex min-w-0 items-center gap-2">
                {selectable && (
                    <input
                        type="checkbox"
                        checked={
                            selected
                        }
                        onChange={(
                            event,
                        ) =>
                            onSelectionChange?.(
                                event
                                    .target
                                    .checked,
                            )
                        }
                        aria-label={t(
                            'action.select',
                            {
                                name:
                                    product.name,
                            },
                        )}
                        className="size-5 shrink-0 cursor-pointer accent-[var(--ac-accent-strong)]"
                    />
                )}

                <button
                    type="button"
                    onClick={() =>
                        onView(
                            product,
                        )
                    }
                    className="flex min-w-0 flex-1 items-start gap-3 text-start lg:items-center"
                >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-surface-strong)] text-[var(--ac-text-soft)] transition duration-200 group-hover:bg-[var(--ac-accent-soft)] group-hover:text-[var(--ac-accent-strong)]">
                        {product.type ===
                        'service' ? (
                            <Wrench
                                size={
                                    17
                                }
                            />
                        ) : (
                            <Package
                                size={
                                    17
                                }
                            />
                        )}
                    </div>

                    <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold tracking-[-0.025em]">
                            {
                                product.name
                            }
                        </p>

                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--ac-accent-strong)]">
                                {t(
                                    product.type ===
                                        'service'
                                        ? 'ui.service'
                                        : product.type === 'raw_material' ? 'production.rawMaterial' : 'ui.product',
                                )}
                            </span>

                            {archived && (
                                <span className="rounded-full bg-[var(--ac-danger)]/8 px-2.5 py-1 text-[9px] font-semibold uppercase text-[var(--ac-danger)]">
                                    {t(
                                        'ui.archived',
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                </button>
            </div>

            <div className="min-w-0 text-xs">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                    {t(
                        'ui.sku',
                    )}
                </p>

                <p className="mt-1 truncate font-semibold">
                    <bdi dir="ltr">
                        {product.sku ??
                            t(
                                'ui.no_sku',
                            )}
                    </bdi>
                </p>
            </div>

            <div className="text-xs">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                    {t(
                        'ui.selling_price',
                    )}
                </p>

                <p className="mt-1 text-base font-semibold tracking-[-0.03em]">
                    {Number(
                        product.unit_price,
                    ).toLocaleString(
                        getLocale(),
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
                    {t(
                        'ui.unit_tax',
                    )}
                </p>

                <p className="mt-1 font-semibold">
                    {
                        product.unit
                    }{' '}
                    ·{' '}
                    {Number(
                        product.tax_rate,
                    )}
                    %
                </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[var(--ac-line)] pt-3 lg:justify-end lg:border-0 lg:pt-0">
                <button
                    type="button"
                    aria-label={t(
                        'action.view',
                        {
                            name:
                                product.name,
                        },
                    )}
                    onClick={() =>
                        onView(
                            product,
                        )
                    }
                    className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] transition duration-200 hover:bg-[var(--ac-surface-strong)]"
                >
                    <ArrowUpRight
                        size={
                            15
                        }
                    />
                </button>

                {! archived &&
                    canEdit && (
                        <button
                            type="button"
                            aria-label={t(
                                'action.edit',
                                {
                                    name:
                                        product.name,
                                },
                            )}
                            onClick={() =>
                                onEdit(
                                    product,
                                )
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] transition duration-200 hover:bg-[var(--ac-surface-strong)]"
                        >
                            <Pencil
                                size={
                                    15
                                }
                            />
                        </button>
                    )}

                {! archived &&
                    canArchive && (
                        <button
                            type="button"
                            aria-label={t(
                                'action.archive',
                                {
                                    name:
                                        product.name,
                                },
                            )}
                            onClick={() =>
                                onArchive(
                                    product,
                                )
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] transition duration-200 hover:bg-[var(--ac-danger)]/8 hover:text-[var(--ac-danger)]"
                        >
                            <Archive
                                size={
                                    15
                                }
                            />
                        </button>
                    )}

                {archived &&
                    canArchive && (
                        <button
                            type="button"
                            aria-label={
                                restoreLabel
                            }
                            title={
                                restoreLabel
                            }
                            onClick={() =>
                                onRestore(
                                    product,
                                )
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] transition duration-200 hover:-translate-y-px hover:bg-[var(--ac-accent)]/18 active:scale-95 motion-reduce:transform-none"
                        >
                            <RotateCcw
                                size={
                                    15
                                }
                            />
                        </button>
                    )}

                {archived && (
                    <PermanentDeleteControl
                        resource="products"
                        recordId={
                            product.id
                        }
                        recordName={
                            product.name
                        }
                        onDeleted={() => {
                            /*
                             * The shared control refreshes the Index after a
                             * successful permanent deletion.
                             */
                        }}
                    />
                )}
            </div>
        </article>
    );
}
