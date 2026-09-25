import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Bot,
    CalendarDays,
    Check,
    ChevronDown,
    CircleAlert,
    CircleHelp,
    CreditCard,
    Crown,
    ExternalLink,
    FileText,
    HardDrive,
    LoaderCircle,
    Plus,
    Puzzle,
    ReceiptText,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    UsersRound,
    WalletCards,
    Zap,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    BillingPurchaseDialog,
    type BillingAiCredits,
    type BillingPurchaseKind,
} from './BillingPurchaseDialog';

type BillingPrice = {
    available: boolean;
    amount_minor: number | null;
    currency: string | null;
};

type BillingPlan = {
    key: string;
    name_ar: string;
    name_en: string;
    description_ar: string;
    description_en: string;
    recommended: boolean;
    features_ar: string[];
    features_en: string[];
    limits: {
        seats: number | null;
        storage_bytes: number | null;
    };
    month: BillingPrice;
    year: BillingPrice;
};

type BillingAddon = {
    key: string;
    name_ar: string;
    name_en: string;
    description_ar: string;
    description_en: string;
    unit: string;
    quantity_per_pack: number;
    amount_minor: number;
    currency: string;
    interval: 'month' | 'year';
    active_quantity: number;
    available: boolean;
};

type BillingOverview = {
    payments_available: boolean;
    plans: BillingPlan[];
    subscription: null | {
        plan_key: string | null;
        name_ar: string;
        name_en: string;
        status: string | null;
        interval: string | null;
        amount_minor: number | null;
        currency: string | null;
        renews_at: string | null;
        trial_ends_at: string | null;
        cancel_at_period_end: boolean;
    };
    next_invoice: null | {
        amount_minor: number;
        currency: string;
        due_at: string | null;
        estimated: boolean;
    };
    payment_method: null | {
        brand: string | null;
        last4: string;
        expires_month: number | null;
        expires_year: number | null;
    };
    invoices: Array<{
        id: string;
        number: string | null;
        status: string | null;
        amount_due_minor: number;
        amount_paid_minor: number;
        currency: string | null;
        issued_at: string | null;
        due_at: string | null;
        paid_at: string | null;
        url: string | null;
    }>;
    addons: {
        catalog: BillingAddon[];
        active: Record<string, {
            quantity: number;
            entitlement: number;
            amount_minor: number;
            currency: string;
        }>;
    };
    ai_credits: BillingAiCredits;
    currency: string;
    usage: {
        period: {
            from: string;
            to: string;
        };
        seats: {
            used: number;
            limit: number | null;
        };
        ai_tokens: {
            used: number;
            messages: number;
            limit: number | null;
        };
        storage: {
            available: boolean;
            used_bytes: number | null;
            limit_bytes: number | null;
        };
    };
};

const panel =
    'rounded-[20px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-[0_14px_38px_rgba(15,40,80,.055)]';

const outlineButton =
    'inline-flex items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-line-strong)] bg-transparent px-3.5 py-2.5 text-[9px] font-bold text-[var(--acs-text)] transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45';

const primaryButton =
    'inline-flex items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-accent)] bg-[var(--acs-accent)] px-4 py-2.5 text-[9px] font-bold text-white shadow-[0_8px_20px_rgba(35,120,220,.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45';

function money(
    amountMinor: number | null,
    currency: string | null,
    locale: string,
): string {
    if (amountMinor === null || ! currency) return '—';

    try {
        const hasCents = Math.abs(amountMinor) % 100 !== 0;
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: hasCents ? 2 : 0,
            maximumFractionDigits: 2,
        }).format(amountMinor / 100);
    } catch {
        return `${(amountMinor / 100).toFixed(2)} ${currency}`;
    }
}

function dateLabel(value: string | null, locale: string): string {
    if (! value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date);
}

function bytes(value: number | null): string {
    if (value === null) return '—';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let current = value;
    let unit = 0;

    while (current >= 1024 && unit < units.length - 1) {
        current /= 1024;
        unit += 1;
    }

    return `${current.toLocaleString(undefined, {
        maximumFractionDigits: current >= 10 ? 0 : 1,
    })} ${units[unit]}`;
}

