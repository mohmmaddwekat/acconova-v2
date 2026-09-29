import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { setLocale } from '@/lib/locale';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Banknote,
    CalendarClock,
    CheckCircle2,
    Clock3,
    CreditCard,
    LoaderCircle,
    LogOut,
    ReceiptText,
    ShieldCheck,
    WalletCards,
    XCircle,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useMemo, useState } from 'react';

type OrganizationOption = {
    id: number;
    name: string;
};

type PlanOption = {
    key: string;
    name_ar: string;
    name_en: string;
    currency: string;
    monthly_minor: number;
    yearly_minor: number;
};

type ManualPayment = {
    id: number;
    organization_id: number;
    organization: string | null;
    recorded_by: string | null;
    requested_by: string | null;
    reviewed_by: string | null;
    receipt_number: string;
    method: string;
    reference: string | null;
    status: string;
    plan_key: string;
    billing_interval: string;
    period_count: number;
    amount_minor: number;
    currency: string;
    service_period_start: string | null;
    service_period_end: string | null;
    paid_at: string | null;
    confirmed_at: string | null;
    requested_at: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
    notes: string | null;
};

type Stats = {
    active_manual_accounts: number;
    expiring_7d: number;
    pending_requests: number;
    payments_30d: number;
    revenue_30d_minor: number;
};

type Props = {
    adminEmail: string;
    organizations: OrganizationOption[];
    plans: PlanOption[];
    payments: ManualPayment[];
    stats: Stats;
    storageReady: boolean;
};

const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900';
const input = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

const methodLabels: Record<string, { ar: string; en: string }> = {
    cash: { ar: 'كاش', en: 'Cash' },
    bank_transfer: { ar: 'تحويل بنكي', en: 'Bank transfer' },
    card_terminal: { ar: 'جهاز دفع / POS', en: 'POS / card terminal' },
    mobile_wallet: { ar: 'محفظة إلكترونية', en: 'Mobile wallet' },
    other: { ar: 'أخرى', en: 'Other' },
};

function formatMoney(amountMinor: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(amountMinor / 100);
    } catch {
        return `${currency} ${(amountMinor / 100).toFixed(2)}`;
    }
}

