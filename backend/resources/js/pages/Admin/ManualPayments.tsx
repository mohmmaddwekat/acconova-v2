import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { setLocale } from '@/lib/locale';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Banknote,
    CalendarClock,
    CheckCircle2,
    CreditCard,
    LogOut,
    ReceiptText,
    ShieldCheck,
    WalletCards,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';

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
    notes: string | null;
};

type Stats = {
    active_manual_accounts: number;
    expiring_7d: number;
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
    if (!value) return '—';
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
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const [payments, setPayments] = useState(props.payments);
    const [logoutBusy, setLogoutBusy] = useState(false);
    const [busy, setBusy] = useState(false);
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

    const selectedPlan = useMemo(
        () => props.plans.find(plan => plan.key === form.plan_key) ?? null,
        [form.plan_key, props.plans],
    );

    const suggestedMinor = useMemo(() => {
        if (!selectedPlan) return 0;
        const unit = form.billing_interval === 'year'
            ? selectedPlan.yearly_minor
            : selectedPlan.monthly_minor;
        const count = Math.max(1, Number.parseInt(form.period_count || '1', 10) || 1);
        return unit * count;
    }, [form.billing_interval, form.period_count, selectedPlan]);

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

            setPayments(current => [response.payment, ...current].slice(0, 100));
            setMessage(text('تم تسجيل الدفعة وتفعيل/تمديد الاشتراك بنجاح.', 'Payment recorded and subscription access activated/extended.'));
            setForm(current => ({
                ...current,
                amount: '',
                reference: '',
                paid_at: '',
                notes: '',
            }));
        } catch (requestError) {
            setError(requestError instanceof Error
                ? requestError.message
                : text('تعذر تسجيل الدفعة.', 'Could not record the payment.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <Head title={`${text('الدفعات اليدوية', 'Manual payments')} | AccoNova Admin`} />
            <div dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
                    <aside className="border-e border-slate-200 bg-[#162235] text-white dark:border-slate-800">
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
                                <h1 className="mt-2 text-2xl font-black sm:text-3xl">{text('الدفعات اليدوية والكاش', 'Manual & cash payments')}</h1>
                                <p className="mt-2 max-w-3xl text-sm text-slate-500">
                                    {text('سجّل دفعة خارج Stripe لتفعيل اشتراك جديد أو تمديد اشتراك يدوي قائم. التجديد المبكر يبدأ من تاريخ الانتهاء الحالي حتى لا يخسر العميل أي أيام.', 'Record an offline payment to activate a new subscription or extend an existing manual subscription. Early renewals start from the current expiry date so the customer never loses paid time.')}
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <ShieldCheck size={15} /> {text('Platform Admin فقط', 'Platform Admin only')}
                            </span>
                        </header>

                        {!props.storageReady && (
                            <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                                {text('قاعدة البيانات غير جاهزة بعد. شغّل migrations قبل استخدام الدفعات اليدوية.', 'The database is not ready yet. Run the latest migrations before using manual payments.')}
                            </section>
                        )}

                        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <Metric icon={CheckCircle2} label={text('اشتراكات يدوية فعالة', 'Active manual accounts')} value={props.stats.active_manual_accounts.toLocaleString()} />
                            <Metric icon={CalendarClock} label={text('تنتهي خلال 7 أيام', 'Expiring in 7 days')} value={props.stats.expiring_7d.toLocaleString()} />
                            <Metric icon={ReceiptText} label={text('دفعات آخر 30 يوم', 'Payments in 30 days')} value={props.stats.payments_30d.toLocaleString()} />
                            <Metric icon={Banknote} label={text('تحصيل يدوي آخر 30 يوم', 'Manual revenue in 30 days')} value={formatMoney(props.stats.revenue_30d_minor, 'USD', locale)} />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
                            <section className={`${card} h-fit p-5`}>
                                <div className="mb-5">
                                    <h2 className="font-extrabold">{text('تسجيل دفعة', 'Record payment')}</h2>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">{text('لا تستخدمها فوق اشتراك Stripe نشط. النظام يمنع ذلك تلقائيًا لتجنب الخصم المزدوج.', 'Do not use this on top of an active Stripe subscription. The server blocks that automatically to avoid double billing.')}</p>
                                </div>

                                <form onSubmit={submit} className="space-y-4">
                                    <Field label={text('المؤسسة', 'Organization')}>
                                        <select value={form.organization_id} onChange={event => setForm(current => ({ ...current, organization_id: event.target.value }))} className="input" required>
                                            <option value="">{text('اختر مؤسسة', 'Choose organization')}</option>
                                            {props.organizations.map(organization => <option key={organization.id} value={organization.id}>{organization.name} · #{organization.id}</option>)}
                                        </select>
                                    </Field>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label={text('الباقة', 'Plan')}>
                                            <select value={form.plan_key} onChange={event => setForm(current => ({ ...current, plan_key: event.target.value }))} className="input" required>
                                                {props.plans.map(plan => <option key={plan.key} value={plan.key}>{ar ? plan.name_ar : plan.name_en}</option>)}
                                            </select>
                                        </Field>
                                        <Field label={text('الدورة', 'Interval')}>
                                            <select value={form.billing_interval} onChange={event => setForm(current => ({ ...current, billing_interval: event.target.value }))} className="input">
                                                <option value="month">{text('شهري', 'Monthly')}</option>
                                                <option value="year">{text('سنوي', 'Yearly')}</option>
                                            </select>
                                        </Field>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Field label={text('عدد الدورات', 'Periods')}>
                                            <input type="number" min="1" max="36" value={form.period_count} onChange={event => setForm(current => ({ ...current, period_count: event.target.value }))} className="input" required />
                                        </Field>
                                        <Field label={text('طريقة الدفع', 'Method')}>
                                            <select value={form.method} onChange={event => setForm(current => ({ ...current, method: event.target.value }))} className="input">
                                                <option value="cash">{text('كاش', 'Cash')}</option>
                                                <option value="bank_transfer">{text('تحويل بنكي', 'Bank transfer')}</option>
                                                <option value="cheque">{text('شيك', 'Cheque')}</option>
                                                <option value="card_terminal">{text('جهاز بطاقة', 'Card terminal')}</option>
                                                <option value="other">{text('أخرى', 'Other')}</option>
                                            </select>
                                        </Field>
                                    </div>

                                    <Field label={`${text('المبلغ المحصل', 'Collected amount')} · ${selectedPlan?.currency ?? 'USD'}`} hint={`${text('المقترح حسب الباقة', 'Plan suggestion')}: ${formatMoney(suggestedMinor, selectedPlan?.currency ?? 'USD', locale)}`}>
                                        <input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} placeholder={(suggestedMinor / 100).toFixed(2)} className="input" />
                                    </Field>

                                    <Field label={text('مرجع الدفعة', 'Payment reference')} hint={text('اختياري، لكنه يمنع تسجيل نفس التحويل مرتين.', 'Optional, but it prevents recording the same transfer twice.')}>
                                        <input value={form.reference} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} className="input" placeholder="BANK-123 / CASH-001" />
                                    </Field>

                                    <Field label={text('تاريخ الدفع', 'Paid at')} hint={text('اتركه فارغًا لاستخدام الوقت الحالي.', 'Leave blank to use the current time.')}>
                                        <input type="datetime-local" value={form.paid_at} onChange={event => setForm(current => ({ ...current, paid_at: event.target.value }))} className="input" />
                                    </Field>

                                    <Field label={text('ملاحظات', 'Notes')}>
                                        <textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} className="input min-h-24 resize-y" maxLength={2000} />
                                    </Field>

                                    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</div>}
                                    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

                                    <button type="submit" disabled={busy || !props.storageReady || !form.organization_id || !form.plan_key} className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
                                        {busy ? text('جارٍ التسجيل…', 'Recording…') : text('تأكيد الدفعة وتفعيل الاشتراك', 'Confirm payment & activate')}
                                    </button>
                                </form>
                            </section>

                            <section className={`${card} overflow-hidden`}>
                                <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                                    <h2 className="font-extrabold">{text('سجل الدفعات اليدوية', 'Manual payment ledger')}</h2>
                                    <p className="mt-1 text-xs text-slate-500">{text('آخر 100 عملية مع فترة الخدمة، المرجع، وطرف الإدارة الذي سجلها.', 'Latest 100 transactions with service period, reference and the admin who recorded them.')}</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[980px] text-sm">
                                        <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800">
                                            <tr>
                                                <th className="p-3 text-start">{text('الإيصال', 'Receipt')}</th>
                                                <th className="p-3 text-start">{text('المؤسسة', 'Organization')}</th>
                                                <th className="p-3 text-start">{text('الباقة', 'Plan')}</th>
                                                <th className="p-3 text-start">{text('المبلغ', 'Amount')}</th>
                                                <th className="p-3 text-start">{text('الطريقة', 'Method')}</th>
                                                <th className="p-3 text-start">{text('فترة الخدمة', 'Service period')}</th>
                                                <th className="p-3 text-start">{text('سجّلها', 'Recorded by')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {payments.length === 0 ? (
                                                <tr><td colSpan={7} className="p-8 text-center text-slate-500">{text('لا توجد دفعات يدوية بعد.', 'No manual payments yet.')}</td></tr>
                                            ) : payments.map(payment => (
                                                <tr key={payment.id} className="align-top">
                                                    <td className="p-3"><strong className="block font-mono text-xs">{payment.receipt_number}</strong><span className="mt-1 block text-[11px] text-slate-400">{formatDate(payment.paid_at, locale)}</span></td>
                                                    <td className="p-3"><strong>{payment.organization ?? `#${payment.organization_id}`}</strong>{payment.reference && <span className="mt-1 block text-[11px] text-slate-500">{payment.reference}</span>}</td>
                                                    <td className="p-3"><span className="font-bold">{payment.plan_key}</span><span className="mt-1 block text-[11px] text-slate-500">{payment.period_count} × {payment.billing_interval}</span></td>
                                                    <td className="p-3 font-bold">{formatMoney(payment.amount_minor, payment.currency, locale)}</td>
                                                    <td className="p-3">{methodLabel(payment.method, ar)}</td>
                                                    <td className="p-3 text-xs text-slate-500"><span className="block">{formatDate(payment.service_period_start, locale)}</span><span className="mt-1 block">→ {formatDate(payment.service_period_end, locale)}</span></td>
                                                    <td className="p-3 text-xs text-slate-500">{payment.recorded_by ?? '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </div>
                    </main>
                </div>
                <style>{`.input{width:100%;border-radius:.75rem;border:1px solid rgb(226 232 240);background:transparent;padding:.65rem .75rem;font-size:.875rem;outline:none}.input:focus{border-color:rgb(14 165 233);box-shadow:0 0 0 1px rgb(14 165 233)}.dark .input{border-color:rgb(51 65 85)}`}</style>
            </div>
        </>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return <label className="block"><span className="text-xs font-bold">{label}</span>{hint && <span className="ms-2 text-[10px] font-normal text-slate-400">{hint}</span>}<div className="mt-2">{children}</div></label>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Banknote; label: string; value: string }) {
    return <section className={`${card} p-5`}><span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Icon size={18} /></span><p className="mt-4 text-xs font-bold text-slate-500">{label}</p><strong className="mt-1 block text-2xl font-black">{value}</strong></section>;
}

function methodLabel(method: string, ar: boolean): string {
    const labels: Record<string, [string, string]> = {
        cash: ['كاش', 'Cash'],
        bank_transfer: ['تحويل بنكي', 'Bank transfer'],
        cheque: ['شيك', 'Cheque'],
        card_terminal: ['جهاز بطاقة', 'Card terminal'],
        other: ['أخرى', 'Other'],
    };
    const label = labels[method] ?? [method, method];
    return ar ? label[0] : label[1];
}
