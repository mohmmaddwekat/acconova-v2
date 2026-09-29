import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Banknote,
    Building2,
    CheckCircle2,
    CreditCard,
    Landmark,
    LoaderCircle,
    Smartphone,
    Store,
    WalletCards,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type BillingPlan = {
    key: string;
    name_ar: string;
    name_en: string;
    month: {
        available: boolean;
        amount_minor: number | null;
        currency: string;
    };
    year: {
        available: boolean;
        amount_minor: number | null;
        currency: string;
    };
};

type BillingOverview = {
    plans: BillingPlan[];
};

type ManualPaymentRequest = {
    id: number;
    method: PaymentMethod;
    status: string;
    plan_key: string;
    billing_interval: 'month' | 'year';
    amount_minor: number;
    currency: string;
    reference: string | null;
    notes: string | null;
    requested_at: string | null;
};

type PaymentMethod =
    | 'cash'
    | 'bank_transfer'
    | 'card_terminal'
    | 'mobile_wallet'
    | 'other';

const methods: Array<{
    key: PaymentMethod;
    ar: string;
    en: string;
    icon: typeof Banknote;
}> = [
    { key: 'cash', ar: 'كاش', en: 'Cash', icon: Banknote },
    { key: 'bank_transfer', ar: 'تحويل بنكي', en: 'Bank transfer', icon: Landmark },
    { key: 'card_terminal', ar: 'جهاز دفع / POS', en: 'POS / card terminal', icon: CreditCard },
    { key: 'mobile_wallet', ar: 'محفظة إلكترونية', en: 'Mobile wallet', icon: Smartphone },
    { key: 'other', ar: 'طريقة أخرى', en: 'Other method', icon: Store },
];

