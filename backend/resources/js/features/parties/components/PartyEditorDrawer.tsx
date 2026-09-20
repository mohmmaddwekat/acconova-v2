import {
    useDialog,
} from '@/components/feedback/useDialog';
import {
    createParty,
    fetchParties,
    updateParty,
    type PartyPayload,
} from '@/features/parties/api';
import type {
    Party,
    PartyRole,
    PartyType,
} from '@/features/parties/types';
import {
    ApiError,
} from '@/lib/http';
import {
    useGlobalSave,
    useUnsavedChanges,
} from '@/lib/editorSafety';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    Building2,
    Check,
    Save,
    UserRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useId,
    useRef,
    useState,
    type FormEvent,
} from 'react';
import {
    createPortal,
} from 'react-dom';

type PartyEditorDrawerProps = {
    open: boolean;

    party:
        | Party
        | null;

    onClose: () => void;

    onSaved: () => void;
};

type PartyForm = {
    type: PartyType;

    displayName: string;

    email: string;

    phone: string;

    taxNumber: string;

    creditLimit: string;

    addressLine1: string;

    addressLine2: string;

    city: string;

    state: string;

    postalCode: string;

    countryCode: string;

    roles: PartyRole[];
};

/**
 * Convert an existing Party into editable state or return Add defaults.
 */
function formFromParty(
    party:
        | Party
        | null,
): PartyForm {
    return {
        type:
            party?.type ??
            'person',

        displayName:
            party?.type ===
            'company'
                ? party.company_name ??
                  ''
                : party?.name ??
                  '',

        email:
            party?.email ??
            '',

        phone:
            party?.phone ??
            '',

        taxNumber:
            party?.tax_number ??
            '',

        creditLimit:
            party?.credit_limit ??
            '',

        addressLine1:
            party?.address_line_1 ??
            '',

        addressLine2:
            party?.address_line_2 ??
            '',

        city:
            party?.city ??
            '',

        state:
            party?.state ??
            '',

        postalCode:
            party?.postal_code ??
            '',

        countryCode:
            party?.country_code ??
            '',

        roles:
            party?.roles.length
                ? party.roles
                : [
                      'customer',
                  ],
    };
}

/**
 * Convert browser state into the stable Party API contract.
 */
function payloadFromForm(
    form: PartyForm,
): PartyPayload {
    const payload:
        PartyPayload = {
        type:
            form.type,

        email:
            form.email.trim()
                || null,

        phone:
            form.phone.trim()
                || null,

        tax_number:
            form.taxNumber.trim()
                || null,

        credit_limit:
            form.creditLimit.trim()
                || null,

        address_line_1:
            form.addressLine1.trim()
                || null,

        address_line_2:
            form.addressLine2.trim()
                || null,

        city:
            form.city.trim()
                || null,

        state:
            form.state.trim()
                || null,

        postal_code:
            form.postalCode.trim()
                || null,

        country_code:
            form.countryCode
                .trim()
                .toUpperCase()
                || null,

        roles:
            form.roles,
    };

    if (
        form.type !==
        'company'
    ) {
        payload.name =
            form.displayName.trim();
    } else {
        payload.company_name =
            form.displayName.trim();
    }

    return payload;
}

/**
 * Render the shared Party Add/Edit workspace against the browser viewport.
 *
 * Add and Edit intentionally share one editor so future field and validation
 * changes cannot drift between the two workflows.
 */
