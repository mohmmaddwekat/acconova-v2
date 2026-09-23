import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    BellRing,
    Bot,
    CalendarClock,
    CheckCircle2,
    CircleDollarSign,
    CreditCard,
    Gauge,
    Gift,
    HeartHandshake,
    LoaderCircle,
    PauseCircle,
    ReceiptText,
    RefreshCw,
    RotateCcw,
    ShieldCheck,
    Sparkles,
    TicketPercent,
    TrendingUp,
    UsersRound,
    WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type GrowthSnapshot = {
    health: {
        score: number;
        failed_payments: number;
        grace_ends_at: string | null;
        card_expiry_risk: boolean;
    };
    trial: {
        eligible_for_extension: boolean;
        extension_days: number;
    };
    cancellation: {
        scheduled: boolean;
        reason: string | null;
        save_options: Array<{ key: string; available: boolean }>;
    };
    pause: { paused_until: string | null; available: boolean };
    recommendation: {
        plan_key: string;
        reason: string;
        confidence: number;
    };
    plan_previews: Array<{
        plan_key: string;
        name_ar: string;
        name_en: string;
        month_amount_minor: number;
        year_amount_minor: number;
        estimated_proration_minor: number;
        estimated: boolean;
    }>;
    downgrade_readiness: Record<string, {
        ready: boolean;
        blockers: Array<{ type: string; used: number; limit: number }>;
    }>;
    usage: {
        seats: { used: number; limit: number | null };
        ai: { tokens: number; messages: number };
    };
    addons: {
        catalog: Array<{
            key: string;
            name_ar: string;
            name_en: string;
            amount_minor: number;
            currency: string;
            enabled: boolean;
        }>;
        active: Array<{
            key: string;
            quantity: number;
            amount_minor: number;
            currency: string;
        }>;
    };
    credits: { balance_minor: number; currency: string };
    referral: { invited: number; converted: number; reward_minor: number };
    annual_nudge: { eligible: boolean; plan_key: string | null };
    renewal_calendar: Array<{
        date: string;
        amount_minor: number;
        currency: string;
        kind: string;
    }>;
    timeline: Array<{ type: string; title: string; occurred_at: string }>;
    soft_lock: { read_only: boolean; preserve_until: string | null };
    notifications: Array<{
        id: number;
        kind: string;
        title_ar: string;
        title_en: string;
        body_ar: string | null;
        body_en: string | null;
        action_url: string | null;
        read: boolean;
    }>;
    invoices: Array<{
        id: number;
        number: string | null;
        status: string | null;
        amount_due_minor: number;
        amount_paid_minor: number;
        currency: string | null;
        issued_at: string | null;
        local_url: string;
    }>;
    spending_guardrail: {
        cap_minor: number | null;
        currency: string;
        forecast_minor: number;
        over_cap: boolean;
    };
    ai_spend_forecast: {
        estimated_minor: number;
        currency: string;
        note: string;
    };
    offers: Array<{
        kind: string;
        code: string | null;
        value_minor: number;
        currency: string;
        expires_at: string | null;
    }>;
    recovery: { required: boolean; url: string };
};

const panel =
    'rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)] p-4 shadow-[0_12px_30px_rgba(15,40,80,.045)]';
const button =
    'inline-flex items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-line-strong)] bg-transparent px-3.5 py-2 text-[9px] font-bold text-[var(--acs-text)] transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45';
const input =
    'w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-bg)] px-3 py-2 text-[10px] text-[var(--acs-text)] outline-none focus:border-[var(--acs-accent)]';

