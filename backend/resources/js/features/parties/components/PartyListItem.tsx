import {
    PermanentDeleteControl,
} from '@/components/data/PermanentDeleteControl';
import {
    InlineEditValue,
} from '@/components/data/InlineEditValue';
import type {
    ListDensity,
} from '@/components/data/ListPreferences';
import type {
    Party,
} from '@/features/parties/types';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    Archive,
    ArrowUpRight,
    Building2,
    Mail,
    MapPin,
    Pencil,
    Phone,
    RotateCcw,
    UserRound,
} from 'lucide-react';
import type {
    MouseEvent as ReactMouseEvent,
} from 'react';

type PartyListItemProps = {
    party: Party;

    selected: boolean;

    selectable: boolean;

    canEdit: boolean;

    canArchive: boolean;

    columnOrder?: string[];

    hiddenColumns?: string[];

    density?: ListDensity;

    onInlineUpdate?: (
        party: Party,
        patch: Partial<Party>,
    ) => void | Promise<void>;

    onSelectionChange: (
        party: Party,
        selected: boolean,
    ) => void;

    onView: (
        party: Party,
    ) => void;

    onEdit: (
        party: Party,
    ) => void;

    onArchive: (
        party: Party,
    ) => void;

    onRestore: (
        party: Party,
    ) => void;
};

/**
 * Return the human-facing Party identity.
 */
function partyLabel(
    party: Party,
): string {
    if (
        party.type ===
        'company'
    ) {
        return (
            party.company_name ??
            t(
                'ui.unnamed_company',
            )
        );
    }

    return (
        party.name ??
        t(
            'ui.unnamed_person',
        )
    );
}

/**
 * Build a concise Party location for Index presentation.
 */
function partyLocation(
    party: Party,
): string {
    return [
        party.city,
        party.country_code,
    ]
        .filter(
            Boolean,
        )
        .join(
            ', ',
        );
}

/**
 * Render one selectable Party operating row.
 */
