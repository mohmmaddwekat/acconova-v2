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
 * Convert an existing Party into editable form state.
 *
 * Passing null creates the defaults used when adding a new relationship.
 */
function formFromParty(
    party: Party | null,
): PartyForm {
    return {
        type:
            party?.type ?? 'person',

        displayName:
            party?.type === 'company'
                ? party.company_name ?? ''
                : party?.name ?? '',

        email:
            party?.email ?? '',

        phone:
            party?.phone ?? '',

        taxNumber:
            party?.tax_number ?? '',

        addressLine1:
            party?.address_line_1 ?? '',

        addressLine2:
            party?.address_line_2 ?? '',

        city:
            party?.city ?? '',

        state:
            party?.state ?? '',

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
 * Convert browser form state into Laravel's stable Party API contract.
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
 * Render the shared create/edit Party workspace.
 *
 * A right-side working surface keeps the user inside the relationship context
 * instead of navigating away to a disconnected form page.
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

    const [message, setMessage] =
        useState<string | null>(null);

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
        setMessage(null);
    }, [
        open,
        party,
    ]);

    /**
     * Change Party identity type while keeping the entered display name
     * available for refinement.
     */
    function changeType(
        type: PartyType,
    ): void {
        setForm(
            (current) => ({
                ...current,
                type,
            }),
        );
    }

    /**
     * Toggle customer or supplier status while guaranteeing that every Party
     * retains at least one business relationship role.
     */
    function toggleRole(
        role: PartyRole,
    ): void {
        setForm((current) => {
            const selected =
                current.roles.includes(
                    role,
                );

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

    type FieldLabelProps = {
    label: string;
    required: boolean;
};

/**
 * Render a form label with an explicit Required or Optional state so users
 * never have to infer form requirements from missing asterisks.
 */
function FieldLabel({
    label,
    required,
}: FieldLabelProps) {
    return (
        <span className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[var(--ac-text)]">
                {label}
            </span>

            <span
                className={[
                    'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]',
                    required
                        ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                        : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                ].join(' ')}
            >
                {required
                    ? 'Required'
                    : 'Optional'}
            </span>
        </span>
    );
}
    /**
     * Persist the form as either a new Party or an update to an existing one.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        setBusy(true);
        setErrors({});
        setMessage(null);

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
        } catch (exception) {
            if (
                exception instanceof ApiError
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
                'AccoNova could not save this relationship.',
            );
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
                aria-label="Close relationship editor"
                onClick={onClose}
                className="absolute inset-0 bg-[var(--ac-text)]/20 backdrop-blur-[2px]"
            />

            <aside className="absolute inset-y-0 right-0 z-10 flex h-full w-full flex-col border-l border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.14)] sm:max-w-[640px]">
                <header className="flex items-start justify-between gap-4 border-b border-[var(--ac-line)] px-4 py-5 sm:px-7 sm:py-6">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                            {party
                                ? 'Relationship record'
                                : 'New relationship'}
                        </p>

                        <h2 className="mt-2 text-3xl font-medium tracking-[-0.05em] text-[var(--ac-text)]">
                            {party
                                ? 'Refine what you know.'
                                : 'Add someone you do business with.'}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-10 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-bg-soft)]"
                    >
                        <X size={18} />
                    </button>
                </header>

                <form
                    onSubmit={handleSubmit}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-7">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]">
                            Identity
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    changeType(
                                        'person',
                                    )
                                }
                                className={[
                                    'flex items-center gap-3 rounded-[18px] border p-4 text-left transition',
                                    form.type ===
                                    'person'
                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                        : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
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
                                    changeType(
                                        'company',
                                    )
                                }
                                className={[
                                    'flex items-center gap-3 rounded-[18px] border p-4 text-left transition',
                                    form.type ===
                                    'company'
                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                        : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
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
                            <FieldLabel
                                label={
                                    form.type === 'person'
                                        ? 'Full name'
                                        : 'Company name'
                                }
                                required
                            />

                            <input
                                required
                                value={form.displayName}
                                onChange={(event) =>
                                    setForm(
                                        (current) => ({
                                            ...current,

                                            displayName:
                                                event.target.value,
                                        }),
                                    )
                                }
                                className="h-12 w-full rounded-[16px] border border-[var(--ac-line-strong)] bg-white px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                            />

                            {identityError && (
                                <p className="mt-2 text-xs text-[var(--ac-danger)]">
                                    {identityError}
                                </p>
                            )}
                        </label>

                        <div className="mb-3 mt-8 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]">
                                Business relationship
                            </p>

                            <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-accent-strong)]">
                                Required
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
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
                                            'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium capitalize transition',
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

                        <p className="mb-3 mt-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]">
                            Contact
                        </p>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <PartyField
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

                            <PartyField
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

                            <PartyField
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

                            <PartyField
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

                        <p className="mb-3 mt-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]">
                            Location
                        </p>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <PartyField
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
                                <PartyField
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

                            <PartyField
                                label="City"
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
                                            city: value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label="State"
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
                                            state: value,
                                        }),
                                    )
                                }
                            />

                            <PartyField
                                label="Postal code"
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

                        {message && (
                            <div className="mt-6 rounded-[16px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                                {message}
                            </div>
                        )}
                    </div>

                    <footer className="flex flex-col-reverse gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-5">
                        <p className="hidden text-xs text-[var(--ac-text-muted)] sm:block">
                            Stored inside the active workspace.
                        </p>

                        <div className="flex w-full gap-2 sm:w-auto">
                            <button
                                type="button"
                                onClick={onClose}
                                className="h-11 flex-1 rounded-[14px] px-5 text-sm font-medium text-[var(--ac-text-soft)] sm:flex-none"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={busy}
                                className="h-11 flex-1 rounded-[14px] bg-[var(--ac-text)] px-6 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 sm:flex-none"
                            >
                                {busy
                                    ? 'Saving…'
                                    : party
                                      ? 'Save changes'
                                      : 'Add relationship'}
                            </button>
                        </div>
                    </footer>
                </form>
            </aside>
        </div>
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

    maxLength?: number;

    required?: boolean;
};

/**
 * Render a consistent optional Party detail field with Laravel validation
 * feedback.
 */
/**
 * Render a consistent Party detail field and clearly communicate whether the
 * value is required or optional.
 */
function PartyField({
    label,
    value,
    onChange,
    error,
    type = 'text',
    maxLength,
    required = false,
}: PartyFieldProps) {
    return (
        <label className="block">
            <FieldLabel
                label={label}
                required={required}
            />

            <input
                required={required}
                type={type}
                value={value}
                maxLength={maxLength}
                onChange={(event) =>
                    onChange(
                        event.target.value,
                    )
                }
                className="h-12 w-full rounded-[16px] border border-[var(--ac-line)] bg-white px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
            />

            {error && (
                <p className="mt-2 text-xs text-[var(--ac-danger)]">
                    {error}
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
 * Render a form label with an explicit Required or Optional state so users
 * never have to infer form requirements from missing asterisks.
 */
function FieldLabel({
    label,
    required,
}: FieldLabelProps) {
    return (
        <span className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[var(--ac-text)]">
                {label}
            </span>

            <span
                className={[
                    'rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]',
                    required
                        ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                        : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                ].join(' ')}
            >
                {required
                    ? 'Required'
                    : 'Optional'}
            </span>
        </span>
    );
}
