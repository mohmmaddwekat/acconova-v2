import { ApiError, apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import { usePage } from '@inertiajs/react';
import {
    ArrowDownLeft,
    ArrowUpRight,
    CalendarClock,
    ChevronDown,
    CirclePause,
    CirclePlay,
    Plus,
    ReceiptText,
    RefreshCw,
    WalletCards,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from 'react';
import {
    FPanel,
    Money,
    SummaryCard,
    financeButton,
    financeInput,
    financePrimary,
} from './shared';

type Frequency =
    | 'once'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly';

type Plan = {
    id: number;
    title: string;
    direction: 'incoming' | 'outgoing';
    amount: string;
    currency: string;
    frequency: Frequency;
    interval_count: number;
    next_due_on: string;
    counterparty: string | null;
    active: boolean;
    completed: boolean;
    due: boolean;
    reminder: boolean;
};

type Payment = {
    id: number;
    title: string;
    direction: 'incoming' | 'outgoing';
    amount: string;
    currency: string;
    due_on: string;
    paid_on: string;
    counterparty: string | null;
    method: 'cash' | 'bank' | 'electronic';
    notes: string | null;
};

type Result<T> = {
    data: T[];
    meta: {
        last_page: number;
    };
};

function localDate(): string {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function apiMessage(
    failure: unknown,
    fallback: string,
): string {
    if (failure instanceof ApiError) {
        return [
            failure.message,
            ...Object.values(failure.errors).flat(),
        ].filter(Boolean).join(' ');
    }

    return failure instanceof Error
        ? failure.message
        : fallback;
}

export function RecurringPaymentsPanel() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (
        arabic: string,
        english: string,
    ): string => ar ? arabic : english;

    const { workspace } =
        usePage<AppPageProps>().props;

    const permissions =
        workspace.activeOrganization?.permissions;

    const fallbackAccess = [
        'owner',
        'admin',
        'manager',
        'accountant',
    ].includes(
        workspace.activeOrganization?.role ?? '',
    );

    const allowed = permissions
        ? permissions.includes('payments.view')
        : fallbackAccess;

    const canCreate = permissions
        ? permissions.some(permission =>
            [
                'payments.manage',
                'payments.create',
            ].includes(permission),
        )
        : allowed;

    const canRecord = permissions
        ? permissions.some(permission =>
            [
                'payments.manage',
                'payments.record',
            ].includes(permission),
        )
        : allowed;

    const canManage = permissions
        ? permissions.some(permission =>
            [
                'payments.manage',
                'payments.update',
            ].includes(permission),
        )
        : allowed;

    const [defaults, setDefaults] =
        useState<{
            currency: string;
            reminder_days: number;
        } | null>(null);

    const [tab, setTab] =
        useState<'active' | 'inactive' | 'history'>(
            'active',
        );

    const [direction, setDirection] =
        useState('');

    const [page, setPage] =
        useState(1);

    const [revision, setRevision] =
        useState(0);

    const [plans, setPlans] =
        useState<Plan[]>([]);

    const [records, setRecords] =
        useState<Payment[]>([]);

    const [lastPage, setLastPage] =
        useState(1);

    const [selected, setSelected] =
        useState<Plan | null>(null);

    const [frequency, setFrequency] =
        useState<Frequency>('monthly');

    const [loading, setLoading] =
        useState(true);

    const [busy, setBusy] =
        useState(false);

    const [error, setError] =
        useState('');

    const [success, setSuccess] =
        useState('');

    const [loadError, setLoadError] =
        useState('');

    const recordSection =
        useRef<HTMLElement>(null);

    useEffect(() => {
        let mounted = true;

        apiRequest<{
            currency: string;
            reminder_days: number;
        }>('/api/workspace-settings')
            .then(response => {
                if (mounted) {
                    setDefaults(response);
                }
            })
            .catch(() => undefined);

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!selected) {
            return;
        }

        recordSection.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, [selected]);

    useEffect(() => {
        if (!allowed) {
            setLoading(false);
            return;
        }

        const controller =
            new AbortController();

        setLoading(true);
        setLoadError('');

        const path = tab === 'history'
            ? '/api/payment-records?page='
                + String(page)
            : '/api/payment-plans?status='
                + tab
                + '&page='
                + String(page)
                + (
                    direction
                        ? '&direction='
                            + direction
                        : ''
                );

        apiRequest<
            Result<Plan>
            | Result<Payment>
        >(
            path,
            {
                signal:
                    controller.signal,
            },
        )
            .then(result => {
                setLastPage(
                    result.meta.last_page,
                );

                if (tab === 'history') {
                    setRecords(
                        (
                            result as
                                Result<Payment>
                        ).data,
                    );
                } else {
                    setPlans(
                        (
                            result as
                                Result<Plan>
                        ).data,
                    );
                }
            })
            .catch(failure => {
                if (!controller.signal.aborted) {
                    setLoadError(
                        apiMessage(
                            failure,
                            text(
                                'تعذر تحميل المدفوعات المتكررة.',
                                'Could not load recurring payments.',
                            ),
                        ),
                    );
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () =>
            controller.abort();
    }, [
        allowed,
        tab,
        page,
        direction,
        revision,
    ]);

    async function mutate(
        path: string,
        data: Record<string, unknown>,
        method = 'POST',
    ): Promise<boolean> {
        setBusy(true);
        setError('');
        setSuccess('');

        try {
            await apiRequest(
                path,
                {
                    method,
                    body:
                        JSON.stringify(data),
                },
            );

            setRevision(
                value => value + 1,
            );

            setSuccess(
                text(
                    'تم حفظ التغيير.',
                    'Change saved.',
                ),
            );

            window.dispatchEvent(
                new Event(
                    'payment-plans-changed',
                ),
            );

            return true;
        } catch (failure) {
            if (
                failure instanceof ApiError
                && failure.status === 409
            ) {
                setSelected(null);
                setRevision(
                    value => value + 1,
                );
            }

            setError(
                apiMessage(
                    failure,
                    text(
                        'تعذر حفظ التغيير.',
                        'Could not save the change.',
                    ),
                ),
            );

            return false;
        } finally {
            setBusy(false);
        }
    }

    async function create(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (busy) {
            return;
        }

        const form =
            event.currentTarget;

        const data =
            Object.fromEntries(
                new FormData(form),
            );

        const saved =
            await mutate(
                '/api/payment-plans',
                {
                    ...data,
                    reminder_days:
                        Number(
                            data.reminder_days,
                        ),
                    interval_count:
                        Number(
                            data.interval_count,
                        ),
                },
            );

        if (saved) {
            form.reset();
            setFrequency('monthly');
            setTab('active');
            setPage(1);
        }
    }

    async function record(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
            || !selected
        ) {
            return;
        }

        const data =
            Object.fromEntries(
                new FormData(
                    event.currentTarget,
                ),
            );

        if (
            await mutate(
                '/api/payment-plans/'
                + selected.id
                + '/record',
                {
                    ...data,
                    due_on:
                        selected.next_due_on,
                },
            )
        ) {
            setSelected(null);
        }
    }

    const activeCount =
        tab === 'active'
            ? plans.length
            : 0;

    const dueCount =
        tab === 'active'
            ? plans.filter(
                plan => plan.due,
            ).length
            : 0;

    const reminderCount =
        tab === 'active'
            ? plans.filter(
                plan => plan.reminder,
            ).length
            : 0;

    if (!allowed) {
        return (
            <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
                {text(
                    'ليس لديك صلاحية لعرض المدفوعات المتكررة.',
                    'You do not have access to recurring payments.',
                )}
            </div>
        );
    }

    return (
        <div
            dir={ar ? 'rtl' : 'ltr'}
            className="space-y-4"
        >
            <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                    label={text(
                        'الالتزامات النشطة',
                        'Active plans',
                    )}
                    value={activeCount}
                    icon={CalendarClock}
                />

                <SummaryCard
                    label={text(
                        'مستحق الآن',
                        'Due now',
                    )}
                    value={dueCount}
                    icon={WalletCards}
                    tone="amber"
                />

                <SummaryCard
                    label={text(
                        'قريب الاستحقاق',
                        'Due soon',
                    )}
                    value={reminderCount}
                    icon={RefreshCw}
                    tone="violet"
                />
            </div>

            {canCreate && (
                <FPanel
                    title={text(
                        'إضافة دفعة متكررة',
                        'Add recurring payment',
                    )}
                    icon={Plus}
                >
                    <details className="group">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-semibold text-[var(--ac-text)] [&::-webkit-details-marker]:hidden">
                            <span>
                                {text(
                                    'أنشئ التزاماً يتكرر تلقائياً',
                                    'Create a repeating obligation',
                                )}
                            </span>

                            <ChevronDown
                                size={17}
                                className="text-[var(--ac-text-muted)] transition group-open:rotate-180"
                            />
                        </summary>

                        <form
                            onSubmit={create}
                            className="border-t border-[var(--ac-line)] p-4"
                        >
                            <fieldset
                                disabled={busy}
                                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                            >
                                <label className="text-[11px] font-semibold text-[var(--ac-text-soft)] md:col-span-2 xl:col-span-1">
                                    {text(
                                        'اسم الالتزام *',
                                        'Name *',
                                    )}
                                    <input
                                        required
                                        name="title"
                                        maxLength={255}
                                        className={financeInput + ' mt-2'}
                                        placeholder={text(
                                            'مثال: إيجار المكتب',
                                            'Example: Office rent',
                                        )}
                                    />
                                </label>

                                <ChoiceField
                                    name="direction"
                                    label={text(
                                        'الاتجاه *',
                                        'Direction *',
                                    )}
                                    defaultValue="outgoing"
                                    options={[
                                        {
                                            value:
                                                'outgoing',
                                            label:
                                                text(
                                                    'دفع',
                                                    'Payment',
                                                ),
                                        },
                                        {
                                            value:
                                                'incoming',
                                            label:
                                                text(
                                                    'قبض',
                                                    'Receipt',
                                                ),
                                        },
                                    ]}
                                />

                                <ChoiceField
                                    name="frequency"
                                    label={text(
                                        'التكرار *',
                                        'Frequency *',
                                    )}
                                    defaultValue="monthly"
                                    onChange={value =>
                                        setFrequency(
                                            value as Frequency,
                                        )
                                    }
                                    options={[
                                        {
                                            value:
                                                'once',
                                            label:
                                                text(
                                                    'مرة واحدة',
                                                    'Once',
                                                ),
                                        },
                                        {
                                            value:
                                                'weekly',
                                            label:
                                                text(
                                                    'أسبوعي',
                                                    'Weekly',
                                                ),
                                        },
                                        {
                                            value:
                                                'monthly',
                                            label:
                                                text(
                                                    'شهري',
                                                    'Monthly',
                                                ),
                                        },
                                        {
                                            value:
                                                'yearly',
                                            label:
                                                text(
                                                    'سنوي',
                                                    'Yearly',
                                                ),
                                        },
                                    ]}
                                />

                                <label className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                    {text(
                                        'المبلغ *',
                                        'Amount *',
                                    )}
                                    <input
                                        required
                                        name="amount"
                                        type="number"
                                        dir="ltr"
                                        min="0.0001"
                                        max="9999999999"
                                        step="0.0001"
                                        className={financeInput + ' mt-2'}
                                    />
                                </label>

                                <label className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                    {text(
                                        'كل كم فترة *',
                                        'Every *',
                                    )}
                                    <input
                                        required
                                        name="interval_count"
                                        type="number"
                                        min="1"
                                        max="365"
                                        step="1"
                                        disabled={
                                            frequency === 'once'
                                        }
                                        defaultValue="1"
                                        className={financeInput + ' mt-2'}
                                    />
                                </label>

                                <label className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                    {text(
                                        'أول استحقاق *',
                                        'First due date *',
                                    )}
                                    <input
                                        required
                                        name="next_due_on"
                                        type="date"
                                        defaultValue={localDate()}
                                        className={financeInput + ' mt-2'}
                                    />
                                </label>

                                <div className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                    {text(
                                        'العملة',
                                        'Currency',
                                    )}
                                    <div className={financeInput + ' mt-2 bg-[var(--ac-surface-soft)] font-bold text-[var(--ac-text)]'}>
                                        {defaults?.currency
                                            ?? workspace.activeOrganization?.currency
                                            ?? 'ILS'}
                                    </div>
                                </div>

                                <label className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                    {text(
                                        'التذكير قبل (أيام) *',
                                        'Reminder days *',
                                    )}
                                    <input
                                        required
                                        name="reminder_days"
                                        type="number"
                                        min="0"
                                        max="30"
                                        defaultValue={
                                            defaults?.reminder_days
                                            ?? 3
                                        }
                                        className={financeInput + ' mt-2'}
                                    />
                                </label>

                                <label className="text-[11px] font-semibold text-[var(--ac-text-soft)] md:col-span-2 xl:col-span-1">
                                    {text(
                                        'الطرف (اختياري)',
                                        'Party (optional)',
                                    )}
                                    <input
                                        name="counterparty"
                                        maxLength={255}
                                        className={financeInput + ' mt-2'}
                                    />
                                </label>

                                <div className="md:col-span-2 xl:col-span-3">
                                    <p className="mb-3 rounded-[12px] bg-blue-50 px-3 py-2 text-[10px] leading-5 text-blue-700">
                                        {text(
                                            'الرواتب لا تُسجل هنا لأنها تُدار من نظام الموظفين. العملة ثابتة من إعدادات مساحة العمل.',
                                            'Payroll is managed in the staff module. Currency is controlled by workspace settings.',
                                        )}
                                    </p>

                                    <button
                                        disabled={busy}
                                        className={financePrimary}
                                    >
                                        <Plus size={15} />
                                        {text(
                                            'حفظ الدفعة المتكررة',
                                            'Save recurring payment',
                                        )}
                                    </button>
                                </div>
                            </fieldset>
                        </form>
                    </details>
                </FPanel>
            )}

            {selected && (
                <section
                    ref={recordSection}
                    className="rounded-[18px] border border-[var(--ac-line-strong)] bg-[var(--ac-surface)] p-5 shadow-[0_8px_28px_rgba(30,75,140,.055)]"
                >
                    <h3 className="text-sm font-bold text-[var(--ac-text)]">
                        {text(
                            'تسجيل حركة',
                            'Record movement',
                        )}
                        {' — '}
                        {selected.title}
                    </h3>

                    <form
                        onSubmit={record}
                        className="mt-4"
                    >
                        <fieldset
                            disabled={busy}
                            className="grid gap-4 md:grid-cols-2"
                        >
                            <label className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                {text(
                                    'المبلغ الفعلي *',
                                    'Actual amount *',
                                )}
                                <input
                                    required
                                    name="amount"
                                    type="number"
                                    min="0.0001"
                                    max="9999999999"
                                    step="0.0001"
                                    dir="ltr"
                                    defaultValue={
                                        selected.amount
                                    }
                                    className={financeInput + ' mt-2'}
                                />
                            </label>

                            <label className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                {text(
                                    'تاريخ الحركة *',
                                    'Movement date *',
                                )}
                                <input
                                    required
                                    type="date"
                                    name="paid_on"
                                    max={localDate()}
                                    defaultValue={localDate()}
                                    className={financeInput + ' mt-2'}
                                />
                            </label>

                            <label className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                                {text(
                                    'الطرف (اختياري)',
                                    'Party (optional)',
                                )}
                                <input
                                    name="counterparty"
                                    maxLength={255}
                                    defaultValue={
                                        selected.counterparty
                                        ?? ''
                                    }
                                    className={financeInput + ' mt-2'}
                                />
                            </label>

                            <ChoiceField
                                name="method"
                                label={text(
                                    'طريقة الدفع *',
                                    'Payment method *',
                                )}
                                defaultValue="cash"
                                options={[
                                    {
                                        value:
                                            'cash',
                                        label:
                                            text(
                                                'نقدي',
                                                'Cash',
                                            ),
                                    },
                                    {
                                        value:
                                            'bank',
                                        label:
                                            text(
                                                'بنك',
                                                'Bank',
                                            ),
                                    },
                                    {
                                        value:
                                            'electronic',
                                        label:
                                            text(
                                                'إلكتروني',
                                                'Electronic',
                                            ),
                                    },
                                ]}
                            />

                            <label className="text-[11px] font-semibold text-[var(--ac-text-soft)] md:col-span-2">
                                {text(
                                    'ملاحظات (اختياري)',
                                    'Notes (optional)',
                                )}
                                <textarea
                                    name="notes"
                                    maxLength={2000}
                                    className={financeInput + ' mt-2 min-h-24'}
                                />
                            </label>

                            <div className="flex flex-wrap gap-2 md:col-span-2">
                                <button
                                    disabled={busy}
                                    className={financePrimary}
                                >
                                    {text(
                                        'اعتماد الحركة',
                                        'Confirm movement',
                                    )}
                                </button>

                                <button
                                    type="button"
                                    className={financeButton}
                                    onClick={() =>
                                        setSelected(null)
                                    }
                                >
                                    {text(
                                        'إلغاء',
                                        'Cancel',
                                    )}
                                </button>
                            </div>
                        </fieldset>
                    </form>
                </section>
            )}

            {error && (
                <div
                    role="alert"
                    className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                </div>
            )}

            {success && (
                <div
                    role="status"
                    className="rounded-[14px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
                >
                    {success}
                </div>
            )}

            <FPanel
                title={text(
                    'المدفوعات المتكررة',
                    'Recurring payments',
                )}
                icon={CalendarClock}
                action={
                    <div className="flex flex-wrap gap-1.5">
                        {(
                            [
                                [
                                    'active',
                                    text(
                                        'النشطة',
                                        'Active',
                                    ),
                                ],
                                [
                                    'inactive',
                                    text(
                                        'المتوقفة',
                                        'Paused',
                                    ),
                                ],
                                [
                                    'history',
                                    text(
                                        'السجل',
                                        'History',
                                    ),
                                ],
                            ] as const
                        ).map(
                            ([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                        setTab(value);
                                        setPage(1);
                                        setSelected(null);
                                    }}
                                    className={[
                                        'rounded-[9px] px-3 py-2 text-[10px] font-semibold transition',
                                        tab === value
                                            ? 'bg-[var(--ac-accent-solid)] text-white'
                                            : 'text-[var(--ac-text-soft)] hover:bg-blue-50',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            ),
                        )}
                    </div>
                }
            >
                {tab !== 'history' && (
                    <div className="flex flex-wrap gap-2 border-b border-[var(--ac-line)] p-4">
                        {(
                            [
                                [
                                    '',
                                    text(
                                        'الكل',
                                        'All',
                                    ),
                                    WalletCards,
                                ],
                                [
                                    'outgoing',
                                    text(
                                        'دفع',
                                        'Outgoing',
                                    ),
                                    ArrowUpRight,
                                ],
                                [
                                    'incoming',
                                    text(
                                        'قبض',
                                        'Incoming',
                                    ),
                                    ArrowDownLeft,
                                ],
                            ] as const
                        ).map(
                            ([value, label, Icon]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                        setDirection(value);
                                        setPage(1);
                                    }}
                                    className={[
                                        'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-semibold transition',
                                        direction === value
                                            ? 'border-[var(--ac-line-strong)] bg-blue-50 text-[var(--ac-accent)]'
                                            : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]',
                                    ].join(' ')}
                                >
                                    <Icon size={13} />
                                    {label}
                                </button>
                            ),
                        )}
                    </div>
                )}

                {loading ? (
                    <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                        {text(
                            'جارٍ تحميل المدفوعات المتكررة...',
                            'Loading recurring payments...',
                        )}
                    </div>
                ) : loadError ? (
                    <div className="p-6 text-sm text-red-700">
                        <p>{loadError}</p>
                        <button
                            type="button"
                            className={financeButton + ' mt-3'}
                            onClick={() =>
                                setRevision(
                                    value => value + 1,
                                )
                            }
                        >
                            <RefreshCw size={14} />
                            {text(
                                'إعادة المحاولة',
                                'Retry',
                            )}
                        </button>
                    </div>
                ) : tab === 'history' ? (
                    records.length === 0 ? (
                        <EmptyState
                            ar={ar}
                            history
                        />
                    ) : (
                        <div className="divide-y divide-[#edf3fa]">
                            {records.map(record => (
                                <div
                                    key={record.id}
                                    className="grid gap-3 p-4 text-xs md:grid-cols-[1.4fr_1fr_1fr_1fr]"
                                >
                                    <div>
                                        <strong className="text-[var(--ac-text)]">
                                            {record.title}
                                        </strong>
                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {record.counterparty
                                                ?? '—'}
                                        </p>
                                    </div>

                                    <span>
                                        {record.paid_on}
                                    </span>

                                    <span>
                                        {record.method}
                                    </span>

                                    <strong className="text-[var(--ac-text)]">
                                        <Money
                                            value={record.amount}
                                            currency={record.currency}
                                            compact
                                        />
                                    </strong>
                                </div>
                            ))}
                        </div>
                    )
                ) : plans.length === 0 ? (
                    <EmptyState ar={ar} />
                ) : (
                    <div className="grid gap-3 p-4 lg:grid-cols-2">
                        {plans.map(plan => (
                            <article
                                key={plan.id}
                                className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 transition hover:border-[var(--ac-line-strong)] hover:shadow-[0_8px_24px_rgba(18,101,216,.06)]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="font-bold text-[var(--ac-text)]">
                                            {plan.title}
                                        </h3>
                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {plan.counterparty
                                                ?? text(
                                                    'بدون طرف محدد',
                                                    'No party specified',
                                                )}
                                        </p>
                                    </div>

                                    <span
                                        className={[
                                            'rounded-full px-2.5 py-1 text-[9px] font-semibold',
                                            plan.direction === 'outgoing'
                                                ? 'bg-amber-50 text-amber-700'
                                                : 'bg-emerald-50 text-emerald-700',
                                        ].join(' ')}
                                    >
                                        {plan.direction === 'outgoing'
                                            ? text(
                                                'دفع',
                                                'Outgoing',
                                            )
                                            : text(
                                                'قبض',
                                                'Incoming',
                                            )}
                                    </span>
                                </div>

                                <div className="mt-4 flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-[10px] text-[var(--ac-text-muted)]">
                                            {text(
                                                'المبلغ',
                                                'Amount',
                                            )}
                                        </p>
                                        <strong className="mt-1 block text-xl text-[var(--ac-text)]">
                                            <Money
                                                value={plan.amount}
                                                currency={plan.currency}
                                            />
                                        </strong>
                                    </div>

                                    <div className="text-end">
                                        <p className="text-[10px] text-[var(--ac-text-muted)]">
                                            {text(
                                                'الاستحقاق القادم',
                                                'Next due',
                                            )}
                                        </p>
                                        <strong className="mt-1 block text-xs text-[var(--ac-text)]">
                                            {plan.next_due_on}
                                        </strong>
                                    </div>
                                </div>

                                {(plan.due || plan.reminder) && (
                                    <div className="mt-3 rounded-[10px] bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-700">
                                        {plan.due
                                            ? text(
                                                'مستحق الآن',
                                                'Due now',
                                            )
                                            : text(
                                                'اقترب موعد الاستحقاق',
                                                'Due soon',
                                            )}
                                    </div>
                                )}

                                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--ac-line)] pt-3">
                                    {canRecord && plan.active && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            className={financePrimary}
                                            onClick={() => {
                                                setSelected(plan);
                                                setError('');
                                                setSuccess('');
                                            }}
                                        >
                                            <ReceiptText size={14} />
                                            {text(
                                                'تسجيل الحركة',
                                                'Record',
                                            )}
                                        </button>
                                    )}

                                    {canManage && !plan.completed && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            className={financeButton}
                                            onClick={() =>
                                                void mutate(
                                                    '/api/payment-plans/'
                                                    + plan.id,
                                                    {
                                                        active:
                                                            !plan.active,
                                                    },
                                                    'PATCH',
                                                )
                                            }
                                        >
                                            {plan.active
                                                ? <CirclePause size={14} />
                                                : <CirclePlay size={14} />}

                                            {plan.active
                                                ? text(
                                                    'إيقاف مؤقت',
                                                    'Pause',
                                                )
                                                : text(
                                                    'استئناف',
                                                    'Resume',
                                                )}
                                        </button>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}

                {!loading
                    && !loadError
                    && lastPage > 1 && (
                    <div className="flex items-center justify-between border-t border-[var(--ac-line)] p-4 text-xs text-[var(--ac-text-muted)]">
                        <button
                            type="button"
                            className={financeButton}
                            disabled={page <= 1}
                            onClick={() =>
                                setPage(
                                    value => value - 1,
                                )
                            }
                        >
                            {text(
                                'السابق',
                                'Previous',
                            )}
                        </button>

                        <span>
                            {page}
                            {' / '}
                            {lastPage}
                        </span>

                        <button
                            type="button"
                            className={financeButton}
                            disabled={page >= lastPage}
                            onClick={() =>
                                setPage(
                                    value => value + 1,
                                )
                            }
                        >
                            {text(
                                'التالي',
                                'Next',
                            )}
                        </button>
                    </div>
                )}
            </FPanel>
        </div>
    );
}

function EmptyState({
    ar,
    history = false,
}: {
    ar: boolean;
    history?: boolean;
}) {
    return (
        <div className="p-14 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-blue-50 text-[var(--ac-accent)]">
                {history
                    ? <ReceiptText size={22} />
                    : <CalendarClock size={22} />}
            </span>

            <h3 className="mt-4 text-sm font-bold text-[var(--ac-text)]">
                {ar
                    ? (
                        history
                            ? 'لا توجد حركات مسجلة بعد'
                            : 'لا توجد مدفوعات متكررة بعد'
                    )
                    : (
                        history
                            ? 'No recorded movements yet'
                            : 'No recurring payments yet'
                    )}
            </h3>

            <p className="mt-2 text-xs text-[var(--ac-text-muted)]">
                {ar
                    ? (
                        history
                            ? 'عند تسجيل دفعة أو قبض ستظهر هنا.'
                            : 'استخدم قسم الإضافة أعلاه لإنشاء أول التزام متكرر.'
                    )
                    : (
                        history
                            ? 'Recorded payments and receipts will appear here.'
                            : 'Use the add section above to create your first recurring obligation.'
                    )}
            </p>
        </div>
    );
}

function ChoiceField({
    name,
    label,
    options,
    defaultValue,
    onChange,
}: {
    name: string;
    label: string;
    options: {
        value: string;
        label: string;
    }[];
    defaultValue?: string;
    onChange?: (
        value: string,
    ) => void;
}) {
    return (
        <fieldset className="min-w-0">
            <legend className="text-[11px] font-semibold text-[var(--ac-text-soft)]">
                {label}
            </legend>

            <div className="mt-2 flex flex-wrap gap-2">
                {options.map(option => (
                    <label
                        key={option.value}
                        className="cursor-pointer"
                    >
                        <input
                            type="radio"
                            name={name}
                            value={option.value}
                            onChange={() =>
                                onChange?.(
                                    option.value,
                                )
                            }
                            defaultChecked={
                                defaultValue === option.value
                            }
                            required
                            className="peer sr-only"
                        />

                        <span className="block rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3.5 py-2.5 text-[10px] font-semibold text-[var(--ac-text-soft)] transition peer-checked:border-[var(--ac-line-strong)] peer-checked:bg-blue-50 peer-checked:text-[var(--ac-accent)]">
                            {option.label}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