function formatDate(value: string | null, locale: string): string {
    if (! value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export default function ManualPayments(props: Props) {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const [payments, setPayments] = useState(props.payments);
    const [logoutBusy, setLogoutBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [reviewingId, setReviewingId] = useState<number | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({
        organization_id: props.organizations[0]?.id ? String(props.organizations[0].id) : '',
        plan_key: props.plans[0]?.key ?? '',
        billing_interval: 'month',
        period_count: '1',
        method: 'cash',
        amount: '',
        reference: '',
        paid_at: '',
        notes: '',
    });

    const pending = useMemo(
        () => payments.filter(payment => payment.status === 'pending'),
        [payments],
    );
    const history = useMemo(
        () => payments.filter(payment => payment.status !== 'pending'),
        [payments],
    );
    const selectedPlan = useMemo(
        () => props.plans.find(plan => plan.key === form.plan_key) ?? null,
        [form.plan_key, props.plans],
    );
    const suggestedMinor = useMemo(() => {
        if (! selectedPlan) return 0;
        const unit = form.billing_interval === 'year'
            ? selectedPlan.yearly_minor
            : selectedPlan.monthly_minor;
        const count = Math.max(1, Number.parseInt(form.period_count || '1', 10) || 1);
        return unit * count;
    }, [form.billing_interval, form.period_count, selectedPlan]);

    function methodLabel(method: string): string {
        const item = methodLabels[method];
        return item ? (ar ? item.ar : item.en) : method;
    }

    function planLabel(key: string): string {
        const plan = props.plans.find(item => item.key === key);
        return plan ? (ar ? plan.name_ar : plan.name_en) : key;
    }

    function replacePayment(next: ManualPayment): void {
        setPayments(current => {
            const exists = current.some(item => item.id === next.id);
            return exists
                ? current.map(item => item.id === next.id ? next : item)
                : [next, ...current].slice(0, 150);
        });
    }

    async function logout(): Promise<void> {
        if (logoutBusy) return;
        setLogoutBusy(true);
        try {
            await apiRequest('/api/auth/logout', { method: 'POST' });
            window.location.assign('/');
        } finally {
            setLogoutBusy(false);
        }
    }

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        if (busy) return;

        setBusy(true);
        setMessage(null);
        setError(null);

        try {
            const amountMinor = form.amount.trim() === ''
                ? undefined
                : Math.round(Number(form.amount) * 100);

            const response = await apiRequest<{ message: string; payment: ManualPayment }>(
                '/admin/manual-payments',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        organization_id: Number(form.organization_id),
                        plan_key: form.plan_key,
                        billing_interval: form.billing_interval,
                        period_count: Number(form.period_count),
                        method: form.method,
                        amount_minor: amountMinor,
                        reference: form.reference.trim() || null,
                        paid_at: form.paid_at || null,
                        notes: form.notes.trim() || null,
                    }),
                },
            );

            replacePayment(response.payment);
            setMessage(text('تم تسجيل الدفعة وتفعيل/تمديد الاشتراك.', 'Payment recorded and subscription activated/extended.'));
            setForm(current => ({
                ...current,
                amount: '',
                reference: '',
                paid_at: '',
                notes: '',
            }));
        } catch (requestError) {
            setError(requestError instanceof ApiError
                ? requestError.message
                : text('تعذر تسجيل الدفعة.', 'Could not record the payment.'));
        } finally {
            setBusy(false);
        }
    }

    async function approve(payment: ManualPayment): Promise<void> {
        if (reviewingId !== null) return;
        setReviewingId(payment.id);
        setMessage(null);
        setError(null);

        try {
            const response = await apiRequest<{ message: string; payment: ManualPayment }>(
                `/admin/manual-payments/${payment.id}/approve`,
                { method: 'POST' },
            );
            replacePayment(response.payment);
            setMessage(text('تم تأكيد استلام الدفعة وتفعيل الاشتراك.', 'Payment confirmed and subscription activated.'));
        } catch (requestError) {
            setError(requestError instanceof ApiError
                ? requestError.message
                : text('تعذر تأكيد الطلب.', 'Could not approve the request.'));
        } finally {
            setReviewingId(null);
        }
    }

    async function reject(payment: ManualPayment): Promise<void> {
        if (reviewingId !== null) return;
        const reason = window.prompt(text('سبب الرفض:', 'Rejection reason:'))?.trim();
        if (! reason) return;

        setReviewingId(payment.id);
        setMessage(null);
        setError(null);

        try {
            const response = await apiRequest<{ message: string; payment: ManualPayment }>(
                `/admin/manual-payments/${payment.id}/reject`,
                {
                    method: 'POST',
                    body: JSON.stringify({ reason }),
                },
            );
            replacePayment(response.payment);
            setMessage(text('تم رفض الطلب بدون أي تغيير على الاشتراك.', 'Request rejected without changing the subscription.'));
        } catch (requestError) {
            setError(requestError instanceof ApiError
                ? requestError.message
                : text('تعذر رفض الطلب.', 'Could not reject the request.'));
        } finally {
            setReviewingId(null);
        }
    }

    return (
        <>
            <Head title={`${text('الدفعات اليدوية', 'Manual payments')} | AccoNova Admin`} />
            <div dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
                    <aside className="border-e border-slate-800 bg-[#162235] text-white">
                        <div className="sticky top-0 flex min-h-screen flex-col p-4">
                            <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-3">
                                <span className="grid size-10 place-items-center rounded-xl bg-sky-500 font-black">A</span>
                                <div>
                                    <strong className="block">AccoNova</strong>
                                    <span className="text-[11px] text-slate-300">Platform Admin</span>
                                </div>
                            </Link>
                            <nav className="mt-6 space-y-1 text-sm">
                                <Link href="/admin/subscriptions" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-300 hover:bg-white/10 hover:text-white">
                                    <CreditCard size={17} /> {text('الاشتراكات', 'Subscriptions')}
                                </Link>
                                <Link href="/admin/plans" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-300 hover:bg-white/10 hover:text-white">
                                    <WalletCards size={17} /> {text('الباقات والسعات', 'Plans & capacity')}
                                </Link>
                                <Link href="/admin/manual-payments" className="flex items-center gap-3 rounded-xl bg-sky-500 px-3 py-2.5 font-bold text-white shadow-lg shadow-sky-950/20">
                                    <Banknote size={17} /> {text('الدفعات اليدوية', 'Manual payments')}
                                </Link>
                            </nav>
                            <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
                                <p className="truncate px-3 text-[11px] text-slate-400">{props.adminEmail}</p>
                                <button type="button" onClick={() => setLocale(ar ? 'en' : 'ar')} className="w-full rounded-xl border border-white/15 px-3 py-2 text-start text-xs text-slate-200 hover:bg-white/10">
                                    {ar ? 'English' : 'العربية'}
                                </button>
                                <button type="button" onClick={logout} disabled={logoutBusy} className="flex w-full items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50">
                                    <LogOut size={14} /> {text('تسجيل الخروج', 'Sign out')}
                                </button>
                            </div>
                        </div>
                    </aside>

                    <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <Link href="/admin/subscriptions" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-sky-600">
                                    <ArrowLeft size={14} className={ar ? 'rotate-180' : ''} /> {text('الرجوع للاشتراكات', 'Back to subscriptions')}
                                </Link>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">AccoNova Control Center</p>
                                <h1 className="mt-2 text-2xl font-black sm:text-3xl">{text('الدفعات اليدوية والطلبات', 'Manual payments & requests')}</h1>
                                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                                    {text('راجع طلبات العملاء أو سجّل دفعة مباشرة. لا يتم تفعيل أي طلب أرسله العميل قبل تأكيدك.', 'Review customer requests or record a payment directly. Customer-submitted requests never activate access until you confirm them.')}
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <ShieldCheck size={15} /> {text('Platform Admin فقط', 'Platform Admin only')}
                            </span>
                        </header>

                        {! props.storageReady && (
                            <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                                {text('شغّل migrations الجديدة أولًا.', 'Run the latest migrations first.')}
                            </section>
                        )}

                        {message && <div className="mb-5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}
                        {error && <div className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

                        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                            <Metric icon={Clock3} label={text('طلبات معلقة', 'Pending requests')} value={pending.length.toLocaleString()} emphasis={pending.length > 0} />
                            <Metric icon={CheckCircle2} label={text('اشتراكات يدوية فعالة', 'Active manual')} value={props.stats.active_manual_accounts.toLocaleString()} />
                            <Metric icon={CalendarClock} label={text('تنتهي خلال 7 أيام', 'Expiring in 7 days')} value={props.stats.expiring_7d.toLocaleString()} />
                            <Metric icon={ReceiptText} label={text('دفعات آخر 30 يوم', 'Payments in 30 days')} value={props.stats.payments_30d.toLocaleString()} />
                            <Metric icon={Banknote} label={text('تحصيل آخر 30 يوم', 'Revenue in 30 days')} value={formatMoney(props.stats.revenue_30d_minor, 'USD', locale)} />
                        </div>

                        <section className={`${card} mb-6 overflow-hidden`}>
                            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                                <div>
                                    <h2 className="font-extrabold">{text('طلبات العملاء المعلقة', 'Pending customer requests')}</h2>
                                    <p className="mt-1 text-xs text-slate-500">{text('أكد فقط بعد التأكد من استلام الدفعة فعليًا.', 'Approve only after the payment has actually been received.')}</p>
                                </div>
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{pending.length}</span>
                            </div>
                            {pending.length === 0 ? (
                                <div className="px-5 py-10 text-center text-sm text-slate-500">{text('لا توجد طلبات معلقة حاليًا.', 'No pending requests right now.')}</div>
                            ) : (
                                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {pending.map(payment => (
                                        <div key={payment.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <strong>{payment.organization ?? `#${payment.organization_id}`}</strong>
                                                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{text('بانتظار التأكيد', 'Pending')}</span>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {payment.requested_by ?? '—'} · {formatDate(payment.requested_at, locale)}
                                                </p>
                                            </div>
                                            <div className="text-sm">
                                                <strong>{planLabel(payment.plan_key)} · {payment.billing_interval === 'year' ? text('سنوي', 'Yearly') : text('شهري', 'Monthly')}</strong>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {methodLabel(payment.method)} · {formatMoney(payment.amount_minor, payment.currency, locale)}
                                                    {payment.reference ? ` · ${payment.reference}` : ''}
                                                </p>
                                                {payment.notes && <p className="mt-1 text-xs text-slate-500">{payment.notes}</p>}
                                            </div>
                                            <div className="flex gap-2 lg:justify-end">
                                                <button type="button" disabled={reviewingId !== null} onClick={() => void reject(payment)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-300 px-3 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950/30">
                                                    <XCircle size={14} /> {text('رفض', 'Reject')}
                                                </button>
                                                <button type="button" disabled={reviewingId !== null} onClick={() => void approve(payment)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50">
                                                    {reviewingId === payment.id ? <LoaderCircle size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                    {text('تأكيد الاستلام', 'Confirm received')}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
                            <section className={`${card} h-fit p-5`}>
                                <h2 className="font-extrabold">{text('تسجيل دفعة مباشرة', 'Record payment directly')}</h2>
                                <p className="mt-1 text-xs leading-5 text-slate-500">{text('للدفعات التي استلمتها الإدارة بدون أن يرسل العميل طلبًا.', 'For payments received by the admin without a customer request.')}</p>
                                <form onSubmit={submit} className="mt-5 space-y-4">
                                    <Field label={text('المؤسسة', 'Organization')}>
                                        <select value={form.organization_id} onChange={event => setForm(current => ({ ...current, organization_id: event.target.value }))} className={input} required>
                                            <option value="">{text('اختر مؤسسة', 'Choose organization')}</option>
                                            {props.organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name} · #{organization.id}</option>)}
                                        </select>
                                    </Field>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label={text('الباقة', 'Plan')}>
                                            <select value={form.plan_key} onChange={event => setForm(current => ({ ...current, plan_key: event.target.value }))} className={input} required>
                                                {props.plans.map(plan => <option key={plan.key} value={plan.key}>{ar ? plan.name_ar : plan.name_en}</option>)}
                                            </select>
                                        </Field>
                                        <Field label={text('الدورة', 'Interval')}>
                                            <select value={form.billing_interval} onChange={event => setForm(current => ({ ...current, billing_interval: event.target.value }))} className={input}>
                                                <option value="month">{text('شهري', 'Monthly')}</option>
                                                <option value="year">{text('سنوي', 'Yearly')}</option>
                                            </select>
                                        </Field>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label={text('عدد الدورات', 'Periods')}>
                                            <input type="number" min="1" max="36" value={form.period_count} onChange={event => setForm(current => ({ ...current, period_count: event.target.value }))} className={input} required />
                                        </Field>
                                        <Field label={text('طريقة الدفع', 'Method')}>
                                            <select value={form.method} onChange={event => setForm(current => ({ ...current, method: event.target.value }))} className={input}>
                                                <option value="cash">{text('كاش', 'Cash')}</option>
                                                <option value="bank_transfer">{text('تحويل بنكي', 'Bank transfer')}</option>
                                                <option value="card_terminal">{text('جهاز دفع / POS', 'POS / card terminal')}</option>
                                                <option value="mobile_wallet">{text('محفظة إلكترونية', 'Mobile wallet')}</option>
                                                <option value="other">{text('أخرى', 'Other')}</option>
                                            </select>
                                        </Field>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-950">
                                        {text('السعر المقترح:', 'Suggested amount:')} <strong className="text-slate-900 dark:text-white">{formatMoney(suggestedMinor, selectedPlan?.currency ?? 'USD', locale)}</strong>
                                    </div>
                                    <Field label={text('المبلغ (اختياري)', 'Amount (optional)')}>
                                        <input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} className={input} placeholder={(suggestedMinor / 100).toFixed(2)} />
                                    </Field>
                                    <Field label={text('المرجع', 'Reference')}>
                                        <input value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} className={input} maxLength={120} />
                                    </Field>
                                    <Field label={text('تاريخ الدفع', 'Paid at')}>
                                        <input type="datetime-local" value={form.paid_at} onChange={event => setForm(current => ({ ...current, paid_at: event.target.value }))} className={input} />
                                    </Field>
                                    <Field label={text('ملاحظات', 'Notes')}>
                                        <textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className={`${input} min-h-24 py-3`} maxLength={2000} />
                                    </Field>
                                    <button type="submit" disabled={busy || ! props.storageReady} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-black text-white hover:bg-sky-500 disabled:opacity-50">
                                        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Banknote size={16} />}
                                        {text('تسجيل وتفعيل الاشتراك', 'Record & activate subscription')}
                                    </button>
                                </form>
                            </section>

                            <section className={`${card} overflow-hidden`}>
                                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                                    <h2 className="font-extrabold">{text('سجل الدفعات والطلبات', 'Payment & request history')}</h2>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-start text-xs">
                                        <thead className="bg-slate-50 text-slate-500 dark:bg-slate-950">
                                            <tr>
                                                <Th>{text('المؤسسة', 'Organization')}</Th>
                                                <Th>{text('الحالة', 'Status')}</Th>
                                                <Th>{text('الطريقة', 'Method')}</Th>
                                                <Th>{text('الباقة', 'Plan')}</Th>
                                                <Th>{text('المبلغ', 'Amount')}</Th>
                                                <Th>{text('التاريخ', 'Date')}</Th>
                                                <Th>{text('المرجع', 'Reference')}</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                            {history.map(payment => (
                                                <tr key={payment.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                                    <Td><strong>{payment.organization ?? `#${payment.organization_id}`}</strong></Td>
                                                    <Td><Status status={payment.status} ar={ar} /></Td>
                                                    <Td>{methodLabel(payment.method)}</Td>
                                                    <Td>{planLabel(payment.plan_key)} · {payment.billing_interval === 'year' ? text('سنوي', 'Yearly') : text('شهري', 'Monthly')}</Td>
                                                    <Td>{formatMoney(payment.amount_minor, payment.currency, locale)}</Td>
                                                    <Td>{formatDate(payment.paid_at ?? payment.requested_at, locale)}</Td>
                                                    <Td>{payment.reference ?? '—'}</Td>
                                                </tr>
                                            ))}
                                            {history.length === 0 && (
                                                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">{text('لا يوجد سجل بعد.', 'No history yet.')}</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}

function Metric({ icon: Icon, label, value, emphasis = false }: { icon: typeof Banknote; label: string; value: string; emphasis?: boolean }) {
    return (
        <div className={`${card} p-4 ${emphasis ? 'ring-2 ring-amber-400/40' : ''}`}>
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">{label}</span>
                <Icon size={17} className={emphasis ? 'text-amber-500' : 'text-sky-600'} />
            </div>
            <strong className="mt-3 block text-xl font-black">{value}</strong>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
            {children}
        </label>
    );
}

function Th({ children }: { children: ReactNode }) {
    return <th className="whitespace-nowrap px-4 py-3 text-start font-bold">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
    return <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{children}</td>;
}

function Status({ status, ar }: { status: string; ar: boolean }) {
    const config: Record<string, { label: string; className: string }> = {
        confirmed: {
            label: ar ? 'مؤكد' : 'Confirmed',
            className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        },
        rejected: {
            label: ar ? 'مرفوض' : 'Rejected',
            className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
        },
        cancelled: {
            label: ar ? 'ملغي' : 'Cancelled',
            className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        },
    };
    const item = config[status] ?? { label: status, className: 'bg-slate-100 text-slate-600' };
    return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.className}`}>{item.label}</span>;
}