function money(amountMinor: number, currency: string, locale: string): string {
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

function shouldShowLauncher(): boolean {
    if (typeof window === 'undefined') return false;

    return window.location.pathname === '/app/settings'
        || window.location.pathname === '/app/billing'
        || window.location.pathname === '/app/subscription-required'
        || window.location.pathname === '/onboarding/workspace';
}

export function ManualPaymentRequestLauncher() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = useCallback(
        (arabic: string, english: string): string => ar ? arabic : english,
        [ar],
    );

    const [visible, setVisible] = useState(shouldShowLauncher);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [overview, setOverview] = useState<BillingOverview | null>(null);
    const [pending, setPending] = useState<ManualPaymentRequest | null>(null);
    const [planKey, setPlanKey] = useState('');
    const [interval, setInterval] = useState<'month' | 'year'>('month');
    const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        const refresh = (): void => setVisible(shouldShowLauncher());
        window.addEventListener('popstate', refresh);
        document.addEventListener('inertia:navigate', refresh as EventListener);

        return () => {
            window.removeEventListener('popstate', refresh);
            document.removeEventListener('inertia:navigate', refresh as EventListener);
        };
    }, []);

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            const [billing, request] = await Promise.all([
                apiRequest<{ data: BillingOverview }>('/api/billing/overview'),
                apiRequest<{
                    data: {
                        request: ManualPaymentRequest | null;
                        methods: PaymentMethod[];
                    };
                }>('/api/billing/manual-payment-requests/current'),
            ]);

            setOverview(billing.data);
            setPending(request.data.request);

            const defaultPlan = request.data.request?.plan_key
                ?? billing.data.plans.find(plan => plan.month.available || plan.year.available)?.key
                ?? billing.data.plans[0]?.key
                ?? '';

            setPlanKey(defaultPlan);

            if (request.data.request) {
                setInterval(request.data.request.billing_interval);
                setMethod(request.data.request.method);
                setReference(request.data.request.reference ?? '');
                setNotes(request.data.request.notes ?? '');
            }
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر تحميل خيارات الدفع.', 'Could not load payment options.'),
            );
        } finally {
            setLoading(false);
        }
    }, [text]);

    async function openDialog(): Promise<void> {
        setOpen(true);
        await load();
    }

    async function submit(): Promise<void> {
        if (! planKey || saving) return;
        setSaving(true);
        setError('');

        try {
            const response = await apiRequest<{ data: ManualPaymentRequest }>(
                '/api/billing/manual-payment-requests',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        plan_key: planKey,
                        billing_interval: interval,
                        method,
                        reference: reference.trim() || null,
                        notes: notes.trim() || null,
                    }),
                },
            );
            setPending(response.data);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر إرسال طلب الدفع.', 'Could not submit payment request.'),
            );
        } finally {
            setSaving(false);
        }
    }

    async function cancelPending(): Promise<void> {
        if (! pending || saving) return;
        setSaving(true);
        setError('');

        try {
            await apiRequest(`/api/billing/manual-payment-requests/${pending.id}`, {
                method: 'DELETE',
            });
            setPending(null);
            setReference('');
            setNotes('');
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر إلغاء الطلب.', 'Could not cancel the request.'),
            );
        } finally {
            setSaving(false);
        }
    }

    const selectedPlan = useMemo(
        () => overview?.plans.find(plan => plan.key === planKey) ?? null,
        [overview, planKey],
    );
    const selectedPrice = selectedPlan?.[interval] ?? null;
    const pendingMethod = methods.find(item => item.key === pending?.method);

    if (! visible) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => void openDialog()}
                className="fixed bottom-5 end-5 z-[70] inline-flex min-h-11 items-center gap-2 rounded-[13px] border border-[var(--acs-accent)] bg-[var(--acs-accent)] px-4 text-[11px] font-bold text-white shadow-[0_16px_36px_rgba(15,73,150,.28)] transition hover:brightness-110"
            >
                {pending ? <CheckCircle2 size={16} /> : <WalletCards size={16} />}
                {pending
                    ? text('طلب دفع قيد المراجعة', 'Payment request pending')
                    : text('طرق دفع أخرى', 'Other payment methods')}
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-3 backdrop-blur-[2px] sm:items-center"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) setOpen(false);
                    }}
                >
                    <div
                        dir={ar ? 'rtl' : 'ltr'}
                        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[22px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-[var(--acs-line)] px-5 py-5 sm:px-6">
                            <div className="flex items-start gap-3">
                                <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                    <WalletCards size={19} />
                                </span>
                                <div>
                                    <h2 className="text-base font-extrabold text-[var(--acs-text)]">
                                        {text('طرق دفع أخرى', 'Other payment methods')}
                                    </h2>
                                    <p className="mt-1 text-[10px] leading-5 text-[var(--acs-text-muted)]">
                                        {text(
                                            'أرسل طلبك هنا. لن يتفعل الاشتراك إلا بعد أن تؤكد الإدارة استلام الدفعة.',
                                            'Submit a request here. Your subscription activates only after an admin confirms the payment.',
                                        )}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--acs-line)] text-[var(--acs-text-muted)] transition hover:bg-[var(--acs-surface-soft)] hover:text-[var(--acs-text)]"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-5 sm:p-6">
                            {loading ? (
                                <div className="flex min-h-52 items-center justify-center">
                                    <LoaderCircle size={25} className="animate-spin text-[var(--acs-accent)]" />
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {error && (
                                        <div className="rounded-[12px] border border-red-400/25 bg-red-500/10 px-4 py-3 text-[10px] font-semibold text-red-500">
                                            {error}
                                        </div>
                                    )}

                                    {pending && (
                                        <div className="rounded-[16px] border border-amber-400/25 bg-amber-500/10 p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2 text-[11px] font-extrabold text-[var(--acs-text)]">
                                                        <CheckCircle2 size={16} className="text-amber-500" />
                                                        {text('طلبك بانتظار تأكيد الإدارة', 'Your request is awaiting admin confirmation')}
                                                    </div>
                                                    <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]">
                                                        {pendingMethod ? (ar ? pendingMethod.ar : pendingMethod.en) : pending.method}
                                                        {' · '}
                                                        {money(pending.amount_minor, pending.currency, locale)}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={saving}
                                                    onClick={() => void cancelPending()}
                                                    className="rounded-[10px] border border-red-400/30 px-3 py-2 text-[9px] font-bold text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
                                                >
                                                    {text('إلغاء الطلب', 'Cancel request')}
                                                </button>
                                            </div>
                                            <p className="mt-3 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                                {text(
                                                    'يمكنك تغيير الباقة أو طريقة الدفع أدناه وإعادة إرسال الطلب؛ سيتم تحديث نفس الطلب المعلق بدل إنشاء طلب جديد.',
                                                    'You can change the plan or payment method below and submit again; the same pending request will be updated instead of duplicated.',
                                                )}
                                            </p>
                                        </div>
                                    )}

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="block">
                                            <span className="text-[9px] font-bold text-[var(--acs-text-soft)]">{text('الباقة', 'Plan')}</span>
                                            <select
                                                value={planKey}
                                                onChange={event => setPlanKey(event.target.value)}
                                                className="mt-2 min-h-11 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-control)] px-3 text-xs text-[var(--acs-text)] outline-none focus:border-[var(--acs-accent)]"
                                            >
                                                {overview?.plans.map(plan => (
                                                    <option key={plan.key} value={plan.key}>
                                                        {ar ? plan.name_ar : plan.name_en}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>

                                        <label className="block">
                                            <span className="text-[9px] font-bold text-[var(--acs-text-soft)]">{text('الفترة', 'Interval')}</span>
                                            <select
                                                value={interval}
                                                onChange={event => setInterval(event.target.value as 'month' | 'year')}
                                                className="mt-2 min-h-11 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-control)] px-3 text-xs text-[var(--acs-text)] outline-none focus:border-[var(--acs-accent)]"
                                            >
                                                <option value="month">{text('شهري', 'Monthly')}</option>
                                                <option value="year">{text('سنوي', 'Yearly')}</option>
                                            </select>
                                        </label>
                                    </div>

                                    {selectedPrice && selectedPrice.amount_minor !== null && (
                                        <div className="flex items-center justify-between rounded-[13px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-4 py-3">
                                            <span className="text-[9px] font-semibold text-[var(--acs-text-muted)]">{text('المبلغ المتوقع', 'Expected amount')}</span>
                                            <strong className="text-sm text-[var(--acs-text)]">
                                                {money(selectedPrice.amount_minor, selectedPrice.currency, locale)}
                                            </strong>
                                        </div>
                                    )}

                                    <div>
                                        <span className="text-[9px] font-bold text-[var(--acs-text-soft)]">{text('طريقة الدفع', 'Payment method')}</span>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            {methods.map(item => {
                                                const Icon = item.icon;
                                                const selected = method === item.key;
                                                return (
                                                    <button
                                                        key={item.key}
                                                        type="button"
                                                        onClick={() => setMethod(item.key)}
                                                        className={[
                                                            'flex min-h-12 items-center gap-2.5 rounded-[12px] border px-3 text-start text-[10px] font-bold transition',
                                                            selected
                                                                ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]'
                                                                : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] text-[var(--acs-text)] hover:border-[var(--acs-line-strong)]',
                                                        ].join(' ')}
                                                    >
                                                        <Icon size={16} />
                                                        {ar ? item.ar : item.en}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <label className="block">
                                            <span className="text-[9px] font-bold text-[var(--acs-text-soft)]">{text('مرجع العملية (اختياري)', 'Payment reference (optional)')}</span>
                                            <input
                                                value={reference}
                                                onChange={event => setReference(event.target.value)}
                                                maxLength={120}
                                                placeholder={text('مثلاً رقم الحوالة', 'e.g. transfer reference')}
                                                className="mt-2 min-h-11 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-control)] px-3 text-xs text-[var(--acs-text)] outline-none placeholder:text-[var(--acs-text-muted)] focus:border-[var(--acs-accent)]"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="text-[9px] font-bold text-[var(--acs-text-soft)]">{text('ملاحظة (اختياري)', 'Note (optional)')}</span>
                                            <input
                                                value={notes}
                                                onChange={event => setNotes(event.target.value)}
                                                maxLength={1000}
                                                placeholder={text('أي تفاصيل تساعد الإدارة', 'Any details that help the admin')}
                                                className="mt-2 min-h-11 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-control)] px-3 text-xs text-[var(--acs-text)] outline-none placeholder:text-[var(--acs-text-muted)] focus:border-[var(--acs-accent)]"
                                            />
                                        </label>
                                    </div>

                                    <div className="rounded-[14px] border border-sky-400/20 bg-sky-500/8 p-4 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                        <div className="flex gap-2">
                                            <Building2 size={15} className="mt-0.5 shrink-0 text-[var(--acs-accent)]" />
                                            <p>
                                                {text(
                                                    'طريقة الدفع ليست ثابتة. تستطيع استخدام طريقة مختلفة في أي تجديد لاحق، ويمكنك الرجوع إلى Stripe وبوابة الدفع العادية عند انتهاء الفترة اليدوية المدفوعة.',
                                                    'Your payment method is not permanent. You may use a different method on any later renewal, and you can return to Stripe checkout after the prepaid manual period ends.',
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setOpen(false)}
                                            className="min-h-11 rounded-[11px] border border-[var(--acs-line-strong)] px-4 text-[10px] font-bold text-[var(--acs-text)] transition hover:bg-[var(--acs-surface-soft)]"
                                        >
                                            {text('إغلاق', 'Close')}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={saving || ! planKey || ! selectedPrice || selectedPrice.amount_minor === null}
                                            onClick={() => void submit()}
                                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-accent)] bg-[var(--acs-accent)] px-5 text-[10px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <WalletCards size={15} />}
                                            {pending
                                                ? text('تحديث الطلب', 'Update request')
                                                : text('إرسال طلب الدفع', 'Submit payment request')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
