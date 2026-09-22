import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Bot,
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    CreditCard,
    HardDrive,
    LoaderCircle,
    ReceiptText,
    ShieldCheck,
    Sparkles,
    UsersRound,
    WalletCards,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type BillingOverview = {
    provider: {
        name: string;
        enabled: boolean;
        state: 'not_configured' | 'credentials_ready' | 'ready_for_sync' | string;
        credentials_configured: boolean;
        webhook_configured: boolean;
        mode: 'test' | 'live' | null;
    };
    subscription: null | {
        name: string;
        status: string;
        interval: string;
        amount: string;
        currency: string;
        renews_at: string | null;
    };
    next_invoice: null | {
        amount: string;
        currency: string;
        due_at: string | null;
    };
    payment_method: null | {
        brand: string;
        last4: string;
        expires_month: number;
        expires_year: number;
    };
    invoices: Array<{
        id: string;
        number: string | null;
        status: string;
        amount: string;
        currency: string;
        issued_at: string | null;
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
                        width: `${progress === null ? 0 : Math.min(100, Math.max(0, progress))}%`,
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
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const [overview, setOverview] = useState<BillingOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError('');

        apiRequest<{ data: BillingOverview }>('/api/billing/overview', {
            signal: controller.signal,
        })
            .then(response => {
                if (! controller.signal.aborted) {
                    setOverview(response.data);
                }
            })
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
    }, [ar]);

    const providerLabel = useMemo(() => {
        if (! overview) return '';

        if (overview.provider.state === 'ready_for_sync') {
            return text(
                'بيانات Stripe وWebhook جاهزة',
                'Stripe credentials and webhook are ready',
            );
        }

        if (overview.provider.state === 'credentials_ready') {
            return text(
                'بيانات Stripe موجودة — باقي Webhook',
                'Stripe credentials found — webhook still needed',
            );
        }

        return text(
            'Stripe غير مربوط بعد',
            'Stripe is not connected yet',
        );
    }, [overview, ar]);

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
                        {text('تعذر فتح مركز الفوترة', 'Billing center unavailable')}
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
    const aiProgress = overview.usage.ai_tokens.limit
        ? overview.usage.ai_tokens.used / overview.usage.ai_tokens.limit * 100
        : null;
    const storageProgress =
        overview.usage.storage.used_bytes !== null
        && overview.usage.storage.limit_bytes
            ? overview.usage.storage.used_bytes
                / overview.usage.storage.limit_bytes
                * 100
            : null;

    return (
        <div className="space-y-4">
            <section className={card + ' overflow-hidden'}>
                <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-[15px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                            <WalletCards size={21} />
                        </span>

                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-bold text-[var(--acs-text)]">
                                    {text('مركز فوترة AccoNova', 'AccoNova Billing Center')}
                                </h2>

                                <span className={[
                                    'rounded-full border px-2.5 py-1 text-[9px] font-bold',
                                    overview.provider.state === 'ready_for_sync'
                                        ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-400'
                                        : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] text-[var(--acs-text-muted)]',
                                ].join(' ')}>
                                    {overview.provider.mode === 'test'
                                        ? text('وضع تجريبي', 'Test mode')
                                        : overview.provider.mode === 'live'
                                            ? text('وضع فعلي', 'Live mode')
                                            : text('غير متصل', 'Not connected')}
                                </span>
                            </div>

                            <p className="mt-1 max-w-2xl text-[10px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'هنا ستظهر الباقة، الدفعات، الفاتورة القادمة، طرق الدفع والاستهلاك الفعلي بدون أرقام تجريبية.',
                                    'Plans, payments, the next invoice, payment methods and real usage will live here without fake billing data.',
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 rounded-[13px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-3.5 py-2.5">
                        {overview.provider.credentials_configured
                            ? <CheckCircle2 size={16} className="text-emerald-400" />
                            : <CircleAlert size={16} className="text-amber-500" />}
                        <span className="text-[10px] font-semibold text-[var(--acs-text-soft)]">
                            {providerLabel}
                        </span>
                    </div>
                </div>

                <div className="grid border-t border-[var(--acs-line)] md:grid-cols-3">
                    <div className="p-4 md:border-e md:border-[var(--acs-line)]">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--acs-text-muted)]">
                            {text('الاشتراك الحالي', 'Current subscription')}
                        </p>
                        <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                            {overview.subscription?.name
                                ?? text('لم يتم إنشاء اشتراك بعد', 'No subscription yet')}
                        </strong>
                        <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                            {text(
                                'لن يظهر سعر أو اسم باقة قبل مزامنته فعليًا.',
                                'No plan or price is shown until it is actually synchronized.',
                            )}
                        </p>
                    </div>

                    <div className="border-t border-[var(--acs-line)] p-4 md:border-e md:border-t-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--acs-text-muted)]">
                            {text('الفاتورة القادمة', 'Next invoice')}
                        </p>
                        <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                            {overview.next_invoice
                                ? `${overview.next_invoice.amount} ${overview.next_invoice.currency}`
                                : '—'}
                        </strong>
                        <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                            {text(
                                'ستظهر تلقائيًا بعد تفعيل أول اشتراك.',
                                'It will appear automatically after the first subscription is active.',
                            )}
                        </p>
                    </div>

                    <div className="border-t border-[var(--acs-line)] p-4 md:border-t-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--acs-text-muted)]">
                            {text('طريقة الدفع', 'Payment method')}
                        </p>
                        <strong className="mt-2 block text-sm text-[var(--acs-text)]">
                            {overview.payment_method
                                ? `${overview.payment_method.brand} •••• ${overview.payment_method.last4}`
                                : text('لا توجد بطاقة محفوظة', 'No saved payment method')}
                        </strong>
                        <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">
                            {text(
                                'بيانات البطاقة الحساسة ستبقى عند Stripe وليست داخل AccoNova.',
                                'Sensitive card data will stay with Stripe, not inside AccoNova.',
                            )}
                        </p>
                    </div>
                </div>
            </section>

            <div className="grid gap-4 md:grid-cols-3">
                <UsageMeter
                    title={text('أعضاء مساحة العمل', 'Workspace members')}
                    value={number(overview.usage.seats.used)}
                    meta={
                        overview.usage.seats.limit
                            ? text(
                                `${number(overview.usage.seats.used)} من ${number(overview.usage.seats.limit)} مقعد`,
                                `${number(overview.usage.seats.used)} of ${number(overview.usage.seats.limit)} seats`,
                            )
                            : text(
                                'استهلاك فعلي — الحد يضاف عند اعتماد الباقات',
                                'Live usage — the limit will appear once plans are defined',
                            )
                    }
                    progress={seatProgress}
                    icon={UsersRound}
                />

                <UsageMeter
                    title={text('استخدام الذكاء الاصطناعي هذا الشهر', 'AI usage this month')}
                    value={number(overview.usage.ai_tokens.used)}
                    meta={text(
                        `${number(overview.usage.ai_tokens.messages)} رسالة AI مسجلة هذا الشهر`,
                        `${number(overview.usage.ai_tokens.messages)} AI messages recorded this month`,
                    )}
                    progress={aiProgress}
                    icon={Bot}
                />

                <UsageMeter
                    title={text('التخزين', 'Storage')}
                    value={bytes(overview.usage.storage.used_bytes)}
                    meta={
                        overview.usage.storage.available
                            ? text('استهلاك التخزين الفعلي', 'Live storage usage')
                            : text(
                                'سيبدأ القياس بعد ربط Amazon S3',
                                'Metering starts after Amazon S3 is connected',
                            )
                    }
                    progress={storageProgress}
                    icon={HardDrive}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <section className={card}>
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--acs-line)] px-5 py-4">
                        <div>
                            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--acs-text)]">
                                <ReceiptText size={16} className="text-[var(--acs-accent)]" />
                                {text('سجل الفواتير', 'Billing history')}
                            </h3>
                            <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                {text(
                                    'فواتير AccoNova والمدفوعات المرتبطة بالاشتراك.',
                                    'AccoNova subscription invoices and payments.',
                                )}
                            </p>
                        </div>
                    </div>

                    {overview.invoices.length === 0 ? (
                        <div className="flex min-h-44 flex-col items-center justify-center px-5 py-8 text-center">
                            <ReceiptText size={23} className="text-[var(--acs-text-muted)]" />
                            <strong className="mt-3 text-xs text-[var(--acs-text)]">
                                {text('لا توجد فواتير اشتراك حتى الآن', 'No subscription invoices yet')}
                            </strong>
                            <p className="mt-1 max-w-sm text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'أول فاتورة حقيقية ستظهر هنا تلقائيًا بعد الربط مع Stripe.',
                                    'The first real invoice will appear here automatically after Stripe is connected.',
                                )}
                            </p>
                        </div>
                    ) : null}
                </section>

                <section className={card + ' p-5'}>
                    <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] text-[var(--acs-accent)]">
                            <ShieldCheck size={17} />
                        </span>
                        <div>
                            <h3 className="text-sm font-bold text-[var(--acs-text)]">
                                {text('جاهزية الدفع', 'Payment readiness')}
                            </h3>
                            <p className="mt-1 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'نبني الدفع بحيث Stripe ينفذ العملية، بينما AccoNova يحتفظ بمنطق الباقات والصلاحيات والاستهلاك.',
                                    'Stripe will execute payments while AccoNova owns plan, entitlement and usage logic.',
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 space-y-2">
                        {[
                            {
                                done: overview.provider.credentials_configured,
                                icon: CreditCard,
                                ar: 'بيانات Stripe',
                                en: 'Stripe credentials',
                            },
                            {
                                done: overview.provider.webhook_configured,
                                icon: Sparkles,
                                ar: 'Webhook لتحديث الدفع تلقائيًا',
                                en: 'Webhook for automatic payment updates',
                            },
                            {
                                done: false,
                                icon: CalendarClock,
                                ar: 'الباقات والأسعار — بانتظار اعتمادك',
                                en: 'Plans and pricing — awaiting approval',
                            },
                        ].map(item => (
                            <div
                                key={item.en}
                                className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-3.5 py-3"
                            >
                                <span className="flex items-center gap-2 text-[10px] font-semibold text-[var(--acs-text-soft)]">
                                    <item.icon size={14} className="text-[var(--acs-accent)]" />
                                    {ar ? item.ar : item.en}
                                </span>

                                <span className={[
                                    'rounded-full px-2 py-1 text-[8px] font-bold',
                                    item.done
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'bg-[var(--acs-surface-strong)] text-[var(--acs-text-muted)]',
                                ].join(' ')}>
                                    {item.done
                                        ? text('جاهز', 'Ready')
                                        : text('قادم', 'Pending')}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