function compactNumber(value: number, locale: string): string {
    return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

function percent(used: number | null, limit: number | null): number | null {
    if (used === null || limit === null || limit <= 0) return null;
    return Math.min(100, Math.max(0, used / limit * 100));
}

function ResourceCard({
    icon: Icon,
    label,
    value,
    meta,
    usagePercent,
    actionLabel,
    addonHint,
    onAction,
    disabled,
    busy,
}: {
    icon: typeof UsersRound;
    label: string;
    value: string;
    meta: string;
    usagePercent: number | null;
    actionLabel: string;
    addonHint?: string;
    onAction: () => void;
    disabled: boolean;
    busy: boolean;
}) {
    return (
        <article className={panel + ' flex min-h-[190px] flex-col p-4'}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[9px] font-bold text-[var(--acs-text-soft)]">{label}</p>
                    <strong className="mt-1.5 block text-lg font-extrabold tracking-tight text-[var(--acs-text)] sm:text-xl">{value}</strong>
                </div>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                    <Icon size={17} />
                </span>
            </div>

            <div className="mt-3">
                <div className="flex items-center justify-between gap-2 text-[8px] font-bold text-[var(--acs-text-muted)]">
                    <span>{meta}</span>
                    {usagePercent !== null && <span>{Math.round(usagePercent)}%</span>}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--acs-surface-strong)]">
                    <div
                        className="h-full rounded-full bg-[var(--acs-accent)] transition-all duration-300"
                        style={{ width: `${usagePercent ?? 0}%` }}
                    />
                </div>
                {addonHint && (
                    <p className="mt-2 text-[8px] font-semibold text-[var(--acs-accent)]">{addonHint}</p>
                )}
            </div>

            <button
                type="button"
                className={outlineButton + ' mt-auto w-full'}
                onClick={onAction}
                disabled={disabled}
            >
                {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={13} />}
                {actionLabel}
            </button>
        </article>
    );
}

