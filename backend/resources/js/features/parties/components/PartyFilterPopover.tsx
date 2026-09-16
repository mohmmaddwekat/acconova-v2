import {
    ArrowDownAZ,
    ArrowUpAZ,
    Building2,
    History,
    MailWarning,
    PhoneOff,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import { useState } from 'react';

import {
    FilterGroup,
    FilterOption,
    FilterPopover,
} from '@/components/data/FilterPopover';
import type {
    PartyContactQuality,
    PartyLifecycle,
    PartySort,
} from '@/features/parties/api';
import type { PartyRole, PartyType } from '@/features/parties/types';
import { t, useLocale } from '@/lib/i18n';

export type PartyFilterState = {
    role?: PartyRole;
    type?: PartyType;
    contact?: PartyContactQuality;
    status: PartyLifecycle;
    sort: PartySort;
};

type PartyFilterPopoverProps = {
    value: PartyFilterState;
    onChange: (filters: PartyFilterState) => void;
};

/** Count Party filters that differ from the normal active A-Z view. */
export function countPartyFilters(filters: PartyFilterState): number {
    let count = 0;

    if (filters.role) count++;
    if (filters.type) count++;
    if (filters.contact) count++;
    if (filters.status !== 'active') count++;
    if (filters.sort !== 'name_asc') count++;

    return count;
}

/**
 * Render compact, immediately-applied Party filtering.
 *
 * Users can combine relationship, entity, quality, lifecycle and sort choices
 * without a second Apply step. Reset restores the default ledger immediately.
 */
export function PartyFilterPopover({
    value,
    onChange,
}: PartyFilterPopoverProps) {
    useLocale();
    const [open, setOpen] = useState(false);
    const count = countPartyFilters(value);

    /** Apply one partial Party filter update without closing the popup. */
    function update(patch: Partial<PartyFilterState>): void {
        onChange({
            ...value,
            ...patch,
        });
    }

    /** Restore the normal active alphabetical Party ledger. */
    function reset(): void {
        onChange({
            status: 'active',
            sort: 'name_asc',
        });
    }

    return (
        <FilterPopover
            open={open}
            title={t('ui.filter_relationships')}
            eyebrow={t('ui.refine_view')}
            activeCount={count}
            onOpenChange={setOpen}
            onReset={reset}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <FilterGroup title={t('ui.relationship')}>
                    <div className="grid grid-cols-3 gap-2">
                        <FilterOption
                            active={!value.role}
                            onClick={() => update({ role: undefined })}
                        >
                            {t('ui.everyone')}
                        </FilterOption>

                        <FilterOption
                            active={value.role === 'customer'}
                            onClick={() => update({ role: 'customer' })}
                        >
                            {t('ui.customers')}
                        </FilterOption>

                        <FilterOption
                            active={value.role === 'supplier'}
                            onClick={() => update({ role: 'supplier' })}
                        >
                            {t('ui.suppliers')}
                        </FilterOption>
                    </div>
                </FilterGroup>

                <FilterGroup title={t('ui.entity_type')}>
                    <div className="grid grid-cols-3 gap-2">
                        <FilterOption
                            active={!value.type}
                            onClick={() => update({ type: undefined })}
                        >
                            {t('ui.all_types')}
                        </FilterOption>

                        <FilterOption
                            icon={UserRound}
                            active={value.type === 'person'}
                            onClick={() => update({ type: 'person' })}
                        >
                            {t('ui.people')}
                        </FilterOption>

                        <FilterOption
                            icon={Building2}
                            active={value.type === 'company'}
                            onClick={() => update({ type: 'company' })}
                        >
                            {t('ui.companies')}
                        </FilterOption>
                    </div>
                </FilterGroup>
            </div>

            <FilterGroup title={t('ui.contact_quality')}>
                <div className="grid gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
                    <FilterOption
                        active={!value.contact}
                        onClick={() => update({ contact: undefined })}
                    >
                        {t('ui.any_quality')}
                    </FilterOption>

                    <FilterOption
                        icon={ShieldCheck}
                        active={value.contact === 'complete'}
                        onClick={() => update({ contact: 'complete' })}
                    >
                        {t('ui.complete_contact')}
                    </FilterOption>

                    <FilterOption
                        icon={MailWarning}
                        active={value.contact === 'missing_email'}
                        onClick={() => update({ contact: 'missing_email' })}
                    >
                        {t('ui.missing_email')}
                    </FilterOption>

                    <FilterOption
                        icon={PhoneOff}
                        active={value.contact === 'missing_phone'}
                        onClick={() => update({ contact: 'missing_phone' })}
                    >
                        {t('ui.missing_phone')}
                    </FilterOption>

                    <FilterOption
                        active={value.contact === 'missing_both'}
                        onClick={() => update({ contact: 'missing_both' })}
                    >
                        {t('ui.missing_both')}
                    </FilterOption>
                </div>
            </FilterGroup>

            <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
                <FilterGroup title={t('ui.lifecycle')}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                        <FilterOption
                            active={value.status === 'active'}
                            onClick={() => update({ status: 'active' })}
                        >
                            {t('ui.active')}
                        </FilterOption>

                        <FilterOption
                            icon={History}
                            active={value.status === 'deleted'}
                            onClick={() => update({ status: 'deleted' })}
                        >
                            {t('ui.archived')}
                        </FilterOption>
                    </div>
                </FilterGroup>

                <FilterGroup title={t('ui.sort')}>
                    <div className="grid grid-cols-2 gap-2">
                        <FilterOption
                            icon={ArrowDownAZ}
                            active={value.sort === 'name_asc'}
                            onClick={() => update({ sort: 'name_asc' })}
                        >
                            {t('ui.name_a_z')}
                        </FilterOption>

                        <FilterOption
                            icon={ArrowUpAZ}
                            active={value.sort === 'name_desc'}
                            onClick={() => update({ sort: 'name_desc' })}
                        >
                            {t('ui.name_z_a')}
                        </FilterOption>

                        <FilterOption
                            active={value.sort === 'newest'}
                            onClick={() => update({ sort: 'newest' })}
                        >
                            {t('ui.newest')}
                        </FilterOption>

                        <FilterOption
                            active={value.sort === 'oldest'}
                            onClick={() => update({ sort: 'oldest' })}
                        >
                            {t('ui.oldest')}
                        </FilterOption>
                    </div>
                </FilterGroup>
            </div>
        </FilterPopover>
    );
}
