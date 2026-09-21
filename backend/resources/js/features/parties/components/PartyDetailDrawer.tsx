import {
    RecordCollaborationPanel,
} from '@/components/data/RecordCollaborationPanel';
import { RecordCustomizationPanel } from '@/components/data/RecordCustomizationPanel';
import {
    PermanentDeleteControl,
} from '@/components/data/PermanentDeleteControl';
import {
    ActivityTimeline,
} from '@/components/data/ActivityTimeline';
import {
    RecordHealth,
} from '@/components/data/RecordHealth';
import {
    RecordQuickActions,
} from '@/components/data/RecordQuickActions';
import {
    useDialog,
} from '@/components/feedback/useDialog';
import {
    useToast,
} from '@/components/feedback/ToastProvider';
import {
    updatePartyNotes,
} from '@/features/parties/api';
import {
    Party360Panel,
} from '@/features/parties/components/Party360Panel';
import {
    PartyPricingPanel,
} from '@/features/parties/components/PartyPricingPanel';
import type {
    Party,
} from '@/features/parties/types';
import {
    ApiError,
} from '@/lib/http';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    getLocale,
} from '@/lib/locale';
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
    createPortal,
} from 'react-dom';

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
 * Format an API timestamp using the active application locale.
 */
function formatDate(
    value: string,
): string {
    return new Intl.DateTimeFormat(
        getLocale(),
        {
            day:
                'numeric',

            month:
                'short',

            year:
                'numeric',
        },
    ).format(
        new Date(
            value,
        ),
    );
}

/**
 * Translate Party business roles.
 */
function roleLabel(
    role:
        Party['roles'][number],
): string {
    return t(
        role ===
            'customer'
            ? 'role.customer'
            : role === 'contact' ? 'role.contact' : 'role.supplier',
    );
}

