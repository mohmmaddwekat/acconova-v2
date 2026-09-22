import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Bot,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    CircleAlert,
    CreditCard,
    ExternalLink,
    HardDrive,
    LoaderCircle,
    ReceiptText,
    RefreshCw,
    ShieldCheck,
    Sparkles,
    UsersRound,
    WalletCards,
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
    addons: Array<{
        key: string;
        name: string;
        status: string;
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

const card =
    'rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-[0_10px_28px_rgba(30,75,140,.045)]';

const outlineButton =
    'inline-flex items-center justify-center gap-2 rounded-[12px] border border-[var(--acs-line-strong)] bg-transparent px-3.5 py-2.5 text-[10px] font-bold text-[var(--acs-text)] transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45';

function number(value: number): string {
    return value.toLocaleString(undefined, {
        maximumFractionDigits: 0,
    });
}

function bytes(value: number | null): string {
    if (value === null) return '—';

    if (value < 1024) {
        return `${value} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let current = value / 1024;
    let unit = units[0];

    for (let index = 1; index < units.length && current >= 1024; index += 1) {
        current /= 1024;
        unit = units[index];
    }

    return `${current.toLocaleString(undefined, {
        maximumFractionDigits: 1,
    })} ${unit}`;
}

function money(
    amountMinor: number | null,
    currency: string | null,
    locale: string,
): string {
    if (amountMinor === null || ! currency) {
        return '—';
    }

    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(amountMinor / 100);
    } catch {
        return `${(amountMinor / 100).toFixed(2)} ${currency}`;
    }
}

function dateLabel(
    value: string | null,
    locale: string,
): string {
    if (! value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(date);
}

function UsageMeter({
    title,
    value,
    meta,
    progress,
    icon: Icon,
}: {
    title: string;
    value: string;
    meta: string;
    progress: number | null;
    icon: typeof UsersRound;
}) {
    return (
        <div className={card + ' p-4'}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold text-[var(--acs-text-muted)]">
                        {title}
                    </p>
                    <strong className="mt-2 block text-xl font-bold tracking-tight text-[var(--acs-text)]">
                        {value}
                    </strong>
                </div>

                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] text-[var(--acs-accent)]">
                    <Icon size={17} />
                </span>
            </div>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--acs-surface-strong)]">
                <div
                    className="h-full rounded-full bg-[var(--acs-accent)] transition-[width]"
                    style={{
                        width: `${progress === null
                            ? 0
                            : Math.min(100, Math.max(0, progress))}%`,
                    }}
                />
            </div>

            <p className="mt-2 text-[9px] leading-5 text-[var(--acs-text-muted)]">
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
                            'تعذر تحميل مركز الفوترة.',
                            'Could not load the billing center.',
                        ),
                );
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [loadOverview, text]);

    const checkoutState = useMemo(() => {
        if (typeof window === 'undefined') {
            return null;
        }

        return new URLSearchParams(window.location.search)
            .get('checkout');
    }, []);

    async function startCheckout(
        plan: BillingPlan,
    ): Promise<void> {
        if (actionLoading) return;

        setActionLoading(`checkout:${plan.key}`);
        setActionError('');

        try {
            const response = await apiRequest<{
                data: {
                    url: string;
                };
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
                        'تعذر بدء عملية الدفع. حاول مرة أخرى.',
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
                data: {
                    url: string;
                };
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
            <div className={card + ' flex min-h-72 items-center justify-center'}>
                <LoaderCircle
                    size={22}
                    className="animate-spin text-[var(--acs-accent)]"
                />
            </div>
        );
    }

    if (error || ! overview) {
        return (
            <div className={card + ' flex items-start gap-3 p-5'}>
                <CircleAlert
                    size={18}
                    className="mt-0.5 shrink-0 text-amber-500"
                />
                <div>
                    <strong className="text-xs text-[var(--acs-text)]">
                        {text(
                            'تعذر فتح مركز الفوترة',
                            'Billing center unavailable',
                        )}
                    </strong>
                    <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                        {error}
                    </p>
                </div>
            </div>
        );
    }

    const seatProgress = overview.usage.seats.limit
        ? overview.usage.seats.used / overview.usage.seats.limit * 100
        : null;

    const storageProgress =
        overview.usage.storage.used_bytes !== null
        && overview.usage.storage.limit_bytes
            ? overview.usage.storage.used_bytes
                / overview.usage.storage.limit_bytes
                * 100
            : null;

    const subscriptionStatus = overview.subscription?.status ?? null;

    const activeSubscription = overview.subscription
        && ! ['canceled', 'incomplete_expired'].includes(
            subscriptionStatus ?? '',
        );

    const statusLabel = (() => {
        switch (subscriptionStatus) {
            case 'active':
                return text('فعّال', 'Active');
            case 'trialing':
                return text('تجريبي', 'Trial');
            case 'past_due':
                return text('الدفع متأخر', 'Payment due');
            case 'unpaid':
                return text('بحاجة لتحديث الدفع', 'Payment update needed');
            case 'canceled':
                return text('ملغي', 'Canceled');
            default:
                return subscriptionStatus
                    ? subscriptionStatus.replaceAll('_', ' ')
                    : text('لا يوجد اشتراك', 'No subscription');
        }
    })();

    const faqs = [
        {
            qAr: 'كيف أغيّر الباقة أو طريقة الدفع؟',
            qEn: 'How do I change my plan or payment method?',
            aAr: 'من زر إدارة الاشتراك يمكنك تعديل الباقة وبيانات الدفع المتاحة لحسابك من مكان واحد.',
            aEn: 'Use Manage subscription to update your plan and the payment details available to your account.',
        },
        {
            qAr: 'هل أقدر ألغي التجديد؟',
            qEn: 'Can I cancel renewal?',
            aAr: 'نعم. إدارة الاشتراك تتيح لك التحكم بالتجديد. إذا كان الإلغاء في نهاية الفترة، يبقى الاشتراك فعالًا حتى نهاية الفترة المدفوعة.',
            aEn: 'Yes. Subscription management lets you control renewal. If cancellation is scheduled for period end, access continues through the paid period.',
        },
        {
            qAr: 'ماذا يحدث إذا فشل الدفع؟',
            qEn: 'What happens if a payment fails?',
            aAr: 'ستظهر حالة الاشتراك بحاجة إلى تحديث، ويمكن لصاحب الحساب تحديث طريقة الدفع وإعادة معالجة الدفعة من إدارة الاشتراك.',
            aEn: 'The subscription will show that payment needs attention, and the account owner can update payment details from subscription management.',
        },
        {
            qAr: 'هل AccoNova يحفظ رقم بطاقتي؟',
            qEn: 'Does AccoNova store my full card number?',
            aAr: 'لا. AccoNova يحتفظ فقط بالمعلومات اللازمة لعرض وسيلة الدفع مثل نوع البطاقة وآخر أربع خانات، ولا يخزن رقم البطاقة الكامل داخل قاعدة بيانات النظام.',
            aEn: 'No. AccoNova only keeps the limited details needed to identify the payment method, such as brand and last four digits, and does not store the full card number in the application database.',
        },
        {
            qAr: 'هل أقدر أحمل فواتير الاشتراك؟',
            qEn: 'Can I download subscription invoices?',
            aAr: 'نعم. الفواتير التي أصبحت متاحة تظهر في سجل الفواتير، ويمكن فتحها أو تنزيلها من الرابط الموجود بجانب كل فاتورة.',
            aEn: 'Yes. Available subscription invoices appear in Billing history and can be opened or downloaded from the invoice link.',
        },
        {
            qAr: 'هل أقدر أدفع شهري أو سنوي؟',
            qEn: 'Can I pay monthly or yearly?',
            aAr: 'إذا كانت الباقة متاحة بالخيارين ستقدر تختار شهري أو سنوي قبل بدء الدفع.',
            aEn: 'If a plan is offered in both intervals, you can choose monthly or yearly before checkout.',
        },
        {
            qAr: 'متى يتفعل الاشتراك بعد الدفع؟',
            qEn: 'When does my subscription activate after payment?',
            aAr: 'بعد تأكيد عملية الدفع يتم تحديث حالة الاشتراك تلقائيًا. قد تحتاج الصفحة لثوانٍ قليلة حتى تظهر الحالة الجديدة.',
            aEn: 'After payment is confirmed, the subscription status updates automatically. It can take a few seconds for the new state to appear.',
        },
    ];

    return (
        <div className="space-y-4">
            {checkoutState === 'success' && (
                <div className="flex items-start justify-between gap-3 rounded-[16px] border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
                    <div className="flex items-start gap-2">
                        <CheckCircle2
                            size={17}
                            className="mt-0.5 shrink-0 text-emerald-400"
                        />
                        <div>
                            <strong className="text-xs text-[var(--acs-text)]">
                                {text(
                                    'تمت عملية الدفع',
                                    'Payment completed',
                                )}
                            </strong>
                            <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                {text(
                                    'يتم الآن تحديث حالة اشتراكك تلقائيًا.',
                                    'Your subscription status is being updated automatically.',
                                )}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={outlineButton}
                        onClick={() => {
                            setLoading(true);
                            void loadOverview()
                                .catch(() => undefined)
                                .finally(() => setLoading(false));
                        }}
                    >
                        <RefreshCw size={13} />
                        {text('تحديث', 'Refresh')}
                    </button>
                </div>
            )}

            {checkoutState === 'cancelled' && (
                <div className="flex items-start gap-2 rounded-[16px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-4 py-3">
                    <CircleAlert
                        size={17}
                        className="mt-0.5 shrink-0 text-[var(--acs-text-muted)]"
                    />
                    <p className="text-[10px] text-[var(--acs-text-soft)]">
                        {text(
                            'لم يتم إكمال الدفع ولم يتم تغيير اشتراكك.',
                            'Checkout was not completed and your subscription was not changed.',
                        )}
                    </p>
                </div>
            )}

            {actionError && (
                <div
                    role="alert"
                    className="rounded-[16px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-[10px] text-red-400"
                >
                    {actionError}
                </div>
            )}

            <section className={card + ' overflow-hidden'}>
                <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-[15px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                            <WalletCards size={21} />
                        </span>

                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-bold text-[var(--acs-text)]">
                                    {text(
                                        'مركز فوترة AccoNova',
                                        'AccoNova Billing Center',
                                    )}
                                </h2>

                                <span className={[
                                    'rounded-full border px-2.5 py-1 text-[9px] font-bold',
                                    activeSubscription
                                        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-400'
                                        : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] text-[var(--acs-text-muted)]',
                                ].join(' ')}>
                                    {statusLabel}
                                </span>
                            </div>

                            <p className="mt-1 max-w-2xl text-[10px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'تابع باقتك، الفاتورة القادمة، طريقة الدفع، الفواتير السابقة والاستهلاك من مكان واحد.',
                                    'Manage your plan, next invoice, payment method, billing history and usage in one place.',
                                )}
                            </p>
                        </div>
                    </div>

                    {activeSubscription && overview.payments_available && (
                        <button
                            type="button"
                            className={outlineButton}
                            disabled={actionLoading !== ''}
                            onClick={() => void openSubscriptionManagement()}
                        >
                            {actionLoading === 'portal'
                                ? <LoaderCircle size={14} className="animate-spin" />
                                : <CreditCard size={14} />}
                            {text(
                                'إدارة الاشتراك',
                                'Manage subscription',
                            )}
                        </button>
                    )}
                </div>

                <div className="grid border-t border-[var(--acs-line)] md:grid-cols-3">
                    <div className="p-4 md:border-e md:border-[var(--acs-line)]">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--acs-text-muted)]">
                            {text('الاشتراك الحالي', 'Current subscription')}
                        </p>
                        <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                            {overview.subscription
                                ? (
                                    ar
                                        ? overview.subscription.name_ar
                                        : overview.subscription.name_en
                                )
                                : text(
                                    'لا يوجد اشتراك فعّال',
                                    'No active subscription',
                                )}
                        </strong>
                        <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                            {overview.subscription?.renews_at
                                ? (
                                    overview.subscription.cancel_at_period_end
                                        ? text(
                                            `ينتهي في ${dateLabel(overview.subscription.renews_at, locale)}`,
                                            `Ends on ${dateLabel(overview.subscription.renews_at, locale)}`,
                                        )
                                        : text(
                                            `التجديد في ${dateLabel(overview.subscription.renews_at, locale)}`,
                                            `Renews on ${dateLabel(overview.subscription.renews_at, locale)}`,
                                        )
                                )
                                : text(
                                    'يمكنك اختيار باقة من الخيارات أدناه.',
                                    'Choose a plan from the options below.',
                                )}
                        </p>
                    </div>

                    <div className="border-t border-[var(--acs-line)] p-4 md:border-e md:border-t-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--acs-text-muted)]">
                            {text('الفاتورة القادمة', 'Next invoice')}
                        </p>
                        <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                            {overview.next_invoice
                                ? money(
                                    overview.next_invoice.amount_minor,
                                    overview.next_invoice.currency,
                                    locale,
                                )
                                : '—'}
                        </strong>
                        <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                            {overview.next_invoice?.due_at
                                ? text(
                                    `متوقعة في ${dateLabel(overview.next_invoice.due_at, locale)}`,
                                    `Expected on ${dateLabel(overview.next_invoice.due_at, locale)}`,
                                )
                                : text(
                                    'لا توجد فاتورة قادمة حاليًا.',
                                    'There is no upcoming invoice right now.',
                                )}
                        </p>
                    </div>

                    <div className="border-t border-[var(--acs-line)] p-4 md:border-t-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--acs-text-muted)]">
                            {text('طريقة الدفع', 'Payment method')}
                        </p>
                        <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                            {overview.payment_method
                                ? `${overview.payment_method.brand ?? text('بطاقة', 'Card')} •••• ${overview.payment_method.last4}`
                                : text(
                                    'لا توجد طريقة دفع محفوظة',
                                    'No saved payment method',
                                )}
                        </strong>
                        <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                            {overview.payment_method?.expires_month
                                && overview.payment_method.expires_year
                                ? text(
                                    `تنتهي ${overview.payment_method.expires_month}/${overview.payment_method.expires_year}`,
                                    `Expires ${overview.payment_method.expires_month}/${overview.payment_method.expires_year}`,
                                )
                                : text(
                                    'لا يخزن AccoNova رقم البطاقة الكامل داخل النظام.',
                                    'AccoNova does not store the full card number in the application.',
                                )}
                        </p>
                    </div>
                </div>
            </section>

            {! activeSubscription && (
                <section className={card + ' p-5'}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--acs-text)]">
                                <Sparkles
                                    size={16}
                                    className="text-[var(--acs-accent)]"
                                />
                                {text(
                                    'اختر الباقة المناسبة',
                                    'Choose your plan',
                                )}
                            </h3>
                            <p className="mt-1 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'تقدر تغيّر الباقة لاحقًا من إدارة الاشتراك.',
                                    'You can change your plan later from subscription management.',
                                )}
                            </p>
                        </div>

                        <div className="inline-flex self-start rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-1">
                            {(['month', 'year'] as const).map(item => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => setInterval(item)}
                                    className={[
                                        'rounded-[9px] px-3 py-2 text-[9px] font-bold transition',
                                        interval === item
                                            ? 'border border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]'
                                            : 'text-[var(--acs-text-muted)]',
                                    ].join(' ')}
                                >
                                    {item === 'month'
                                        ? text('شهري', 'Monthly')
                                        : text('سنوي', 'Yearly')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        {overview.plans.map(plan => {
                            const price = plan[interval];
                            const busy =
                                actionLoading === `checkout:${plan.key}`;

                            return (
                                <article
                                    key={plan.key}
                                    className={[
                                        'rounded-[16px] border p-4',
                                        plan.key === 'business'
                                            ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)]/30'
                                            : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)]',
                                    ].join(' ')}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h4 className="text-sm font-bold text-[var(--acs-text)]">
                                                {ar
                                                    ? plan.name_ar
                                                    : plan.name_en}
                                            </h4>
                                            <p className="mt-1 min-h-10 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                                {ar
                                                    ? plan.description_ar
                                                    : plan.description_en}
                                            </p>
                                        </div>

                                        {plan.key === 'business' && (
                                            <span className="rounded-full border border-[var(--acs-accent)]/30 bg-[var(--acs-accent-soft)] px-2 py-1 text-[8px] font-bold text-[var(--acs-accent)]">
                                                {text('الأكثر اختيارًا', 'Popular')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4">
                                        <strong className="text-xl font-bold text-[var(--acs-text)]">
                                            {money(
                                                price.amount_minor,
                                                price.currency,
                                                locale,
                                            )}
                                        </strong>
                                        {price.amount_minor !== null && (
                                            <span className="ms-1 text-[9px] text-[var(--acs-text-muted)]">
                                                / {interval === 'month'
                                                    ? text('شهر', 'month')
                                                    : text('سنة', 'year')}
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        disabled={
                                            ! overview.payments_available
                                            || ! price.available
                                            || actionLoading !== ''
                                        }
                                        onClick={() =>
                                            void startCheckout(plan)
                                        }
                                        className={outlineButton + ' mt-4 w-full'}
                                    >
                                        {busy
                                            ? <LoaderCircle size={14} className="animate-spin" />
                                            : <WalletCards size={14} />}
                                        {price.available
                                            ? text(
                                                'اختيار الباقة',
                                                'Choose plan',
                                            )
                                            : text(
                                                'غير متاحة حاليًا',
                                                'Currently unavailable',
                                            )}
                                    </button>
                                </article>
                            );
                        })}
                    </div>

                    {! overview.payments_available && (
                        <div className="mt-4 flex items-start gap-2 rounded-[13px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-3.5 py-3">
                            <CircleAlert
                                size={15}
                                className="mt-0.5 shrink-0 text-amber-500"
                            />
                            <p className="text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'الدفع الإلكتروني غير متاح لحسابك حاليًا. حاول مرة أخرى لاحقًا.',
                                    'Online billing is not available for your account right now. Please try again later.',
                                )}
                            </p>
                        </div>
                    )}
                </section>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <UsageMeter
                    title={text(
                        'أعضاء مساحة العمل',
                        'Workspace members',
                    )}
                    value={number(overview.usage.seats.used)}
                    meta={
                        overview.usage.seats.limit
                            ? text(
                                `${number(overview.usage.seats.used)} من ${number(overview.usage.seats.limit)} مستخدم`,
                                `${number(overview.usage.seats.used)} of ${number(overview.usage.seats.limit)} users`,
                            )
                            : text(
                                'عدد المستخدمين الحاليين في مساحة العمل',
                                'Current users in this workspace',
                            )
                    }
                    progress={seatProgress}
                    icon={UsersRound}
                />

                <UsageMeter
                    title={text(
                        'استخدام AccoNova AI هذا الشهر',
                        'AccoNova AI usage this month',
                    )}
                    value={number(overview.usage.ai_tokens.messages)}
                    meta={text(
                        'عدد الرسائل الذكية المستخدمة هذا الشهر',
                        'AI messages used this month',
                    )}
                    progress={null}
                    icon={Bot}
                />

                <UsageMeter
                    title={text('التخزين', 'Storage')}
                    value={bytes(overview.usage.storage.used_bytes)}
                    meta={
                        overview.usage.storage.available
                            ? text(
                                'استهلاك التخزين الحالي',
                                'Current storage usage',
                            )
                            : text(
                                'سيظهر استهلاك التخزين عند تفعيل الخدمة لحسابك',
                                'Storage usage appears when enabled for your account',
                            )
                    }
                    progress={storageProgress}
                    icon={HardDrive}
                />
            </div>

            <section className={card}>
                <div className="flex items-center justify-between gap-3 border-b border-[var(--acs-line)] px-5 py-4">
                    <div>
                        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--acs-text)]">
                            <ReceiptText
                                size={16}
                                className="text-[var(--acs-accent)]"
                            />
                            {text('سجل الفواتير', 'Billing history')}
                        </h3>
                        <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                            {text(
                                'فواتير اشتراك AccoNova والمدفوعات السابقة.',
                                'AccoNova subscription invoices and previous payments.',
                            )}
                        </p>
                    </div>
                </div>

                {overview.invoices.length === 0 ? (
                    <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
                        <ReceiptText
                            size={23}
                            className="text-[var(--acs-text-muted)]"
                        />
                        <strong className="mt-3 text-xs text-[var(--acs-text)]">
                            {text(
                                'لا توجد فواتير حتى الآن',
                                'No invoices yet',
                            )}
                        </strong>
                        <p className="mt-1 max-w-sm text-[9px] leading-5 text-[var(--acs-text-muted)]">
                            {text(
                                'ستظهر فواتير اشتراكك هنا تلقائيًا بعد أول عملية دفع.',
                                'Your subscription invoices appear here automatically after your first payment.',
                            )}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--acs-line)]">
                        {overview.invoices.map(invoice => (
                            <div
                                key={invoice.id}
                                className="grid gap-3 px-5 py-3.5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center"
                            >
                                <div>
                                    <strong className="text-[10px] text-[var(--acs-text)]">
                                        {invoice.number
                                            ?? text('فاتورة اشتراك', 'Subscription invoice')}
                                    </strong>
                                    <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                        {dateLabel(
                                            invoice.issued_at,
                                            locale,
                                        )}
                                    </p>
                                </div>

                                <span className="text-[9px] font-semibold text-[var(--acs-text-soft)]">
                                    {invoice.status ?? '—'}
                                </span>

                                <strong className="text-[10px] text-[var(--acs-text)]">
                                    {money(
                                        invoice.amount_due_minor,
                                        invoice.currency,
                                        locale,
                                    )}
                                </strong>

                                {invoice.url ? (
                                    <a
                                        href={invoice.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={outlineButton}
                                    >
                                        <ExternalLink size={13} />
                                        {text('فتح', 'Open')}
                                    </a>
                                ) : (
                                    <span />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className={card + ' p-5'}>
                <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] text-[var(--acs-accent)]">
                        <ShieldCheck size={17} />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold text-[var(--acs-text)]">
                            {text(
                                'الدفع والخصوصية',
                                'Payments & privacy',
                            )}
                        </h3>
                        <p className="mt-1 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                            {text(
                                'AccoNova يعرض لك حالة الاشتراك والفواتير دون تخزين بيانات البطاقة الكاملة داخل النظام.',
                                'AccoNova shows your subscription and invoices without storing full card details inside the application.',
                            )}
                        </p>
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                        {
                            icon: WalletCards,
                            ar: 'تغيير الباقة',
                            en: 'Change plan',
                        },
                        {
                            icon: CreditCard,
                            ar: 'تحديث طريقة الدفع',
                            en: 'Update payment method',
                        },
                        {
                            icon: CalendarClock,
                            ar: 'التحكم بالتجديد',
                            en: 'Manage renewal',
                        },
                    ].map(item => (
                        <div
                            key={item.en}
                            className="flex items-center gap-2 rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-3.5 py-3 text-[10px] font-semibold text-[var(--acs-text-soft)]"
                        >
                            <item.icon
                                size={14}
                                className="text-[var(--acs-accent)]"
                            />
                            {ar ? item.ar : item.en}
                        </div>
                    ))}
                </div>
            </section>

            <section className={card + ' p-5'}>
                <div>
                    <h3 className="text-sm font-bold text-[var(--acs-text)]">
                        {text(
                            'الأسئلة الشائعة',
                            'Frequently asked questions',
                        )}
                    </h3>
                    <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                        {text(
                            'إجابات سريعة عن الاشتراك والدفع والفواتير.',
                            'Quick answers about subscriptions, payments and invoices.',
                        )}
                    </p>
                </div>

                <div className="mt-4 space-y-2">
                    {faqs.map((item, index) => (
                        <details
                            key={item.qEn}
                            className="group rounded-[13px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)]"
                            open={index === 0}
                        >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[10px] font-bold text-[var(--acs-text)]">
                                <span>
                                    {ar ? item.qAr : item.qEn}
                                </span>
                                <ChevronDown
                                    size={14}
                                    className="shrink-0 text-[var(--acs-text-muted)] transition-transform group-open:rotate-180"
                                />
                            </summary>
                            <p className="border-t border-[var(--acs-line)] px-4 py-3 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {ar ? item.aAr : item.aEn}
                            </p>
                        </details>
                    ))}
                </div>
            </section>
        </div>
    );
}
