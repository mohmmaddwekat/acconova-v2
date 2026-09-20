import {
    StaffWorkforcePanel,
} from '@/components/StaffWorkforcePanel';
import {
    StaffModuleNav,
} from '@/components/staff/StaffModuleNav';
import {
    SavedViews,
} from '@/components/data/SavedViews';
import {
    RecordHealth,
} from '@/components/data/RecordHealth';
import {
    RecordCollaborationPanel,
} from '@/components/data/RecordCollaborationPanel';
import {
    RecordQuickActions,
} from '@/components/data/RecordQuickActions';
import {
    SmartEmptyState,
} from '@/components/data/SmartEmptyState';
import {
    AppShell,
} from '@/layouts/AppShell';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import {
    staffCopy,
} from '@/lib/staffCopy';
import {
    useGlobalSave,
    useUnsavedChanges,
} from '@/lib/editorSafety';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    CircleDollarSign,
    FileSpreadsheet,
    History,
    MessageSquareText,
    Pencil,
    Plus,
    ReceiptText,
    Send,
    Trash2,
    UserRound,
    Users,
    WalletCards,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from 'react';

type PayBasis =
    | 'hour'
    | 'day'
    | 'month'
    | 'piece';

type Staff = {
    id: number;
    name: string;
    job_title: string | null;
    phone: string | null;
    email: string | null;
    user_id: number | null;
    basis: PayBasis;
    unit: string | null;
    rate: string;
    currency: string;
    monthly_allowance: string;
    started_on: string;
    active: boolean;
    department_id: number | null;
    balance: string | null;
};

type EntryKind =
    | 'work'
    | 'bonus'
    | 'allowance'
    | 'monthly_allowance'
    | 'deduction'
    | 'payment'
    | 'terms'
    | 'overtime'
    | 'advance';

type Entry = {
    id: number;
    kind: EntryKind;
    amount: string;
    occurred_on: string;
    quantity: string | null;
    rate: string | null;
    notes: string | null;
    terms?: {
        before?: Staff;
        after?: Staff;
        attendance_id?: number;
        adjustment_id?: number;
        period?: string;
    } | null;
};

type Correction = {
    entity: string;
    action: string;
    reason: string;
    created_at: string;
};

type Ledger = {
    can_pay: boolean;
    member: Staff;
    balance: string;
    totals: Record<string, string>;
    corrections: Correction[];
    entries: {
        data: Entry[];
        current_page?: number;
        last_page: number;
    };
};

type StaffIndex = {
    data: {
        data: Staff[];
        last_page: number;
        total: number;
    };
    can_invite: boolean;
    roles: {
        id: number;
        name: string;
    }[];
    can_manage: boolean;
    can_pay: boolean;
    can_import: boolean;
    can_view: boolean;
    currency: string;
    departments: {
        id: number;
        name: string;
        manager_id: number | null;
    }[];
    accounts: {
        id: number;
        name: string;
        email: string;
    }[];
};

type StaffTab =
    | 'overview'
    | 'attendance'
    | 'compensation'
    | 'ledger';

type EntryCorrectionState = {
    entry: Entry;
    action:
        | 'edit'
        | 'delete';
};

const field =
    'mt-2 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)]';

const button =
    'inline-flex items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-50';

const primaryButton =
    'inline-flex items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-solid)] px-4 py-2.5 text-sm font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Create an idempotency/request token in both secure production origins and
 * local HTTP development hosts such as acconova.test.
 *
 * crypto.randomUUID() is unavailable in some non-secure browser contexts and
 * calling it during the initial React render makes the whole Staff page blank.
 */
function requestToken(): string {
    if (
        typeof globalThis.crypto
            ?.randomUUID ===
        'function'
    ) {
        return globalThis.crypto
            .randomUUID();
    }

    return [
        'req',
        Date.now()
            .toString(36),
        Math.random()
            .toString(36)
            .slice(2),
        Math.random()
            .toString(36)
            .slice(2),
    ].join('-');
}

/**
 * Return today's local calendar date without converting through UTC.
 */
function today(): string {
    const date =
        new Date();

    return `${date.getFullYear()}-${String(
        date.getMonth() + 1,
    ).padStart(2, '0')}-${String(
        date.getDate(),
    ).padStart(2, '0')}`;
}

/**
 * Return the previous completed month in YYYY-MM format.
 */
function previousCompletedMonth(): string {
    const date =
        new Date();

    date.setDate(
        1,
    );

    date.setMonth(
        date.getMonth() - 1,
    );

    return `${date.getFullYear()}-${String(
        date.getMonth() + 1,
    ).padStart(2, '0')}`;
}

/**
 * Convert an API error into one useful surface message.
 */
function errorText(
    error: unknown,
    fallback: string,
): string {
    if (
        error instanceof
        ApiError
    ) {
        return [
            error.message,
            ...Object.values(
                error.errors,
            ).flat(),
        ]
            .filter(
                Boolean,
            )
            .join(
                ' ',
            );
    }

    return fallback;
}

/**
 * Format one employee ledger amount while preserving four-decimal values.
 */
function money(
    amount: string | number,
    currency: string,
): string {
    const value =
        Number(
            amount,
        );

    return `${Number.isFinite(value)
        ? value.toLocaleString(undefined, {
              maximumFractionDigits:
                  4,
          })
        : amount} ${currency}`;
}

/**
 * Render the employee workspace using the active Organization as its tenant.
 */
export default function StaffPage() {
    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    return (
        <StaffWorkspace
            key={
                workspace
                    .activeOrganization
                    ?.id
            }
        />
    );
}

/**
 * Render employee directory and a focused employee workspace.
 */