/**
 * Render the Party detail workspace directly against the browser viewport.
 *
 * Portal rendering guarantees the Show drawer is never clipped by AppShell,
 * ContextBar, Index motion, or responsive content containers.
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
    const locale = useLocale();

    const {
        showToast,
    } =
        useToast();

    const [
        notes,
        setNotes,
    ] =
        useState(
            '',
        );

    const [
        notesBusy,
        setNotesBusy,
    ] =
        useState(
            false,
        );

    const [
        notesMessage,
        setNotesMessage,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const dialogRef =
        useDialog(
            open,
            onClose,
            notesBusy,
        );

    /**
     * Keep the Party Show surface open while notes are being persisted.
     */
    function closeDialog(): void {
        if (
            ! notesBusy
        ) {
            onClose();
        }
    }

    useEffect(() => {
        setNotes(
            party?.notes ??
                '',
        );

        setNotesMessage(
            null,
        );
    }, [
        party,
    ]);

    if (
        ! open ||
        ! party ||
        typeof document ===
            'undefined'
    ) {
        return null;
    }

    const resolvedParty:
        Party =
            party;

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
        .filter(
            Boolean,
        )
        .join(
            ', ',
        );

    /**
     * Persist workspace-only Party notes while remaining inside the Show
     * surface.
     */
    async function handleSaveNotes(): Promise<void> {
        if (
            notesBusy ||
            archived ||
            ! canEdit
        ) {
            return;
        }

        setNotesBusy(
            true,
        );

        setNotesMessage(
            null,
        );

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

            showToast(
                t(
                    'feedback.notes',
                ),
            );
        } catch (
            exception
        ) {
            setNotesMessage(
                exception instanceof
                ApiError
                    ? exception.message
                    : t(
                          'ui.acconova_could_not_save_these_notes',
                      ),
            );
        } finally {
            setNotesBusy(
                false,
            );
        }
    }

    const surface = (
        <div className="fixed inset-0 z-[220]">
            <button
                type="button"
                aria-label={t(
                    'ui.close_party_details',
                )}
                onClick={
                    closeDialog
                }
                className="absolute inset-0 bg-black/35"
            />

            <aside
                ref={
                    dialogRef
                }
                role="dialog"
                aria-modal="true"
                aria-label={t(
                    'ui.relationship_context',
                )}
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line-strong)] bg-[var(--ac-surface)] shadow-[-28px_0_80px_rgba(0,0,0,0.28)] sm:max-w-[620px]"
            >
                <header className="shrink-0 border-b border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                            {t(
                                'ui.relationship_context',
                            )}
                        </p>

                        <div className="flex shrink-0 items-center gap-2">
                            <RecordQuickActions
                                recordKey={'party-' + String(resolvedParty.id)}
                                kind="party"
                                label={label}
                                detail={[
                                    resolvedParty.email,
                                    resolvedParty.phone,
                                ].filter(Boolean).join(' · ')}
                                href={'/app/parties/' + String(resolvedParty.id)}
                                ar={locale === 'ar'}
                            />

                            <button
                                type="button"
                                aria-label={t(
                                    'ui.close_party_details',
                                )}
                                onClick={
                                    closeDialog
                                }
                                className="flex size-9 shrink-0 items-center justify-center rounded-[11px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]"
                            >
                                <X
                                    size={
                                        16
                                    }
                                />
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 flex min-w-0 items-start gap-3.5">
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            {resolvedParty.type ===
                            'company' ? (
                                <Building2
                                    size={
                                        20
                                    }
                                />
                            ) : (
                                <UserRound
                                    size={
                                        20
                                    }
                                />
                            )}
                        </div>

                        <div className="min-w-0">
                            <h2 className="break-words text-2xl font-semibold tracking-[-0.045em] text-[var(--ac-text)] sm:text-[28px]">
                                {
                                    label
                                }
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
                                            className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-accent)]"
                                        >
                                            {roleLabel(
                                                role,
                                            )}
                                        </span>
                                    ),
                                )}

                                {archived && (
                                    <span className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-danger)]">
                                        {t(
                                            'ui.archived',
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
                    <div className="mb-6">
                        <RecordHealth
                            ar={locale === 'ar'}
                            fields={[
                                {
                                    label: locale === 'ar' ? 'الاسم' : 'Name',
                                    complete: Boolean(label.trim()),
                                },
                                {
                                    label: locale === 'ar' ? 'البريد الإلكتروني' : 'Email',
                                    complete: Boolean(resolvedParty.email?.trim()),
                                },
                                {
                                    label: locale === 'ar' ? 'الهاتف' : 'Phone',
                                    complete: Boolean(resolvedParty.phone?.trim()),
                                },
                                {
                                    label: locale === 'ar' ? 'الرقم الضريبي' : 'Tax number',
                                    complete: Boolean(resolvedParty.tax_number?.trim()),
                                },
                                {
                                    label: locale === 'ar' ? 'العنوان' : 'Address',
                                    complete: Boolean(
                                        resolvedParty.address_line_1?.trim()
                                        || resolvedParty.city?.trim()
                                        || resolvedParty.country_code?.trim(),
                                    ),
                                },
                            ]}
                        />
                    </div>

                    <section>
                        <SectionHeading>
                            {t(
                                'ui.contact',
                            )}
                        </SectionHeading>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <ContactAction
                                icon={
                                    Mail
                                }
                                label={t(
                                    'ui.email',
                                )}
                                value={
                                    resolvedParty.email ??
                                    t(
                                        'ui.not_provided',
                                    )
                                }
                                href={
                                    resolvedParty.email
                                        ? `mailto:${resolvedParty.email}`
                                        : undefined
                                }
                            />

                            <ContactAction
                                icon={
                                    Phone
                                }
                                label={t(
                                    'ui.phone',
                                )}
                                value={
                                    resolvedParty.phone ??
                                    t(
                                        'ui.not_provided',
                                    )
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
                            {t(
                                'ui.internal_notes',
                            )}
                        </SectionHeading>

                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-surface)] text-[var(--ac-text-muted)] shadow-[var(--ac-shadow-soft)]">
                                    <NotebookPen
                                        size={
                                            16
                                        }
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold">
                                        {t(
                                            'ui.workspace_note',
                                        )}
                                    </p>

                                    <p className="mt-1 text-[10px] leading-4 text-[var(--ac-text-muted)]">
                                        {t(
                                            'ui.internal_only_this_note_is_not_customer_facing',
                                        )}
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
                                rows={
                                    5
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setNotes(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                placeholder={t(
                                    'ui.add_useful_context_preferences_follow_up_information_or_internal_reminders',
                                )}
                                className="mt-4 w-full resize-y rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)] disabled:bg-[var(--ac-bg-soft)] disabled:text-[var(--ac-text-muted)]"
                            />

                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-[10px] text-[var(--ac-text-muted)]">
                                    {archived
                                        ? t(
                                              'ui.restore_this_relationship_before_changing_notes',
                                          )
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
                                                size={
                                                    14
                                                }
                                            />

                                            {notesBusy
                                                ? t(
                                                      'ui.saving',
                                                  )
                                                : t(
                                                      'ui.save_notes',
                                                  )}
                                        </button>
                                    )}
                            </div>

                            {notesMessage && (
                                <p
                                    role="alert"
                                    className="mt-3 text-xs text-[var(--ac-danger)]"
                                >
                                    {
                                        notesMessage
                                    }
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="mt-8">
                        <SectionHeading>
                            {t(
                                'ui.business_identity',
                            )}
                        </SectionHeading>

                        <div className="overflow-hidden rounded-[20px] border border-[var(--ac-line)]">
                            <DetailRow
                                label={t(
                                    'ui.entity_type',
                                )}
                                value={
                                    resolvedParty.type ===
                                    'company'
                                        ? t(
                                              'ui.company',
                                          )
                                        : t(
                                              party.type === 'other' ? 'ui.other_party' : 'ui.person',
                                          )
                                }
                            />

                            <DetailRow
                                label={t(
                                    'ui.tax_number',
                                )}
                                value={
                                    resolvedParty.tax_number ??
                                    t(
                                        'ui.not_provided',
                                    )
                                }
                            />

                            <DetailRow
                                label={t(
                                    'ui.relationship',
                                )}
                                value={resolvedParty.roles
                                    .map(
                                        roleLabel,
                                    )
                                    .join(
                                        ' · ',
                                    )}
                            />
                        </div>
                    </section>

                    <section className="mt-8">
                        <SectionHeading>
                            {t(
                                'ui.location',
                            )}
                        </SectionHeading>

                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-surface)] text-[var(--ac-text-muted)]">
                                    <MapPin
                                        size={
                                            16
                                        }
                                    />
                                </div>

                                <div className="min-w-0">
                                    <p className="text-xs font-semibold">
                                        {t(
                                            'ui.business_address',
                                        )}
                                    </p>

                                    <p className="mt-1.5 break-words text-sm leading-6 text-[var(--ac-text-soft)]">
                                        {location ||
                                            t(
                                                'ui.no_address_has_been_added_yet',
                                            )}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="mt-8">
                        <SectionHeading>
                            {t(
                                'ui.record_activity',
                            )}
                        </SectionHeading>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <LifecycleCard
                                icon={
                                    CalendarDays
                                }
                                label={t(
                                    'ui.created',
                                )}
                                value={formatDate(
                                    resolvedParty.created_at,
                                )}
                            />

                            <LifecycleCard
                                icon={
                                    ShieldCheck
                                }
                                label={t(
                                    'ui.last_updated',
                                )}
                                value={formatDate(
                                    resolvedParty.updated_at,
                                )}
                            />
                        </div>
                    </section>
                    <Party360Panel
                        party={resolvedParty}
                        ar={locale === 'ar'}
                    />

                    <RecordCollaborationPanel
                        type="party"
                        recordId={resolvedParty.id}
                        ar={locale === 'ar'}
                        allowRelationships
                        allowReminders
                        title={
                            locale === 'ar'
                                ? 'العلاقة الداخلية والمتابعة'
                                : 'Internal relationship & follow-up'
                        }
                    />

                    <RecordCustomizationPanel
                        type="party"
                        recordId={resolvedParty.id}
                        ar={locale === 'ar'}
                    />

                    <div className="mt-6">
                        <ActivityTimeline
                            title={locale === 'ar' ? 'سجل النشاط' : 'Activity timeline'}
                            locale={locale}
                            items={[
                                {
                                    key: 'party-created',
                                    label: locale === 'ar' ? 'تم إنشاء الجهة' : 'Party created',
                                    detail: locale === 'ar' ? 'بداية سجل العلاقة داخل مساحة العمل.' : 'Relationship record added to this workspace.',
                                    at: resolvedParty.created_at,
                                    tone: 'created',
                                },
                                {
                                    key: 'party-updated',
                                    label: locale === 'ar' ? 'آخر تعديل' : 'Last updated',
                                    detail: locale === 'ar' ? 'آخر وقت تم فيه تعديل بيانات الجهة.' : 'Most recent Party data update.',
                                    at: resolvedParty.updated_at,
                                    tone: 'updated',
                                },
                                ...(resolvedParty.deleted_at
                                    ? [{
                                        key: 'party-archived',
                                        label: locale === 'ar' ? 'تمت الأرشفة' : 'Party archived',
                                        detail: locale === 'ar' ? 'السجل محفوظ تاريخياً لكنه غير متاح للعمليات الجديدة.' : 'The record remains historical but is unavailable for new activity.',
                                        at: resolvedParty.deleted_at,
                                        tone: 'archived' as const,
                                    }]
                                    : []),
                            ]}
                        />
                    </div>
                </div>

                <footer className="shrink-0 border-t border-[var(--ac-line-strong)] bg-[var(--ac-surface)] px-4 py-3 shadow-[0_-14px_35px_rgba(0,0,0,0.12)] sm:px-6">
                    <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                        {! archived &&
                            canEdit && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onEdit(
                                            resolvedParty,
                                        )
                                    }
                                    className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] px-5 text-sm font-semibold text-[var(--ac-accent)] transition hover:bg-[var(--ac-surface-soft)]"
                                >
                                    <Edit3
                                        size={
                                            15
                                        }
                                    />

                                    {t(
                                        'ui.edit',
                                    )}
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
                                    className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-red-400/35 bg-red-500/10 px-5 text-sm font-semibold text-[var(--ac-danger)] transition hover:bg-red-500/15"
                                >
                                    <Archive
                                        size={
                                            15
                                        }
                                    />

                                    {t(
                                        'ui.archive',
                                    )}
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
                                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-accent-strong)] px-5 text-sm font-semibold text-white transition hover:-translate-y-px motion-reduce:transform-none"
                                >
                                    <RotateCcw
                                        size={
                                            15
                                        }
                                    />

                                    {t(
                                        'ui.restore',
                                    )}
                                </button>
                            )}

                        {archived && (
                            <PermanentDeleteControl
                                resource="parties"
                                recordId={
                                    resolvedParty.id
                                }
                                recordName={
                                    label
                                }
                                onDeleted={
                                    onClose
                                }
                            />
                        )}
                    </div>
                </footer>
            </aside>
        </div>
    );

    return createPortal(
        surface,
        document.body,
    );
}

