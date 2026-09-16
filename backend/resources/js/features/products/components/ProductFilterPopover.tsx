import {
    Archive,
    ArrowDownAZ,
    ArrowUpAZ,
    Clock3,
    DollarSign,
    Filter,
    History,
    Package,
    ShieldCheck,
    Tag,
    Wrench,
} from 'lucide-react';
import {
    useState,
} from 'react';

import {
    FilterChoice,
    FilterDialog,
    type FilterDialogSection,
} from '@/components/data/FilterDialog';
import type {
    ProductLifecycle,
    ProductQuality,
    ProductSort,
} from '@/features/products/api';
import type {
    ProductType,
} from '@/features/products/types';
import {
    t,
    useLocale,
} from '@/lib/i18n';

export type ProductFilterState = {
    type?: ProductType;

    quality?: ProductQuality;

    status: ProductLifecycle;

    sort: ProductSort;
};

type ProductFilterPopoverProps = {
    value: ProductFilterState;

    onChange: (
        value: ProductFilterState,
    ) => void;
};

/**
 * Count filters that differ from the normal active alphabetical catalog view.
 */
export function countProductFilters(
    filters: ProductFilterState,
): number {
    let count = 0;

    if (
        filters.type
    ) {
        count++;
    }

    if (
        filters.quality
    ) {
        count++;
    }

    if (
        filters.status !==
        'active'
    ) {
        count++;
    }

    if (
        filters.sort !==
        'name_asc'
    ) {
        count++;
    }

    return count;
}

/**
 * Render Product filtering through a scalable category navigator.
 */