function StaffWorkspace() {
    const locale =
        useLocale();

    const ar =
        locale ===
        'ar';

    const c =
        staffCopy[
            locale
        ];

    const organizationId =
        usePage<AppPageProps>()
            .props
            .workspace
            .activeOrganization
            ?.id
        ?? 'none';

    const [
        search,
        setSearch,
    ] =
        useState(
            '',
        );

    const [
        department,
        setDepartment,
    ] =
        useState(
            '',
        );

    const [
        basisFilter,
        setBasisFilter,
    ] =
        useState(
            '',
        );

    const [
        activeFilter,
        setActiveFilter,
    ] =
        useState(
            '',
        );

    const [
        result,
        setResult,
    ] =
        useState<StaffIndex | null>(
            null,
        );

    const [
        page,
        setPage,
    ] =
        useState(
            1,
        );

    const [
        perPage,
        setPerPage,
    ] =
        useState(
            50,
        );

    const [
        revision,
        setRevision,
    ] =
        useState(
            0,
        );

    const [
        selected,
        setSelected,
    ] =
        useState<number | null>(
            null,
        );

    const [
        ledger,
        setLedger,
    ] =
        useState<Ledger | null>(
            null,
        );

    const [
        ledgerPage,
        setLedgerPage,
    ] =
        useState(
            1,
        );

    const [
        tab,
        setTab,
    ] =
        useState<StaffTab>(
            'overview',
        );

    const [
        edit,
        setEdit,
    ] =
        useState<
            Staff
            | 'new'
            | null
        >(
            null,
        );

    const [
        linkedUserId,
        setLinkedUserId,
    ] =
        useState(
            '',
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        error,
        setError,
    ] =
        useState(
            '',
        );

    const [
        loading,
        setLoading,
    ] =
        useState(
            true,
        );

    const [
        requestId,
        setRequestId,
    ] =
        useState(
            () =>
                requestToken(),
        );

    const [
        deleteReason,
        setDeleteReason,
    ] =
        useState(
            '',
        );

    const [
        deletingStaff,
        setDeletingStaff,
    ] =
        useState(
            false,
        );

    const [
        entryCorrection,
        setEntryCorrection,
    ] =
        useState<EntryCorrectionState | null>(
            null,
        );

    const [
        invitationUrl,
        setInvitationUrl,
    ] =
        useState(
            '',
        );

    const [
        invitationSent,
        setInvitationSent,
    ] =
        useState(
            false,
        );

    const [
        through,
        setThrough,
    ] =
        useState(
            previousCompletedMonth(),
        );

    const staffFormRef =
        useRef<HTMLFormElement | null>(
            null,
        );

    const [
        staffFormDirty,
        setStaffFormDirty,
    ] =
        useState(
            false,
        );

    useUnsavedChanges(
        staffFormDirty
        && edit !== null
        && ! busy,
        ar,
    );

    useGlobalSave(
        () =>
            staffFormRef.current
                ?.requestSubmit(),
        edit !== null
        && ! busy,
    );

    useEffect(() => {
        setStaffFormDirty(
            false,
        );
    }, [
        edit,
    ]);

    function closeStaffEditor(): void {
        if (
            staffFormDirty
            && ! window.confirm(
                ar
                    ? 'لديك تغييرات غير محفوظة. هل تريد إغلاق نموذج الموظف؟'
                    : 'You have unsaved employee changes. Close the form?',
            )
        ) {
            return;
        }

        setStaffFormDirty(
            false,
        );
        setEdit(
            null,
        );
    }

    /*
     * Quick-create and global-search deep links reuse the existing Staff
     * workspace. This keeps Ctrl+K and the global + button consistent with the
     * normal directory UI instead of introducing a second editor.
     */
    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const url = new URL(window.location.href);
        const staffId =
            Number(url.searchParams.get('staff') ?? 0);
        const createRequested =
            url.searchParams.get('create') === '1';

        let changed = false;

        if (
            Number.isInteger(staffId)
            && staffId > 0
        ) {
            setSelected(staffId);
            setLedgerPage(1);
            setTab('overview');
            url.searchParams.delete('staff');
            changed = true;
        }

        if (
            createRequested
            && result?.can_manage
        ) {
            setEdit('new');
            url.searchParams.delete('create');
            changed = true;
        }

        if (changed) {
            window.history.replaceState({}, '', url);
        }
    }, [
        result?.can_manage,
    ]);

    const isEditing =
        edit !==
        null;

    const member =
        edit
        && edit !==
            'new'
            ? edit
            : null;

    useEffect(
        () => {
            if (
                edit
                && edit !==
                    'new'
                && edit.user_id !==
                    null
            ) {
                setLinkedUserId(
                    String(
                        edit.user_id,
                    ),
                );

                return;
            }

            setLinkedUserId(
                '',
            );
        },
        [
            edit,
        ],
    );

    const selectedDepartment =
        useMemo(
            () =>
                ledger
                    ? result?.departments.find(
                          (
                              departmentItem,
                          ) =>
                              departmentItem.id ===
                              ledger.member
                                  .department_id,
                      )
                    : null,
            [
                ledger,
                result,
            ],
        );

    const earned =
        useMemo(
            () => {
                if (
                    ! ledger
                ) {
                    return 0;
                }

                return [
                    'work',
                    'bonus',
                    'allowance',
                    'monthly_allowance',
                    'overtime',
                ].reduce(
                    (
                        total,
                        kind,
                    ) =>
                        total
                        + Number(
                            ledger
                                .totals[
                                kind
                            ]
                            ?? 0,
                        ),
                    0,
                );
            },
            [
                ledger,
            ],
        );

    /**
     * Load the employee directory and permission metadata.
     */
    useEffect(
        () => {
            const controller =
                new AbortController();

            setLoading(
                true,
            );

            const timer =
                window.setTimeout(
                    () => {
                        apiRequest<StaffIndex>(
                            `/api/staff?page=${page}&per_page=${perPage}&search=${encodeURIComponent(
                                search,
                            )}&department_id=${department}&basis=${basisFilter}&active=${activeFilter}&include_accounts=${isEditing ? 1 : 0}`,
                            {
                                signal:
                                    controller.signal,
                            },
                        )
                            .then(
                                setResult,
                            )
                            .catch(
                                (
                                    failure:
                                        unknown,
                                ) => {
                                    if (
                                        ! controller
                                            .signal
                                            .aborted
                                    ) {
                                        setError(
                                            errorText(
                                                failure,
                                                c.failed,
                                            ),
                                        );
                                    }
                                },
                            )
                            .finally(
                                () => {
                                    if (
                                        ! controller
                                            .signal
                                            .aborted
                                    ) {
                                        setLoading(
                                            false,
                                        );
                                    }
                                },
                            );
                    },
                    220,
                );

            return () => {
                window.clearTimeout(
                    timer,
                );

                controller.abort();
            };
        },
        [
            page,
            perPage,
            revision,
            search,
            department,
            basisFilter,
            activeFilter,
            isEditing,
            c.failed,
        ],
    );

    /**
     * Load the selected employee ledger and correction history.
     */
    useEffect(
        () => {
            setLedger(
                null,
            );

            if (
                selected ===
                null
            ) {
                return;
            }

            const controller =
                new AbortController();

            apiRequest<Ledger>(
                `/api/staff/${selected}/ledger?page=${ledgerPage}`,
                {
                    signal:
                        controller.signal,
                },
            )
                .then(
                    setLedger,
                )
                .catch(
                    (
                        failure:
                            unknown,
                    ) => {
                        if (
                            ! controller
                                .signal
                                .aborted
                        ) {
                            setError(
                                errorText(
                                    failure,
                                    c.failed,
                                ),
                            );
                        }
                    },
                );

            return () =>
                controller.abort();
        },
        [
            selected,
            ledgerPage,
            revision,
            c.failed,
        ],
    );

    /**
     * Send one JSON mutation and refresh the employee data after success.
     */
    async function mutate(
        path: string,
        data: Record<
            string,
            unknown
        >,
        method =
            'POST',
    ): Promise<boolean> {
        if (
            busy
        ) {
            return false;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        try {
            await apiRequest(
                path,
                {
                    method,
                    body:
                        JSON.stringify(
                            data,
                        ),
                },
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            return true;
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                    c.failed,
                ),
            );

            return false;
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Create or update an employee.
     */
    async function saveStaff(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        const values =
            Object.fromEntries(
                new FormData(
                    event.currentTarget,
                ),
            );

        const success =
            await mutate(
                edit ===
                'new'
                    ? '/api/staff'
                    : `/api/staff/${member?.id}`,
                {
                    ...values,

                    user_id:
                        values.user_id
                            ? Number(
                                  values.user_id,
                              )
                            : null,

                    department_id:
                        values.department_id
                            ? Number(
                                  values.department_id,
                              )
                            : null,

                    active:
                        values.active ===
                        'true',
                },
                edit ===
                'new'
                    ? 'POST'
                    : 'PATCH',
            );

        if (
            success
        ) {
            setStaffFormDirty(
                false,
            );
            setEdit(
                null,
            );
        }
    }

    /**
     * Open one employee and reset their workspace to Overview.
     */
    function openEmployee(
        employee: Staff,
    ): void {
        setSelected(
            employee.id,
        );

        setLedgerPage(
            1,
        );

        setTab(
            'overview',
        );

        setRequestId(
            requestToken(),
        );

        setInvitationUrl(
            '',
        );
    }

    /**
     * Close the selected employee and return to the directory.
     */
    function closeEmployee(): void {
        setSelected(
            null,
        );

        setLedger(
            null,
        );

        setTab(
            'overview',
        );

        setInvitationUrl(
            '',
        );
    }

    /**
     * Delete an accidental employee record through the audited correction API.
     */
    async function deleteEmployee(): Promise<void> {
        if (
            ! ledger
            || deleteReason
                .trim()
                .length <
                3
        ) {
            return;
        }

        const success =
            await mutate(
                `/api/staff/${ledger.member.id}`,
                {
                    reason:
                        deleteReason.trim(),
                },
                'DELETE',
            );

        if (
            success
        ) {
            setDeletingStaff(
                false,
            );

            setDeleteReason(
                '',
            );

            closeEmployee();
        }
    }

    /**
     * Record a one-off earning, deduction, payment, or advance.
     */
    async function recordOperation(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            ! selected
        ) {
            return;
        }

        const form =
            event.currentTarget;

        const values =
            Object.fromEntries(
                new FormData(
                    form,
                ),
            );

        const success =
            await mutate(
                `/api/staff/${selected}/entries`,
                {
                    ...values,
                    request_id:
                        requestId,
                },
            );

        if (
            success
        ) {
            form.reset();

            setRequestId(
                requestToken(),
            );
        }
    }

    /**
     * Approve missing monthly salary accruals through a completed month.
     */
    async function accrueSalary(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            ! selected
        ) {
            return;
        }

        await mutate(
            `/api/staff/${selected}/accrue`,
            {
                through,
            },
        );
    }

    /**
     * Invite an existing employee record into the Organization account system.
     */
    async function inviteEmployee(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            ! selected
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        const values =
            Object.fromEntries(
                new FormData(
                    event.currentTarget,
                ),
            );

        try {
            const response =
                await apiRequest<{
                    url: string;
                    email_sent: boolean;
                }>(
                    `/api/staff/${selected}/invitation`,
                    {
                        method:
                            'POST',

                        body:
                            JSON.stringify({
                                ...values,

                                workspace_role_id:
                                    values.workspace_role_id
                                        ? Number(
                                              values.workspace_role_id,
                                          )
                                        : null,
                            }),
                    },
                );

            setInvitationUrl(
                response.url,
            );

            setInvitationSent(
                response.email_sent,
            );
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                    c.failed,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Correct or remove one manually-created ledger entry.
     */
    async function submitEntryCorrection(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            ! selected
            || ! entryCorrection
        ) {
            return;
        }

        const values =
            Object.fromEntries(
                new FormData(
                    event.currentTarget,
                ),
            );

        const entry =
            entryCorrection.entry;

        const data:
            Record<
                string,
                unknown
            > = {
            reason:
                values.reason,
        };

        if (
            entryCorrection.action ===
            'edit'
        ) {
            data.notes =
                values.notes;

            if (
                entry.kind ===
                'work'
            ) {
                data.quantity =
                    values.quantity;
            } else {
                data.amount =
                    values.amount;
            }
        }

        const success =
            await mutate(
                `/api/staff/${selected}/entries/${entry.id}`,
                data,
                entryCorrection.action ===
                'delete'
                    ? 'DELETE'
                    : 'PATCH',
            );

        if (
            success
        ) {
            setEntryCorrection(
                null,
            );
        }
    }

    /**
     * Translate one ledger kind for the active locale.
     */
    function entryKindLabel(
        kind: EntryKind,
    ): string {
        const labels:
            Record<
                EntryKind,
                [
                    string,
                    string,
                ]
            > = {
            work: [
                'عمل',
                'Work',
            ],
            bonus: [
                'مكافأة',
                'Bonus',
            ],
            allowance: [
                'بدل',
                'Allowance',
            ],
            monthly_allowance: [
                'بدل شهري',
                'Monthly allowance',
            ],
            deduction: [
                'خصم',
                'Deduction',
            ],
            payment: [
                'دفعة',
                'Payment',
            ],
            terms: [
                'تغيير شروط العمل',
                'Terms changed',
            ],
            overtime: [
                'إضافي',
                'Overtime',
            ],
            advance: [
                'سلفة',
                'Advance',
            ],
        };

        return labels[
            kind
        ][
            ar
                ? 0
                : 1
        ];
    }

    const tabs:
        {
            id: StaffTab;
            label: string;
            icon:
                typeof UserRound;
        }[] = [
        {
            id:
                'overview',
            label:
                ar
                    ? 'نظرة عامة'
                    : 'Overview',
            icon:
                UserRound,
        },
        {
            id:
                'attendance',
            label:
                ar
                    ? 'الحضور'
                    : 'Attendance',
            icon:
                CalendarDays,
        },
        {
            id:
                'compensation',
            label:
                ar
                    ? 'الراتب والاستحقاقات'
                    : 'Pay & benefits',
            icon:
                WalletCards,
        },
        {
            id:
                'ledger',
            label:
                ar
                    ? 'السجل'
                    : 'Ledger',
            icon:
                History,
        },
    ];

    return (
        <AppShell>
            <Head
                title={
                    c.title
                }
            />

            <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
                <header className="rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-br from-[var(--ac-surface)] via-[var(--ac-surface)] to-[var(--ac-accent-soft)] p-5 sm:p-7">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-[var(--ac-text)] text-white">
                                <Users
                                    size={
                                        22
                                    }
                                />
                            </div>

                            <div>
                                <h1 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
                                    {
                                        c.title
                                    }
                                </h1>

                                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'إدارة الموظفين بدون صفحة مزدحمة: ملف الموظف، حضوره، استحقاقاته وسجله كل واحد في مكان واضح.'
                                        : 'Manage people without one overloaded screen: profile, attendance, compensation and history each have a clear workspace.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Link
                                href="/app/team-space"
                                className={
                                    button
                                }
                            >
                                <MessageSquareText
                                    size={
                                        15
                                    }
                                />

                                {ar
                                    ? 'مساحة الفريق'
                                    : 'Team Space'}
                            </Link>

                            <Link
                                href="/app/departments"
                                className={
                                    button
                                }
                            >
                                {
                                    c.departments
                                }
                            </Link>

                            {result?.can_import && (
                                <Link
                                    href="/app/staff/import"
                                    className={
                                        button
                                    }
                                >
                                    <FileSpreadsheet
                                        size={
                                            15
                                        }
                                    />

                                    {ar
                                        ? 'استيراد Excel / CSV'
                                        : 'Import Excel / CSV'}
                                </Link>
                            )}

                            {result?.can_manage && (
                                <button
                                    type="button"
                                    className={
                                        primaryButton
                                    }
                                    onClick={() =>
                                        setEdit(
                                            'new',
                                        )
                                    }
                                >
                                    <Plus
                                        size={
                                            15
                                        }
                                    />

                                    {
                                        c.new
                                    }
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                <div className="mt-4">
                    <StaffModuleNav />
                </div>

                {error && (
                    <div
                        role="alert"
                        className="mt-5 flex items-start justify-between gap-4 rounded-[18px] border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                    >
                        <span>
                            {
                                error
                            }
                        </span>

                        <button
                            type="button"
                            onClick={() =>
                                setError(
                                    '',
                                )
                            }
                        >
                            <X
                                size={
                                    16
                                }
                            />
                        </button>
                    </div>
                )}

                {! selected && (
                    <section className="mt-6 overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-white">
                        <div className="grid gap-3 border-b border-[var(--ac-line)] p-4 sm:grid-cols-2 xl:grid-cols-5">
                            <label className="text-xs font-semibold">
                                {ar
                                    ? 'بحث'
                                    : 'Search'}

                                <input
                                    type="search"
                                    value={
                                        search
                                    }
                                    placeholder={ar
                                        ? 'اسم، وظيفة أو هاتف'
                                        : 'Name, role or phone'}
                                    onChange={(
                                        event,
                                    ) => {
                                        setSearch(
                                            event
                                                .target
                                                .value,
                                        );

                                        setPage(
                                            1,
                                        );
                                    }}
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.department
                                }

                                <select
                                    value={
                                        department
                                    }
                                    onChange={(
                                        event,
                                    ) => {
                                        setDepartment(
                                            event
                                                .target
                                                .value,
                                        );

                                        setPage(
                                            1,
                                        );
                                    }}
                                    className={
                                        field
                                    }
                                >
                                    <option value="">
                                        {ar
                                            ? 'جميع الأقسام'
                                            : 'All departments'}
                                    </option>

                                    {result?.departments.map(
                                        (
                                            departmentItem,
                                        ) => (
                                            <option
                                                key={
                                                    departmentItem.id
                                                }
                                                value={
                                                    departmentItem.id
                                                }
                                            >
                                                {
                                                    departmentItem.name
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.basis
                                }

                                <select
                                    value={
                                        basisFilter
                                    }
                                    onChange={(
                                        event,
                                    ) => {
                                        setBasisFilter(
                                            event
                                                .target
                                                .value,
                                        );

                                        setPage(
                                            1,
                                        );
                                    }}
                                    className={
                                        field
                                    }
                                >
                                    <option value="">
                                        {ar
                                            ? 'كل أنواع الأجر'
                                            : 'All pay types'}
                                    </option>

                                    {(
                                        [
                                            'hour',
                                            'day',
                                            'month',
                                            'piece',
                                        ] as const
                                    ).map(
                                        (
                                            basis,
                                        ) => (
                                            <option
                                                key={
                                                    basis
                                                }
                                                value={
                                                    basis
                                                }
                                            >
                                                {
                                                    c[
                                                        basis
                                                    ]
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.status
                                }

                                <select
                                    value={
                                        activeFilter
                                    }
                                    onChange={(
                                        event,
                                    ) => {
                                        setActiveFilter(
                                            event
                                                .target
                                                .value,
                                        );

                                        setPage(
                                            1,
                                        );
                                    }}
                                    className={
                                        field
                                    }
                                >
                                    <option value="">
                                        {ar
                                            ? 'الكل'
                                            : 'All'}
                                    </option>

                                    <option value="1">
                                        {
                                            c.active
                                        }
                                    </option>

                                    <option value="0">
                                        {
                                            c.inactive
                                        }
                                    </option>
                                </select>
                            </label>

                            <label className="text-xs font-semibold">
                                {ar
                                    ? 'عدد الصفوف'
                                    : 'Rows per page'}

                                <select
                                    value={
                                        perPage
                                    }
                                    onChange={(
                                        event,
                                    ) => {
                                        setPerPage(
                                            Number(
                                                event
                                                    .target
                                                    .value,
                                            ),
                                        );

                                        setPage(
                                            1,
                                        );
                                    }}
                                    className={
                                        field
                                    }
                                >
                                    <option value="20">
                                        20
                                    </option>
                                    <option value="50">
                                        50
                                    </option>
                                    <option value="100">
                                        100
                                    </option>
                                </select>
                            </label>
                        </div>

                        <div className="border-b border-[var(--ac-line)] px-4 py-3">
                            <SavedViews
                                storageKey={`acconova:saved-views:staff:${organizationId}`}
                                ar={ar}
                                value={{
                                    search,
                                    department,
                                    basisFilter,
                                    activeFilter,
                                    perPage,
                                }}
                                onApply={(saved) => {
                                    setSearch(saved.search);
                                    setDepartment(saved.department);
                                    setBasisFilter(saved.basisFilter);
                                    setActiveFilter(saved.activeFilter);
                                    setPerPage(saved.perPage);
                                    setPage(1);
                                }}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] px-5 py-3 text-xs text-[var(--ac-text-muted)]">
                            <span>
                                {ar
                                    ? 'دليل الموظفين'
                                    : 'Employee directory'}
                                {' · '}
                                {result?.data.total
                                    ?? 0}
                            </span>

                            <span>
                                {page}
                                {' / '}
                                {result?.data.last_page
                                    ?? 1}
                            </span>
                        </div>

                        {loading ? (
                            <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                                …
                            </div>
                        ) : ! result?.data.data.length ? (
                            <SmartEmptyState
                                icon={Users}
                                title={ar ? 'لا يوجد موظفون مطابقون' : 'No matching employees'}
                                description={
                                    search
                                    || department
                                    || basisFilter
                                    || activeFilter
                                        ? (
                                            ar
                                                ? 'غيّر البحث أو عوامل التصفية، أو أضف موظفاً جديداً.'
                                                : 'Adjust the search or filters, or add a new employee.'
                                        )
                                        : (
                                            ar
                                                ? 'ابدأ بإضافة أول موظف إلى مساحة العمل، أو استورد ملف الموظفين.'
                                                : 'Add the first employee to this workspace, or import your staff file.'
                                        )
                                }
                                primary={result?.can_manage ? (
                                    <button
                                        type="button"
                                        className={primaryButton}
                                        onClick={() => setEdit('new')}
                                    >
                                        <Plus size={15} />
                                        {c.new}
                                    </button>
                                ) : undefined}
                                secondary={result?.can_import ? (
                                    <Link
                                        href="/app/staff/import"
                                        className={button}
                                    >
                                        <FileSpreadsheet size={15} />
                                        {ar ? 'استيراد الموظفين' : 'Import employees'}
                                    </Link>
                                ) : undefined}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[980px] text-start text-xs">
                                    <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                                        <tr>
                                            <th className="px-5 py-3 text-start">
                                                {ar ? 'الموظف' : 'Employee'}
                                            </th>
                                            <th className="px-5 py-3 text-start">
                                                {c.department}
                                            </th>
                                            <th className="px-5 py-3 text-start">
                                                {ar ? 'التواصل' : 'Contact'}
                                            </th>
                                            <th className="px-5 py-3 text-start">
                                                {c.basis}
                                            </th>
                                            <th className="px-5 py-3 text-start">
                                                {c.balance}
                                            </th>
                                            <th className="px-5 py-3 text-start">
                                                {c.status}
                                            </th>
                                            <th className="px-5 py-3 text-end">
                                                {ar ? 'فتح' : 'Open'}
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-[var(--ac-line)]">
                                        {result?.data.data.map(
                                            (
                                                employee,
                                            ) => {
                                                const employeeDepartment =
                                                    result.departments.find(
                                                        (
                                                            item,
                                                        ) =>
                                                            item.id ===
                                                            employee.department_id,
                                                    );

                                                return (
                                                    <tr
                                                        key={
                                                            employee.id
                                                        }
                                                        className="transition hover:bg-[var(--ac-surface-soft)]"
                                                    >
                                                        <td className="px-5 py-3.5">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openEmployee(
                                                                        employee,
                                                                    )
                                                                }
                                                                className="flex min-w-0 items-center gap-3 text-start"
                                                            >
                                                                <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-xs font-bold text-[var(--ac-accent-strong)]">
                                                                    {employee.name
                                                                        .trim()
                                                                        .charAt(
                                                                            0,
                                                                        )
                                                                        .toUpperCase()}
                                                                </span>

                                                                <span className="min-w-0">
                                                                    <strong className="block max-w-52 truncate text-xs">
                                                                        {
                                                                            employee.name
                                                                        }
                                                                    </strong>

                                                                    <span className="mt-1 block max-w-52 truncate text-[10px] text-[var(--ac-text-muted)]">
                                                                        {employee.job_title
                                                                            ?? (ar
                                                                                ? 'بدون مسمى وظيفي'
                                                                                : 'No job title')}
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        </td>

                                                        <td className="px-5 py-3.5">
                                                            <span className="max-w-40 truncate">
                                                                {employeeDepartment?.name
                                                                    ?? '—'}
                                                            </span>
                                                        </td>

                                                        <td className="px-5 py-3.5">
                                                            <div className="max-w-52">
                                                                <span className="block truncate">
                                                                    {employee.phone
                                                                        ?? '—'}
                                                                </span>

                                                                {employee.email && (
                                                                    <span className="mt-1 block truncate text-[10px] text-[var(--ac-text-muted)]">
                                                                        {
                                                                            employee.email
                                                                        }
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td className="px-5 py-3.5">
                                                            <span className="rounded-full bg-[var(--ac-surface-soft)] px-2.5 py-1 text-[10px]">
                                                                {
                                                                    c[
                                                                        employee.basis
                                                                    ]
                                                                }
                                                            </span>
                                                        </td>

                                                        <td className="px-5 py-3.5">
                                                            <bdi className="font-semibold">
                                                                {money(
                                                                    employee.balance
                                                                    ?? '0',
                                                                    employee.currency,
                                                                )}
                                                            </bdi>
                                                        </td>

                                                        <td className="px-5 py-3.5">
                                                            <span
                                                                className={[
                                                                    'rounded-full px-2.5 py-1 text-[10px] font-semibold',
                                                                    employee.active
                                                                        ? 'bg-emerald-50 text-emerald-700'
                                                                        : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                                                                ].join(
                                                                    ' ',
                                                                )}
                                                            >
                                                                {employee.active
                                                                    ? c.active
                                                                    : c.inactive}
                                                            </span>
                                                        </td>

                                                        <td className="px-5 py-3.5 text-end">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openEmployee(
                                                                        employee,
                                                                    )
                                                                }
                                                                className={
                                                                    button
                                                                }
                                                            >
                                                                {ar
                                                                    ? 'عرض'
                                                                    : 'View'}

                                                                {ar ? (
                                                                    <ArrowLeft
                                                                        size={
                                                                            13
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <ArrowRight
                                                                        size={
                                                                            13
                                                                        }
                                                                    />
                                                                )}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            },
                                        )}

                                        {! result?.data.data.length && (
                                            <tr>
                                                <td
                                                    colSpan={
                                                        7
                                                    }
                                                    className="p-10 text-center text-sm text-[var(--ac-text-muted)]"
                                                >
                                                    {
                                                        c.empty
                                                    }
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {result
                            && result.data.last_page >
                                1 && (
                                <div className="flex items-center justify-between border-t border-[var(--ac-line)] p-4">
                                    <button
                                        type="button"
                                        className={
                                            button
                                        }
                                        disabled={
                                            page ===
                                            1
                                        }
                                        onClick={() =>
                                            setPage(
                                                (
                                                    current,
                                                ) =>
                                                    current
                                                    - 1,
                                            )
                                        }
                                    >
                                        {
                                            c.previous
                                        }
                                    </button>

                                    <button
                                        type="button"
                                        className={
                                            button
                                        }
                                        disabled={
                                            page >=
                                            result
                                                .data
                                                .last_page
                                        }
                                        onClick={() =>
                                            setPage(
                                                (
                                                    current,
                                                ) =>
                                                    current
                                                    + 1,
                                            )
                                        }
                                    >
                                        {
                                            c.more
                                        }
                                    </button>
                                </div>
                            )}
                    </section>
                )}

                {selected && (
                    <section className="mt-6">
                        <button
                            type="button"
                            className={
                                button
                            }
                            onClick={
                                closeEmployee
                            }
                        >
                            {ar ? (
                                <ArrowRight
                                    size={
                                        15
                                    }
                                />
                            ) : (
                                <ArrowLeft
                                    size={
                                        15
                                    }
                                />
                            )}

                            {ar
                                ? 'العودة إلى الموظفين'
                                : 'Back to employees'}
                        </button>

                        {! ledger ? (
                            <div className="mt-5 rounded-[24px] border border-[var(--ac-line)] bg-white p-12 text-center text-sm text-[var(--ac-text-muted)]">
                                …
                            </div>
                        ) : (
                            <>
                                <div className="mt-5 overflow-hidden rounded-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)]">
                                    <div className="flex flex-col gap-5 bg-gradient-to-br from-[var(--ac-surface)] to-[var(--ac-accent-soft)] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="flex min-w-0 items-center gap-4">
                                            <div className="flex size-14 shrink-0 items-center justify-center rounded-[19px] bg-[var(--ac-text)] text-xl font-bold text-white">
                                                {ledger.member.name
                                                    .trim()
                                                    .charAt(
                                                        0,
                                                    )
                                                    .toUpperCase()}
                                            </div>

                                            <div className="min-w-0">
                                                <h2 className="truncate text-xl font-semibold">
                                                    {
                                                        ledger.member.name
                                                    }
                                                </h2>

                                                <p className="mt-1 text-sm text-[var(--ac-text-muted)]">
                                                    {ledger.member.job_title
                                                        ?? (ar
                                                            ? 'بدون مسمى وظيفي'
                                                            : 'No job title')}
                                                </p>

                                                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                                                    <span className="rounded-full bg-white px-2.5 py-1">
                                                        {selectedDepartment?.name
                                                            ?? (ar
                                                                ? 'بدون قسم'
                                                                : 'No department')}
                                                    </span>

                                                    <span
                                                        className={[
                                                            'rounded-full px-2.5 py-1',
                                                            ledger
                                                                .member
                                                                .active
                                                                ? 'bg-emerald-50 text-emerald-700'
                                                                : 'bg-white text-[var(--ac-text-muted)]',
                                                        ].join(
                                                            ' ',
                                                        )}
                                                    >
                                                        {ledger
                                                            .member
                                                            .active
                                                            ? c.active
                                                            : c.inactive}
                                                    </span>

                                                    <span className="rounded-full bg-white px-2.5 py-1">
                                                        {
                                                            c[
                                                                ledger
                                                                    .member
                                                                    .basis
                                                            ]
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <RecordQuickActions
                                                recordKey={'staff-' + String(ledger.member.id)}
                                                kind="staff"
                                                label={ledger.member.name}
                                                detail={[
                                                    ledger.member.job_title,
                                                    ledger.member.email,
                                                ].filter(Boolean).join(' · ')}
                                                href={'/app/staff/directory?staff=' + String(ledger.member.id)}
                                                ar={ar}
                                            />

                                            {result?.can_manage && (
                                                <button
                                                    type="button"
                                                    className={
                                                        button
                                                    }
                                                    onClick={() =>
                                                        setEdit(
                                                            ledger.member,
                                                        )
                                                    }
                                                >
                                                    <Pencil
                                                        size={
                                                            14
                                                        }
                                                    />

                                                    {ar
                                                        ? 'تعديل الموظف'
                                                        : 'Edit employee'}
                                                </button>
                                            )}

                                            {result?.can_manage && (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-2 rounded-[13px] border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                                    onClick={() =>
                                                        setDeletingStaff(
                                                            true,
                                                        )
                                                    }
                                                >
                                                    <Trash2
                                                        size={
                                                            14
                                                        }
                                                    />

                                                    {ar
                                                        ? 'حذف'
                                                        : 'Delete'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="border-t border-[var(--ac-line)] p-5 sm:p-6">
                                        <RecordHealth
                                            ar={ar}
                                            fields={[
                                                {
                                                    label: ar ? 'الاسم' : 'Name',
                                                    complete: Boolean(ledger.member.name.trim()),
                                                },
                                                {
                                                    label: ar ? 'المسمى الوظيفي' : 'Job title',
                                                    complete: Boolean(ledger.member.job_title?.trim()),
                                                },
                                                {
                                                    label: ar ? 'البريد الإلكتروني' : 'Email',
                                                    complete: Boolean(ledger.member.email?.trim()),
                                                },
                                                {
                                                    label: ar ? 'الهاتف' : 'Phone',
                                                    complete: Boolean(ledger.member.phone?.trim()),
                                                },
                                                {
                                                    label: ar ? 'القسم' : 'Department',
                                                    complete: Boolean(ledger.member.department_id),
                                                },
                                                {
                                                    label: ar ? 'تاريخ البدء' : 'Start date',
                                                    complete: Boolean(ledger.member.started_on),
                                                },
                                            ]}
                                        />
                                    </div>

                                    <div className="border-t border-[var(--ac-line)] px-5 pb-5 sm:px-6 sm:pb-6">
                                        <RecordCollaborationPanel
                                            type="staff"
                                            recordId={ledger.member.id}
                                            ar={ar}
                                            title={
                                                ar
                                                    ? 'وسوم ومرفقات الموظف'
                                                    : 'Employee tags & attachments'
                                            }
                                        />
                                    </div>

                                    <nav className="flex gap-1 overflow-x-auto border-t border-[var(--ac-line)] p-2">
                                        {tabs.map(
                                            (
                                                tabItem,
                                            ) => {
                                                const Icon =
                                                    tabItem.icon;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={
                                                            tabItem.id
                                                        }
                                                        onClick={() =>
                                                            setTab(
                                                                tabItem.id,
                                                            )
                                                        }
                                                        className={[
                                                            'flex min-w-max items-center gap-2 rounded-[13px] px-4 py-2.5 text-xs font-semibold transition',
                                                            tab ===
                                                            tabItem.id
                                                                ? 'bg-[var(--ac-text)] text-white'
                                                                : 'text-[var(--ac-text-soft)] hover:bg-[var(--ac-bg-soft)]',
                                                        ].join(
                                                            ' ',
                                                        )}
                                                    >
                                                        <Icon
                                                            size={
                                                                14
                                                            }
                                                        />

                                                        {
                                                            tabItem.label
                                                        }
                                                    </button>
                                                );
                                            },
                                        )}
                                    </nav>
                                </div>

                                {tab ===
                                    'overview' && (
                                    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
                                        <div className="space-y-5">
                                            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                <MetricCard
                                                    label={ar
                                                        ? 'إجمالي الاستحقاقات'
                                                        : 'Total earned'}
                                                    value={money(
                                                        earned,
                                                        ledger.member.currency,
                                                    )}
                                                />

                                                <MetricCard
                                                    label={ar
                                                        ? 'إجمالي الخصومات'
                                                        : 'Deductions'}
                                                    value={money(
                                                        Math.abs(
                                                            Number(
                                                                ledger
                                                                    .totals
                                                                    .deduction
                                                                ?? 0,
                                                            ),
                                                        ),
                                                        ledger.member.currency,
                                                    )}
                                                />

                                                <MetricCard
                                                    label={ar
                                                        ? 'المدفوع'
                                                        : 'Paid'}
                                                    value={money(
                                                        Math.abs(
                                                            Number(
                                                                ledger
                                                                    .totals
                                                                    .payment
                                                                ?? 0,
                                                            ),
                                                        ),
                                                        ledger.member.currency,
                                                    )}
                                                />

                                                <MetricCard
                                                    accent
                                                    label={ar
                                                        ? 'الرصيد الحالي'
                                                        : 'Current balance'}
                                                    value={money(
                                                        ledger.balance,
                                                        ledger.member.currency,
                                                    )}
                                                />
                                            </section>

                                            <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                                                <h3 className="font-semibold">
                                                    {ar
                                                        ? 'بيانات العمل'
                                                        : 'Employment details'}
                                                </h3>

                                                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                                    <InfoCard
                                                        label={
                                                            c.basis
                                                        }
                                                        value={
                                                            c[
                                                                ledger
                                                                    .member
                                                                    .basis
                                                            ]
                                                        }
                                                    />

                                                    <InfoCard
                                                        label={ar
                                                            ? 'الأجر'
                                                            : 'Rate'}
                                                        value={`${ledger.member.rate} ${ledger.member.currency}`}
                                                    />

                                                    <InfoCard
                                                        label={ar
                                                            ? 'البدل الشهري الأساسي'
                                                            : 'Base monthly allowance'}
                                                        value={`${ledger.member.monthly_allowance} ${ledger.member.currency}`}
                                                    />

                                                    <InfoCard
                                                        label={ar
                                                            ? 'تاريخ البداية'
                                                            : 'Start date'}
                                                        value={
                                                            ledger
                                                                .member
                                                                .started_on
                                                        }
                                                    />

                                                    <InfoCard
                                                        label={
                                                            c.department
                                                        }
                                                        value={
                                                            selectedDepartment?.name
                                                            ?? '—'
                                                        }
                                                    />

                                                    <InfoCard
                                                        label={ar
                                                            ? 'الهاتف'
                                                            : 'Phone'}
                                                        value={
                                                            ledger
                                                                .member
                                                                .phone
                                                            ?? '—'
                                                        }
                                                    />
                                                </div>
                                            </section>
                                        </div>

                                        <div className="space-y-5">
                                            {result?.can_invite
                                                && ! ledger
                                                    .member
                                                    .user_id && (
                                                <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                                                    <div className="flex items-center gap-2">
                                                        <Send
                                                            size={
                                                                16
                                                            }
                                                        />

                                                        <h3 className="font-semibold">
                                                            {ar
                                                                ? 'دعوة الموظف للنظام'
                                                                : 'Invite to AccoNova'}
                                                        </h3>
                                                    </div>

                                                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                                                        {ar
                                                            ? 'اربط هذا الموظف بحساب ليتمكن من الدخول حسب دوره وصلاحياته.'
                                                            : 'Connect this employee to an account with the selected role and permissions.'}
                                                    </p>

                                                    <form
                                                        onSubmit={(
                                                            event,
                                                        ) =>
                                                            void inviteEmployee(
                                                                event,
                                                            )
                                                        }
                                                        className="mt-4 space-y-3"
                                                    >
                                                        <label className="block text-xs font-semibold">
                                                            Email

                                                            <input
                                                                required
                                                                type="email"
                                                                name="email"
                                                                className={
                                                                    field
                                                                }
                                                            />
                                                        </label>

                                                        <label className="block text-xs font-semibold">
                                                            {ar
                                                                ? 'الدور'
                                                                : 'Role'}

                                                            <select
                                                                name="workspace_role_id"
                                                                className={
                                                                    field
                                                                }
                                                            >
                                                                <option value="">
                                                                    {ar
                                                                        ? 'الدور الافتراضي'
                                                                        : 'Default role'}
                                                                </option>

                                                                {result.roles.map(
                                                                    (
                                                                        role,
                                                                    ) => (
                                                                        <option
                                                                            key={
                                                                                role.id
                                                                            }
                                                                            value={
                                                                                role.id
                                                                            }
                                                                        >
                                                                            {
                                                                                role.name
                                                                            }
                                                                        </option>
                                                                    ),
                                                                )}
                                                            </select>
                                                        </label>

                                                        <button
                                                            disabled={
                                                                busy
                                                            }
                                                            className={
                                                                primaryButton
                                                            }
                                                        >
                                                            <Send
                                                                size={
                                                                    14
                                                                }
                                                            />

                                                            {ar
                                                                ? 'إرسال الدعوة'
                                                                : 'Send invite'}
                                                        </button>
                                                    </form>

                                                    {invitationUrl && (
                                                        <div className="mt-4 rounded-xl bg-[var(--ac-surface-soft)] p-3 text-xs">
                                                            <p>
                                                                {invitationSent
                                                                    ? ar
                                                                        ? 'تم إرسال البريد.'
                                                                        : 'Email sent.'
                                                                    : ar
                                                                      ? 'تم إنشاء الرابط.'
                                                                      : 'Invitation link created.'}
                                                            </p>

                                                            <input
                                                                readOnly
                                                                value={
                                                                    invitationUrl
                                                                }
                                                                className={
                                                                    field
                                                                }
                                                            />
                                                        </div>
                                                    )}
                                                </section>
                                            )}

                                            <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                                                <h3 className="font-semibold">
                                                    {ar
                                                        ? 'اختصارات'
                                                        : 'Quick actions'}
                                                </h3>

                                                <div className="mt-4 grid gap-2">
                                                    <button
                                                        type="button"
                                                        className={`${button} justify-start`}
                                                        onClick={() =>
                                                            setTab(
                                                                'attendance',
                                                            )
                                                        }
                                                    >
                                                        <CalendarDays
                                                            size={
                                                                15
                                                            }
                                                        />

                                                        {ar
                                                            ? 'تسجيل حضور'
                                                            : 'Record attendance'}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className={`${button} justify-start`}
                                                        onClick={() =>
                                                            setTab(
                                                                'compensation',
                                                            )
                                                        }
                                                    >
                                                        <CircleDollarSign
                                                            size={
                                                                15
                                                            }
                                                        />

                                                        {ar
                                                            ? 'تسجيل استحقاق أو دفعة'
                                                            : 'Record pay transaction'}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className={`${button} justify-start`}
                                                        onClick={() =>
                                                            setTab(
                                                                'ledger',
                                                            )
                                                        }
                                                    >
                                                        <ReceiptText
                                                            size={
                                                                15
                                                            }
                                                        />

                                                        {ar
                                                            ? 'فتح كشف الحساب'
                                                            : 'Open ledger'}
                                                    </button>
                                                </div>
                                            </section>
                                        </div>
                                    </div>
                                )}

                                {tab ===
                                    'attendance' && (
                                    <div className="mt-5">
                                        <StaffWorkforcePanel
                                            mode="attendance"
                                            id={
                                                ledger.member.id
                                            }
                                            basis={
                                                ledger.member.basis
                                            }
                                            unit={
                                                ledger.member.unit
                                            }
                                            currency={
                                                ledger.member.currency
                                            }
                                            canPay={
                                                ledger.can_pay
                                            }
                                            onChanged={() =>
                                                setRevision(
                                                    (
                                                        current,
                                                    ) =>
                                                        current
                                                        + 1,
                                                )
                                            }
                                        />
                                    </div>
                                )}

                                {tab ===
                                    'compensation' && (
                                    <div className="mt-5 grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                                        <div className="space-y-5">
                                            {ledger.can_pay
                                                && ledger
                                                    .member
                                                    .basis ===
                                                    'month' && (
                                                <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                                                    <h3 className="font-semibold">
                                                        {ar
                                                            ? 'اعتماد الراتب الشهري'
                                                            : 'Monthly salary accrual'}
                                                    </h3>

                                                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                                                        {ar
                                                            ? 'يسجل الاستحقاق للشهور المكتملة غير المسجلة. الدفع يبقى عملية مستقلة.'
                                                            : 'Records missing completed salary months. Payment remains a separate transaction.'}
                                                    </p>

                                                    <form
                                                        onSubmit={(
                                                            event,
                                                        ) =>
                                                            void accrueSalary(
                                                                event,
                                                            )
                                                        }
                                                        className="mt-4"
                                                    >
                                                        <label className="text-xs font-semibold">
                                                            {ar
                                                                ? 'حتى شهر'
                                                                : 'Through month'}

                                                            <input
                                                                required
                                                                type="month"
                                                                value={
                                                                    through
                                                                }
                                                                max={previousCompletedMonth()}
                                                                onChange={(
                                                                    event,
                                                                ) =>
                                                                    setThrough(
                                                                        event
                                                                            .target
                                                                            .value,
                                                                    )
                                                                }
                                                                className={
                                                                    field
                                                                }
                                                            />
                                                        </label>

                                                        <button
                                                            disabled={
                                                                busy
                                                            }
                                                            className={`${primaryButton} mt-3 w-full`}
                                                        >
                                                            {ar
                                                                ? 'اعتماد الاستحقاق'
                                                                : 'Approve accrual'}
                                                        </button>
                                                    </form>
                                                </section>
                                            )}

                                            {ledger.can_pay && (
                                                <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                                                    <h3 className="font-semibold">
                                                        {ar
                                                            ? 'تسجيل عملية'
                                                            : 'Record transaction'}
                                                    </h3>

                                                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                                                        {ar
                                                            ? 'للمكافآت والبدلات والخصومات والدفعات والسلف غير المرتبطة بالحضور.'
                                                            : 'For bonuses, allowances, deductions, payments and advances not generated by attendance.'}
                                                    </p>

                                                    <form
                                                        onSubmit={(
                                                            event,
                                                        ) =>
                                                            void recordOperation(
                                                                event,
                                                            )
                                                        }
                                                        className="mt-4 space-y-3"
                                                    >
                                                        <label className="block text-xs font-semibold">
                                                            {ar
                                                                ? 'نوع العملية'
                                                                : 'Transaction type'}

                                                            <select
                                                                name="kind"
                                                                className={
                                                                    field
                                                                }
                                                            >
                                                                <option value="bonus">
                                                                    {ar
                                                                        ? 'مكافأة'
                                                                        : 'Bonus'}
                                                                </option>

                                                                <option value="allowance">
                                                                    {ar
                                                                        ? 'بدل'
                                                                        : 'Allowance'}
                                                                </option>

                                                                <option value="deduction">
                                                                    {ar
                                                                        ? 'خصم'
                                                                        : 'Deduction'}
                                                                </option>

                                                                <option value="payment">
                                                                    {ar
                                                                        ? 'دفعة للموظف'
                                                                        : 'Payment'}
                                                                </option>

                                                                <option value="advance">
                                                                    {ar
                                                                        ? 'سلفة'
                                                                        : 'Advance'}
                                                                </option>
                                                            </select>
                                                        </label>

                                                        <label className="block text-xs font-semibold">
                                                            {ar
                                                                ? 'التاريخ'
                                                                : 'Date'}

                                                            <input
                                                                required
                                                                type="date"
                                                                max={today()}
                                                                defaultValue={today()}
                                                                name="occurred_on"
                                                                className={
                                                                    field
                                                                }
                                                            />
                                                        </label>

                                                        <label className="block text-xs font-semibold">
                                                            {ar
                                                                ? `المبلغ (${ledger.member.currency})`
                                                                : `Amount (${ledger.member.currency})`}

                                                            <input
                                                                required
                                                                type="number"
                                                                min="0.0001"
                                                                step="0.0001"
                                                                name="amount"
                                                                className={
                                                                    field
                                                                }
                                                            />
                                                        </label>

                                                        <label className="block text-xs font-semibold">
                                                            {ar
                                                                ? 'ملاحظة / سبب'
                                                                : 'Note / reason'}

                                                            <textarea
                                                                required
                                                                maxLength={
                                                                    2000
                                                                }
                                                                name="notes"
                                                                rows={
                                                                    3
                                                                }
                                                                className={`${field} resize-none`}
                                                            />
                                                        </label>

                                                        <button
                                                            disabled={
                                                                busy
                                                            }
                                                            className={`${primaryButton} w-full`}
                                                        >
                                                            {
                                                                c.save
                                                            }
                                                        </button>
                                                    </form>
                                                </section>
                                            )}
                                        </div>

                                        <StaffWorkforcePanel
                                            mode="adjustments"
                                            id={
                                                ledger.member.id
                                            }
                                            basis={
                                                ledger.member.basis
                                            }
                                            unit={
                                                ledger.member.unit
                                            }
                                            currency={
                                                ledger.member.currency
                                            }
                                            canPay={
                                                ledger.can_pay
                                            }
                                            onChanged={() =>
                                                setRevision(
                                                    (
                                                        current,
                                                    ) =>
                                                        current
                                                        + 1,
                                                )
                                            }
                                        />
                                    </div>
                                )}

                                {tab ===
                                    'ledger' && (
                                    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
                                        <section className="overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-white">
                                            <div className="border-b border-[var(--ac-line)] p-5">
                                                <h3 className="font-semibold">
                                                    {ar
                                                        ? 'كشف الحساب'
                                                        : 'Employee ledger'}
                                                </h3>

                                                <p className="mt-2 text-xs text-[var(--ac-text-muted)]">
                                                    {ar
                                                        ? 'العمليات اليدوية يمكن تعديلها أو حذفها مع تسجيل سبب التصحيح.'
                                                        : 'Manual transactions can be corrected or deleted with an audit reason.'}
                                                </p>
                                            </div>

                                            <div className="divide-y divide-[var(--ac-line)]">
                                                {ledger.entries.data.map(
                                                    (
                                                        entry,
                                                    ) => {
                                                        const generated =
                                                            entry.kind ===
                                                                'terms'
                                                            || Boolean(
                                                                entry
                                                                    .terms
                                                                    ?.attendance_id,
                                                            )
                                                            || Boolean(
                                                                entry
                                                                    .terms
                                                                    ?.adjustment_id,
                                                            );

                                                        return (
                                                            <article
                                                                key={
                                                                    entry.id
                                                                }
                                                                className="p-4 sm:p-5"
                                                            >
                                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                    <div>
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <strong className="text-sm">
                                                                                {entryKindLabel(
                                                                                    entry.kind,
                                                                                )}
                                                                            </strong>

                                                                            {generated && (
                                                                                <span className="rounded-full bg-[var(--ac-bg-soft)] px-2 py-1 text-[9px] text-[var(--ac-text-muted)]">
                                                                                    {ar
                                                                                        ? 'مولد من النظام'
                                                                                        : 'System generated'}
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                                                            {
                                                                                entry.occurred_on
                                                                            }
                                                                        </p>

                                                                        {entry.notes && (
                                                                            <p className="mt-2 text-xs leading-5 text-[var(--ac-text-soft)]">
                                                                                {
                                                                                    entry.notes
                                                                                }
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    <div className="text-start sm:text-end">
                                                                        <bdi
                                                                            className={[
                                                                                'text-sm font-semibold',
                                                                                Number(
                                                                                    entry.amount,
                                                                                ) <
                                                                                0
                                                                                    ? 'text-red-700'
                                                                                    : 'text-emerald-700',
                                                                            ].join(
                                                                                ' ',
                                                                            )}
                                                                        >
                                                                            {money(
                                                                                entry.amount,
                                                                                ledger.member.currency,
                                                                            )}
                                                                        </bdi>

                                                                        {entry.quantity && (
                                                                            <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                                                {entry.quantity}
                                                                                {' × '}
                                                                                {entry.rate
                                                                                    ?? '—'}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {ledger.can_pay
                                                                    && ! generated && (
                                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                                        <button
                                                                            type="button"
                                                                            className={
                                                                                button
                                                                            }
                                                                            onClick={() =>
                                                                                setEntryCorrection(
                                                                                    {
                                                                                        entry,
                                                                                        action:
                                                                                            'edit',
                                                                                    },
                                                                                )
                                                                            }
                                                                        >
                                                                            <Pencil
                                                                                size={
                                                                                    13
                                                                                }
                                                                            />

                                                                            {ar
                                                                                ? 'تعديل'
                                                                                : 'Edit'}
                                                                        </button>

                                                                        <button
                                                                            type="button"
                                                                            className="inline-flex items-center gap-2 rounded-[13px] border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                                            onClick={() =>
                                                                                setEntryCorrection(
                                                                                    {
                                                                                        entry,
                                                                                        action:
                                                                                            'delete',
                                                                                    },
                                                                                )
                                                                            }
                                                                        >
                                                                            <Trash2
                                                                                size={
                                                                                    13
                                                                                }
                                                                            />

                                                                            {ar
                                                                                ? 'حذف'
                                                                                : 'Delete'}
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                {generated
                                                                    && ledger.can_pay && (
                                                                    <p className="mt-3 text-[10px] text-[var(--ac-text-muted)]">
                                                                        {entry
                                                                            .terms
                                                                            ?.attendance_id
                                                                            ? ar
                                                                                ? 'لتصحيح هذا السجل استخدم تبويب الحضور.'
                                                                                : 'Correct this entry from Attendance.'
                                                                            : entry
                                                                                  .terms
                                                                                  ?.adjustment_id
                                                                              ? ar
                                                                                  ? 'هذا السجل ناتج عن بند متكرر.'
                                                                                  : 'This entry came from a recurring adjustment.'
                                                                              : ''}
                                                                    </p>
                                                                )}
                                                            </article>
                                                        );
                                                    },
                                                )}

                                                {! ledger.entries.data.length && (
                                                    <div className="p-10 text-center text-sm text-[var(--ac-text-muted)]">
                                                        {
                                                            c.empty
                                                        }
                                                    </div>
                                                )}
                                            </div>

                                            {ledger.entries.last_page >
                                                1 && (
                                                <div className="flex justify-between border-t border-[var(--ac-line)] p-4">
                                                    <button
                                                        type="button"
                                                        className={
                                                            button
                                                        }
                                                        disabled={
                                                            ledgerPage ===
                                                            1
                                                        }
                                                        onClick={() =>
                                                            setLedgerPage(
                                                                (
                                                                    current,
                                                                ) =>
                                                                    current
                                                                    - 1,
                                                            )
                                                        }
                                                    >
                                                        {
                                                            c.previous
                                                        }
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className={
                                                            button
                                                        }
                                                        disabled={
                                                            ledgerPage >=
                                                            ledger
                                                                .entries
                                                                .last_page
                                                        }
                                                        onClick={() =>
                                                            setLedgerPage(
                                                                (
                                                                    current,
                                                                ) =>
                                                                    current
                                                                    + 1,
                                                            )
                                                        }
                                                    >
                                                        {
                                                            c.more
                                                        }
                                                    </button>
                                                </div>
                                            )}
                                        </section>

                                        <section className="rounded-[22px] border border-[var(--ac-line)] bg-white p-5">
                                            <h3 className="font-semibold">
                                                {ar
                                                    ? 'سجل التصحيحات'
                                                    : 'Correction audit'}
                                            </h3>

                                            <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                                                {ar
                                                    ? 'كل تعديل أو حذف يبقى موثقًا بدل أن يختفي من التاريخ.'
                                                    : 'Every correction remains auditable instead of disappearing from history.'}
                                            </p>

                                            <div className="mt-4 space-y-2">
                                                {ledger.corrections.map(
                                                    (
                                                        correction,
                                                        index,
                                                    ) => (
                                                        <div
                                                            key={`${correction.created_at}-${index}`}
                                                            className="rounded-[14px] bg-[var(--ac-surface-soft)] p-3"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <strong className="text-xs">
                                                                    {
                                                                        correction.action
                                                                    }
                                                                </strong>

                                                                <span className="text-[9px] text-[var(--ac-text-muted)]">
                                                                    {
                                                                        correction.created_at
                                                                    }
                                                                </span>
                                                            </div>

                                                            <p className="mt-2 text-xs leading-5 text-[var(--ac-text-soft)]">
                                                                {
                                                                    correction.reason
                                                                }
                                                            </p>
                                                        </div>
                                                    ),
                                                )}

                                                {! ledger.corrections.length && (
                                                    <p className="rounded-xl border border-dashed border-[var(--ac-line)] p-4 text-center text-xs text-[var(--ac-text-muted)]">
                                                        {ar
                                                            ? 'لا توجد تصحيحات.'
                                                            : 'No corrections yet.'}
                                                    </p>
                                                )}
                                            </div>
                                        </section>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                )}
            </main>

            {edit && (
                <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
                    <form
                        data-ac-managed-dirty="true"
                        ref={
                            staffFormRef
                        }
                        key={
                            member?.id
                            ?? 'new'
                        }
                        onChange={() =>
                            setStaffFormDirty(
                                true,
                            )
                        }
                        onSubmit={(
                            event,
                        ) =>
                            void saveStaff(
                                event,
                            )
                        }
                        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] border border-[var(--ac-line)] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-6"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-semibold">
                                    {member
                                        ? ar
                                            ? 'تعديل الموظف'
                                            : 'Edit employee'
                                        : ar
                                          ? 'إضافة موظف'
                                          : 'Add employee'}
                                </h2>

                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'احفظ بيانات العمل الأساسية فقط. الحضور والرواتب لها تبويبات مستقلة.'
                                        : 'Keep employment details here. Attendance and pay remain in their own tabs.'}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={
                                    closeStaffEditor
                                }
                                className="flex size-10 items-center justify-center rounded-xl bg-[var(--ac-bg-soft)]"
                            >
                                <X
                                    size={
                                        17
                                    }
                                />
                            </button>
                        </div>

                        <fieldset
                            disabled={
                                busy
                            }
                            className="mt-6 grid gap-4 sm:grid-cols-2"
                        >
                            <label className="text-xs font-semibold">
                                {
                                    c.name
                                }

                                <input
                                    required
                                    maxLength={
                                        255
                                    }
                                    name="name"
                                    defaultValue={
                                        member?.name
                                        ?? ''
                                    }
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.job
                                }

                                <input
                                    maxLength={
                                        255
                                    }
                                    name="job_title"
                                    defaultValue={
                                        member?.job_title
                                        ?? ''
                                    }
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.phone
                                }

                                <input
                                    maxLength={
                                        50
                                    }
                                    name="phone"
                                    defaultValue={
                                        member?.phone
                                        ?? ''
                                    }
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.department
                                }

                                <select
                                    name="department_id"
                                    defaultValue={
                                        member?.department_id
                                        ?? ''
                                    }
                                    className={
                                        field
                                    }
                                >
                                    <option value="">
                                        {
                                            c.none
                                        }
                                    </option>

                                    {result?.departments.map(
                                        (
                                            departmentItem,
                                        ) => (
                                            <option
                                                key={
                                                    departmentItem.id
                                                }
                                                value={
                                                    departmentItem.id
                                                }
                                            >
                                                {
                                                    departmentItem.name
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.basis
                                }

                                <select
                                    name="basis"
                                    defaultValue={
                                        member?.basis
                                        ?? 'month'
                                    }
                                    className={
                                        field
                                    }
                                >
                                    {(
                                        [
                                            'hour',
                                            'day',
                                            'month',
                                            'piece',
                                        ] as const
                                    ).map(
                                        (
                                            basis,
                                        ) => (
                                            <option
                                                key={
                                                    basis
                                                }
                                                value={
                                                    basis
                                                }
                                            >
                                                {
                                                    c[
                                                        basis
                                                    ]
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold">
                                {ar
                                    ? 'الوحدة'
                                    : 'Unit'}

                                <input
                                    maxLength={
                                        50
                                    }
                                    name="unit"
                                    defaultValue={
                                        member?.unit
                                        ?? ''
                                    }
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.rate
                                }

                                <input
                                    required
                                    type="number"
                                    min="0"
                                    max="999999"
                                    step="0.0001"
                                    name="rate"
                                    defaultValue={
                                        member?.rate
                                        ?? '0'
                                    }
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.allowance
                                }

                                <input
                                    required
                                    type="number"
                                    min="0"
                                    max="999999"
                                    step="0.0001"
                                    name="monthly_allowance"
                                    defaultValue={
                                        member?.monthly_allowance
                                        ?? '0'
                                    }
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.start
                                }

                                <input
                                    required
                                    type="date"
                                    name="started_on"
                                    defaultValue={
                                        member?.started_on
                                        ?? today()
                                    }
                                    className={
                                        field
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    c.status
                                }

                                <select
                                    name="active"
                                    defaultValue={
                                        member?.active ===
                                        false
                                            ? 'false'
                                            : 'true'
                                    }
                                    className={
                                        field
                                    }
                                >
                                    <option value="true">
                                        {
                                            c.active
                                        }
                                    </option>

                                    <option value="false">
                                        {
                                            c.inactive
                                        }
                                    </option>
                                </select>
                            </label>

                            <label className="text-xs font-semibold sm:col-span-2">
                                {
                                    c.access
                                }

                                <select
                                    name="user_id"
                                    value={
                                        linkedUserId
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setLinkedUserId(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className={
                                        field
                                    }
                                >
                                    <option value="">
                                        {ar
                                            ? 'بدون حساب مرتبط'
                                            : 'No linked account'}
                                    </option>

                                    {linkedUserId
                                        && ! result?.accounts.some(
                                            (
                                                account,
                                            ) =>
                                                String(
                                                    account.id,
                                                ) ===
                                                linkedUserId,
                                        ) && (
                                        <option value={linkedUserId}>
                                            {ar
                                                ? 'الحساب المرتبط · جارٍ تحميل بياناته…'
                                                : 'Linked account · loading details…'}
                                        </option>
                                    )}

                                    {result?.accounts.map(
                                        (
                                            account,
                                        ) => (
                                            <option
                                                key={
                                                    account.id
                                                }
                                                value={
                                                    account.id
                                                }
                                            >
                                                {account.name}
                                                {' · '}
                                                {account.email}
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <input
                                type="hidden"
                                name="currency"
                                value={
                                    member?.currency
                                    ?? result?.currency
                                    ?? 'ILS'
                                }
                            />
                        </fieldset>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                className={
                                    button
                                }
                                onClick={
                                    closeStaffEditor
                                }
                            >
                                {
                                    c.cancel
                                }
                            </button>

                            <button
                                disabled={
                                    busy
                                }
                                className={
                                    primaryButton
                                }
                            >
                                {
                                    c.save
                                }
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {deletingStaff
                && ledger && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
                    <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-red-50 text-red-700">
                            <Trash2
                                size={
                                    18
                                }
                            />
                        </div>

                        <h2 className="mt-4 text-lg font-semibold">
                            {ar
                                ? `حذف ${ledger.member.name}؟`
                                : `Delete ${ledger.member.name}?`}
                        </h2>

                        <p className="mt-2 text-xs leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'الحذف مخصص للأخطاء. إذا كان للموظف رصيد مالي غير مصفّى سيمنع النظام الحذف لحماية السجل المحاسبي.'
                                : 'Deletion is for mistakes. AccoNova blocks deletion while an unsettled financial balance exists.'}
                        </p>

                        <label className="mt-4 block text-xs font-semibold">
                            {ar
                                ? 'سبب الحذف'
                                : 'Deletion reason'}

                            <textarea
                                required
                                rows={
                                    3
                                }
                                value={
                                    deleteReason
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setDeleteReason(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                className={`${field} resize-none`}
                            />
                        </label>

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                className={
                                    button
                                }
                                onClick={() => {
                                    setDeletingStaff(
                                        false,
                                    );

                                    setDeleteReason(
                                        '',
                                    );
                                }}
                            >
                                {ar
                                    ? 'إلغاء'
                                    : 'Cancel'}
                            </button>

                            <button
                                type="button"
                                disabled={
                                    busy
                                    || deleteReason
                                        .trim()
                                        .length <
                                        3
                                }
                                onClick={() =>
                                    void deleteEmployee()
                                }
                                className="rounded-[13px] bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                            >
                                {ar
                                    ? 'تأكيد الحذف'
                                    : 'Delete employee'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {entryCorrection && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
                    <form
                        onSubmit={(
                            event,
                        ) =>
                            void submitEntryCorrection(
                                event,
                            )
                        }
                        className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl"
                    >
                        <div className="flex items-center justify-between gap-4">
                            <h2 className="text-lg font-semibold">
                                {entryCorrection.action ===
                                'edit'
                                    ? ar
                                        ? 'تصحيح العملية'
                                        : 'Correct transaction'
                                    : ar
                                      ? 'حذف العملية'
                                      : 'Delete transaction'}
                            </h2>

                            <button
                                type="button"
                                onClick={() =>
                                    setEntryCorrection(
                                        null,
                                    )
                                }
                            >
                                <X
                                    size={
                                        17
                                    }
                                />
                            </button>
                        </div>

                        {entryCorrection.action ===
                            'edit' && (
                            <div className="mt-4 space-y-3">
                                {entryCorrection
                                    .entry
                                    .kind ===
                                'work' ? (
                                    <label className="block text-xs font-semibold">
                                        {ar
                                            ? 'الكمية'
                                            : 'Quantity'}

                                        <input
                                            required
                                            type="number"
                                            min="0.0001"
                                            step="0.0001"
                                            name="quantity"
                                            defaultValue={
                                                entryCorrection
                                                    .entry
                                                    .quantity
                                                ?? ''
                                            }
                                            className={
                                                field
                                            }
                                        />
                                    </label>
                                ) : (
                                    <label className="block text-xs font-semibold">
                                        {ar
                                            ? 'المبلغ'
                                            : 'Amount'}

                                        <input
                                            required
                                            type="number"
                                            min="0.0001"
                                            step="0.0001"
                                            name="amount"
                                            defaultValue={Math.abs(
                                                Number(
                                                    entryCorrection
                                                        .entry
                                                        .amount,
                                                ),
                                            )}
                                            className={
                                                field
                                            }
                                        />
                                    </label>
                                )}

                                <label className="block text-xs font-semibold">
                                    {ar
                                        ? 'الملاحظة'
                                        : 'Note'}

                                    <textarea
                                        name="notes"
                                        rows={
                                            3
                                        }
                                        defaultValue={
                                            entryCorrection
                                                .entry
                                                .notes
                                            ?? ''
                                        }
                                        className={`${field} resize-none`}
                                    />
                                </label>
                            </div>
                        )}

                        <label className="mt-4 block text-xs font-semibold">
                            {ar
                                ? 'سبب التصحيح'
                                : 'Correction reason'}

                            <textarea
                                required
                                minLength={
                                    3
                                }
                                maxLength={
                                    1000
                                }
                                name="reason"
                                rows={
                                    3
                                }
                                className={`${field} resize-none`}
                            />
                        </label>

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                className={
                                    button
                                }
                                onClick={() =>
                                    setEntryCorrection(
                                        null,
                                    )
                                }
                            >
                                {ar
                                    ? 'إلغاء'
                                    : 'Cancel'}
                            </button>

                            <button
                                disabled={
                                    busy
                                }
                                className={
                                    entryCorrection.action ===
                                    'delete'
                                        ? 'rounded-[13px] bg-red-700 px-4 py-2.5 text-sm font-semibold text-white'
                                        : primaryButton
                                }
                            >
                                {entryCorrection.action ===
                                'delete'
                                    ? ar
                                        ? 'حذف'
                                        : 'Delete'
                                    : ar
                                      ? 'حفظ التصحيح'
                                      : 'Save correction'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}

/**
 * Render one summary metric without adding another dashboard layer.
 */
function MetricCard({
    label,
    value,
    accent = false,
}: {
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <div
            className={[
                'rounded-[18px] border p-4',
                accent
                    ? 'border-transparent bg-[var(--ac-accent-soft)]'
                    : 'border-[var(--ac-line)] bg-white',
            ].join(
                ' ',
            )}
        >
            <p className="text-[10px] text-[var(--ac-text-muted)]">
                {
                    label
                }
            </p>

            <bdi className="mt-2 block text-lg font-semibold">
                {
                    value
                }
            </bdi>
        </div>
    );
}

/**
 * Render one compact immutable employee information tile.
 */
function InfoCard({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
            <p className="text-[10px] text-[var(--ac-text-muted)]">
                {
                    label
                }
            </p>

            <p className="mt-1.5 text-sm font-semibold">
                {
                    value
                }
            </p>
        </div>
    );
}