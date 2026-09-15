import {
    Archive,
    Building2,
    CalendarDays,
    Edit3,
    Mail,
    MapPin,
    NotebookPen,
    Phone,
    RotateCcw,
    Save,
    ShieldCheck,
    UserRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

import {
    updatePartyNotes,
} from '@/features/parties/api';
import type {
    Party,
} from '@/features/parties/types';
import { ApiError } from '@/lib/http';

type PartyDetailDrawerProps = {
    open: boolean;

    party:
        | Party
        | null;

    canEdit: boolean;

    canArchive: boolean;

    onClose: () => void;

    onChanged: (
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
 * Return the correct human-facing Party identity.
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
 * Format an API timestamp for human-facing Party context.
 */
function formatDate(
    value: string,
): string {
    return new Intl.DateTimeFormat(
        undefined,
        {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        },
    ).format(
        new Date(
            value,
        ),
    );
}

/**
 * Render the responsive Party detail workspace.
 */
export function PartyDetailDrawer({
    open,
    party,
    canEdit,
    canArchive,
    onClose,
    onChanged,
    onEdit,
    onArchive,
    onRestore,
}: PartyDetailDrawerProps) {
    const [notes, setNotes] =
        useState('');

    const [
        notesBusy,
        setNotesBusy,
    ] = useState(false);

    const [
        notesMessage,
        setNotesMessage,
    ] =
        useState<string | null>(
            null,
        );

    useEffect(() => {
        setNotes(
            party?.notes ?? '',
        );

        setNotesMessage(
            null,
        );
    }, [
        party,
    ]);

    useEffect(() => {
        if (! open) {
            return;
        }

        const previousOverflow =
            document.body.style
                .overflow;

        document.body.style
            .overflow = 'hidden';

        /**
         * Allow keyboard users to close the Party detail surface.
         */
        function handleKeyDown(
            event: KeyboardEvent,
        ): void {
            if (
                event.key ===
                'Escape'
            ) {
                onClose();
            }
        }

        window.addEventListener(
            'keydown',
            handleKeyDown,
        );

        return () => {
            document.body.style
                .overflow =
                previousOverflow;

            window.removeEventListener(
                'keydown',
                handleKeyDown,
            );
        };
    }, [
        onClose,
        open,
    ]);

    /*
     * Stop rendering before any Party-specific behavior runs when no Party is
     * currently selected. After this guard we copy the Party reference into a
     * non-null constant so TypeScript can safely use it inside async handlers.
     */
    if (
        ! open ||
        ! party
    ) {
        return null;
    }

    const resolvedParty:
        Party = party;

    const archived =
        resolvedParty.deleted_at !==
        null;

    const label =
        partyLabel(
            resolvedParty,
        );

    const location = [
        resolvedParty.address_line_1,
        resolvedParty.address_line_2,
        resolvedParty.city,
        resolvedParty.state,
        resolvedParty.postal_code,
        resolvedParty.country_code,
    ]
        .filter(Boolean)
        .join(', ');

    /**
     * Persist internal Party notes without leaving the context surface.
     */
    async function handleSaveNotes(): Promise<void> {
        if (
            notesBusy ||
            archived ||
            ! canEdit
        ) {
            return;
        }

        setNotesBusy(true);
        setNotesMessage(null);

        try {
            const updated =
                await updatePartyNotes(
                    resolvedParty.id,
                    notes,
                );

            setNotes(
                updated.notes ??
                    '',
            );

            onChanged(
                updated,
            );

            setNotesMessage(
                'Notes saved.',
            );
        } catch (exception) {
            setNotesMessage(
                exception instanceof
                ApiError
                    ? exception.message
                    : 'AccoNova could not save these notes.',
            );
        } finally {
            setNotesBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[120]">
            <button
                type="button"
                aria-label="Close Party details"
                onClick={
                    onClose
                }
                className="absolute inset-0 bg-[var(--ac-text)]/20 backdrop-blur-[3px]"
            />

            <aside className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[600px]">
                <header className="border-b border-[var(--ac-line)] px-4 py-5 sm:px-6 sm:py-6">
                    <div className="flex items-start justify-between gap-5">
                        <div className="flex min-w-0 items-start gap-3.5">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-[var(--ac-surface-strong)]">
                                {resolvedParty.type ===
                                'company' ? (
                                    <Building2
                                        size={20}
                                    />
                                ) : (
                                    <UserRound
                                        size={20}
                                    />
                                )}
                            </div>

                            <div className="min-w-0">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                                    Relationship context
                                </p>

                                <h2 className="mt-1.5 break-words text-2xl font-semibold tracking-[-0.045em] sm:text-3xl">
                                    {label}
                                </h2>

                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {resolvedParty.roles.map(
                                        (
                                            role,
                                        ) => (
                                            <span
                                                key={
                                                    role
                                                }
                                                className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-accent-strong)]"
                                            >
                                                {
                                                    role
                                                }
                                            </span>
                                        ),
                                    )}

                                    {archived && (
                                        <span className="rounded-full bg-[var(--ac-danger)]/8 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-danger)]">
                                            Archived
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={
                                onClose
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-text-muted)]"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
                    <section>
                        <SectionHeading>
                            Contact
                        </SectionHeading>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <ContactAction
                                icon={Mail}
                                label="Email"
                                value={
                                    resolvedParty.email ??
                                    'Not provided'
                                }
                                href={
                                    resolvedParty.email
                                        ? `mailto:${resolvedParty.email}`
                                        : undefined
                                }
                            />

                            <ContactAction
                                icon={Phone}
                                label="Phone"
                                value={
                                    resolvedParty.phone ??
                                    'Not provided'
                                }
                                href={
                                    resolvedParty.phone
                                        ? `tel:${resolvedParty.phone}`
                                        : undefined
                                }
                            />
                        </div>
                    </section>

                    <section className="mt-8">
                        <SectionHeading>
                            Internal notes
                        </SectionHeading>

                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-white text-[var(--ac-text-muted)] shadow-[var(--ac-shadow-soft)]">
                                    <NotebookPen
                                        size={16}
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold">
                                        Workspace note
                                    </p>

                                    <p className="mt-1 text-[10px] leading-4 text-[var(--ac-text-muted)]">
                                        Internal only. This note is not customer-facing.
                                    </p>
                                </div>
                            </div>

                            <textarea
                                value={
                                    notes
                                }
                                disabled={
                                    archived ||
                                    ! canEdit
                                }
                                maxLength={
                                    5000
                                }
                                rows={5}
                                onChange={(
                                    event,
                                ) =>
                                    setNotes(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                placeholder="Add useful context, preferences, follow-up information, or internal reminders…"
                                className="mt-4 w-full resize-y rounded-[15px] border border-[var(--ac-line)] bg-white px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)] disabled:bg-[var(--ac-bg-soft)] disabled:text-[var(--ac-text-muted)]"
                            />

                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-[10px] text-[var(--ac-text-muted)]">
                                    {archived
                                        ? 'Restore this relationship before changing notes.'
                                        : `${notes.length} / 5000`}
                                </p>

                                {! archived &&
                                    canEdit && (
                                        <button
                                            type="button"
                                            disabled={
                                                notesBusy
                                            }
                                            onClick={() =>
                                                void handleSaveNotes()
                                            }
                                            className="flex h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-text)] px-4 text-xs font-semibold text-white disabled:opacity-50"
                                        >
                                            <Save
                                                size={14}
                                            />

                                            {notesBusy
                                                ? 'Saving…'
                                                : 'Save notes'}
                                        </button>
                                    )}
                            </div>

                            {notesMessage && (
                                <p className="mt-3 text-xs text-[var(--ac-text-soft)]">
                                    {notesMessage}
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="mt-8">
                        <SectionHeading>
                            Business identity
                        </SectionHeading>

                        <div className="overflow-hidden rounded-[20px] border border-[var(--ac-line)]">
                            <DetailRow
                                label="Entity type"
                                value={
                                    resolvedParty.type ===
                                    'company'
                                        ? 'Company'
                                        : 'Person'
                                }
                            />

                            <DetailRow
                                label="Tax number"
                                value={
                                    resolvedParty.tax_number ??
                                    'Not provided'
                                }
                            />

                            <DetailRow
                                label="Relationship"
                                value={resolvedParty.roles
                                    .map(
                                        (
                                            role,
                                        ) =>
                                            role
                                                .charAt(
                                                    0,
                                                )
                                                .toUpperCase() +
                                            role.slice(
                                                1,
                                            ),
                                    )
                                    .join(
                                        ' · ',
                                    )}
                            />
                        </div>
                    </section>

                    <section className="mt-8">
                        <SectionHeading>
                            Location
                        </SectionHeading>

                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-white text-[var(--ac-text-muted)]">
                                    <MapPin
                                        size={16}
                                    />
                                </div>

                                <div>
                                    <p className="text-xs font-semibold">
                                        Business address
                                    </p>

                                    <p className="mt-1.5 text-sm leading-6 text-[var(--ac-text-soft)]">
                                        {location ||
                                            'No address has been added yet.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="mt-8">
                        <SectionHeading>
                            Record activity
                        </SectionHeading>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <LifecycleCard
                                icon={
                                    CalendarDays
                                }
                                label="Created"
                                value={formatDate(
                                    resolvedParty.created_at,
                                )}
                            />

                            <LifecycleCard
                                icon={
                                    ShieldCheck
                                }
                                label="Last updated"
                                value={formatDate(
                                    resolvedParty.updated_at,
                                )}
                            />
                        </div>
                    </section>
                </div>

                <footer className="border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:px-6">
                    <div className="grid gap-2 sm:flex sm:justify-end">
                        {! archived &&
                            canEdit && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onEdit(
                                            resolvedParty,
                                        )
                                    }
                                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white px-5 text-sm font-semibold"
                                >
                                    <Edit3
                                        size={15}
                                    />

                                    Edit
                                </button>
                            )}

                        {! archived &&
                            canArchive && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onArchive(
                                            resolvedParty,
                                        )
                                    }
                                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white"
                                >
                                    <Archive
                                        size={15}
                                    />

                                    Archive
                                </button>
                            )}

                        {archived &&
                            canArchive && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onRestore(
                                            resolvedParty,
                                        )
                                    }
                                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-accent-strong)] px-5 text-sm font-semibold text-white"
                                >
                                    <RotateCcw
                                        size={15}
                                    />

                                    Restore
                                </button>
                            )}
                    </div>
                </footer>
            </aside>
        </div>
    );
}