type SectionHeadingProps = {
    children: string;
};

/**
 * Render one Party Show section heading.
 */
function SectionHeading({
    children,
}: SectionHeadingProps) {
    return (
        <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
            {
                children
            }
        </p>
    );
}

type ContactActionProps = {
    icon:
        typeof Mail;

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
                <Icon
                    size={
                        15
                    }
                />
            </div>

            <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                    {
                        label
                    }
                </p>

                <p className="mt-1 truncate text-xs font-semibold">
                    {
                        value
                    }
                </p>
            </div>
        </>
    );

    if (
        ! href
    ) {
        return (
            <div className="flex min-w-0 items-center gap-3 rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                {
                    content
                }
            </div>
        );
    }

    return (
        <a
            href={
                href
            }
            className="flex min-w-0 items-center gap-3 rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 transition hover:-translate-y-0.5 hover:shadow-[var(--ac-shadow-soft)] motion-reduce:transform-none"
        >
            {
                content
            }
        </a>
    );
}

type DetailRowProps = {
    label: string;

    value: string;
};

/**
 * Render one Party identity value.
 */
function DetailRow({
    label,
    value,
}: DetailRowProps) {
    return (
        <div className="flex items-start justify-between gap-5 border-b border-[var(--ac-line)] px-4 py-3.5 last:border-b-0">
            <span className="text-xs text-[var(--ac-text-muted)]">
                {
                    label
                }
            </span>

            <span className="max-w-[60%] break-words text-end text-xs font-semibold">
                {
                    value
                }
            </span>
        </div>
    );
}

type LifecycleCardProps = {
    icon:
        typeof CalendarDays;

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
        <div className="rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <Icon
                size={
                    15
                }
                className="text-[var(--ac-text-muted)]"
            />

            <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                {
                    label
                }
            </p>

            <p className="mt-1 text-sm font-semibold">
                {
                    value
                }
            </p>
        </div>
    );
}
