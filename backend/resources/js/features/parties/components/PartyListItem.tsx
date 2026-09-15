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
    Party,
} from '@/features/parties/types';

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
            'Unnamed company'
        );
    }

    return (
        party.name ??
        'Unnamed person'
    );
}

/**
 * Build a concise Party location.
 */
function partyLocation(
    party: Party,
): string {
    return [
        party.city,
        party.country_code,
    ]
        .filter(Boolean)
        .join(', ');
}

/**
 * Render one selectable Party relationship card or operating row.
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

    return (
        <article
            className={[
                'group mx-3 my-3 grid min-w-0 gap-4 rounded-[20px] border bg-white p-4 shadow-[var(--ac-shadow-soft)] transition duration-300 sm:mx-4 sm:p-5 lg:m-0 lg:grid-cols-[auto_minmax(220px,1.3fr)_minmax(180px,1fr)_minmax(160px,0.8fr)_auto] lg:items-center lg:gap-5 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:p-5 lg:shadow-none xl:px-6',
                selected
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]/30'
                    : 'border-[var(--ac-line)] hover:border-[var(--ac-line-strong)]',
            ].join(' ')}
        >
            {selectable && (
                <label className="flex items-center">
                    <input
                        type="checkbox"
                        checked={
                            selected
                        }
                        aria-label={`Select ${label}`}
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
                className="flex min-w-0 items-start gap-3 text-left sm:gap-4 lg:items-center"
            >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-text-soft)] transition group-hover:bg-[var(--ac-accent-soft)] group-hover:text-[var(--ac-accent-strong)]">
                    {party.type ===
                    'company' ? (
                        <Building2
                            size={17}
                        />
                    ) : (
                        <UserRound
                            size={17}
                        />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="break-words text-[15px] font-semibold leading-5 tracking-[-0.02em]">
                        {label}
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
                                    {role}
                                </span>
                            ),
                        )}

                        {archived && (
                            <span className="rounded-full bg-[var(--ac-danger)]/8 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--ac-danger)]">
                                Archived
                            </span>
                        )}
                    </div>
                </div>
            </button>

            <div className="grid min-w-0 gap-2 text-xs text-[var(--ac-text-soft)] sm:grid-cols-2 lg:grid-cols-1">
                <div className="flex min-w-0 items-center gap-2">
                    <Mail
                        size={13}
                        className="shrink-0 text-[var(--ac-text-muted)]"
                    />

                    <span className="truncate">
                        {party.email ??
                            'No email'}
                    </span>
                </div>

                <div className="flex min-w-0 items-center gap-2">
                    <Phone
                        size={13}
                        className="shrink-0 text-[var(--ac-text-muted)]"
                    />

                    <span className="truncate">
                        {party.phone ??
                            'No phone'}
                    </span>
                </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 text-xs text-[var(--ac-text-soft)]">
                <MapPin
                    size={13}
                    className="shrink-0 text-[var(--ac-text-muted)]"
                />

                <span className="truncate">
                    {location ||
                        'No location'}
                </span>
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--ac-line)] pt-3 lg:justify-end lg:border-0 lg:pt-0">
                <button
                    type="button"
                    aria-label={`View ${label}`}
                    onClick={() =>
                        onView(
                            party,
                        )
                    }
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] lg:size-9 lg:flex-none lg:px-0"
                >
                    <ArrowUpRight
                        size={15}
                    />

                    <span className="lg:hidden">
                        View
                    </span>
                </button>

                {! archived &&
                    canEdit && (
                        <button
                            type="button"
                            aria-label={`Edit ${label}`}
                            onClick={() =>
                                onEdit(
                                    party,
                                )
                            }
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] lg:size-9 lg:flex-none lg:px-0"
                        >
                            <Pencil
                                size={15}
                            />

                            <span className="lg:hidden">
                                Edit
                            </span>
                        </button>
                    )}

                {! archived &&
                    canArchive && (
                        <button
                            type="button"
                            aria-label={`Archive ${label}`}
                            onClick={() =>
                                onArchive(
                                    party,
                                )
                            }
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-bg-soft)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] hover:text-[var(--ac-danger)] lg:size-9 lg:flex-none lg:px-0"
                        >
                            <Archive
                                size={15}
                            />

                            <span className="lg:hidden">
                                Archive
                            </span>
                        </button>
                    )}

                {archived &&
                    canArchive && (
                        <button
                            type="button"
                            aria-label={`Restore ${label}`}
                            onClick={() =>
                                onRestore(
                                    party,
                                )
                            }
                            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-soft)] px-3 text-xs font-semibold text-[var(--ac-accent-strong)] lg:h-9 lg:flex-none"
                        >
                            <RotateCcw
                                size={15}
                            />

                            <span className="lg:hidden">
                                Restore
                            </span>
                        </button>
                    )}
            </div>
        </article>
    );
}