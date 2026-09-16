import { Package, Wrench } from 'lucide-react';
import { useState } from 'react';

import {
    FilterGroup,
    FilterOption,
    FilterPopover,
} from '@/components/data/FilterPopover';
import type {
    ProductLifecycle,
    ProductQuality,
    ProductSort,
} from '@/features/products/api';
import type { ProductType } from '@/features/products/types';
import { t, useLocale } from '@/lib/i18n';

export type ProductFilterState = {
    type?: ProductType;
    quality?: ProductQuality;
    status: ProductLifecycle;
    sort: ProductSort;
};

type ProductFilterPopoverProps = {
    value: ProductFilterState;
    onChange: (value: ProductFilterState) => void;
};

/** Count catalog filters that differ from the normal active A-Z view. */
export function countProductFilters(filters: ProductFilterState): number {
    let count = 0;

    if (filters.type) count++;
    if (filters.quality) count++;
    if (filters.status !== 'active') count++;
    if (filters.sort !== 'name_asc') count++;

    return count;
}

/**
 * Render compact, immediately-applied Product filtering.
 *
 * There is intentionally no Apply button: every choice updates the catalog as
 * soon as it is selected, while Reset restores the normal view immediately.
 */
export function ProductFilterPopover({
    value,
    onChange,
}: ProductFilterPopoverProps) {
    useLocale();
    const [open, setOpen] = useState(false);
    const count = countProductFilters(value);

    /** Apply one partial catalog filter update without closing the popup. */
    function update(patch: Partial<ProductFilterState>): void {
        onChange({
            ...value,
            ...patch,
        });
    }

    /** Restore AccoNova's normal active alphabetical catalog view. */
    function reset(): void {
        onChange({
            status: 'active',
            sort: 'name_asc',
        });
    }

    return (
        <FilterPopover
            open={open}
            title={t('ui.product_filters')}
            eyebrow={t('ui.refine_catalog')}
            activeCount={count}
            onOpenChange={setOpen}
            onReset={reset}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <FilterGroup title={t('ui.type')}>
                    <div className="grid grid-cols-3 gap-2">
                        <FilterOption
                            active={!value.type}
                            onClick={() => update({ type: undefined })}
                        >
                            {t('ui.everything')}
                        </FilterOption>

                        <FilterOption
                            icon={Package}
                            active={value.type === 'product'}
                            onClick={() => update({ type: 'product' })}
                        >
                            {t('ui.products')}
                        </FilterOption>

                        <FilterOption
                            icon={Wrench}
                            active={value.type === 'service'}
                            onClick={() => update({ type: 'service' })}
                        >
                            {t('ui.services')}
                        </FilterOption>
                    </div>
                </FilterGroup>

                <FilterGroup title={t('ui.lifecycle')}>
                    <div className="grid grid-cols-2 gap-2">
                        <FilterOption
                            active={value.status === 'active'}
                            onClick={() => update({ status: 'active' })}
                        >
                            {t('ui.active')}
                        </FilterOption>

                        <FilterOption
                            active={value.status === 'deleted'}
                            onClick={() => update({ status: 'deleted' })}
                        >
                            {t('ui.archived')}
                        </FilterOption>
                    </div>
                </FilterGroup>
            </div>

            <FilterGroup title={t('ui.data_quality')}>
                <div className="grid gap-2 min-[420px]:grid-cols-2 sm:grid-cols-4">
                    <FilterOption
                        active={!value.quality}
                        onClick={() => update({ quality: undefined })}
                    >
                        {t('ui.any_quality')}
                    </FilterOption>

                    <FilterOption
                        active={value.quality === 'missing_sku'}
                        onClick={() => update({ quality: 'missing_sku' })}
                    >
                        {t('ui.missing_sku')}
                    </FilterOption>

                    <FilterOption
                        active={value.quality === 'zero_price'}
                        onClick={() => update({ quality: 'zero_price' })}
                    >
                        {t('ui.zero_price')}
                    </FilterOption>

                    <FilterOption
                        active={value.quality === 'missing_cost'}
                        onClick={() => update({ quality: 'missing_cost' })}
                    >
                        {t('ui.missing_cost')}
                    </FilterOption>
                </div>
            </FilterGroup>

            <FilterGroup title={t('ui.sort')}>
                <div className="grid gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
                    {([
                        ['name_asc', t('ui.name_a_z')],
                        ['name_desc', t('ui.name_z_a')],
                        ['price_low', t('ui.price_low')],
                        ['price_high', t('ui.price_high')],
                        ['newest', t('ui.newest')],
                        ['oldest', t('ui.oldest')],
                    ] as Array<[ProductSort, string]>).map(([sort, label]) => (
                        <FilterOption
                            key={sort}
                            active={value.sort === sort}
                            onClick={() => update({ sort })}
                        >
                            {label}
                        </FilterOption>
                    ))}
                </div>
            </FilterGroup>
        </FilterPopover>
    );
}
