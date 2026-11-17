import {
    PermanentDeleteControl,
} from '@/components/data/PermanentDeleteControl';
import {
    InlineEditValue,
} from '@/components/data/InlineEditValue';
import type {
    ListDensity,
} from '@/components/data/ListPreferences';
import {
    PartyAgingBar,
} from '@/features/parties/components/PartyAgingBar';
import type {
    Party,
    PartyRole,
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
    ReceiptText,
    RotateCcw,
    UserRound,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
} from 'react';
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
function formatBalance(
    value: string,
    currency: string,
    locale: string,
): string {
    const numeric =
        Math.max(
            Number(value) || 0,
            0,
        );

    if (numeric < 0.005) {
        return '—';
    }

    const amount =
        numeric.toLocaleString(
            locale === 'ar'
                ? 'ar'
                : 'en',
            {
                maximumFractionDigits:
                    4,
            },
        );

    return `${amount} ${currency}`;
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
 * Shared desktop grid for the Party header and rows; both must stay in sync.
 */
export const PARTY_ROW_GRID =
    'lg:grid-cols-[auto_minmax(190px,1.2fr)_minmax(130px,0.7fr)_minmax(170px,1fr)_minmax(100px,0.55fr)_minmax(100px,0.55fr)_minmax(130px,0.7fr)_minmax(120px,0.65fr)_auto]';

const ROLE_OPTIONS: Array<{ value: PartyRole; key: 'role.customer' | 'role.supplier' | 'role.contact' }> = [
    { value: 'customer', key: 'role.customer' },
    { value: 'supplier', key: 'role.supplier' },
    { value: 'contact', key: 'role.contact' },
];

/**
 * Shows a party's types (customer, supplier, contact) and lets the user toggle them in place.
 * At least one type must stay selected, matching the server rule.
 */
function PartyRolesEditor({
    roles,
    editable,
    onChange,
}: {
    roles: PartyRole[];
    editable: boolean;
    onChange: (roles: PartyRole[]) => void | Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (! open) {
            return;
        }

        const close = (event: MouseEvent) => {
            if (box.current && ! box.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', close);

        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    async function toggle(role: PartyRole): Promise<void> {
        const next = roles.includes(role)
            ? roles.filter((item) => item !== role)
            : [...roles, role];

        if (next.length === 0 || busy) {
            return;
        }

        setBusy(true);

        try {
            await onChange(ROLE_OPTIONS.map((option) => option.value).filter((value) => next.includes(value)));
        } finally {
            setBusy(false);
        }
    }

    const badges = (
        <span className="flex flex-wrap gap-1.5">
            {roles.map((role) => (
                <span
                    key={role}
                    className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ac-accent-strong)]"
                >
                    {t(ROLE_OPTIONS.find((option) => option.value === role)?.key ?? 'role.contact')}
                </span>
            ))}
        </span>
    );

    if (! editable) {
        return badges;
    }

    return (
        <div ref={box} className="relative">
            <button
                type="button"
                onClick={() => setOpen((current) => ! current)}
                className="flex max-w-full items-center gap-1.5 rounded-[10px] px-1 py-0.5 text-start transition hover:bg-[var(--ac-surface-soft)]"
            >
                {badges}
                <Pencil size={11} className="shrink-0 text-[var(--ac-text-muted)]" />
            </button>

            {open && (
                <div className="absolute start-0 top-full z-30 mt-1 grid min-w-[150px] gap-1 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-2 shadow-[var(--ac-shadow-soft)]">
                    {ROLE_OPTIONS.map((option) => (
                        <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs font-semibold hover:bg-[var(--ac-surface-soft)]">
                            <input
                                type="checkbox"
                                checked={roles.includes(option.value)}
                                disabled={busy || (roles.length === 1 && roles.includes(option.value))}
                                onChange={() => void toggle(option.value)}
                                className="size-4 accent-[var(--ac-accent-strong)]"
                            />
                            {t(option.key)}
                        </label>
                    ))}
                </div>
            )}
        </div>
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
        'roles',
        'contact',
        'owed_to_us',
        'we_owe',
        'aging',
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
    const locale =
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
            ? 'p-3 sm:p-3 lg:px-5 lg:py-2'
            : 'p-4 sm:p-4 lg:px-5 lg:py-3';

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
                'ac-index-row group mx-3 my-3 grid min-w-0 gap-4 rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)] sm:mx-4 lg:m-0 lg:items-center lg:gap-4 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:shadow-none xl:px-6',
                rowPadding,
                PARTY_ROW_GRID,
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
            <div
                style={columnStyle('identity')}
                className="flex min-w-0 items-start gap-3 text-start sm:gap-4 lg:items-center"
            >
                <button
                    type="button"
                    aria-label={label}
                    onClick={() => onView(party)}
                    className="flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-text-soft)] transition duration-200 group-hover:bg-[var(--ac-accent-soft)] group-hover:text-[var(--ac-accent-strong)]"
                >
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
                </button>

                <div className="min-w-0 flex-1">
                    <InlineEditValue
                        value={party.type === 'company' ? (party.company_name ?? '') : (party.name ?? '')}
                        display={(
                            <button
                                type="button"
                                onClick={() => onView(party)}
                                className="block max-w-full break-words text-start text-[15px] font-semibold leading-5 tracking-[-0.02em]"
                            >
                                {label}
                            </button>
                        )}
                        editable={! archived && canEdit && Boolean(onInlineUpdate)}
                        onSave={(value) =>
                            onInlineUpdate?.(
                                party,
                                party.type === 'company'
                                    ? { company_name: value.trim() }
                                    : { name: value.trim() },
                            )}
                    />

                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {archived && (
                            <span className="rounded-full bg-[var(--ac-danger)]/8 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--ac-danger)]">
                                {t(
                                    'ui.archived',
                                )}
                            </span>
                        )}
                    </div>
                </div>
            </div>
            )}

            {visibleColumn('roles') && (
            <div style={columnStyle('roles')} className="min-w-0">
                <PartyRolesEditor
                    roles={party.roles}
                    editable={! archived && canEdit && Boolean(onInlineUpdate)}
                    onChange={(roles) => onInlineUpdate?.(party, { roles })}
                />
            </div>
            )}

            {visibleColumn('contact') && (
            <div
                style={columnStyle('contact')}
                className="grid min-w-0 gap-1 text-xs text-[var(--ac-text-soft)] sm:grid-cols-2 lg:grid-cols-1"
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

            {visibleColumn('owed_to_us') && (
            <div
                style={columnStyle('owed_to_us')}
                className="min-w-0"
            >
                <p className="mb-1 text-[9px] font-semibold text-[var(--ac-text-muted)] lg:hidden">
                    {locale === 'ar'
                        ? 'لي عليه'
                        : 'Owes me'}
                </p>

                <bdi
                    className={[
                        'block truncate text-sm font-semibold tabular-nums',
                        Number(party.balance_summary?.owed_to_us ?? 0) > 0
                            ? 'text-[var(--ac-success)]'
                            : 'text-[var(--ac-text-muted)]',
                    ].join(' ')}
                >
                    {party.balance_summary
                        ? formatBalance(
                            party.balance_summary.owed_to_us,
                            party.balance_summary.currency,
                            locale,
                        )
                        : '—'}
                </bdi>
            </div>
            )}

            {visibleColumn('we_owe') && (
            <div
                style={columnStyle('we_owe')}
                className="min-w-0"
            >
                <p className="mb-1 text-[9px] font-semibold text-[var(--ac-text-muted)] lg:hidden">
                    {locale === 'ar'
                        ? 'له عليّ'
                        : 'I owe'}
                </p>

                <bdi
                    className={[
                        'block truncate text-sm font-semibold tabular-nums',
                        Number(party.balance_summary?.we_owe ?? 0) > 0
                            ? 'text-[var(--ac-danger)]'
                            : 'text-[var(--ac-text-muted)]',
                    ].join(' ')}
                >
                    {party.balance_summary
                        ? formatBalance(
                            party.balance_summary.we_owe,
                            party.balance_summary.currency,
                            locale,
                        )
                        : '—'}
                </bdi>
            </div>
            )}

            {visibleColumn('aging') && (
            <div
                style={columnStyle('aging')}
                className="min-w-0"
            >
                <p className="mb-1 text-[9px] font-semibold text-[var(--ac-text-muted)] lg:hidden">
                    {locale === 'ar'
                        ? 'عمر الدين'
                        : 'Debt age'}
                </p>

                <PartyAgingBar
                    aging={party.balance_summary?.aging}
                    currency={party.balance_summary?.currency ?? ''}
                    ar={locale === 'ar'}
                />
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
                className="flex flex-wrap items-center gap-0.5 border-t border-[var(--ac-line)] pt-3 transition-opacity lg:justify-end lg:border-0 lg:pt-0 lg:opacity-50 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
            >
                <a
                    href={'/app/parties/' + String(party.id)}
                    aria-label={
                        locale === 'ar'
                            ? 'فتح الحساب الكامل'
                            : 'Open full account'
                    }
                    title={
                        locale === 'ar'
                            ? 'فتح الحساب الكامل'
                            : 'Open full account'
                    }
                    className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--ac-accent)] transition duration-200 hover:bg-[var(--ac-accent-soft)]"
                >
                    <ReceiptText size={15} />
                </a>

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
                    className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] transition duration-200 hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
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
                            className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] transition duration-200 hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
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
                            className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] transition duration-200 hover:bg-[var(--ac-danger)]/8 hover:text-[var(--ac-danger)]"
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