function money(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(amount / 100);
    } catch {
        return `${(amount / 100).toFixed(2)} ${currency}`;
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

function Metric({ icon: Icon, label, value, hint }: {
    icon: typeof Gauge;
    label: string;
    value: string;
    hint: string;
}) {
    return (
        <div className={panel}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[8px] font-semibold text-[var(--acs-text-muted)]">{label}</p>
                    <strong className="mt-1 block text-lg font-bold">{value}</strong>
                </div>
                <span className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                    <Icon size={16} />
                </span>
            </div>
            <p className="mt-2 text-[8px] leading-4 text-[var(--acs-text-muted)]">{hint}</p>
        </div>
    );
}

export function BillingGrowthCenter() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = useCallback(
        (arabic: string, english: string) => (ar ? arabic : english),
        [ar],
    );
    const [data, setData] = useState<GrowthSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');
    const [cancelReason, setCancelReason] = useState('temporary');
    const [cancelFeedback, setCancelFeedback] = useState('');
    const [showCancel, setShowCancel] = useState(false);
    const [spendCap, setSpendCap] = useState('');
    const [referralEmail, setReferralEmail] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [offerCode, setOfferCode] = useState('');

    const load = useCallback(async (): Promise<void> => {
        const response = await apiRequest<{ data: GrowthSnapshot }>(
            '/api/billing/growth',
        );
        setData(response.data);
        setSpendCap(
            response.data.spending_guardrail.cap_minor === null
                ? ''
                : String(response.data.spending_guardrail.cap_minor / 100),
        );
    }, []);

    useEffect(() => {
        setLoading(true);
        load()
            .catch(() => setMessage(text(
                'تعذر تحميل مركز الدفع الذكي.',
                'Could not load smart billing center.',
            )))
            .finally(() => setLoading(false));
    }, [load, text]);

    async function action(
        key: string,
        url: string,
        body?: Record<string, unknown>,
        method = 'POST',
    ): Promise<void> {
        if (busy) return;
        setBusy(key);
        setMessage('');
        try {
            await apiRequest(url, {
                method,
                body: body ? JSON.stringify(body) : undefined,
            });
            await load();
            setMessage(text('تم التحديث بنجاح.', 'Updated successfully.'));
        } catch (error) {
            setMessage(error instanceof ApiError
                ? error.message
                : text('تعذر تنفيذ العملية.', 'Could not complete the action.'));
        } finally {
            setBusy('');
        }
    }

    async function createReferral(): Promise<void> {
        if (busy) return;
        setBusy('referral');
        setMessage('');
        try {
            const response = await apiRequest<{ data: { code: string } }>(
                '/api/billing/growth/referrals',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        email: referralEmail.trim() || null,
                    }),
                },
            );
            setReferralCode(response.data.code);
            await load();
        } catch (error) {
            setMessage(error instanceof ApiError ? error.message : text(
                'تعذر إنشاء رمز الدعوة.',
                'Could not create referral code.',
            ));
        } finally {
            setBusy('');
        }
    }

    const recommendedPreview = useMemo(
        () => data?.plan_previews.find(
            (plan) => plan.plan_key === data.recommendation.plan_key,
        ) ?? null,
        [data],
    );

    if (loading) {
        return (
            <div className={panel + ' flex min-h-36 items-center justify-center'}>
                <LoaderCircle className="animate-spin text-[var(--acs-accent)]" size={20} />
            </div>
        );
    }

    if (! data) return null;

    const seatsPercent = data.usage.seats.limit
        ? Math.round(data.usage.seats.used / data.usage.seats.limit * 100)
        : 0;

    return (
        <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                        <Sparkles size={17} />
                    </span>
                    <div>
                        <h2 className="text-sm font-bold">{text('AccoNova Smart Billing', 'AccoNova Smart Billing')}</h2>
                        <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                            {text(
                                'حماية الاشتراك، الاسترداد، التوقعات، العروض والاستخدام من مكان واحد.',
                                'Subscription health, recovery, forecasts, retention and usage in one place.',
                            )}
                        </p>
                    </div>
                </div>
                <button className={button} type="button" onClick={() => void load()}>
                    <RefreshCw size={12} /> {text('تحديث', 'Refresh')}
                </button>
            </div>

            {message && (
                <div className="rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] px-4 py-3 text-[9px] font-semibold">
                    {message}
                </div>
            )}

            {data.recovery.required && (
                <div className="flex flex-col gap-3 rounded-[16px] border border-amber-400/30 bg-amber-500/8 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <strong className="text-[11px]">{text('استعادة الاشتراك بنقرة واحدة', 'One-click subscription recovery')}</strong>
                        <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                            {text('بياناتك محفوظة. حدّث الدفع لإرجاع مساحة العمل للوضع الطبيعي.', 'Your data is preserved. Update billing to restore full workspace access.')}
                        </p>
                    </div>
                    <a className={button} href={data.recovery.url}><RotateCcw size={12} />{text('استعادة الوصول', 'Restore access')}</a>
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Metric
                    icon={Gauge}
                    label={text('صحة الدفع', 'Payment health')}
                    value={`${data.health.score}/100`}
                    hint={data.health.failed_payments
                        ? text(`${data.health.failed_payments} دفعات تحتاج متابعة`, `${data.health.failed_payments} payments need attention`)
                        : text('الوضع المالي للاشتراك مستقر', 'Subscription payment health is stable')}
                />
                <Metric
                    icon={UsersRound}
                    label={text('استخدام المقاعد', 'Seat usage')}
                    value={`${data.usage.seats.used}${data.usage.seats.limit ? ` / ${data.usage.seats.limit}` : ''}`}
                    hint={text(`${seatsPercent}% من السعة الحالية`, `${seatsPercent}% of current capacity`)}
                />
                <Metric
                    icon={Bot}
                    label={text('استخدام AccoNova AI', 'AccoNova AI usage')}
                    value={data.usage.ai.messages.toLocaleString(locale)}
                    hint={text(`${data.usage.ai.tokens.toLocaleString(locale)} وحدة معالجة هذا الشهر`, `${data.usage.ai.tokens.toLocaleString(locale)} processing units this month`)}
                />
                <Metric
                    icon={WalletCards}
                    label={text('رصيد AccoNova', 'AccoNova credits')}
                    value={money(data.credits.balance_minor, data.credits.currency, locale)}
                    hint={text('يُستخدم للعروض والتعويضات المؤهلة', 'Applied to eligible offers and credits')}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <div className={panel}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 text-[11px] font-bold"><TrendingUp size={14} />{text('توصية الباقة ومحاكاة الترقية', 'Plan recommendation & upgrade simulator')}</div>
                            <p className="mt-1 text-[8px] text-[var(--acs-text-muted)]">{text('التوصية مبنية على الاستخدام الفعلي والسعة الحالية.', 'Recommendation uses current workspace usage and capacity.')}</p>
                        </div>
                        <span className="rounded-full border border-[var(--acs-line)] px-2.5 py-1 text-[8px] font-bold">{data.recommendation.plan_key}</span>
                    </div>
                    {recommendedPreview && (
                        <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="rounded-[12px] border border-[var(--acs-line)] p-3"><span className="block text-[8px] text-[var(--acs-text-muted)]">{text('شهري', 'Monthly')}</span><strong className="mt-1 block text-[11px]">{money(recommendedPreview.month_amount_minor, 'USD', locale)}</strong></div>
                            <div className="rounded-[12px] border border-[var(--acs-line)] p-3"><span className="block text-[8px] text-[var(--acs-text-muted)]">{text('سنوي', 'Yearly')}</span><strong className="mt-1 block text-[11px]">{money(recommendedPreview.year_amount_minor, 'USD', locale)}</strong></div>
                            <div className="rounded-[12px] border border-[var(--acs-line)] p-3"><span className="block text-[8px] text-[var(--acs-text-muted)]">{text('فرق تقديري الآن', 'Estimated change now')}</span><strong className="mt-1 block text-[11px]">{money(recommendedPreview.estimated_proration_minor, 'USD', locale)}</strong></div>
                        </div>
                    )}
                    <div className="mt-3 rounded-[12px] border border-dashed border-[var(--acs-line-strong)] p-3">
                        <strong className="text-[9px]">{text('معاينة فتح المزايا', 'Feature unlock preview')}</strong>
                        <p className="mt-1 text-[8px] leading-4 text-[var(--acs-text-muted)]">{text('قبل الترقية تشوف الباقة الأنسب والفرق التقديري بدون تنفيذ أي خصم تلقائي.', 'Preview the recommended plan and estimated difference before any billing change is made.')}</p>
                    </div>
                </div>

                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><CalendarClock size={14} />{text('التجديد والتجربة', 'Trial & renewal')}</div>
                    <div className="mt-4 space-y-2 text-[9px]">
                        {data.renewal_calendar.length > 0 ? data.renewal_calendar.map((item) => (
                            <div key={`${item.kind}-${item.date}`} className="flex items-center justify-between rounded-[11px] border border-[var(--acs-line)] p-3">
                                <span>{dateLabel(item.date, locale)}</span><strong>{money(item.amount_minor, item.currency, locale)}</strong>
                            </div>
                        )) : <p className="text-[var(--acs-text-muted)]">{text('لا يوجد تجديد مجدول حاليًا.', 'No renewal is currently scheduled.')}</p>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {data.trial.eligible_for_extension && (
                            <button className={button} disabled={!!busy} onClick={() => void action('trial', '/api/billing/growth/trial/extend')}>
                                <Gift size={12} />{text(`تمديد التجربة ${data.trial.extension_days} أيام`, `Extend trial ${data.trial.extension_days} days`)}
                            </button>
                        )}
                        {data.annual_nudge.eligible && <span className="rounded-[11px] border border-[var(--acs-line)] px-3 py-2 text-[8px] font-semibold">{text('التوفير السنوي متاح لهذه الباقة', 'Annual savings are available for this plan')}</span>}
                        {data.health.card_expiry_risk && <span className="rounded-[11px] border border-amber-400/30 px-3 py-2 text-[8px] font-semibold text-amber-500">{text('حدّث البطاقة قبل التجديد', 'Update card before renewal')}</span>}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><PauseCircle size={14} />{text('الاحتفاظ قبل الإلغاء', 'Cancellation save flow')}</div>
                    <p className="mt-2 text-[8px] leading-4 text-[var(--acs-text-muted)]">{text('بدل الإلغاء الفوري: وقف مؤقت، تحويل سنوي، تخفيض باقة أو عرض مؤهل.', 'Before canceling: pause, annual billing, downgrade, or an eligible retention offer.')}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {data.pause.paused_until ? (
                            <button className={button} disabled={!!busy} onClick={() => void action('resume', '/api/billing/growth/resume')}><RotateCcw size={12} />{text('استئناف الآن', 'Resume now')}</button>
                        ) : data.pause.available && (
                            <button className={button} disabled={!!busy} onClick={() => void action('pause', '/api/billing/growth/pause', { days: 30 })}><PauseCircle size={12} />{text('تجميد 30 يوم', 'Pause 30 days')}</button>
                        )}
                        {data.cancellation.scheduled ? (
                            <button className={button} disabled={!!busy} onClick={() => void action('renew', '/api/billing/growth/resume-renewal')}><RotateCcw size={12} />{text('استئناف التجديد', 'Resume renewal')}</button>
                        ) : (
                            <button className={button} type="button" onClick={() => setShowCancel((value) => !value)}>{text('إدارة الإلغاء', 'Manage cancellation')}</button>
                        )}
                    </div>
                    {showCancel && ! data.cancellation.scheduled && (
                        <div className="mt-3 space-y-2 rounded-[12px] border border-[var(--acs-line)] p-3">
                            <select className={input} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}>
                                <option value="too_expensive">{text('السعر مرتفع', 'Too expensive')}</option>
                                <option value="not_using">{text('لا أستخدمه كفاية', 'Not using it enough')}</option>
                                <option value="missing_feature">{text('ميزة مفقودة', 'Missing feature')}</option>
                                <option value="temporary">{text('توقف مؤقت', 'Temporary pause')}</option>
                                <option value="other">{text('سبب آخر', 'Other')}</option>
                            </select>
                            <textarea className={input} rows={2} value={cancelFeedback} onChange={(event) => setCancelFeedback(event.target.value)} placeholder={text('ملاحظتك تساعدنا نحسن AccoNova', 'Your feedback helps improve AccoNova')} />
                            <button className={button} disabled={!!busy} onClick={() => void action('cancel', '/api/billing/growth/cancel', { reason: cancelReason, feedback: cancelFeedback.trim() || null })}>{text('إيقاف التجديد بنهاية الفترة', 'Stop renewal at period end')}</button>
                        </div>
                    )}
                </div>

                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><ShieldCheck size={14} />{text('الحماية والاستمرارية', 'Protection & continuity')}</div>
                    <div className="mt-3 space-y-2 text-[8px]">
                        <div className="flex justify-between rounded-[10px] border border-[var(--acs-line)] p-2.5"><span>{text('فترة السماح', 'Grace period')}</span><strong>{dateLabel(data.health.grace_ends_at, locale)}</strong></div>
                        <div className="flex justify-between rounded-[10px] border border-[var(--acs-line)] p-2.5"><span>{text('وضع القراءة فقط', 'Read-only mode')}</span><strong>{data.soft_lock.read_only ? text('مفعّل', 'Enabled') : text('غير مفعّل', 'Off')}</strong></div>
                        <div className="flex justify-between rounded-[10px] border border-[var(--acs-line)] p-2.5"><span>{text('حفظ البيانات حتى', 'Data preserved until')}</span><strong>{dateLabel(data.soft_lock.preserve_until, locale)}</strong></div>
                    </div>
                </div>

                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><CircleDollarSign size={14} />{text('حد الإنفاق والتوقع', 'Spend guardrail & forecast')}</div>
                    <p className="mt-2 text-[8px] text-[var(--acs-text-muted)]">{text('المتوقع هذا الشهر', 'Forecast this month')}: <strong className="text-[var(--acs-text)]">{money(data.spending_guardrail.forecast_minor, data.spending_guardrail.currency, locale)}</strong></p>
                    <div className="mt-3 flex gap-2">
                        <input className={input} inputMode="decimal" value={spendCap} onChange={(event) => setSpendCap(event.target.value)} placeholder={text('حد شهري بالدولار', 'Monthly USD cap')} />
                        <button className={button} disabled={!!busy} onClick={() => void action('cap', '/api/billing/growth/spend-cap', {
                            amount_minor: spendCap.trim() === '' ? null : Math.max(0, Math.round(Number(spendCap) * 100)),
                            currency: 'USD',
                        }, 'PUT')}>{text('حفظ', 'Save')}</button>
                    </div>
                    {data.spending_guardrail.over_cap && <p className="mt-2 text-[8px] font-semibold text-amber-500">{text('التوقع تجاوز الحد الذي حددته.', 'Forecast is above your configured guardrail.')}</p>}
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><CreditCard size={14} />{text('الإضافات والاستخدام المرن', 'Add-ons & flexible usage')}</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {data.addons.catalog.map((addon) => (
                            <div key={addon.key} className="rounded-[12px] border border-[var(--acs-line)] p-3">
                                <strong className="block text-[9px]">{ar ? addon.name_ar : addon.name_en}</strong>
                                <span className="mt-1 block text-[8px] text-[var(--acs-text-muted)]">
                                    {addon.enabled ? money(addon.amount_minor, addon.currency, locale) : text('يُفعّل عند تحديد السعر', 'Available once pricing is configured')}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-[8px] leading-4 text-[var(--acs-text-muted)]">{text('الإضافات المدفوعة لا تُفعّل أو تُخصم تلقائيًا قبل تحديد سعرها واعتمادها.', 'Paid add-ons are never activated or charged until their price is explicitly configured and approved.')}</p>
                </div>

                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><HeartHandshake size={14} />{text('الإحالات والعروض', 'Referrals & offers')}</div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input className={input} value={referralEmail} onChange={(event) => setReferralEmail(event.target.value)} placeholder={text('بريد الشركة المدعوة (اختياري)', 'Referral email (optional)')} />
                        <button className={button} disabled={!!busy} onClick={() => void createReferral()}><Gift size={12} />{text('إنشاء دعوة', 'Create referral')}</button>
                    </div>
                    {referralCode && <div className="mt-2 rounded-[10px] border border-[var(--acs-line)] p-2.5 text-[9px] font-bold">{referralCode}</div>}
                    <div className="mt-3 flex gap-2">
                        <input className={input} value={offerCode} onChange={(event) => setOfferCode(event.target.value)} placeholder={text('رمز العرض', 'Offer code')} />
                        <button className={button} disabled={!offerCode.trim() || !!busy} onClick={() => void action('offer', '/api/billing/growth/offers/redeem', { code: offerCode.trim() })}><TicketPercent size={12} />{text('تطبيق', 'Apply')}</button>
                    </div>
                    <p className="mt-2 text-[8px] text-[var(--acs-text-muted)]">{text(`${data.referral.invited} دعوات · ${data.referral.converted} تحولت`, `${data.referral.invited} referrals · ${data.referral.converted} converted`)}</p>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><BellRing size={14} />{text('مركز تنبيهات الدفع', 'Billing notification center')}</div>
                    <div className="mt-3 space-y-2">
                        {data.notifications.length === 0 ? <p className="text-[8px] text-[var(--acs-text-muted)]">{text('لا توجد تنبيهات حالية.', 'No current billing alerts.')}</p> : data.notifications.slice(0, 6).map((notification) => (
                            <div key={notification.id} className="rounded-[11px] border border-[var(--acs-line)] p-3">
                                <strong className="text-[9px]">{ar ? notification.title_ar : notification.title_en}</strong>
                                <p className="mt-1 text-[8px] leading-4 text-[var(--acs-text-muted)]">{ar ? notification.body_ar : notification.body_en}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><ReceiptText size={14} />{text('الفواتير المحلية', 'AccoNova invoices')}</div>
                    <div className="mt-3 space-y-2">
                        {data.invoices.length === 0 ? <p className="text-[8px] text-[var(--acs-text-muted)]">{text('لا توجد فواتير بعد.', 'No invoices yet.')}</p> : data.invoices.slice(0, 6).map((invoice) => (
                            <a key={invoice.id} href={invoice.local_url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-[11px] border border-[var(--acs-line)] p-3 text-[8px] transition hover:border-[var(--acs-accent)]">
                                <span>{invoice.number || `#${invoice.id}`} · {dateLabel(invoice.issued_at, locale)}</span>
                                <strong>{money(invoice.amount_due_minor, invoice.currency || 'USD', locale)}</strong>
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><CheckCircle2 size={14} />{text('جاهزية التخفيض', 'Downgrade readiness')}</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {Object.entries(data.downgrade_readiness).map(([key, readiness]) => (
                            <div key={key} className="rounded-[11px] border border-[var(--acs-line)] p-3">
                                <strong className="block text-[9px] capitalize">{key}</strong>
                                <span className="mt-1 block text-[8px] text-[var(--acs-text-muted)]">{readiness.ready ? text('جاهز', 'Ready') : text(`${readiness.blockers.length} عوائق`, `${readiness.blockers.length} blockers`)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={panel}>
                    <div className="flex items-center gap-2 text-[11px] font-bold"><Bot size={14} />{text('توقع إنفاق الذكاء', 'AI spend forecast')}</div>
                    <strong className="mt-3 block text-xl">{money(data.ai_spend_forecast.estimated_minor, data.ai_spend_forecast.currency, locale)}</strong>
                    <p className="mt-2 text-[8px] leading-4 text-[var(--acs-text-muted)]">{text('لن نعرض تكلفة إضافية وهمية؛ الاستخدام يبقى ضمن الباقة حتى يتم اعتماد تسعير استخدام منفصل.', 'No artificial overage is shown: AI remains included until separate metered pricing is explicitly enabled.')}</p>
                </div>
            </div>

            <div className={panel}>
                <div className="flex items-center gap-2 text-[11px] font-bold"><CalendarClock size={14} />{text('سجل الاشتراك', 'Subscription timeline')}</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {data.timeline.length === 0 ? <p className="text-[8px] text-[var(--acs-text-muted)]">{text('سيظهر سجل تغييرات الاشتراك هنا.', 'Subscription changes will appear here.')}</p> : data.timeline.slice(0, 9).map((event, index) => (
                        <div key={`${event.type}-${event.occurred_at}-${index}`} className="rounded-[11px] border border-[var(--acs-line)] p-3">
                            <strong className="block text-[9px]">{event.title}</strong>
                            <span className="mt-1 block text-[8px] text-[var(--acs-text-muted)]">{dateLabel(event.occurred_at, locale)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
