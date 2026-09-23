import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Bot,
    CalendarClock,
    Check,
    CheckCircle2,
    ChevronDown,
    CircleAlert,
    CreditCard,
    ExternalLink,
    HardDrive,
    LoaderCircle,
    LockKeyhole,
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
    'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--acs-line-strong)] bg-transparent px-4 py-2.5 text-[10px] font-bold text-[var(--acs-text)] transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45';

const primaryButton =
    'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--acs-accent)] bg-[var(--acs-accent)] px-4 py-2.5 text-[10px] font-bold text-white shadow-[0_8px_20px_rgba(35,120,220,.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45';

function money(
    amountMinor: number | null,
    currency: string | null,
    locale: string,
): string {
    if (amountMinor === null || ! currency) return '—';

    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 0,
        }).format(amountMinor / 100);
    } catch {
        return `${(amountMinor / 100).toFixed(0)} ${currency}`;
    }
}

function dateLabel(value: string | null, locale: string): string {
    if (! value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
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

function UsageCard({
    icon: Icon,
    label,
    value,
    meta,
    percent,
}: {
    icon: typeof UsersRound;
    label: string;
    value: string;
    meta: string;
    percent: number | null;
}) {
    return (
        <div className={panel + ' p-4'}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[9px] font-semibold text-[var(--acs-text-muted)]">
                        {label}
                    </p>
                    <strong className="mt-1.5 block text-xl font-bold tracking-tight text-[var(--acs-text)]">
                        {value}
                    </strong>
                </div>
                <span className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                    <Icon size={16} />
                </span>
            </div>

            {percent !== null && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--acs-surface-strong)]">
                    <div
                        className="h-full rounded-full bg-[var(--acs-accent)]"
                        style={{
                            width: `${Math.min(100, Math.max(0, percent))}%`,
                        }}
                    />
                </div>
            )}

            <p className="mt-2 text-[9px] leading-4 text-[var(--acs-text-muted)]">
                {meta}
            </p>
        </div>
    );
}

