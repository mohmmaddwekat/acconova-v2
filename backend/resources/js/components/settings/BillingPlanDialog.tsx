import { ApiError, apiRequest } from '@/lib/http';
import { Check, CircleAlert, LoaderCircle, Sparkles, X, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export type BillingPlanOption = {
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
    month: {
        available: boolean;
        amount_minor: number | null;
        currency: string | null;
    };
    year: {
        available: boolean;
        amount_minor: number | null;
        currency: string | null;
    };
};

type Props = {
    open: boolean;
    plans: BillingPlanOption[];
    currentPlanKey: string | null;
    currentInterval: string | null;
    usedSeats: number;
    currentSeatLimit: number | null;
    locale: string;
    onClose: () => void;
    onCompleted: (message: string) => Promise<void> | void;
};

function money(amountMinor: number | null, currency: string | null, locale: string): string {
    if (amountMinor === null || ! currency) return '—';

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

export function BillingPlanDialog({
    open,
    plans,
    currentPlanKey,
    currentInterval,
    usedSeats,
    currentSeatLimit,
    locale,
    onClose,
    onCompleted,
}: Props) {
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const [interval, setInterval] = useState<'month' | 'year'>(
        currentInterval === 'year' ? 'year' : 'month',
    );
    const [selectedKey, setSelectedKey] = useState(currentPlanKey ?? plans[0]?.key ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (! open) return;
        setInterval(currentInterval === 'year' ? 'year' : 'month');
        setSelectedKey(currentPlanKey ?? plans[0]?.key ?? '');
        setBusy(false);
        setError('');
    }, [open, currentInterval, currentPlanKey, plans]);

    const currentPlan = useMemo(
        () => plans.find(plan => plan.key === currentPlanKey) ?? null,
        [plans, currentPlanKey],
    );
    const selectedPlan = useMemo(
        () => plans.find(plan => plan.key === selectedKey) ?? null,
        [plans, selectedKey],
    );

    if (! open || ! selectedPlan) return null;

    const currentIncludedSeats = currentPlan?.limits.seats ?? null;
    const extraSeats = currentSeatLimit !== null && currentIncludedSeats !== null
        ? Math.max(0, currentSeatLimit - currentIncludedSeats)
        : 0;
    const selectedTotalSeats = selectedPlan.limits.seats === null
        ? null
        : selectedPlan.limits.seats + extraSeats;
    const seatBlocked = selectedTotalSeats !== null && usedSeats > selectedTotalSeats;
    const selectedPrice = selectedPlan[interval];
    const currentPrice = currentPlan
        ? currentPlan[currentInterval === 'year' ? 'year' : 'month']
        : null;
    const isSame = selectedPlan.key === currentPlanKey
        && interval === (currentInterval === 'year' ? 'year' : 'month');
    const priceDelta = selectedPrice.amount_minor !== null && currentPrice?.amount_minor !== null
        ? selectedPrice.amount_minor - currentPrice.amount_minor
        : null;

    async function submit(): Promise<void> {
        if (busy || isSame || seatBlocked || ! selectedPrice.available) return;

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{
                data: {
                    pending: boolean;
                    payment_url: string | null;
                    changed: boolean;
                };
            }>('/api/billing/change-plan', {
                method: 'POST',
                body: JSON.stringify({
                    plan: selectedPlan.key,
                    interval,
                }),
            });

            if (response.data.payment_url) {
                window.location.assign(response.data.payment_url);
                return;
            }

            await onCompleted(text(
                response.data.pending
                    ? 'تم حفظ التغيير وهو بانتظار إكمال الدفع في Stripe.'
                    : 'تم تغيير باقة AccoNova بنجاح.',
                response.data.pending
                    ? 'The plan change is pending payment completion in Stripe.'
                    : 'Your AccoNova plan was changed successfully.',
            ));
            onClose();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text('تعذر تغيير الباقة. حاول مرة أخرى.', 'Could not change the plan. Please try again.'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-[3px]"
            dir={ar ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            aria-label={text('تغيير باقة AccoNova', 'Change AccoNova plan')}
            onMouseDown={event => {
                if (event.target === event.currentTarget && ! busy) onClose();
            }}
        >
            <section className="max-h-[calc(100dvh-24px)] w-full max-w-[920px] overflow-y-auto rounded-[24px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-2xl">
                <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--acs-line)] bg-[var(--acs-surface)]/98 px-5 py-5 backdrop-blur sm:px-7">
                    <div className="flex items-start gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                            <Sparkles size={19} />
                        </span>
                        <div>
                            <h2 className="text-base font-extrabold text-[var(--acs-text)]">
                                {text('تغيير / ترقية باقة AccoNova', 'Change / upgrade AccoNova plan')}
                            </h2>
                            <p className="mt-1 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'اختر الباقة والفترة الجديدة. المقاعد والتخزين الإضافيان يبقيان على نفس اشتراك Stripe.',
                                    'Choose the new plan and billing period. Extra seats and storage remain on the same Stripe subscription.',
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="flex size-9 shrink-0 items-center justify-center rounded-[11px] border border-[var(--acs-line)] text-[var(--acs-text-muted)] transition hover:border-[var(--acs-accent)] hover:text-[var(--acs-text)] disabled:opacity-40"
                    >
                        <X size={15} />
                    </button>
                </header>

                <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <span className="text-[8px] font-semibold text-[var(--acs-text-muted)]">
                                {text('الفوترة', 'Billing period')}
                            </span>
                            <div className="mt-2 inline-flex rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-1">
                                {(['month', 'year'] as const).map(value => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setInterval(value)}
                                        className={[
                                            'rounded-[9px] px-4 py-2 text-[9px] font-bold transition',
                                            interval === value
                                                ? 'bg-[var(--acs-surface)] text-[var(--acs-text)] shadow-sm ring-1 ring-[var(--acs-line-strong)]'
                                                : 'text-[var(--acs-text-muted)] hover:text-[var(--acs-text)]',
                                        ].join(' ')}
                                    >
                                        {value === 'month' ? text('شهري', 'Monthly') : text('سنوي', 'Yearly')}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-3.5 py-2.5 text-[8px] text-[var(--acs-text-muted)]">
                            {text('الإضافات الحالية لا تُحذف عند تغيير الباقة.', 'Current add-ons are preserved when changing plan.')}
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        {plans.map(plan => {
                            const price = plan[interval];
                            const selected = plan.key === selectedKey;
                            const current = plan.key === currentPlanKey;
                            const features = ar ? plan.features_ar : plan.features_en;

                            return (
                                <button
                                    key={plan.key}
                                    type="button"
                                    onClick={() => setSelectedKey(plan.key)}
                                    className={[
                                        'relative flex min-h-[315px] flex-col rounded-[18px] border p-4 text-start transition',
                                        selected
                                            ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] ring-1 ring-[var(--acs-accent)]'
                                            : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                    ].join(' ')}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <strong className="block text-base font-extrabold text-[var(--acs-text)]">
                                                {ar ? plan.name_ar : plan.name_en}
                                            </strong>
                                            <p className="mt-1 text-[8px] leading-4 text-[var(--acs-text-muted)]">
                                                {ar ? plan.description_ar : plan.description_en}
                                            </p>
                                        </div>
                                        {current && (
                                            <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[7px] font-bold text-emerald-500">
                                                {text('الحالية', 'Current')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4 flex items-end gap-1.5">
                                        <strong className="text-2xl font-extrabold text-[var(--acs-text)]">
                                            {money(price.amount_minor, price.currency, locale)}
                                        </strong>
                                        <span className="mb-1 text-[8px] text-[var(--acs-text-muted)]">
                                            / {interval === 'year' ? text('سنة', 'year') : text('شهر', 'month')}
                                        </span>
                                    </div>

                                    <div className="my-4 h-px bg-[var(--acs-line)]" />
                                    <ul className="space-y-2">
                                        {features.slice(0, 5).map(feature => (
                                            <li key={feature} className="flex items-start gap-2 text-[8px] leading-4 text-[var(--acs-text-soft)]">
                                                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                                                    <Check size={9} strokeWidth={3} />
                                                </span>
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </button>
                            );
                        })}
                    </div>

                    <div className="rounded-[16px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                                <span className="block text-[8px] text-[var(--acs-text-muted)]">{text('الباقة الجديدة', 'New plan')}</span>
                                <strong className="mt-1 block text-[10px] text-[var(--acs-text)]">{ar ? selectedPlan.name_ar : selectedPlan.name_en}</strong>
                            </div>
                            <div>
                                <span className="block text-[8px] text-[var(--acs-text-muted)]">{text('السعر الأساسي', 'Base price')}</span>
                                <strong className="mt-1 block text-[10px] text-[var(--acs-text)]">{money(selectedPrice.amount_minor, selectedPrice.currency, locale)} / {interval === 'year' ? text('سنة', 'year') : text('شهر', 'month')}</strong>
                            </div>
                            <div>
                                <span className="block text-[8px] text-[var(--acs-text-muted)]">{text('الفرق عن الباقة الحالية', 'Difference vs current')}</span>
                                <strong className={[
                                    'mt-1 block text-[10px]',
                                    priceDelta !== null && priceDelta < 0 ? 'text-emerald-500' : 'text-[var(--acs-text)]',
                                ].join(' ')}>
                                    {priceDelta === null
                                        ? '—'
                                        : `${priceDelta > 0 ? '+' : ''}${money(priceDelta, selectedPrice.currency, locale)}`}
                                </strong>
                            </div>
                        </div>
                        <p className="mt-3 border-t border-[var(--acs-line)] pt-3 text-[8px] leading-4 text-[var(--acs-text-muted)]">
                            {text(
                                'Stripe يحسب الزيادة أو الرصيد النسبي للفترة الحالية تلقائيًا. بعد ذلك يتجدد سعر الباقة الجديد مع إضافاتك الحالية في نفس الاشتراك.',
                                'Stripe automatically calculates the prorated charge or credit for the current period. The new plan then renews with your existing add-ons on the same subscription.',
                            )}
                        </p>
                    </div>

                    {seatBlocked && (
                        <div className="flex items-start gap-2 rounded-[13px] border border-amber-400/30 bg-amber-500/10 px-3.5 py-3 text-[9px] text-amber-600">
                            <CircleAlert size={14} className="mt-0.5 shrink-0" />
                            <span>
                                {text(
                                    `لا يمكن الخفض لهذه الباقة الآن: لديك ${usedSeats} مستخدمين بينما الحد بعد التغيير سيكون ${selectedTotalSeats}. قلل المستخدمين أو احتفظ بمقاعد إضافية كافية أولًا.`,
                                    `You cannot downgrade to this plan yet: ${usedSeats} seats are in use but the new limit would be ${selectedTotalSeats}. Remove members or keep enough extra seats first.`,
                                )}
                            </span>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-[13px] border border-red-400/25 bg-red-500/10 px-3.5 py-3 text-[9px] text-red-500">
                            <CircleAlert size={14} className="mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <button
                        type="button"
                        disabled={busy || isSame || seatBlocked || ! selectedPrice.available}
                        onClick={() => void submit()}
                        className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--acs-accent)] bg-[var(--acs-accent)] px-4 py-3.5 text-[10px] font-extrabold text-white shadow-[0_10px_24px_rgba(35,120,220,.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Zap size={15} />}
                        {isSame
                            ? text('هذه باقتك الحالية', 'This is your current plan')
                            : text('تأكيد تغيير الباقة', 'Confirm plan change')}
                    </button>
                </div>
            </section>
        </div>
    );
}
