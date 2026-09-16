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
 *
 * Selection presentation comes from the shared Index design system, keeping
 * Party and Product lists visually consistent.
 */
export function PartyListItem({
    party,
    selected,
    selectable,
    canEdit,
    canArchive,
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
            className="ac-index-row group mx-3 my-3 grid min-w-0 gap-4 rounded-[20px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] sm:mx-4 sm:p-5 lg:m-0 lg:grid-cols-[auto_minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(160px,0.8fr)_auto] lg:items-center lg:gap-5 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:p-5 lg:shadow-none xl:px-6"
        >
            {selectable && (
                <label className="flex items-center">
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

            <button
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
                                            : 'role.supplier',
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

            <div className="grid min-w-0 gap-2 text-xs text-[var(--ac-text-soft)] sm:grid-cols-2 lg:grid-cols-1">
                <div className="flex min-w-0 items-center gap-2">
                    <Mail
                        size={
                            13
                        }
                        className="shrink-0 text-[var(--ac-text-muted)]"
                    />

                    <span className="truncate">
                        {party.email ??
                            t(
                                'ui.no_email',
                            )}
                    </span>
                </div>

                <div className="flex min-w-0 items-center gap-2">
                    <Phone
                        size={
                            13
                        }
                        className="shrink-0 text-[var(--ac-text-muted)]"
                    />

                    <span className="truncate">
                        {party.phone ??
                            t(
                                'ui.no_phone',
                            )}
                    </span>
                </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--ac-text-soft)]">
                <MapPin
                    size={
                        13
                    }
                    className="shrink-0 text-[var(--ac-text-muted)]"
                />

                <span className="truncate">
                    {location ||
                        t(
                            'ui.no_location',
                        )}
                </span>
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--ac-line)] pt-3 lg:justify-end lg:border-0 lg:pt-0">
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
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition duration-200 hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)] lg:size-9 lg:flex-none lg:px-0"
                >
                    <ArrowUpRight
                        size={
                            15
                        }
                    />

                    <span className="lg:hidden">
                        {t(
                            'ui.view',
                        )}
                    </span>
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
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition duration-200 hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)] lg:size-9 lg:flex-none lg:px-0"
                        >
                            <Pencil
                                size={
                                    15
                                }
                            />

                            <span className="lg:hidden">
                                {t(
                                    'ui.edit',
                                )}
                            </span>
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
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition duration-200 hover:bg-[var(--ac-danger)]/8 hover:text-[var(--ac-danger)] lg:size-9 lg:flex-none lg:px-0"
                        >
                            <Archive
                                size={
                                    15
                                }
                            />

                            <span className="lg:hidden">
                                {t(
                                    'ui.archive',
                                )}
                            </span>
                        </button>
                    )}

                {archived &&
                    canArchive && (
                        <button
                            type="button"
                            aria-label={t(
                                'action.restore',
                                {
                                    name:
                                        label,
                                },
                            )}
                            onClick={() =>
                                onRestore(
                                    party,
                                )
                            }
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-soft)] px-3 text-xs font-semibold text-[var(--ac-accent-strong)] transition duration-200 hover:-translate-y-px hover:bg-[var(--ac-accent)]/18 motion-reduce:transform-none lg:h-9 lg:flex-none"
                        >
                            <RotateCcw
                                size={
                                    15
                                }
                            />

                            <span className="lg:hidden">
                                {t(
                                    'ui.restore',
                                )}
                            </span>
                        </button>
                    )}
            </div>
        </article>
    );
}