export function ProductFilterPopover({
    value,
    onChange,
}: ProductFilterPopoverProps) {
    useLocale();

    const [
        open,
        setOpen,
    ] =
        useState(
            false,
        );

    const count =
        countProductFilters(
            value,
        );

    /**
     * Apply one catalog filtering change immediately.
     */
    function change(
        patch: Partial<ProductFilterState>,
    ): void {
        onChange({
            ...value,
            ...patch,
        });
    }

    /**
     * Restore the default active alphabetical catalog view immediately.
     */
    function reset(): void {
        onChange({
            status:
                'active',

            sort:
                'name_asc',
        });
    }

    const typeSummary =
        value.type ===
        'product'
            ? t(
                  'ui.products',
              )
            : value.type ===
                'service'
              ? t(
                    'ui.services',
                )
              : t(
                    'ui.everything',
                );

    const qualitySummary =
        value.quality ===
        'missing_sku'
            ? t(
                  'ui.missing_sku',
              )
            : value.quality ===
                'zero_price'
              ? t(
                    'ui.zero_price',
                )
              : value.quality ===
                  'missing_cost'
                ? t(
                      'ui.missing_cost',
                  )
                : t(
                      'ui.any_quality',
                  );

    const lifecycleSummary =
        value.status ===
        'deleted'
            ? t(
                  'ui.archived',
              )
            : t(
                  'ui.active',
              );

    const sortSummary =
        value.sort ===
        'name_desc'
            ? t(
                  'ui.name_z_a',
              )
            : value.sort ===
                'price_low'
              ? t(
                    'ui.price_low',
                )
              : value.sort ===
                  'price_high'
                ? t(
                      'ui.price_high',
                  )
                : value.sort ===
                    'newest'
                  ? t(
                        'ui.newest',
                    )
                  : value.sort ===
                      'oldest'
                    ? t(
                          'ui.oldest',
                      )
                    : t(
                          'ui.name_a_z',
                      );

    const sections:
        FilterDialogSection[] =
        [
            {
                id: 'type',

                title: t(
                    'ui.type',
                ),

                summary:
                    typeSummary,

                icon: Package,

                active:
                    Boolean(
                        value.type,
                    ),

                content: (
                    <div className="grid gap-2 sm:grid-cols-2">
                        <FilterChoice
                            active={
                                ! value.type
                            }
                            onClick={() =>
                                change({
                                    type: undefined,
                                })
                            }
                        >
                            {t(
                                'ui.everything',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                Package
                            }
                            active={
                                value.type ===
                                'product'
                            }
                            onClick={() =>
                                change({
                                    type: 'product',
                                })
                            }
                        >
                            {t(
                                'ui.products',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                Wrench
                            }
                            active={
                                value.type ===
                                'service'
                            }
                            onClick={() =>
                                change({
                                    type: 'service',
                                })
                            }
                        >
                            {t(
                                'ui.services',
                            )}
                        </FilterChoice>
                    </div>
                ),
            },

            {
                id: 'quality',

                title: t(
                    'ui.data_quality',
                ),

                summary:
                    qualitySummary,

                icon:
                    ShieldCheck,

                active:
                    Boolean(
                        value.quality,
                    ),

                content: (
                    <div className="grid gap-2 sm:grid-cols-2">
                        <FilterChoice
                            icon={
                                ShieldCheck
                            }
                            active={
                                ! value.quality
                            }
                            onClick={() =>
                                change({
                                    quality: undefined,
                                })
                            }
                        >
                            {t(
                                'ui.any_quality',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                Tag
                            }
                            active={
                                value.quality ===
                                'missing_sku'
                            }
                            onClick={() =>
                                change({
                                    quality:
                                        'missing_sku',
                                })
                            }
                        >
                            {t(
                                'ui.missing_sku',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                DollarSign
                            }
                            active={
                                value.quality ===
                                'zero_price'
                            }
                            onClick={() =>
                                change({
                                    quality:
                                        'zero_price',
                                })
                            }
                        >
                            {t(
                                'ui.zero_price',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                DollarSign
                            }
                            active={
                                value.quality ===
                                'missing_cost'
                            }
                            onClick={() =>
                                change({
                                    quality:
                                        'missing_cost',
                                })
                            }
                        >
                            {t(
                                'ui.missing_cost',
                            )}
                        </FilterChoice>
                    </div>
                ),
            },

            {
                id: 'lifecycle',

                title: t(
                    'ui.lifecycle',
                ),

                summary:
                    lifecycleSummary,

                icon:
                    Archive,

                active:
                    value.status !==
                    'active',

                content: (
                    <div className="grid gap-2 sm:grid-cols-2">
                        <FilterChoice
                            active={
                                value.status ===
                                'active'
                            }
                            onClick={() =>
                                change({
                                    status: 'active',
                                })
                            }
                        >
                            {t(
                                'ui.active',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                Archive
                            }
                            active={
                                value.status ===
                                'deleted'
                            }
                            onClick={() =>
                                change({
                                    status: 'deleted',
                                })
                            }
                        >
                            {t(
                                'ui.archived',
                            )}
                        </FilterChoice>
                    </div>
                ),
            },

            {
                id: 'sort',

                title: t(
                    'ui.sort',
                ),

                summary:
                    sortSummary,

                icon:
                    ArrowDownAZ,

                active:
                    value.sort !==
                    'name_asc',

                content: (
                    <div className="grid gap-2 sm:grid-cols-2">
                        <FilterChoice
                            icon={
                                ArrowDownAZ
                            }
                            active={
                                value.sort ===
                                'name_asc'
                            }
                            onClick={() =>
                                change({
                                    sort: 'name_asc',
                                })
                            }
                        >
                            {t(
                                'ui.name_a_z',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                ArrowUpAZ
                            }
                            active={
                                value.sort ===
                                'name_desc'
                            }
                            onClick={() =>
                                change({
                                    sort: 'name_desc',
                                })
                            }
                        >
                            {t(
                                'ui.name_z_a',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                DollarSign
                            }
                            active={
                                value.sort ===
                                'price_low'
                            }
                            onClick={() =>
                                change({
                                    sort: 'price_low',
                                })
                            }
                        >
                            {t(
                                'ui.price_low',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                DollarSign
                            }
                            active={
                                value.sort ===
                                'price_high'
                            }
                            onClick={() =>
                                change({
                                    sort: 'price_high',
                                })
                            }
                        >
                            {t(
                                'ui.price_high',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                Clock3
                            }
                            active={
                                value.sort ===
                                'newest'
                            }
                            onClick={() =>
                                change({
                                    sort: 'newest',
                                })
                            }
                        >
                            {t(
                                'ui.newest',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                History
                            }
                            active={
                                value.sort ===
                                'oldest'
                            }
                            onClick={() =>
                                change({
                                    sort: 'oldest',
                                })
                            }
                        >
                            {t(
                                'ui.oldest',
                            )}
                        </FilterChoice>
                    </div>
                ),
            },
        ];

    return (
        <div className="min-w-0">
            <button
                type="button"
                aria-expanded={
                    open
                }
                aria-haspopup="dialog"
                onClick={() =>
                    setOpen(
                        (
                            current,
                        ) =>
                            ! current,
                    )
                }
                className={[
                    'group flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-semibold transition duration-200 hover:-translate-y-px active:translate-y-0 motion-reduce:transform-none sm:w-auto',
                    open ||
                    count > 0
                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-soft)]'
                        : 'border-[var(--ac-line)] bg-white text-[var(--ac-text)] hover:border-[var(--ac-line-strong)]',
                ].join(
                    ' ',
                )}
            >
                <Filter
                    size={
                        15
                    }
                    className="transition-transform duration-200 group-hover:rotate-6 motion-reduce:transform-none"
                />

                {t(
                    'ui.filters',
                )}

                {count >
                    0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-[var(--ac-accent-strong)] text-[9px] font-bold text-white">
                        {
                            count
                        }
                    </span>
                )}
            </button>

            <FilterDialog
                open={
                    open
                }
                eyebrow={t(
                    'ui.refine_catalog',
                )}
                title={t(
                    'ui.product_filters',
                )}
                activeCount={
                    count
                }
                sections={
                    sections
                }
                onClose={() =>
                    setOpen(
                        false,
                    )
                }
                onReset={
                    reset
                }
            />
        </div>
    );
}
