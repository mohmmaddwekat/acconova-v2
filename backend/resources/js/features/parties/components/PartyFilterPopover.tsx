import {
    ArrowDownAZ,
    ArrowUpAZ,
    Building2,
    Filter,
    History,
    MailWarning,
    PhoneOff,
    ShieldCheck,
    UsersRound,
    UserRound,
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
    PartyContactQuality,
    PartyLifecycle,
    PartySort,
} from '@/features/parties/api';
import type {
    PartyRole,
    PartyType,
} from '@/features/parties/types';
import {
    t,
    useLocale,
} from '@/lib/i18n';

export type PartyFilterState = {
    role?: PartyRole;

    type?: PartyType;

    contact?: PartyContactQuality;

    status: PartyLifecycle;

    sort: PartySort;
};

type PartyFilterPopoverProps = {
    value: PartyFilterState;

    onChange: (
        filters: PartyFilterState,
    ) => void;
};

/**
 * Count Party filters that differ from the normal active alphabetical view.
 */
export function countPartyFilters(
    filters: PartyFilterState,
): number {
    let count = 0;

    if (
        filters.role
    ) {
        count++;
    }

    if (
        filters.type
    ) {
        count++;
    }

    if (
        filters.contact
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
 * Render Party filters through the shared scalable category navigator.
 */
export function PartyFilterPopover({
    value,
    onChange,
}: PartyFilterPopoverProps) {
    useLocale();

    const [
        open,
        setOpen,
    ] =
        useState(
            false,
        );

    const count =
        countPartyFilters(
            value,
        );

    /**
     * Apply one relationship filtering change immediately.
     */
    function change(
        patch: Partial<PartyFilterState>,
    ): void {
        onChange({
            ...value,
            ...patch,
        });
    }

    /**
     * Restore the default active alphabetical Party view immediately.
     */
    function reset(): void {
        onChange({
            status:
                'active',

            sort:
                'name_asc',
        });
    }

    const relationshipSummary =
        value.role ===
        'customer'
            ? t(
                  'ui.customers',
              )
            : value.role ===
                'supplier'
              ? t(
                    'ui.suppliers',
                )
              : value.role === 'contact' ? t('role.contact') : t(
                    'ui.everyone',
                );

    const typeSummary =
        value.type ===
        'person'
            ? t(
                  'ui.people',
              )
            : value.type ===
                'company'
              ? t(
                    'ui.companies',
                )
              : value.type === 'other' ? t('ui.other_party') : t(
                    'ui.all_types',
                );

    const contactSummary =
        value.contact ===
        'complete'
            ? t(
                  'ui.complete_contact',
              )
            : value.contact ===
                'missing_email'
              ? t(
                    'ui.missing_email',
                )
              : value.contact ===
                  'missing_phone'
                ? t(
                      'ui.missing_phone',
                  )
                : value.contact ===
                    'missing_both'
                  ? t(
                        'ui.missing_both',
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
                id: 'relationship',

                title: t(
                    'ui.relationship',
                ),

                summary:
                    relationshipSummary,

                icon:
                    UsersRound,

                active:
                    Boolean(
                        value.role,
                    ),

                content: (
                    <div className="grid gap-2 sm:grid-cols-2">
                        <FilterChoice
                            icon={
                                UsersRound
                            }
                            active={
                                ! value.role
                            }
                            onClick={() =>
                                change({
                                    role: undefined,
                                })
                            }
                        >
                            {t(
                                'ui.everyone',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            active={
                                value.role ===
                                'customer'
                            }
                            onClick={() =>
                                change({
                                    role: 'customer',
                                })
                            }
                        >
                            {t(
                                'ui.customers',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            active={
                                value.role ===
                                'supplier'
                            }
                            onClick={() =>
                                change({
                                    role: 'supplier',
                                })
                            }
                        >
                            {t(
                                'ui.suppliers',
                            )}
                        </FilterChoice>
                        <FilterChoice icon={Building2} active={value.role === 'contact'} onClick={() => change({ role: 'contact' })}>{t('role.contact')}</FilterChoice>
                    </div>
                ),
            },

            {
                id: 'type',

                title: t(
                    'ui.entity_type',
                ),

                summary:
                    typeSummary,

                icon:
                    Building2,

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
                                'ui.all_types',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                UserRound
                            }
                            active={
                                value.type ===
                                'person'
                            }
                            onClick={() =>
                                change({
                                    type: 'person',
                                })
                            }
                        >
                            {t(
                                'ui.people',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                Building2
                            }
                            active={
                                value.type ===
                                'company'
                            }
                            onClick={() =>
                                change({
                                    type: 'company',
                                })
                            }
                        >
                            {t(
                                'ui.companies',
                            )}
                        </FilterChoice>
                        <FilterChoice icon={Building2} active={value.type === 'other'} onClick={() => change({ type: 'other' })}>
                            {t('ui.other_party')}
                        </FilterChoice>
                    </div>
                ),
            },

            {
                id: 'contact',

                title: t(
                    'ui.contact_quality',
                ),

                summary:
                    contactSummary,

                icon:
                    ShieldCheck,

                active:
                    Boolean(
                        value.contact,
                    ),

                content: (
                    <div className="grid gap-2 sm:grid-cols-2">
                        <FilterChoice
                            icon={
                                ShieldCheck
                            }
                            active={
                                ! value.contact
                            }
                            onClick={() =>
                                change({
                                    contact: undefined,
                                })
                            }
                        >
                            {t(
                                'ui.any_quality',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                ShieldCheck
                            }
                            active={
                                value.contact ===
                                'complete'
                            }
                            onClick={() =>
                                change({
                                    contact:
                                        'complete',
                                })
                            }
                        >
                            {t(
                                'ui.complete_contact',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                MailWarning
                            }
                            active={
                                value.contact ===
                                'missing_email'
                            }
                            onClick={() =>
                                change({
                                    contact:
                                        'missing_email',
                                })
                            }
                        >
                            {t(
                                'ui.missing_email',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            icon={
                                PhoneOff
                            }
                            active={
                                value.contact ===
                                'missing_phone'
                            }
                            onClick={() =>
                                change({
                                    contact:
                                        'missing_phone',
                                })
                            }
                        >
                            {t(
                                'ui.missing_phone',
                            )}
                        </FilterChoice>

                        <FilterChoice
                            active={
                                value.contact ===
                                'missing_both'
                            }
                            onClick={() =>
                                change({
                                    contact:
                                        'missing_both',
                                })
                            }
                        >
                            {t(
                                'ui.missing_both',
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
                    History,

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
                                History
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
                    'ui.refine_view',
                )}
                title={t(
                    'ui.filter_relationships',
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