export function BillingPanel() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = useCallback(
        (arabic: string, english: string): string => ar ? arabic : english,
        [ar],
    );

    const [overview, setOverview] = useState<BillingOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [actionLoading, setActionLoading] = useState('');
    const [interval, setInterval] = useState<'month' | 'year'>('month');
    const [showAllInvoices, setShowAllInvoices] = useState(false);
    const [purchaseKind, setPurchaseKind] = useState<BillingPurchaseKind | null>(null);

    const loadOverview = useCallback(
        async (signal?: AbortSignal): Promise<void> => {
            const response = await apiRequest<{ data: BillingOverview }>(
                '/api/billing/overview',
                { signal },
            );

            if (! signal?.aborted) setOverview(response.data);
        },
        [],
    );

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');

        loadOverview(controller.signal)
            .catch((failure: unknown) => {
                if (controller.signal.aborted) return;
                setError(
                    failure instanceof ApiError
                        ? failure.message
                        : text('تعذر تحميل معلومات الاشتراك.', 'Could not load subscription information.'),
                );
            })
            .finally(() => {
                if (! controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [loadOverview, text]);

    const checkoutState = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return new URLSearchParams(window.location.search).get('checkout');
    }, []);

    const creditState = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return new URLSearchParams(window.location.search).get('credit');
    }, []);

    async function refreshOverview(): Promise<void> {
        if (actionLoading) return;
        setActionLoading('sync');
        setActionError('');
        setSuccessMessage('');

        try {
            await loadOverview();
            setSuccessMessage(text('تمت مزامنة بيانات الفوترة.', 'Billing data synced.'));
        } catch (failure) {
            setActionError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذرت مزامنة بيانات الفوترة.', 'Could not sync billing data.'),
            );
        } finally {
            setActionLoading('');
        }
    }

    async function startCheckout(plan: BillingPlan): Promise<void> {
        if (actionLoading) return;
        setActionLoading(`checkout:${plan.key}`);
        setActionError('');

        try {
            const response = await apiRequest<{ data: { url: string } }>(
                '/api/billing/checkout',
                {
                    method: 'POST',
                    body: JSON.stringify({ plan: plan.key, interval }),
                },
            );
            window.location.assign(response.data.url);
        } catch (failure) {
            setActionError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر بدء الدفع. حاول مرة أخرى.', 'Could not start checkout. Please try again.'),
            );
            setActionLoading('');
        }
    }

    async function openSubscriptionManagement(action = 'portal'): Promise<void> {
        if (actionLoading) return;
        setActionLoading(action);
        setActionError('');

        try {
            const response = await apiRequest<{ data: { url: string } }>(
                '/api/billing/portal',
                { method: 'POST' },
            );
            window.location.assign(response.data.url);
        } catch (failure) {
            setActionError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر فتح إدارة الاشتراك. حاول مرة أخرى.', 'Could not open subscription management. Please try again.'),
            );
            setActionLoading('');
        }
    }

    function addon(key: string): BillingAddon | null {
        return overview?.addons.catalog.find(item => item.key === key) ?? null;
    }

    if (loading) {
        return (
            <div className={panel + ' flex min-h-64 items-center justify-center'}>
                <LoaderCircle size={24} className="animate-spin text-[var(--acs-accent)]" />
            </div>
        );
    }

    if (error || ! overview) {
        return (
            <div className={panel + ' flex items-start gap-3 p-5'}>
                <CircleAlert className="mt-0.5 shrink-0 text-amber-500" size={18} />
                <div>
                    <strong className="text-xs text-[var(--acs-text)]">{text('تعذر تحميل الاشتراك', 'Subscription unavailable')}</strong>
                    <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">{error}</p>
                </div>
            </div>
        );
    }

    const status = overview.subscription?.status ?? null;
    const unlocked = status === 'active' || status === 'trialing';
    const manageable = overview.subscription
        && ! [null, 'canceled', 'incomplete_expired'].includes(status);
    const showPlans = ! manageable;
    const seatsPercent = percent(overview.usage.seats.used, overview.usage.seats.limit);
    const aiPercent = percent(overview.usage.ai_tokens.used, overview.usage.ai_tokens.limit);
    const storagePercent = overview.usage.storage.available
        ? percent(overview.usage.storage.used_bytes, overview.usage.storage.limit_bytes)
        : null;

    const seatsAddon = addon('extra_seats_5');
    const storageAddon = addon('storage_25gb');

    const statusLabel = (() => {
        switch (status) {
            case 'active': return text('نشط', 'Active');
            case 'trialing': return text('فترة تجريبية', 'Trial');
            case 'past_due': return text('الدفع متأخر', 'Payment due');
            case 'unpaid': return text('تحديث الدفع مطلوب', 'Payment update required');
            case 'canceled': return text('ملغي', 'Canceled');
            default: return text('غير مشترك', 'Not subscribed');
        }
    })();

    const invoiceStatus = (value: string | null): string => {
        switch (value) {
            case 'paid': return text('مدفوع', 'Paid');
            case 'open': return text('مستحق', 'Open');
            case 'void': return text('ملغي', 'Void');
            case 'uncollectible': return text('متعذر التحصيل', 'Uncollectible');
            default: return value ?? '—';
        }
    };

    return (
        <div className="space-y-4">
            {checkoutState === 'success' && (
                <div className="flex items-center gap-2.5 rounded-[14px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[9px] text-[var(--acs-text)]">
                    <ShieldCheck size={16} className="shrink-0 text-emerald-500" />
                    {text('تمت عملية الدفع، وسيتم تأكيد الاشتراك تلقائيًا.', 'Payment completed. Your subscription will be confirmed automatically.')}
                </div>
            )}

            {checkoutState === 'cancelled' && (
                <div className="flex items-center gap-2 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-4 py-3 text-[9px] text-[var(--acs-text-muted)]">
                    <CircleAlert size={15} />
                    {text('لم يتم إكمال الدفع ولم يتغير اشتراكك.', 'Checkout was not completed and your subscription was not changed.')}
                </div>
            )}

            {creditState === 'success' && (
                <div className="flex items-center gap-2.5 rounded-[14px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[9px] text-[var(--acs-text)]">
                    <ShieldCheck size={16} className="shrink-0 text-emerald-500" />
                    {text('تم دفع رصيد AccoNova AI. سيظهر الرصيد بعد تأكيد Stripe مباشرة.', 'AccoNova AI credits were paid. The balance appears as soon as Stripe confirms the payment.')}
                </div>
            )}

            {creditState === 'cancelled' && (
                <div className="flex items-center gap-2 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-4 py-3 text-[9px] text-[var(--acs-text-muted)]">
                    <CircleAlert size={15} />
                    {text('تم إلغاء شراء رصيد AI ولم يتم خصم أي مبلغ.', 'AI credit purchase was cancelled and no charge was completed.')}
                </div>
            )}

            {successMessage && (
                <div className="flex items-center gap-2 rounded-[14px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[9px] text-emerald-600">
                    <ShieldCheck size={15} />
                    {successMessage}
                </div>
            )}

            {actionError && (
                <div role="alert" className="rounded-[12px] border border-red-400/25 bg-red-500/8 px-3.5 py-2.5 text-[9px] text-red-500">
                    {actionError}
                </div>
            )}

            {showPlans && (
                <section className={panel + ' overflow-hidden'}>
                    <div className="flex flex-col gap-4 border-b border-[var(--acs-line)] px-5 py-5 sm:flex-row sm:items-end sm:justify-between lg:px-6">
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]"><Sparkles size={17} /></span>
                            <div>
                                <h2 className="text-base font-bold text-[var(--acs-text)]">{text('اختر الباقة المناسبة لشركتك', 'Choose the right plan for your company')}</h2>
                                <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">{text('اختر السعة والمزايا التي تناسب فريقك ويمكنك تغييرها لاحقًا.', 'Choose the capacity and features that fit your team. You can change them later.')}</p>
                            </div>
                        </div>

                        <div className="inline-flex rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-1">
                            {(['month', 'year'] as const).map(item => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setInterval(item)}
                                    className={[
                                        'rounded-[9px] px-3.5 py-2 text-[9px] font-bold transition',
                                        interval === item
                                            ? 'bg-[var(--acs-surface)] text-[var(--acs-text)] shadow-sm ring-1 ring-[var(--acs-line-strong)]'
                                            : 'text-[var(--acs-text-muted)] hover:text-[var(--acs-text)]',
                                    ].join(' ')}
                                >
                                    {item === 'month' ? text('شهري', 'Monthly') : text('سنوي', 'Yearly')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-3 p-4 lg:grid-cols-3 lg:p-6">
                        {overview.plans.map(plan => {
                            const price = plan[interval];
                            const features = ar ? plan.features_ar : plan.features_en;
                            const busy = actionLoading === `checkout:${plan.key}`;

                            return (
                                <article
                                    key={plan.key}
                                    className={[
                                        'relative flex min-h-[360px] flex-col rounded-[18px] border p-5 transition',
                                        plan.recommended
                                            ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] shadow-[0_16px_35px_rgba(35,120,220,.09)]'
                                            : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                    ].join(' ')}
                                >
                                    {plan.recommended && (
                                        <span className="absolute end-4 top-4 rounded-full border border-[var(--acs-accent)]/30 bg-[var(--acs-surface)] px-2.5 py-1 text-[8px] font-bold text-[var(--acs-accent)]">{text('الأكثر اختيارًا', 'Most popular')}</span>
                                    )}
                                    <div className="pe-20">
                                        <h3 className="text-lg font-bold text-[var(--acs-text)]">{ar ? plan.name_ar : plan.name_en}</h3>
                                        <p className="mt-1 min-h-10 text-[9px] leading-5 text-[var(--acs-text-muted)]">{ar ? plan.description_ar : plan.description_en}</p>
                                    </div>
                                    <div className="mt-5 flex items-end gap-1.5">
                                        <strong className="text-3xl font-extrabold tracking-[-0.04em] text-[var(--acs-text)]">{money(price.amount_minor, price.currency, locale)}</strong>
                                        <span className="mb-1 text-[9px] font-semibold text-[var(--acs-text-muted)]">/ {interval === 'month' ? text('شهر', 'month') : text('سنة', 'year')}</span>
                                    </div>
                                    <div className="my-5 h-px bg-[var(--acs-line)]" />
                                    <ul className="flex-1 space-y-2.5">
                                        {features.map(feature => (
                                            <li key={feature} className="flex items-start gap-2 text-[9px] leading-5 text-[var(--acs-text-soft)]">
                                                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check size={10} strokeWidth={3} /></span>
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        disabled={! price.available || actionLoading !== ''}
                                        onClick={() => void startCheckout(plan)}
                                        className={(plan.recommended ? primaryButton : outlineButton) + ' mt-5 w-full'}
                                    >
                                        {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Zap size={14} />}
                                        {text(`ابدأ مع ${plan.name_ar}`, `Choose ${plan.name_en}`)}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {manageable && (
                <>
                    <section className={panel + ' overflow-hidden'}>
                        <div className="relative overflow-hidden px-5 py-5 lg:px-6 lg:py-6">
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(38,132,255,.09),transparent_34%)]" />
                            <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                                <div className="flex items-start gap-4">
                                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[17px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]"><WalletCards size={24} /></span>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[9px] font-bold text-[var(--acs-text-muted)]">{text('الباقة الحالية', 'Current plan')}</span>
                                            <span className={[
                                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8px] font-bold',
                                                unlocked ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-500' : 'border-amber-400/25 bg-amber-500/10 text-amber-500',
                                            ].join(' ')}>
                                                <span className="size-1.5 rounded-full bg-current" />{statusLabel}
                                            </span>
                                        </div>
                                        <h2 className="mt-1 text-lg font-extrabold text-[var(--acs-text)] sm:text-xl">{ar ? overview.subscription?.name_ar : overview.subscription?.name_en}</h2>
                                        <p className="mt-1 max-w-xl text-[9px] leading-5 text-[var(--acs-text-muted)]">{text('إدارة الباقة والموارد وطريقة الدفع والفواتير من مكان واحد.', 'Manage your plan, resources, payment method and invoices in one place.')}</p>
                                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                                            <div>
                                                <span className="block text-[8px] font-semibold text-[var(--acs-text-muted)]">{text('السعر الحالي', 'Current price')}</span>
                                                <strong className="mt-0.5 block text-sm text-[var(--acs-text)]">
                                                    {money(overview.subscription?.amount_minor ?? null, overview.subscription?.currency ?? overview.currency, locale)}{' '}
                                                    <span className="text-[9px] font-semibold text-[var(--acs-text-muted)]">/ {overview.subscription?.interval === 'year' ? text('سنويًا', 'year') : text('شهريًا', 'month')}</span>
                                                </strong>
                                            </div>
                                            <div className="border-s border-[var(--acs-line)] ps-5">
                                                <span className="flex items-center gap-1.5 text-[8px] font-semibold text-[var(--acs-text-muted)]"><CalendarDays size={11} />{overview.subscription?.cancel_at_period_end ? text('ينتهي الاشتراك', 'Subscription ends') : text('التجديد القادم', 'Next renewal')}</span>
                                                <strong className="mt-0.5 block text-[10px] text-[var(--acs-text)]">{dateLabel(overview.subscription?.renews_at ?? null, locale)}</strong>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid min-w-[245px] gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                    <button type="button" className={primaryButton} disabled={actionLoading !== '' || ! overview.payments_available} onClick={() => void openSubscriptionManagement('upgrade')}>
                                        {actionLoading === 'upgrade' ? <LoaderCircle size={13} className="animate-spin" /> : <Crown size={13} />}{text('ترقية الباقة', 'Upgrade plan')}
                                    </button>
                                    <button type="button" className={outlineButton} disabled={actionLoading !== '' || ! overview.payments_available} onClick={() => void openSubscriptionManagement('change-plan')}>
                                        {actionLoading === 'change-plan' ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}{text('تغيير / خفض الباقة', 'Change / downgrade')}
                                    </button>
                                    <button type="button" className={outlineButton + ' sm:col-span-2 lg:col-span-1 xl:col-span-2'} disabled={actionLoading !== ''} onClick={() => void refreshOverview()}>
                                        {actionLoading === 'sync' ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}{text('مزامنة الفوترة', 'Sync billing')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-3 md:grid-cols-3">
                        <ResourceCard
                            icon={UsersRound}
                            label={text('الموظفون / المقاعد', 'Employees / seats')}
                            value={`${overview.usage.seats.used} / ${overview.usage.seats.limit ?? '∞'}`}
                            meta={text('استخدام المقاعد المتاحة في باقتك.', 'Seat usage in your current plan.')}
                            usagePercent={seatsPercent}
                            actionLabel={text('زيادة المقاعد', 'Add seats')}
                            addonHint={seatsAddon ? `${money(seatsAddon.amount_minor, seatsAddon.currency, locale)} / ${seatsAddon.interval === 'year' ? text('سنة لكل 5 مقاعد', 'year per 5 seats') : text('شهر لكل 5 مقاعد', 'month per 5 seats')}` : undefined}
                            onAction={() => setPurchaseKind('seats')}
                            disabled={actionLoading !== '' || ! overview.payments_available || ! seatsAddon?.available}
                            busy={false}
                        />
                        <ResourceCard
                            icon={Bot}
                            label={text('استخدام AccoNova AI', 'AccoNova AI usage')}
                            value={`${compactNumber(overview.usage.ai_tokens.used, locale)} / ${overview.usage.ai_tokens.limit === null ? '∞' : compactNumber(overview.usage.ai_tokens.limit, locale)} Tokens`}
                            meta={text('استهلاك الباقة الشهرية، وبعدها يُستخدم رصيدك الإضافي.', 'Monthly included usage, then your purchased wallet is used.')}
                            usagePercent={aiPercent}
                            actionLabel={text('إضافة رصيد', 'Add credits')}
                            addonHint={`${text('الرصيد الإضافي', 'Extra balance')}: ${compactNumber(overview.ai_credits.balance_tokens, locale)} Tokens`}
                            onAction={() => setPurchaseKind('ai')}
                            disabled={actionLoading !== '' || ! overview.payments_available}
                            busy={false}
                        />
                        <ResourceCard
                            icon={HardDrive}
                            label={text('التخزين', 'Storage')}
                            value={overview.usage.storage.available ? `${bytes(overview.usage.storage.used_bytes)} / ${bytes(overview.usage.storage.limit_bytes)}` : bytes(overview.usage.storage.limit_bytes)}
                            meta={text('سعة التخزين المشمولة في الباقة الحالية.', 'Storage included in your current plan.')}
                            usagePercent={storagePercent}
                            actionLabel={text('زيادة التخزين', 'Add storage')}
                            addonHint={storageAddon ? `${money(storageAddon.amount_minor, storageAddon.currency, locale)} / ${storageAddon.interval === 'year' ? text('سنة لكل 25 GB', 'year per 25 GB') : text('شهر لكل 25 GB', 'month per 25 GB')}` : undefined}
                            onAction={() => setPurchaseKind('storage')}
                            disabled={actionLoading !== '' || ! overview.payments_available || ! storageAddon?.available}
                            busy={false}
                        />
                    </section>

                    <section className="grid gap-3 lg:grid-cols-2">
                        <article className={panel + ' overflow-hidden'}>
                            <div className="flex items-start justify-between gap-3 border-b border-[var(--acs-line)] px-5 py-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]"><CreditCard size={17} /></span>
                                    <div><h3 className="text-xs font-bold text-[var(--acs-text)]">{text('طريقة الدفع', 'Payment method')}</h3><p className="mt-1 text-[8px] text-[var(--acs-text-muted)]">{text('وسيلة الدفع المستخدمة للاشتراك وإعادة شحن AI عند تفعيلها.', 'Payment method used for the subscription and AI auto-recharge when enabled.')}</p></div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-3 p-5">
                                <div>
                                    <strong className="text-[10px] text-[var(--acs-text)]">{overview.payment_method ? `${overview.payment_method.brand ?? text('بطاقة', 'Card')} •••• ${overview.payment_method.last4}` : text('لا توجد بطاقة محفوظة', 'No saved card')}</strong>
                                    {overview.payment_method?.expires_month && overview.payment_method.expires_year && <p className="mt-1 text-[8px] text-[var(--acs-text-muted)]">{text('تنتهي', 'Expires')} {overview.payment_method.expires_month}/{overview.payment_method.expires_year}</p>}
                                </div>
                                <button type="button" className={outlineButton} disabled={actionLoading !== '' || ! overview.payments_available} onClick={() => void openSubscriptionManagement('payment')}><CreditCard size={12} />{text('تحديث وسيلة الدفع', 'Update payment')}</button>
                            </div>
                        </article>

                        <article className={panel + ' overflow-hidden'}>
                            <div className="flex items-start justify-between gap-3 border-b border-[var(--acs-line)] px-5 py-4">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]"><ReceiptText size={17} /></span>
                                    <div><h3 className="text-xs font-bold text-[var(--acs-text)]">{text('الفواتير السابقة', 'Previous invoices')}</h3><p className="mt-1 text-[8px] text-[var(--acs-text-muted)]">{text('آخر الفواتير والمدفوعات الخاصة باشتراكك.', 'Recent invoices and subscription payments.')}</p></div>
                                </div>
                                {overview.invoices.length > 2 && <button type="button" className={outlineButton} onClick={() => setShowAllInvoices(current => ! current)}><FileText size={12} />{showAllInvoices ? text('عرض أقل', 'Show less') : text('عرض الكل', 'View all')}</button>}
                            </div>
                            {overview.invoices.length === 0 ? <div className="p-5 text-[9px] text-[var(--acs-text-muted)]">{text('لا توجد فواتير سابقة بعد.', 'No previous invoices yet.')}</div> : (
                                <div className="divide-y divide-[var(--acs-line)]">
                                    {(showAllInvoices ? overview.invoices : overview.invoices.slice(0, 2)).map(invoice => (
                                        <div key={invoice.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3">
                                            <div className="min-w-0"><strong className="block truncate text-[9px] text-[var(--acs-text)]">{invoice.number ?? text('فاتورة اشتراك', 'Subscription invoice')}</strong><span className="mt-0.5 block text-[8px] text-[var(--acs-text-muted)]">{dateLabel(invoice.issued_at, locale)}</span></div>
                                            <div className="text-end"><strong className="block text-[9px] text-[var(--acs-text)]">{money(invoice.amount_due_minor, invoice.currency, locale)}</strong><span className="mt-0.5 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[7px] font-bold text-emerald-500">{invoiceStatus(invoice.status)}</span></div>
                                            {invoice.url ? <a href={invoice.url} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--acs-line)] text-[var(--acs-accent)] transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)]"><ExternalLink size={12} /></a> : <span className="size-8" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>
                    </section>

                    <section className={panel + ' p-5'}>
                        <div className="flex items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]"><Puzzle size={17} /></span>
                            <div><h3 className="text-xs font-bold text-[var(--acs-text)]">{text('إدارة السعة الإضافية', 'Extra capacity')}</h3><p className="mt-1 text-[8px] leading-4 text-[var(--acs-text-muted)]">{text('المقاعد والتخزين إضافات دورية على الاشتراك، بينما رصيد AI شراء مرن مرة واحدة ويمكن تفعيل إعادة شحنه.', 'Seats and storage are recurring subscription add-ons, while AI credits are flexible one-time purchases with optional auto-recharge.')}</p></div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                            {overview.addons.catalog.map(item => {
                                const resourceKind: BillingPurchaseKind | null = item.unit === 'seats'
                                    ? 'seats'
                                    : item.unit === 'storage_bytes'
                                        ? 'storage'
                                        : null;

                                return (
                                    <div key={item.key} className="rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3.5">
                                        <strong className="block text-[9px] text-[var(--acs-text)]">{ar ? item.name_ar : item.name_en}</strong>
                                        <p className="mt-1 min-h-8 text-[8px] leading-4 text-[var(--acs-text-muted)]">{ar ? item.description_ar : item.description_en}</p>
                                        <div className="mt-3 flex items-end justify-between gap-2"><span className="text-[10px] font-extrabold text-[var(--acs-text)]">{money(item.amount_minor, item.currency, locale)}</span><span className="text-[7px] text-[var(--acs-text-muted)]">{item.interval === 'year' ? text('/ سنة', '/ year') : text('/ شهر', '/ month')}</span></div>
                                        {item.active_quantity > 0 && <p className="mt-2 text-[8px] font-bold text-emerald-500">{text(`لديك ${item.active_quantity} حزمة إضافية`, `${item.active_quantity} extra pack(s) active`)}</p>}
                                        <button
                                            type="button"
                                            className={outlineButton + ' mt-3 w-full'}
                                            disabled={actionLoading !== '' || ! item.available || ! overview.payments_available || ! resourceKind}
                                            onClick={() => resourceKind && setPurchaseKind(resourceKind)}
                                        >
                                            <Plus size={12} />{text('اختيار الكمية', 'Choose quantity')}
                                        </button>
                                    </div>
                                );
                            })}

                            <div className="rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3.5">
                                <strong className="block text-[9px] text-[var(--acs-text)]">{text('رصيد AccoNova AI', 'AccoNova AI credits')}</strong>
                                <p className="mt-1 min-h-8 text-[8px] leading-4 text-[var(--acs-text-muted)]">{text('اشترِ المبلغ الذي تحتاجه فقط، مع خيار إعادة الشحن التلقائي.', 'Buy only the amount you need, with optional automatic recharge.')}</p>
                                <div className="mt-3 flex items-end justify-between gap-2"><span className="text-[10px] font-extrabold text-[var(--acs-text)]">{compactNumber(overview.ai_credits.balance_tokens, locale)} Tokens</span><span className="text-[7px] text-[var(--acs-text-muted)]">{overview.ai_credits.auto_recharge.enabled ? text('إعادة الشحن مفعلة', 'Auto-recharge on') : text('شراء مرن', 'Flexible top-up')}</span></div>
                                <button type="button" className={outlineButton + ' mt-3 w-full'} disabled={actionLoading !== '' || ! overview.payments_available} onClick={() => setPurchaseKind('ai')}>
                                    <Plus size={12} />{text('إضافة رصيد', 'Add credits')}
                                </button>
                            </div>
                        </div>
                    </section>
                </>
            )}

            {! overview.payments_available && (
                <div className="flex items-center gap-2 rounded-[12px] border border-amber-400/20 bg-amber-500/5 px-3.5 py-2.5 text-[9px] text-[var(--acs-text-muted)]">
                    <CircleAlert size={14} className="shrink-0 text-amber-500" />
                    {text('الدفع الإلكتروني غير متاح مؤقتًا. بيانات الاشتراك ستبقى ظاهرة ويمكنك المحاولة لاحقًا.', 'Online billing is temporarily unavailable. Your subscription details remain visible; please try again later.')}
                </div>
            )}

            <section className={panel + ' p-5'}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3"><span className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]"><CircleHelp size={17} /></span><div><h3 className="text-xs font-bold text-[var(--acs-text)]">{text('الأسئلة الشائعة', 'Frequently asked questions')}</h3><p className="mt-1 text-[8px] text-[var(--acs-text-muted)]">{text('إجابات سريعة عن الاشتراك والإضافات والدفع.', 'Quick answers about subscriptions, add-ons and billing.')}</p></div></div>
                    <ShieldCheck size={17} className="text-[var(--acs-accent)]" />
                </div>
                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                    {[
                        {
                            q: text('كيف يعمل رصيد AccoNova AI؟', 'How do AccoNova AI credits work?'),
                            a: text('تُستخدم حصة باقتك الشهرية أولًا، وبعد انتهائها يبدأ الخصم من الرصيد الإضافي الذي اشتريته. ويمكنك تفعيل إعادة الشحن التلقائي عند انخفاض الرصيد.', 'Your included monthly allowance is used first. After it is exhausted, usage is deducted from purchased credits. You can enable automatic recharge when the balance gets low.'),
                        },
                        {
                            q: text('كيف تعمل زيادة المقاعد والتخزين؟', 'How do seat and storage upgrades work?'),
                            a: text('تختار الكمية من نافذة الشراء، ثم نزيد كمية الإضافة على نفس اشتراك Stripe بدل إنشاء اشتراك جديد.', 'Choose the quantity in the purchase dialog, then we increase that add-on on the same Stripe subscription instead of creating a second subscription.'),
                        },
                        {
                            q: text('هل أدفع المبلغ كاملًا إذا زدت المقاعد منتصف الشهر؟', 'Do I pay the full amount for seats added mid-cycle?'),
                            a: text('Stripe يحسب الفرق النسبي للفترة الحالية تلقائيًا، وبعدها تدخل الإضافة في التجديد الدوري مع باقتك.', 'Stripe automatically prorates the current period, then the add-on renews with your plan.'),
                        },
                        {
                            q: text('هل AccoNova يخزن رقم البطاقة الكامل؟', 'Does AccoNova store my full card number?'),
                            a: text('لا. الدفع يتم عبر Stripe ولا نخزن رقم البطاقة الكامل داخل قاعدة بيانات AccoNova.', 'No. Payments run through Stripe and full card details are not stored in the AccoNova database.'),
                        },
                    ].map(item => (
                        <details key={item.q} className="group rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)]">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[9px] font-bold text-[var(--acs-text)]">{item.q}<ChevronDown size={13} className="shrink-0 text-[var(--acs-text-muted)] transition group-open:rotate-180" /></summary>
                            <p className="border-t border-[var(--acs-line)] px-3.5 py-3 text-[9px] leading-5 text-[var(--acs-text-muted)]">{item.a}</p>
                        </details>
                    ))}
                </div>
            </section>

            <BillingPurchaseDialog
                open={purchaseKind !== null}
                kind={purchaseKind}
                addon={purchaseKind === 'seats'
                    ? seatsAddon
                    : purchaseKind === 'storage'
                        ? storageAddon
                        : null}
                credits={overview.ai_credits}
                locale={locale}
                onClose={() => setPurchaseKind(null)}
                onCompleted={async message => {
                    await loadOverview();
                    setSuccessMessage(message);
                }}
            />
        </div>
    );
}