export function PartyEditorDrawer({
    open,
    party,
    onClose,
    onSaved,
}: PartyEditorDrawerProps) {
    const ar = useLocale() === 'ar';

    const formRef =
        useRef<HTMLFormElement | null>(
            null,
        );

    const [
        form,
        setForm,
    ] =
        useState<PartyForm>(
            formFromParty(
                party,
            ),
        );

    const [
        errors,
        setErrors,
    ] =
        useState<
            Record<
                string,
                string[]
            >
        >({});

    const [
        message,
        setMessage,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const [
        possibleDuplicates,
        setPossibleDuplicates,
    ] = useState<Party[]>([]);

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const dialogRef =
        useDialog(
            open,
            onClose,
            busy,
        );

    /**
     * Prevent closing while Party persistence is still in flight.
     */
    function closeDialog(): void {
        if (busy) {
            return;
        }

        if (
            dirty
            && ! window.confirm(
                ar
                    ? 'لديك تغييرات غير محفوظة. هل تريد إغلاق النموذج؟'
                    : 'You have unsaved changes. Close the form?',
            )
        ) {
            return;
        }

        onClose();
    }

    useEffect(() => {
        if (
            ! open
        ) {
            return;
        }

        setForm(
            formFromParty(
                party,
            ),
        );

        setErrors(
            {},
        );

        setMessage(
            null,
        );
    }, [
        open,
        party,
    ]);

    /*
     * Warn before a duplicate Party is created. This is advisory because two
     * people can legitimately share a name or phone number, while exact email
     * uniqueness remains enforced by the server.
     */
    useEffect(() => {
        if (! open) {
            setPossibleDuplicates([]);
            return;
        }

        const needle =
            form.email.trim()
            || form.phone.trim()
            || form.taxNumber.trim()
            || form.displayName.trim();

        if (needle.length < 3) {
            setPossibleDuplicates([]);
            return;
        }

        const timer = window.setTimeout(() => {
            void fetchParties({
                search: needle,
                status: 'active',
                page: 1,
                perPage: 8,
            })
                .then((response) => {
                    const normalizedName =
                        form.displayName.trim().toLocaleLowerCase();
                    const normalizedEmail =
                        form.email.trim().toLocaleLowerCase();
                    const normalizedPhone =
                        form.phone.trim().replace(/\s+/g, '');
                    const normalizedTax =
                        form.taxNumber.trim().toLocaleLowerCase();

                    setPossibleDuplicates(
                        response.data.filter((candidate) => {
                            if (candidate.id === party?.id) {
                                return false;
                            }

                            const candidateName =
                                (
                                    candidate.type === 'company'
                                        ? candidate.company_name
                                        : candidate.name
                                )?.trim().toLocaleLowerCase() ?? '';

                            return Boolean(
                                (
                                    normalizedEmail
                                    && candidate.email?.trim().toLocaleLowerCase()
                                        === normalizedEmail
                                )
                                || (
                                    normalizedPhone
                                    && candidate.phone?.trim().replace(/\s+/g, '')
                                        === normalizedPhone
                                )
                                || (
                                    normalizedTax
                                    && candidate.tax_number?.trim().toLocaleLowerCase()
                                        === normalizedTax
                                )
                                || (
                                    normalizedName.length >= 3
                                    && candidateName === normalizedName
                                ),
                            );
                        }).slice(0, 4),
                    );
                })
                .catch(() => {
                    setPossibleDuplicates([]);
                });
        }, 300);

        return () => window.clearTimeout(timer);
    }, [
        open,
        party?.id,
        form.displayName,
        form.email,
        form.phone,
        form.taxNumber,
    ]);

    const dirty =
        open
        && JSON.stringify(
            form,
        ) !==
            JSON.stringify(
                formFromParty(
                    party,
                ),
            );

    useUnsavedChanges(
        dirty && ! busy,
        ar,
    );

    useGlobalSave(
        () =>
            formRef.current
                ?.requestSubmit(),
        open
        && ! busy,
    );

    /**
     * Change the Party identity type while retaining entered information.
     */
    function changeType(
        type: PartyType,
    ): void {
        setForm(
            (
                current,
            ) => ({
                ...current,

                type,
                roles: type === 'other' ? ['contact'] : current.roles,
            }),
        );
    }

    /**
     * Toggle customer/supplier role while retaining at least one relationship.
     */
    function toggleRole(
        role: PartyRole,
    ): void {
        setForm(
            (
                current,
            ) => {
                const selected =
                    current.roles.includes(
                        role,
                    );

                if (
                    selected &&
                    current.roles.length ===
                        1
                ) {
                    return current;
                }

                return {
                    ...current,

                    roles:
                        selected
                            ? current.roles.filter(
                                  (
                                      value,
                                  ) =>
                                      value !==
                                      role,
                              )
                            : [
                                  ...current.roles,
                                  role,
                              ],
                };
            },
        );
    }

    /**
     * Persist the form as either a new Party or an existing Party update.
     */
    async function handleSubmit(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setErrors(
            {},
        );

        setMessage(
            null,
        );

        try {
            const payload =
                payloadFromForm(
                    form,
                );

            if (
                party
            ) {
                await updateParty(
                    party.id,
                    payload,
                );
            } else {
                await createParty(
                    payload,
                );
            }

            onSaved();

            onClose();
        } catch (
            exception
        ) {
            if (
                exception instanceof
                ApiError
            ) {
                setErrors(
                    exception.errors,
                );

                setMessage(
                    exception.message,
                );

                return;
            }

            setMessage(
                t(
                    'ui.acconova_could_not_save_this_relationship',
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    if (
        ! open ||
        typeof document ===
            'undefined'
    ) {
        return null;
    }

    const identityError =
        errors.name?.[0] ??
        errors.company_name?.[0];

    const surface = (
        <div className="fixed inset-0 z-[220]">
            <button
                type="button"
                aria-label={t(
                    'ui.close_relationship_editor',
                )}
                onClick={
                    closeDialog
                }
                className="absolute inset-0 bg-[var(--ac-text)]/20 backdrop-blur-[3px]"
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
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[-40px_0_100px_rgba(20,35,30,0.14)] sm:max-w-[640px]"
            >
                <header className="shrink-0 border-b border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 py-5 sm:px-7 sm:py-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                                {party
                                    ? t(
                                          'ui.relationship_record',
                                      )
                                    : t(
                                          'ui.new_relationship',
                                      )}
                            </p>

                            <h2 className="mt-2 text-2xl font-medium tracking-[-0.05em] text-[var(--ac-text)] sm:text-3xl">
                                {party
                                    ? t(
                                          'ui.refine_what_you_know',
                                      )
                                    : t(
                                          'ui.add_someone_you_do_business_with',
                                      )}
                            </h2>
                        </div>

                        <button
                            type="button"
                            aria-label={t(
                                'ui.close_relationship_editor',
                            )}
                            onClick={
                                closeDialog
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-bg-soft)]"
                        >
                            <X
                                size={
                                    18
                                }
                            />
                        </button>
                    </div>
                </header>

                <form
                    data-ac-managed-dirty="true"
                    ref={formRef}
                    onSubmit={(
                        event,
                    ) =>
                        void handleSubmit(
                            event,
                        )
                    }
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7 sm:py-7">
                        <SectionTitle>
                            {t(
                                'ui.identity',
                            )}
                        </SectionTitle>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <IdentityTypeButton
                                active={
                                    form.type ===
                                    'person'
                                }
                                icon={
                                    UserRound
                                }
                                label={t(
                                    'ui.person',
                                )}
                                onClick={() =>
                                    changeType(
                                        'person',
                                    )
                                }
                            />

                            <IdentityTypeButton
                                active={
                                    form.type ===
                                    'company'
                                }
                                icon={
                                    Building2
                                }
                                label={t(
                                    'ui.company',
                                )}
                                onClick={() =>
                                    changeType(
                                        'company',
                                    )
                                }
                            />
                            <IdentityTypeButton active={form.type === 'other'} icon={Building2}
                                label={t('ui.other_party')} onClick={() => changeType('other')} />
                        </div>

                        <label className="mt-5 block">
                            <FieldLabel
                                label={
                                    form.type ===
                                    'person'
                                        ? t(
                                              'ui.full_name',
                                          )
                                        : t(
                                              form.type === 'other' ? 'ui.party_name' : 'ui.company_name',
                                          )
                                }
                                required
                            />

                            <input
                                required
                                value={
                                    form.displayName
                                }
                                aria-invalid={Boolean(
                                    identityError,
                                )}
                                aria-describedby={
                                    identityError
                                        ? 'party-identity-error'
                                        : undefined
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            displayName:
                                                event
                                                    .target
                                                    .value,
                                        }),
                                    )
                                }
                                className="h-12 w-full rounded-[16px] border border-[var(--ac-line-strong)] bg-[var(--ac-surface)] px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                            />

                            {identityError && (
                                <p
                                    id="party-identity-error"
                                    role="alert"
                                    className="mt-2 text-xs text-[var(--ac-danger)]"
                                >
                                    {
                                        identityError
                                    }
                                </p>
                            )}
                        </label>

                        <div className="mb-3 mt-8 flex items-center justify-between gap-3">
                            <SectionTitle
                                compact
                            >
                                {t(
                                    'ui.business_relationship',
                                )}
                            </SectionTitle>

                            <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-accent-strong)]">
                                {t(
                                    'ui.required',
                                )}
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {(
                                [
                                    'customer',
                                    'supplier',
                                    'contact',
                                ] as PartyRole[]
                            ).map(
                                (
                                    role,
                                ) => {
                                    const selected =
                                        form.roles.includes(
                                            role,
                                        );

                                    const label =
                                        t(
                                            role ===
                                                'customer'
                                                ? 'role.customer'
                                                : role === 'contact' ? 'role.contact' : 'role.supplier',
                                        );

                                    return (
                                        <button
                                            key={
                                                role
                                            }
                                            type="button"
                                            aria-pressed={
                                                selected
                                            }
                                            onClick={() =>
                                                toggleRole(
                                                    role,
                                                )
                                            }
                                            className={[
                                                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition',
                                                selected
                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                    : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            {selected && (
                                                <Check
                                                    size={
                                                        14
                                                    }
                                                />
                                            )}

                                            {
                                                label
                                            }
                                        </button>
                                    );
                                },
                            )}
                        </div>

                        <div className="mt-8">
                            <SectionTitle>
                                {t(
                                    'ui.contact',
                                )}
                            </SectionTitle>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <PartyField
                                label={t(
                                    'ui.email',
                                )}
                                type="email"
                                value={
                                    form.email
                                }
                                error={
                                    errors
                                        .email?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            email:
                                                value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label={t(
                                    'ui.phone',
                                )}
                                type="tel"
                                value={
                                    form.phone
                                }
                                error={
                                    errors
                                        .phone?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            phone:
                                                value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label={t(
                                    'ui.tax_number',
                                )}
                                value={
                                    form.taxNumber
                                }
                                error={
                                    errors
                                        .tax_number?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            taxNumber:
                                                value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label={ar ? 'الحد الائتماني' : 'Credit limit'}
                                type="number"
                                min="0"
                                step="0.0001"
                                value={
                                    form.creditLimit
                                }
                                error={
                                    errors
                                        .credit_limit?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            creditLimit:
                                                value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label={t(
                                    'ui.country_code',
                                )}
                                value={
                                    form.countryCode
                                }
                                maxLength={
                                    2
                                }
                                error={
                                    errors
                                        .country_code?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            countryCode:
                                                value.toUpperCase(),
                                        }),
                                    )
                                }
                            />
                        </div>

                        <div className="mt-8">
                            <SectionTitle>
                                {t(
                                    'ui.location',
                                )}
                            </SectionTitle>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <PartyField
                                    label={t(
                                        'ui.address_line_1',
                                    )}
                                    value={
                                        form.addressLine1
                                    }
                                    error={
                                        errors
                                            .address_line_1?.[0]
                                    }
                                    onChange={(
                                        value,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                addressLine1:
                                                    value,
                                            }),
                                        )
                                    }
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <PartyField
                                    label={t(
                                        'ui.address_line_2',
                                    )}
                                    value={
                                        form.addressLine2
                                    }
                                    error={
                                        errors
                                            .address_line_2?.[0]
                                    }
                                    onChange={(
                                        value,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                addressLine2:
                                                    value,
                                            }),
                                        )
                                    }
                                />
                            </div>

                            <PartyField
                                label={t(
                                    'ui.city',
                                )}
                                value={
                                    form.city
                                }
                                error={
                                    errors
                                        .city?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            city:
                                                value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label={t(
                                    'ui.state',
                                )}
                                value={
                                    form.state
                                }
                                error={
                                    errors
                                        .state?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            state:
                                                value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label={t(
                                    'ui.postal_code',
                                )}
                                value={
                                    form.postalCode
                                }
                                error={
                                    errors
                                        .postal_code?.[0]
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,

                                            postalCode:
                                                value,
                                        }),
                                    )
                                }
                            />
                        </div>

                        {possibleDuplicates.length > 0 && (
                            <div className="mt-6 rounded-[16px] border border-amber-300 bg-amber-50 p-4 text-amber-900">
                                <div className="flex items-start gap-3">
                                    <Building2 size={17} className="mt-0.5 shrink-0" />
                                    <div>
                                        <strong className="text-sm">
                                            {ar
                                                ? 'قد تكون هذه الجهة موجودة مسبقاً'
                                                : 'This Party may already exist'}
                                        </strong>
                                        <p className="mt-1 text-xs leading-5">
                                            {ar
                                                ? 'راجع النتائج قبل الحفظ حتى لا تنشئ عميلاً أو مورداً مكرراً.'
                                                : 'Review these matches before saving to avoid a duplicate customer or supplier.'}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-xs">
                                            {possibleDuplicates.map((candidate) => (
                                                <li key={candidate.id}>
                                                    • {candidate.type === 'company'
                                                        ? candidate.company_name
                                                        : candidate.name}
                                                    {candidate.email ? ' · ' + candidate.email : ''}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {message && (
                            <div
                                role="alert"
                                className="mt-6 rounded-[16px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]"
                            >
                                {
                                    message
                                }
                            </div>
                        )}
                    </div>

                    <footer className="shrink-0 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-4 sm:px-7 sm:py-5">
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="hidden text-xs text-[var(--ac-text-muted)] sm:block">
                                {t(
                                    'ui.stored_inside_the_active_workspace',
                                )}
                            </p>

                            <div className="flex w-full gap-2 sm:w-auto">
                                <button
                                    type="button"
                                    disabled={
                                        busy
                                    }
                                    onClick={
                                        closeDialog
                                    }
                                    className="h-11 flex-1 rounded-[14px] border border-transparent px-5 text-sm font-medium text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface)] disabled:opacity-50 sm:flex-none"
                                >
                                    {t(
                                        'ui.cancel',
                                    )}
                                </button>

                                <button
                                    type="submit"
                                    disabled={
                                        busy
                                    }
                                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-6 text-sm font-semibold text-white transition hover:-translate-y-px disabled:translate-y-0 disabled:opacity-60 motion-reduce:transform-none sm:flex-none"
                                >
                                    <Save
                                        size={
                                            15
                                        }
                                    />

                                    {busy
                                        ? t(
                                              'ui.saving',
                                          )
                                        : party
                                          ? t(
                                                'ui.save_changes',
                                            )
                                          : t(
                                                'ui.add_relationship',
                                            )}
                                </button>
                            </div>
                        </div>
                    </footer>
                </form>
            </aside>
        </div>
    );

    return createPortal(
        surface,
        document.body,
    );
}

type IdentityTypeButtonProps = {
    active: boolean;

    icon:
        typeof UserRound;

    label: string;

    onClick: () => void;
};

/**
 * Render one Party identity-type selection.
 */
function IdentityTypeButton({
    active,
    icon: Icon,
    label,
    onClick,
}: IdentityTypeButtonProps) {
    return (
        <button
            type="button"
            aria-pressed={
                active
            }
            onClick={
                onClick
            }
            className={[
                'flex items-center gap-3 rounded-[18px] border p-4 text-start transition',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                    : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
            ].join(
                ' ',
            )}
        >
            <Icon
                size={
                    18
                }
            />

            <span className="text-sm font-semibold">
                {
                    label
                }
            </span>
        </button>
    );
}

type SectionTitleProps = {
    children: string;

    compact?: boolean;
};

/**
 * Render one editor section label.
 */
function SectionTitle({
    children,
    compact = false,
}: SectionTitleProps) {
    return (
        <p
            className={[
                'text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]',
                compact
                    ? ''
                    : 'mb-3',
            ].join(
                ' ',
            )}
        >
            {
                children
            }
        </p>
    );
}

type PartyFieldProps = {
    label: string;

    value: string;

    onChange: (
        value: string,
    ) => void;

    error?: string;

    type?: string;

    min?: string;

    step?: string;

    maxLength?: number;

    required?: boolean;
};

/**
 * Render a consistent Party field with localized requirement and validation
 * feedback.
 */
function PartyField({
    label,
    value,
    onChange,
    error,
    type = 'text',
    min,
    step,
    maxLength,
    required = false,
}: PartyFieldProps) {
    useLocale();

    const errorId =
        useId();

    return (
        <label className="block">
            <FieldLabel
                label={
                    label
                }
                required={
                    required
                }
            />

            <input
                required={
                    required
                }
                type={
                    type
                }
                min={min}
                step={step}
                dir={
                    [
                        'email',
                        'tel',
                        'number',
                    ].includes(
                        type,
                    )
                        ? 'ltr'
                        : undefined
                }
                value={
                    value
                }
                maxLength={
                    maxLength
                }
                aria-invalid={Boolean(
                    error,
                )}
                aria-describedby={
                    error
                        ? errorId
                        : undefined
                }
                onChange={(
                    event,
                ) =>
                    onChange(
                        event
                            .target
                            .value,
                    )
                }
                className="h-12 w-full rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
            />

            {error && (
                <p
                    id={
                        errorId
                    }
                    role="alert"
                    className="mt-2 text-xs text-[var(--ac-danger)]"
                >
                    {
                        error
                    }
                </p>
            )}
        </label>
    );
}

type FieldLabelProps = {
    label: string;

    required: boolean;
};

/**
 * Render a field label with explicit Required/Optional state.
 */
function FieldLabel({
    label,
    required,
}: FieldLabelProps) {
    useLocale();

    return (
        <span className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[var(--ac-text)]">
                {
                    label
                }
            </span>

            <span
                className={[
                    'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]',
                    required
                        ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                        : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                ].join(
                    ' ',
                )}
            >
                {required
                    ? t(
                          'ui.required',
                      )
                    : t(
                          'ui.optional',
                      )}
            </span>
        </span>
    );
}