export function BillingPanel() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = useCallback(
        (arabic: string, english: string): string =>
            ar ? arabic : english,
        [ar],
    );

    const [overview, setOverview] = useState<BillingOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [actionLoading, setActionLoading] = useState('');
    const [interval, setInterval] = useState<'month' | 'year'>('month');

    const loadOverview = useCallback(
        async (signal?: AbortSignal): Promise<void> => {
            const response = await apiRequest<{ data: BillingOverview }>(
                '/api/billing/overview',
                { signal },
            );

            if (! signal?.aborted) {
                setOverview(response.data);
            }
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
                        : text(
                            'تعذر تحميل معلومات الاشتراك.',
                            'Could not load subscription information.',
                        ),
                );
            })
            .finally(() => {
                if (! controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [loadOverview, text]);

    const checkoutState = useMemo(() => {
        if (typeof window === 'undefined') return null;

        return new URLSearchParams(window.location.search)
            .get('checkout');
    }, []);

    async function startCheckout(plan: BillingPlan): Promise<void> {
        if (actionLoading) return;

        setActionLoading(`checkout:${plan.key}`);
        setActionError('');

        try {
            const response = await apiRequest<{
                data: { url: string };
            }>('/api/billing/checkout', {
                method: 'POST',
                body: JSON.stringify({
                    plan: plan.key,
                    interval,
                }),
            });

            window.location.assign(response.data.url);
        } catch (failure) {
            setActionError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر بدء الدفع. حاول مرة أخرى.',
                        'Could not start checkout. Please try again.',
                    ),
            );
            setActionLoading('');
        }
    }

    async function openSubscriptionManagement(): Promise<void> {
        if (actionLoading) return;

        setActionLoading('portal');
        setActionError('');

        try {
            const response = await apiRequest<{
                data: { url: string };
            }>('/api/billing/portal', {
                method: 'POST',
            });

            window.location.assign(response.data.url);
        } catch (failure) {
            setActionError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر فتح إدارة الاشتراك. حاول مرة أخرى.',
                        'Could not open subscription management. Please try again.',
                    ),
            );
            setActionLoading('');
        }
    }

    if (loading) {
        return (
            <div className={panel + ' flex min-h-56 items-center justify-center'}>
                <LoaderCircle
                    size={22}
                    className="animate-spin text-[var(--acs-accent)]"
                />
            </div>
        );
    }

    if (error || ! overview) {
        return (
            <div className={panel + ' flex items-start gap-3 p-5'}>
                <CircleAlert className="mt-0.5 shrink-0 text-amber-500" size={18} />
                <div>
                    <strong className="text-xs text-[var(--acs-text)]">
                        {text('تعذر تحميل الاشتراك', 'Subscription unavailable')}
                    </strong>
                    <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                        {error}
                    </p>
                </div>
            </div>
        );
    }

    const status = overview.subscription?.status ?? null;
    const unlocked = status === 'active' || status === 'trialing';
    const manageable = overview.subscription
        && ! [null, 'canceled', 'incomplete_expired'].includes(status);
    const showPlans = ! manageable;

    const statusLabel = (() => {
        switch (status) {
            case 'active': return text('اشتراك فعّال', 'Active subscription');
            case 'trialing': return text('فترة تجريبية', 'Trial');
            case 'past_due': return text('الدفع متأخر', 'Payment due');
            case 'unpaid': return text('تحديث الدفع مطلوب', 'Payment update required');
            case 'canceled': return text('الاشتراك ملغي', 'Canceled');
            default: return text('غير مشترك', 'Not subscribed');
        }
    })();

    const faq = [
        {
            q: text('هل أقدر أغيّر الباقة لاحقًا؟', 'Can I change plans later?'),
            a: text(
                'نعم. بعد الاشتراك تقدر تدير باقتك والتجديد وطريقة الدفع من مركز الاشتراك.',
                'Yes. After subscribing, you can manage your plan, renewal and payment method from the subscription center.',
            ),
        },
        {
            q: text('هل أقدر ألغي التجديد؟', 'Can I cancel renewal?'),
            a: text(
                'نعم. إذا تم إيقاف التجديد في نهاية الفترة، يبقى الوصول متاحًا حتى نهاية الفترة المدفوعة.',
                'Yes. If renewal is stopped at period end, access remains available through the paid period.',
            ),
        },
        {
            q: text('هل AccoNova يخزن رقم البطاقة الكامل؟', 'Does AccoNova store my full card number?'),
            a: text(
                'لا. AccoNova لا يخزن رقم البطاقة الكامل داخل قاعدة بيانات النظام.',
                'No. AccoNova does not store the full card number in the application database.',
            ),
        },
        {
            q: text('متى يفتح النظام بعد الدفع؟', 'When does access unlock after payment?'),
            a: text(
                'بعد تأكيد الاشتراك يتم تحديث حالة مساحة العمل تلقائيًا ويفتح النظام مباشرة.',
                'After the subscription is confirmed, the workspace updates automatically and access unlocks.',
            ),
        },
    ];

    const seatsPercent = overview.usage.seats.limit
        ? overview.usage.seats.used / overview.usage.seats.limit * 100
        : null;

    return (
        <div className="space-y-4">
            {checkoutState === 'success' && (
                <div className="flex items-center justify-between gap-3 rounded-[14px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={17} className="text-emerald-400" />
                        <div>
                            <strong className="block text-[10px] text-[var(--acs-text)]">
                                {text('تمت عملية الدفع', 'Payment completed')}
                            </strong>
                            <span className="text-[9px] text-[var(--acs-text-muted)]">
                                {text('يتم الآن تأكيد اشتراكك وفتح النظام.', 'Your subscription is being confirmed and access will unlock automatically.')}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={outlineButton}
                        onClick={() => void loadOverview()}
                    >
                        <RefreshCw size={13} />
                        {text('تحديث', 'Refresh')}
                    </button>
                </div>
            )}

            {checkoutState === 'cancelled' && (
                <div className="flex items-center gap-2 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-4 py-3 text-[9px] text-[var(--acs-text-muted)]">
                    <CircleAlert size={15} />
                    {text('لم يتم إكمال الدفع ولم يتغير اشتراكك.', 'Checkout was not completed and your subscription was not changed.')}
                </div>
            )}

            {showPlans && (
                <section className={panel + ' overflow-hidden'}>
                    <div className="flex flex-col gap-4 border-b border-[var(--acs-line)] px-5 py-5 sm:flex-row sm:items-end sm:justify-between lg:px-6">
                        <div className="flex items-center gap-2">
                            <span className="flex size-9 items-center justify-center rounded-[11px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                <Sparkles size={16} />
                            </span>
                            <div>
                                <h2 className="text-base font-bold text-[var(--acs-text)]">
                                    {text('اختر الباقة المناسبة لشركتك', 'Choose the right plan for your company')}
                                </h2>
                                <p className="mt-0.5 text-[9px] text-[var(--acs-text-muted)]">
                                    {text('كل الباقات تشمل أساسيات إدارة العمل. اختر السعة والمزايا التي تناسبك.', 'Every plan includes the core business tools. Choose the capacity and features that fit you.')}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {interval === 'year' && (
                                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[8px] font-bold text-emerald-400">
                                    {text('وفّر شهرين', 'Save 2 months')}
                                </span>
                            )}
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
                                        'relative flex min-h-[390px] flex-col rounded-[18px] border p-5 transition',
                                        plan.recommended
                                            ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] shadow-[0_16px_35px_rgba(35,120,220,.09)]'
                                            : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                    ].join(' ')}
                                >
                                    {plan.recommended && (
                                        <span className="absolute end-4 top-4 rounded-full border border-[var(--acs-accent)]/30 bg-[var(--acs-surface)] px-2.5 py-1 text-[8px] font-bold text-[var(--acs-accent)]">
                                            {text('الأكثر اختيارًا', 'Most popular')}
                                        </span>
                                    )}

                                    <div className="pe-20">
                                        <h3 className="text-lg font-bold text-[var(--acs-text)]">
                                            {ar ? plan.name_ar : plan.name_en}
                                        </h3>
                                        <p className="mt-1 min-h-10 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                            {ar ? plan.description_ar : plan.description_en}
                                        </p>
                                    </div>

                                    <div className="mt-5 flex items-end gap-1.5">
                                        <strong className="text-4xl font-extrabold tracking-[-0.04em] text-[var(--acs-text)]">
                                            {money(price.amount_minor, price.currency, locale)}
                                        </strong>
                                        <span className="mb-1 text-[9px] font-semibold text-[var(--acs-text-muted)]">
                                            / {interval === 'month' ? text('شهر', 'month') : text('سنة', 'year')}
                                        </span>
                                    </div>

                                    {interval === 'year' && plan.month.amount_minor !== null && (
                                        <p className="mt-1 text-[8px] font-semibold text-emerald-400">
                                            {text(
                                                `بدل ${money(plan.month.amount_minor * 12, plan.month.currency, locale)} سنويًا`,
                                                `Instead of ${money(plan.month.amount_minor * 12, plan.month.currency, locale)} per year`,
                                            )}
                                        </p>
                                    )}

                                    <div className="my-5 h-px bg-[var(--acs-line)]" />

                                    <ul className="flex-1 space-y-2.5">
                                        {features.map(feature => (
                                            <li key={feature} className="flex items-start gap-2 text-[9px] leading-5 text-[var(--acs-text-soft)]">
                                                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                                                    <Check size={10} strokeWidth={3} />
                                                </span>
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
                                        {busy ? (
                                            <LoaderCircle size={14} className="animate-spin" />
                                        ) : (
                                            <Zap size={14} />
                                        )}
                                        {text(`ابدأ مع ${plan.name_ar}`, `Choose ${plan.name_en}`)}
                                    </button>
                                </article>
                            );
                        })}
                    </div>

                    {! overview.payments_available && (
                        <div className="mx-4 mb-4 flex items-center gap-2 rounded-[12px] border border-amber-400/20 bg-amber-500/5 px-3.5 py-2.5 text-[9px] text-[var(--acs-text-muted)] lg:mx-6 lg:mb-6">
                            <CircleAlert size={14} className="shrink-0 text-amber-500" />
                            {text('الدفع الإلكتروني غير متاح مؤقتًا. الأسعار والباقات ظاهرة ويمكنك المحاولة لاحقًا.', 'Online checkout is temporarily unavailable. Plans and prices remain visible; please try again later.')}
                        </div>
                    )}

                    {actionError && (
                        <div role="alert" className="mx-4 mb-4 rounded-[12px] border border-red-400/25 bg-red-500/8 px-3.5 py-2.5 text-[9px] text-red-400 lg:mx-6 lg:mb-6">
                            {actionError}
                        </div>
                    )}
                </section>
            )}

            {showPlans && (
                <section className="grid gap-3 sm:grid-cols-3">
                    {[
                        {
                            icon: ShieldCheck,
                            title: text('دفع آمن', 'Secure checkout'),
                            copy: text('تتم عملية الدفع في صفحة آمنة ومخصصة.', 'Payment is completed in a secure hosted checkout.'),
                        },
                        {
                            icon: LockKeyhole,
                            title: text('بياناتك محمية', 'Card details protected'),
                            copy: text('لا نخزن رقم بطاقتك الكامل داخل AccoNova.', 'AccoNova does not store your full card number.'),
                        },
                        {
                            icon: CalendarClock,
                            title: text('تحكم كامل', 'Stay in control'),
                            copy: text('يمكنك إدارة التجديد وطريقة الدفع لاحقًا.', 'Manage renewal and payment details later.'),
                        },
                    ].map(item => (
                        <div key={item.title} className={panel + ' flex items-start gap-3 p-4'}>
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                <item.icon size={15} />
                            </span>
                            <div>
                                <strong className="text-[10px] text-[var(--acs-text)]">{item.title}</strong>
                                <p className="mt-1 text-[9px] leading-4 text-[var(--acs-text-muted)]">{item.copy}</p>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {manageable && (
                <>
                    <section className={panel + ' overflow-hidden'}>
                        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
                            <div className="flex items-start gap-3">
                                <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                    <WalletCards size={19} />
                                </span>
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-base font-bold text-[var(--acs-text)]">
                                            {ar ? overview.subscription?.name_ar : overview.subscription?.name_en}
                                        </h2>
                                        <span className={[
                                            'rounded-full border px-2.5 py-1 text-[8px] font-bold',
                                            unlocked
                                                ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-400'
                                                : 'border-amber-400/25 bg-amber-500/10 text-amber-400',
                                        ].join(' ')}>
                                            {statusLabel}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                        {overview.subscription?.renews_at
                                            ? overview.subscription.cancel_at_period_end
                                                ? text(`ينتهي في ${dateLabel(overview.subscription.renews_at, locale)}`, `Ends on ${dateLabel(overview.subscription.renews_at, locale)}`)
                                                : text(`التجديد في ${dateLabel(overview.subscription.renews_at, locale)}`, `Renews on ${dateLabel(overview.subscription.renews_at, locale)}`)
                                            : statusLabel}
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                className={primaryButton}
                                disabled={actionLoading !== '' || ! overview.payments_available}
                                onClick={() => void openSubscriptionManagement()}
                            >
                                {actionLoading === 'portal' ? <LoaderCircle size={14} className="animate-spin" /> : <CreditCard size={14} />}
                                {text('إدارة الاشتراك والدفع', 'Manage subscription')}
                            </button>
                        </div>

                        {! unlocked && (
                            <div className="border-t border-amber-400/20 bg-amber-500/5 px-5 py-3 text-[9px] text-amber-400 lg:px-6">
                                {text('الوصول للنظام متوقف حاليًا. حدّث طريقة الدفع من إدارة الاشتراك لاستعادة الوصول.', 'Workspace access is currently paused. Update payment details from subscription management to restore access.')}
                            </div>
                        )}
                    </section>

                    {actionError && (
                        <div role="alert" className="rounded-[12px] border border-red-400/25 bg-red-500/8 px-3.5 py-2.5 text-[9px] text-red-400">
                            {actionError}
                        </div>
                    )}

                    <section className="grid gap-3 md:grid-cols-3">
                        <UsageCard
                            icon={UsersRound}
                            label={text('المستخدمون', 'Users')}
                            value={`${overview.usage.seats.used}${overview.usage.seats.limit ? ` / ${overview.usage.seats.limit}` : ''}`}
                            meta={text('أعضاء مساحة العمل الحاليون', 'Current workspace members')}
                            percent={seatsPercent}
                        />
                        <UsageCard
                            icon={Bot}
                            label="AccoNova AI"
                            value={overview.usage.ai_tokens.messages.toLocaleString()}
                            meta={text('رسالة ذكية هذا الشهر', 'AI messages this month')}
                            percent={null}
                        />
                        <UsageCard
                            icon={HardDrive}
                            label={text('التخزين المشمول', 'Included storage')}
                            value={bytes(overview.usage.storage.limit_bytes)}
                            meta={text('سعة التخزين ضمن الباقة الحالية', 'Storage allocation for the current plan')}
                            percent={null}
                        />
                    </section>

                    <section className={panel + ' overflow-hidden'}>
                        <div className="grid md:grid-cols-3">
                            <div className="p-4 md:border-e md:border-[var(--acs-line)]">
                                <p className="text-[8px] font-bold uppercase tracking-[.09em] text-[var(--acs-text-muted)]">
                                    {text('الفاتورة القادمة', 'Next invoice')}
                                </p>
                                <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                                    {overview.next_invoice
                                        ? money(overview.next_invoice.amount_minor, overview.next_invoice.currency, locale)
                                        : '—'}
                                </strong>
                                <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                    {overview.next_invoice?.due_at ? dateLabel(overview.next_invoice.due_at, locale) : text('لا توجد فاتورة قادمة', 'No upcoming invoice')}
                                </p>
                            </div>
                            <div className="border-t border-[var(--acs-line)] p-4 md:border-e md:border-t-0">
                                <p className="text-[8px] font-bold uppercase tracking-[.09em] text-[var(--acs-text-muted)]">
                                    {text('طريقة الدفع', 'Payment method')}
                                </p>
                                <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                                    {overview.payment_method ? `${overview.payment_method.brand ?? text('بطاقة', 'Card')} •••• ${overview.payment_method.last4}` : '—'}
                                </strong>
                                <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                    {overview.payment_method?.expires_month && overview.payment_method.expires_year
                                        ? text(`تنتهي ${overview.payment_method.expires_month}/${overview.payment_method.expires_year}`, `Expires ${overview.payment_method.expires_month}/${overview.payment_method.expires_year}`)
                                        : text('تدار من مركز الاشتراك', 'Managed from subscription center')}
                                </p>
                            </div>
                            <div className="border-t border-[var(--acs-line)] p-4 md:border-t-0">
                                <p className="text-[8px] font-bold uppercase tracking-[.09em] text-[var(--acs-text-muted)]">
                                    {text('الفواتير', 'Invoices')}
                                </p>
                                <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                                    {overview.invoices.length.toLocaleString()}
                                </strong>
                                <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                    {text('فاتورة محفوظة في سجل الاشتراك', 'Invoices in subscription history')}
                                </p>
                            </div>
                        </div>
                    </section>

                    {overview.invoices.length > 0 && (
                        <section className={panel + ' overflow-hidden'}>
                            <div className="flex items-center gap-2 border-b border-[var(--acs-line)] px-5 py-4">
                                <ReceiptText size={15} className="text-[var(--acs-accent)]" />
                                <h3 className="text-xs font-bold text-[var(--acs-text)]">
                                    {text('آخر الفواتير', 'Recent invoices')}
                                </h3>
                            </div>
                            <div className="divide-y divide-[var(--acs-line)]">
                                {overview.invoices.slice(0, 6).map(invoice => (
                                    <div key={invoice.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                                        <div>
                                            <strong className="text-[9px] text-[var(--acs-text)]">{invoice.number ?? text('فاتورة اشتراك', 'Subscription invoice')}</strong>
                                            <p className="mt-0.5 text-[8px] text-[var(--acs-text-muted)]">{dateLabel(invoice.issued_at, locale)}</p>
                                        </div>
                                        <span className="text-[8px] font-semibold text-[var(--acs-text-muted)]">{invoice.status ?? '—'}</span>
                                        <strong className="text-[9px] text-[var(--acs-text)]">{money(invoice.amount_due_minor, invoice.currency, locale)}</strong>
                                        {invoice.url ? (
                                            <a href={invoice.url} target="_blank" rel="noreferrer" className={outlineButton}>
                                                <ExternalLink size={12} />
                                                {text('فتح', 'Open')}
                                            </a>
                                        ) : <span />}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            <section className={panel + ' p-5'}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h3 className="text-xs font-bold text-[var(--acs-text)]">
                            {text('الأسئلة الشائعة', 'Frequently asked questions')}
                        </h3>
                        <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                            {text('إجابات سريعة عن الاشتراك والدفع.', 'Quick answers about subscriptions and billing.')}
                        </p>
                    </div>
                    <ShieldCheck size={17} className="text-[var(--acs-accent)]" />
                </div>

                <div className="mt-4 grid gap-2 lg:grid-cols-2">
                    {faq.map((item, index) => (
                        <details key={item.q} className="group rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)]" open={index === 0}>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[9px] font-bold text-[var(--acs-text)]">
                                {item.q}
                                <ChevronDown size={13} className="shrink-0 text-[var(--acs-text-muted)] transition group-open:rotate-180" />
                            </summary>
                            <p className="border-t border-[var(--acs-line)] px-3.5 py-3 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {item.a}
                            </p>
                        </details>
                    ))}
                </div>
            </section>
        </div>
    );
}