type SectionHeadingProps = {
    children: string;
};

/**
 * Render one Party context section heading.
 */
function SectionHeading({
    children,
}: SectionHeadingProps) {
    return (
        <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
            {children}
        </p>
    );
}

type ContactActionProps = {
    icon: typeof Mail;

    label: string;

    value: string;

    href?: string;
};

/**
 * Render contact information as an action when a destination exists.
 */
function ContactAction({
    icon: Icon,
    label,
    value,
    href,
}: ContactActionProps) {
    const content = (
        <>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]">
                <Icon size={15} />
            </div>

            <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                    {label}
                </p>

                <p className="mt-1 truncate text-xs font-semibold">
                    {value}
                </p>
            </div>
        </>
    );

    if (! href) {
        return (
            <div className="flex min-w-0 items-center gap-3 rounded-[17px] border border-[var(--ac-line)] bg-white p-3">
                {content}
            </div>
        );
    }

    return (
        <a
            href={href}
            className="flex min-w-0 items-center gap-3 rounded-[17px] border border-[var(--ac-line)] bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-[var(--ac-shadow-soft)]"
        >
            {content}
        </a>
    );
}

type DetailRowProps = {
    label: string;

    value: string;
};

/**
 * Render one Party business-identity value.
 */
function DetailRow({
    label,
    value,
}: DetailRowProps) {
    return (
        <div className="flex items-start justify-between gap-5 border-b border-[var(--ac-line)] px-4 py-3.5 last:border-b-0">
            <span className="text-xs text-[var(--ac-text-muted)]">
                {label}
            </span>

            <span className="max-w-[60%] text-right text-xs font-semibold">
                {value}
            </span>
        </div>
    );
}

type LifecycleCardProps = {
    icon: typeof CalendarDays;

    label: string;

    value: string;
};

/**
 * Render one compact Party lifecycle signal.
 */
function LifecycleCard({
    icon: Icon,
    label,
    value,
}: LifecycleCardProps) {
    return (
        <div className="rounded-[17px] border border-[var(--ac-line)] bg-white p-4">
            <Icon
                size={15}
                className="text-[var(--ac-text-muted)]"
            />

            <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                {label}
            </p>

            <p className="mt-1 text-sm font-semibold">
                {value}
            </p>
        </div>
    );
}