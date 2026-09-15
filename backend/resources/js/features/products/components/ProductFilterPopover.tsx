import {
    Check,
    Filter,
    Package,
    RotateCcw,
    Wrench,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

import type {
    ProductLifecycle,
    ProductQuality,
    ProductSort,
} from '@/features/products/api';
import type {
    ProductType,
} from '@/features/products/types';

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
 * Count non-default catalog filters.
 */
export function countProductFilters(
    filters: ProductFilterState,
): number {
    let count = 0;

    if (filters.type) {
        count++;
    }

    if (filters.quality) {
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
 * Render phone bottom-sheet, tablet dialog, and desktop popover filtering.
 */
export function ProductFilterPopover({
    value,
    onChange,
}: ProductFilterPopoverProps) {
    const [open, setOpen] =
        useState(false);

    const [draft, setDraft] =
        useState(
            value,
        );

    useEffect(() => {
        if (open) {
            setDraft(
                value,
            );
        }
    }, [
        open,
        value,
    ]);

    /**
     * Reset catalog filters to their normal active alphabetical state.
     */
    function reset(): void {
        setDraft({
            status: 'active',
            sort: 'name_asc',
        });
    }

    /**
     * Apply draft catalog filters.
     */
    function apply(): void {
        onChange(
            draft,
        );

        setOpen(false);
    }

    const count =
        countProductFilters(
            value,
        );

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() =>
                    setOpen(
                        (
                            current,
                        ) =>
                            ! current,
                    )
                }
                className={[
                    'flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-semibold sm:w-auto',
                    open ||
                    count > 0
                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                        : 'border-[var(--ac-line)] bg-white',
                ].join(' ')}
            >
                <Filter
                    size={15}
                />

                Filters

                {count > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-[var(--ac-accent-strong)] text-[9px] text-white">
                        {count}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <button
                        type="button"
                        aria-label="Close filters"
                        onClick={() =>
                            setOpen(
                                false,
                            )
                        }
                        className="fixed inset-0 z-[129] bg-[var(--ac-text)]/20 backdrop-blur-[2px] xl:hidden"
                    />

                    <section className="fixed inset-x-0 bottom-0 z-[130] max-h-[88dvh] overflow-y-auto rounded-t-[28px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-panel)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(560px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[26px] xl:absolute xl:left-auto xl:right-0 xl:top-[calc(100%+0.65rem)] xl:w-[440px] xl:translate-x-0 xl:translate-y-0 xl:rounded-[22px]">
                        <header className="flex items-center justify-between border-b border-[var(--ac-line)] p-5">
                            <div>
                                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                                    Refine catalog
                                </p>

                                <h2 className="mt-1 text-lg font-semibold">
                                    Product filters
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(
                                        false,
                                    )
                                }
                                className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)]"
                            >
                                <X size={16} />
                            </button>
                        </header>

                        <div className="grid gap-6 p-5">
                            <FilterSection
                                title="Type"
                            >
                                <Choice
                                    active={
                                        ! draft.type
                                    }
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            type: undefined,
                                        })
                                    }
                                >
                                    Everything
                                </Choice>

                                <Choice
                                    icon={
                                        Package
                                    }
                                    active={
                                        draft.type ===
                                        'product'
                                    }
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            type: 'product',
                                        })
                                    }
                                >
                                    Products
                                </Choice>

                                <Choice
                                    icon={
                                        Wrench
                                    }
                                    active={
                                        draft.type ===
                                        'service'
                                    }
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            type: 'service',
                                        })
                                    }
                                >
                                    Services
                                </Choice>
                            </FilterSection>

                            <FilterSection
                                title="Data quality"
                            >
                                <Choice
                                    active={
                                        ! draft.quality
                                    }
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            quality: undefined,
                                        })
                                    }
                                >
                                    Any quality
                                </Choice>

                                <Choice
                                    active={
                                        draft.quality ===
                                        'missing_sku'
                                    }
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            quality: 'missing_sku',
                                        })
                                    }
                                >
                                    Missing SKU
                                </Choice>

                                <Choice
                                    active={
                                        draft.quality ===
                                        'zero_price'
                                    }
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            quality: 'zero_price',
                                        })
                                    }
                                >
                                    Zero price
                                </Choice>

                                <Choice
                                    active={
                                        draft.quality ===
                                        'missing_cost'
                                    }
                                    onClick={() =>
                                        setDraft({
                                            ...draft,
                                            quality: 'missing_cost',
                                        })
                                    }
                                >
                                    Missing cost
                                </Choice>
                            </FilterSection>

                            <div className="grid gap-6 sm:grid-cols-2">
                                <FilterSection
                                    title="Lifecycle"
                                >
                                    <Choice
                                        active={
                                            draft.status ===
                                            'active'
                                        }
                                        onClick={() =>
                                            setDraft({
                                                ...draft,
                                                status: 'active',
                                            })
                                        }
                                    >
                                        Active
                                    </Choice>

                                    <Choice
                                        active={
                                            draft.status ===
                                            'deleted'
                                        }
                                        onClick={() =>
                                            setDraft({
                                                ...draft,
                                                status: 'deleted',
                                            })
                                        }
                                    >
                                        Archived
                                    </Choice>
                                </FilterSection>

                                <FilterSection
                                    title="Sort"
                                >
                                    {[
                                        [
                                            'name_asc',
                                            'Name A–Z',
                                        ],
                                        [
                                            'name_desc',
                                            'Name Z–A',
                                        ],
                                        [
                                            'price_low',
                                            'Price low',
                                        ],
                                        [
                                            'price_high',
                                            'Price high',
                                        ],
                                        [
                                            'newest',
                                            'Newest',
                                        ],
                                        [
                                            'oldest',
                                            'Oldest',
                                        ],
                                    ].map(
                                        ([
                                            sort,
                                            label,
                                        ]) => (
                                            <Choice
                                                key={
                                                    sort
                                                }
                                                active={
                                                    draft.sort ===
                                                    sort
                                                }
                                                onClick={() =>
                                                    setDraft({
                                                        ...draft,
                                                        sort:
                                                            sort as ProductSort,
                                                    })
                                                }
                                            >
                                                {
                                                    label
                                                }
                                            </Choice>
                                        ),
                                    )}
                                </FilterSection>
                            </div>
                        </div>

                        <footer className="grid grid-cols-2 gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                            <button
                                type="button"
                                onClick={
                                    reset
                                }
                                className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white text-sm font-semibold"
                            >
                                <RotateCcw
                                    size={14}
                                />

                                Reset
                            </button>

                            <button
                                type="button"
                                onClick={
                                    apply
                                }
                                className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] text-sm font-semibold text-white"
                            >
                                <Check
                                    size={14}
                                />

                                Apply
                            </button>
                        </footer>
                    </section>
                </>
            )}
        </div>
    );
}

type FilterSectionProps = {
    title: string;

    children: React.ReactNode;
};

/**
 * Render one catalog filtering dimension.
 */
function FilterSection({
    title,
    children,
}: FilterSectionProps) {
    return (
        <section>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                {title}
            </p>

            <div className="flex flex-wrap gap-2">
                {children}
            </div>
        </section>
    );
}

type ChoiceProps = {
    active: boolean;

    onClick: () => void;

    children: string;

    icon?: typeof Package;
};

/**
 * Render one compact Product filter option.
 */
function Choice({
    active,
    onClick,
    children,
    icon: Icon,
}: ChoiceProps) {
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            className={[
                'flex min-h-10 items-center gap-2 rounded-[12px] border px-3 py-2 text-[11px] font-semibold',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                    : 'border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)]',
            ].join(' ')}
        >
            {Icon && (
                <Icon size={13} />
            )}

            {children}
        </button>
    );
}