export function PartyListItem({
    party,
    selected,
    selectable,
    canEdit,
    canArchive,
    columnOrder = [
        'identity',
        'contact',
        'location',
        'actions',
    ],
    hiddenColumns = [],
    density = 'comfortable',
    onInlineUpdate,
    onSelectionChange,
    onView,
    onEdit,
    onArchive,
    onRestore,
}: PartyListItemProps) {
    useLocale();

    const archived =
        party.deleted_at !==
        null;

    const visibleColumn = (
        key: string,
    ): boolean =>
        ! hiddenColumns.includes(
            key,
        );

    const columnStyle = (
        key: string,
    ) => ({
        order:
            Math.max(
                columnOrder.indexOf(
                    key,
                ),
                0,
            ),
    });

    const rowPadding =
        density === 'compact'
            ? 'p-3 sm:p-3 lg:p-3'
            : 'p-4 sm:p-5 lg:p-5';

    const label =
        partyLabel(
            party,
        );

    const location =
        partyLocation(
            party,
        );

    /**
     * Open Party details from a deliberate row double-click while preserving
     * all interactive descendants.
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
            party,
        );
    }

    const restoreLabel =
        t(
            'action.restore',
            {
                name:
                    label,
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
            className={[
                'ac-index-row group mx-3 my-3 grid min-w-0 gap-4 rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)] sm:mx-4 lg:m-0 lg:grid-cols-[auto_minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(160px,0.8fr)_auto] lg:items-center lg:gap-5 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none xl:px-6',
                rowPadding,
            ].join(' ')}
        >
            {selectable && (
                <label
                    style={{ order: -1 }}
                    className="flex items-center"
                >
                    <input
                        type="checkbox"
                        checked={
                            selected
                        }
                        aria-label={t(
                            'action.select',
                            {
                                name:
                                    label,
                            },
                        )}
                        onChange={(
                            event,
                        ) =>
                            onSelectionChange(
                                party,
                                event
                                    .target
                                    .checked,
                            )
                        }
                        className="size-4 cursor-pointer accent-[var(--ac-accent-strong)]"
                    />
                </label>
            )}

            {visibleColumn('identity') && (
            <button
                style={columnStyle('identity')}
                type="button"
                onClick={() =>
                    onView(
                        party,
                    )
                }
                className="flex min-w-0 items-start gap-3 text-start sm:gap-4 lg:items-center"
            >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-text-soft)] transition duration-200 group-hover:bg-[var(--ac-accent-soft)] group-hover:text-[var(--ac-accent-strong)]">
                    {party.type ===
                    'company' ? (
                        <Building2
                            size={
                                17
                            }
                        />
                    ) : (
                        <UserRound
                            size={
                                17
                            }
                        />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-semibold leading-5 tracking-[-0.02em]">
                        {
                            label
                        }
                    </p>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {party.roles.map(
                            (
                                role,
                            ) => (
                                <span
                                    key={
                                        role
                                    }
                                    className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--ac-accent-strong)]"
                                >
                                    {t(
                                        role ===
                                            'customer'
                                            ? 'role.customer'
                                            : role === 'contact' ? 'role.contact' : 'role.supplier',
                                    )}
                                </span>
                            ),
                        )}

                        {archived && (
                            <span className="rounded-full bg-[var(--ac-danger)]/8 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--ac-danger)]">
                                {t(
                                    'ui.archived',
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </button>
            )}

            {visibleColumn('contact') && (
            <div
                style={columnStyle('contact')}
                className="grid min-w-0 gap-2 text-xs text-[var(--ac-text-soft)] sm:grid-cols-2 lg:grid-cols-1"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <Mail
                        size={
                            13
                        }
                        className="shrink-0 text-[var(--ac-text-muted)]"
                    />

                    <InlineEditValue
                        value={party.email ?? ''}
                        display={party.email ?? t('ui.no_email')}
                        type="email"
                        inputMode="email"
                        editable={! archived && canEdit && Boolean(onInlineUpdate)}
                        onSave={(value) =>
                            onInlineUpdate?.(
                                party,
                                {
                                    email: value.trim() || null,
                                },
                            )}
                    />
                </div>

                <div className="flex min-w-0 items-center gap-2">
                    <Phone
                        size={
                            13
                        }
                        className="shrink-0 text-[var(--ac-text-muted)]"
                    />

                    <InlineEditValue
                        value={party.phone ?? ''}
                        display={party.phone ?? t('ui.no_phone')}
                        type="tel"
                        inputMode="tel"
                        editable={! archived && canEdit && Boolean(onInlineUpdate)}
                        onSave={(value) =>
                            onInlineUpdate?.(
                                party,
                                {
                                    phone: value.trim() || null,
                                },
                            )}
                    />
                </div>
            </div>
            )}

            {visibleColumn('location') && (
            <div
                style={columnStyle('location')}
                className="flex min-w-0 items-center gap-2 text-xs text-[var(--ac-text-soft)]"
            >
                <MapPin
                    size={
                        13
                    }
                    className="shrink-0 text-[var(--ac-text-muted)]"
                />

                <InlineEditValue
                    value={party.city ?? ''}
                    display={location || t('ui.no_location')}
                    editable={! archived && canEdit && Boolean(onInlineUpdate)}
                    onSave={(value) =>
                        onInlineUpdate?.(
                            party,
                            {
                                city: value.trim() || null,
                            },
                        )}
                />
            </div>
            )}

            {visibleColumn('actions') && (
            <div
                style={columnStyle('actions')}
                className="flex flex-wrap items-center gap-2 border-t border-[var(--ac-line)] pt-3 lg:justify-end lg:border-0 lg:pt-0"
            >
                <button
                    type="button"
                    aria-label={t(
                        'action.view',
                        {
                            name:
                                label,
                        },
                    )}
                    onClick={() =>
                        onView(
                            party,
                        )
                    }
                    className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)] transition duration-200 hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)]"
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
                                        label,
                                },
                            )}
                            onClick={() =>
                                onEdit(
                                    party,
                                )
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)] transition duration-200 hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)]"
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
                                        label,
                                },
                            )}
                            onClick={() =>
                                onArchive(
                                    party,
                                )
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)] transition duration-200 hover:bg-[var(--ac-danger)]/8 hover:text-[var(--ac-danger)]"
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
                                    party,
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
                        resource="parties"
                        recordId={
                            party.id
                        }
                        recordName={
                            label
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
            )}
        </article>
    );
}
