import {
    Building2,
    Check,
    UserRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

import {
    createParty,
    updateParty,
    type PartyPayload,
} from '@/features/parties/api';
import type {
    Party,
    PartyRole,
    PartyType,
} from '@/features/parties/types';
import { ApiError } from '@/lib/http';

type PartyEditorDrawerProps = {
    open: boolean;
    party: Party | null;
    onClose: () => void;
    onSaved: () => void;
};

type PartyForm = {
    type: PartyType;
    displayName: string;

    email: string;
    phone: string;
    taxNumber: string;

    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    countryCode: string;

    roles: PartyRole[];
};

/**
 * Convert one Party into editable browser form state.
 *
 * @param party Existing Party, or null when creating a new record.
 */
function formFromParty(
    party: Party | null,
): PartyForm {
    return {
        type: party?.type ?? 'person',

        displayName:
            party?.type === 'company'
                ? party.company_name ?? ''
                : party?.name ?? '',

        email: party?.email ?? '',
        phone: party?.phone ?? '',
        taxNumber: party?.tax_number ?? '',

        addressLine1:
            party?.address_line_1 ?? '',

        addressLine2:
            party?.address_line_2 ?? '',

        city: party?.city ?? '',
        state: party?.state ?? '',
        postalCode:
            party?.postal_code ?? '',

        countryCode:
            party?.country_code ?? '',

        roles:
            party?.roles.length
                ? party.roles
                : ['customer'],
    };
}

/**
 * Convert browser form values into Laravel's Party API contract.
 *
 * @param form Current Party editor state.
 */
function payloadFromForm(
    form: PartyForm,
): PartyPayload {
    const payload: PartyPayload = {
        type: form.type,

        email:
            form.email.trim() || null,

        phone:
            form.phone.trim() || null,

        tax_number:
            form.taxNumber.trim() || null,

        address_line_1:
            form.addressLine1.trim() || null,

        address_line_2:
            form.addressLine2.trim() || null,

        city:
            form.city.trim() || null,

        state:
            form.state.trim() || null,

        postal_code:
            form.postalCode.trim() || null,

        country_code:
            form.countryCode
                .trim()
                .toUpperCase() || null,

        roles: form.roles,
    };

    if (form.type === 'person') {
        payload.name =
            form.displayName.trim();
    } else {
        payload.company_name =
            form.displayName.trim();
    }

    return payload;
}

/**
 * Render the shared Party create/edit workspace.
 */
export function PartyEditorDrawer({
    open,
    party,
    onClose,
    onSaved,
}: PartyEditorDrawerProps) {
    const [form, setForm] =
        useState<PartyForm>(
            formFromParty(party),
        );

    const [errors, setErrors] =
        useState<
            Record<string, string[]>
        >({});

    const [busy, setBusy] =
        useState(false);

    useEffect(() => {
        if (! open) {
            return;
        }

        setForm(
            formFromParty(party),
        );

        setErrors({});
    }, [
        open,
        party,
    ]);

    /**
     * Toggle one Party relationship while keeping at least one selected.
     *
     * @param role Customer or supplier role.
     */
    function toggleRole(
        role: PartyRole,
    ): void {
        setForm((current) => {
            const selected =
                current.roles.includes(role);

            if (
                selected &&
                current.roles.length === 1
            ) {
                return current;
            }

            return {
                ...current,

                roles: selected
                    ? current.roles.filter(
                          (value) =>
                              value !== role,
                      )
                    : [
                          ...current.roles,
                          role,
                      ],
            };
        });
    }

    /**
     * Persist the Party and refresh the parent workspace.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        setBusy(true);
        setErrors({});

        try {
            const payload =
                payloadFromForm(form);

            if (party) {
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
        } catch (error) {
            if (
                error instanceof ApiError
            ) {
                setErrors(
                    error.errors,
                );
            }
        } finally {
            setBusy(false);
        }
    }

    if (! open) {
        return null;
    }

    const identityError =
        errors.name?.[0] ??
        errors.company_name?.[0];

    return (
        <div className="fixed inset-0 z-[100]">
            <button
                type="button"
                aria-label="Close Party editor"
                onClick={onClose}
                className="absolute inset-0 bg-[var(--ac-text)]/20 backdrop-blur-[2px]"
            />

            <aside className="absolute right-0 top-0 flex h-full w-full max-w-[620px] flex-col border-l border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.14)]">
                <header className="flex items-start justify-between border-b border-[var(--ac-line)] px-7 py-6">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)]">
                            {party
                                ? 'Edit Party'
                                : 'New Party'}
                        </p>

                        <h2 className="mt-2 text-3xl font-medium tracking-[-0.045em]">
                            {party
                                ? 'Update the relationship.'
                                : 'Grow your network.'}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-10 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-text-soft)]"
                    >
                        <X size={18} />
                    </button>
                </header>

                <form
                    onSubmit={handleSubmit}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="flex-1 overflow-y-auto px-7 py-6">
                        <p className="mb-3 text-xs font-semibold text-[var(--ac-text-soft)]">
                            Identity
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,
                                            type: 'person',
                                            displayName:
                                                '',
                                        }),
                                    )
                                }
                                className={[
                                    'flex items-center gap-3 rounded-[18px] border p-4 text-left transition',
                                    form.type ===
                                    'person'
                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                        : 'border-[var(--ac-line)]',
                                ].join(' ')}
                            >
                                <UserRound
                                    size={18}
                                />

                                <span className="text-sm font-semibold">
                                    Person
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,
                                            type: 'company',
                                            displayName:
                                                '',
                                        }),
                                    )
                                }
                                className={[
                                    'flex items-center gap-3 rounded-[18px] border p-4 text-left transition',
                                    form.type ===
                                    'company'
                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                        : 'border-[var(--ac-line)]',
                                ].join(' ')}
                            >
                                <Building2
                                    size={18}
                                />

                                <span className="text-sm font-semibold">
                                    Company
                                </span>
                            </button>
                        </div>

                        <label className="mt-5 block">
                            <span className="mb-2 block text-sm font-medium">
                                {form.type ===
                                'person'
                                    ? 'Full name'
                                    : 'Company name'}
                            </span>

                            <input
                                required
                                value={
                                    form.displayName
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
                                className="h-12 w-full rounded-[15px] border border-[var(--ac-line-strong)] px-4 text-sm outline-none focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                            />

                            {identityError && (
                                <p className="mt-2 text-xs text-[var(--ac-danger)]">
                                    {
                                        identityError
                                    }
                                </p>
                            )}
                        </label>

                        <p className="mb-3 mt-7 text-xs font-semibold text-[var(--ac-text-soft)]">
                            Relationship
                        </p>

                        <div className="flex gap-2">
                            {(
                                [
                                    'customer',
                                    'supplier',
                                ] as PartyRole[]
                            ).map((role) => {
                                const selected =
                                    form.roles.includes(
                                        role,
                                    );

                                return (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() =>
                                            toggleRole(
                                                role,
                                            )
                                        }
                                        className={[
                                            'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium capitalize',
                                            selected
                                                ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                : 'border-[var(--ac-line)] text-[var(--ac-text-soft)]',
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

                                        {role}
                                    </button>
                                );
                            })}
                        </div>

                        <p className="mb-3 mt-7 text-xs font-semibold text-[var(--ac-text-soft)]">
                            Contact
                        </p>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <PartyInput
                                label="Email"
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
                                            email: value,
                                        }),
                                    )
                                }
                            />

                            <PartyInput
                                label="Phone"
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
                                            phone: value,
                                        }),
                                    )
                                }
                            />

                            <PartyInput
                                label="Tax number"
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

                            <PartyInput
                                label="Country code"
                                value={
                                    form.countryCode
                                }
                                maxLength={2}
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

                        <p className="mb-3 mt-7 text-xs font-semibold text-[var(--ac-text-soft)]">
                            Location
                        </p>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <PartyInput
                                    label="Address line 1"
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
                                <PartyInput
                                    label="Address line 2"
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

                            <PartyInput
                                label="City"
                                value={
                                    form.city
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,
                                            city: value,
                                        }),
                                    )
                                }
                            />

                            <PartyInput
                                label="State"
                                value={
                                    form.state
                                }
                                onChange={(
                                    value,
                                ) =>
                                    setForm(
                                        (
                                            current,
                                        ) => ({
                                            ...current,
                                            state: value,
                                        }),
                                    )
                                }
                            />

                            <PartyInput
                                label="Postal code"
                                value={
                                    form.postalCode
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
                    </div>

                    <footer className="flex justify-end gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-7 py-5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-11 rounded-[14px] px-5 text-sm font-medium text-[var(--ac-text-soft)]"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={busy}
                            className="h-11 rounded-[14px] bg-[var(--ac-text)] px-6 text-sm font-semibold text-white disabled:opacity-60"
                        >
                            {busy
                                ? 'Saving…'
                                : party
                                  ? 'Save changes'
                                  : 'Create Party'}
                        </button>
                    </footer>
                </form>
            </aside>
        </div>
    );
}

type PartyInputProps = {
    label: string;
    value: string;
    onChange: (
        value: string,
    ) => void;
    error?: string;
    type?: string;
    maxLength?: number;
};

/**
 * Render one reusable Party text field with consistent validation feedback.
 */
function PartyInput({
    label,
    value,
    onChange,
    error,
    type = 'text',
    maxLength,
}: PartyInputProps) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium">
                {label}
            </span>

            <input
                type={type}
                value={value}
                maxLength={maxLength}
                onChange={(event) =>
                    onChange(
                        event.target.value,
                    )
                }
                className="h-12 w-full rounded-[15px] border border-[var(--ac-line)] px-4 text-sm outline-none focus:border-[var(--ac-accent)]"
            />

            {error && (
                <p className="mt-2 text-xs text-[var(--ac-danger)]">
                    {error}
                </p>
            )}
        </label>
    );
}
