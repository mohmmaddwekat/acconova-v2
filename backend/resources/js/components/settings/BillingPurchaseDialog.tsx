import { ApiError, apiRequest } from '@/lib/http';
import {
    Bot,
    Check,
    CircleAlert,
    CreditCard,
    HardDrive,
    LoaderCircle,
    UsersRound,
    X,
    Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export type BillingPurchaseKind = 'seats' | 'ai' | 'storage';

export type BillingPurchaseAddon = {
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

export type BillingAiCredits = {
    balance_tokens: number;
    total_purchased_tokens: number;
    total_consumed_tokens: number;
    auto_recharge: {
        enabled: boolean;
        threshold_tokens: number;
        recharge_tokens: number;
        recharge_amount_minor: number;
        currency: string;
    };
    pricing: {
        currency: string;
        tokens_per_dollar: number;
        minimum_amount_minor: number;
        maximum_amount_minor: number;
        presets: Array<{
            amount_minor: number;
            tokens: number;
            currency: string;
        }>;
        threshold_options: number[];
    };
};

function money(amountMinor: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
            maximumFractionDigits: 2,
        }).format(amountMinor / 100);
    } catch {
        return `${(amountMinor / 100).toFixed(2)} ${currency}`;
    }
}

function compact(value: number, locale: string): string {
    return new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

function gb(bytes: number): number {
    return Math.max(1, Math.round(bytes / (1024 ** 3)));
}

export function BillingPurchaseDialog({
    open,
    kind,
    addon,
    credits,
    locale,
    onClose,
    onCompleted,
}: {
    open: boolean;
    kind: BillingPurchaseKind | null;
    addon: BillingPurchaseAddon | null;
    credits: BillingAiCredits;
    locale: string;
    onClose: () => void;
    onCompleted: (message: string) => Promise<void> | void;
}) {
    const ar = locale === 'ar';
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const [selectedPack, setSelectedPack] = useState(1);
    const [customUnits, setCustomUnits] = useState('');
    const [customMode, setCustomMode] = useState(false);
    const [selectedAmount, setSelectedAmount] = useState(0);
    const [customAmount, setCustomAmount] = useState('');
    const [customAmountMode, setCustomAmountMode] = useState(false);
    const [autoRecharge, setAutoRecharge] = useState(false);
    const [thresholdTokens, setThresholdTokens] = useState(100000);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (! open) return;
        setSelectedPack(1);
        setCustomUnits('');
        setCustomMode(false);
        setCustomAmount('');
        setCustomAmountMode(false);
        setSelectedAmount(credits.pricing.presets[0]?.amount_minor ?? credits.pricing.minimum_amount_minor);
        setAutoRecharge(credits.auto_recharge.enabled);
        setThresholdTokens(
            credits.auto_recharge.threshold_tokens
            || credits.pricing.threshold_options[0]
            || 100000,
        );
        setBusy(false);
        setError('');
    }, [open, kind, credits]);

    const resource = useMemo(() => {
        if (! addon) return null;
        const perPack = Math.max(1, addon.quantity_per_pack);
        const packOptions = [1, 2, 4];

        return {
            perPack,
            packOptions,
            baseLabel: kind === 'storage'
                ? `${gb(perPack)} GB`
                : String(perPack),
            unitLabel: kind === 'storage'
                ? 'GB'
                : text('مقعد', 'seats'),
        };
    }, [addon, kind, ar]);

    if (! open || ! kind) return null;

    const Icon = kind === 'ai' ? Bot : kind === 'storage' ? HardDrive : UsersRound;
    const title = kind === 'ai'
        ? text('إضافة رصيد AccoNova AI', 'Add AccoNova AI credits')
        : kind === 'storage'
            ? text('زيادة مساحة التخزين', 'Increase storage')
            : text('زيادة الموظفين / المقاعد', 'Add employees / seats');

    const customAmountMinor = Math.round(Number(customAmount || 0) * 100);
    const aiAmountMinor = customAmountMode ? customAmountMinor : selectedAmount;
    const aiTokens = Math.max(0, Math.floor(
        aiAmountMinor * credits.pricing.tokens_per_dollar / 100,
    ));

    let resourcePacks = selectedPack;
    let resourceUnits = resource ? resource.perPack * selectedPack : 0;

    if (customMode && resource && Number.isFinite(Number(customUnits))) {
        const requested = Math.max(0, Math.floor(Number(customUnits)));
        resourceUnits = requested;
        resourcePacks = requested > 0 && requested % resource.perPack === 0
            ? requested / resource.perPack
            : 0;
    }

    const resourceAmount = addon
        ? addon.amount_minor * Math.max(0, resourcePacks)
        : 0;

    const aiValid = aiAmountMinor >= credits.pricing.minimum_amount_minor
        && aiAmountMinor <= credits.pricing.maximum_amount_minor;
    const resourceValid = Boolean(
        addon?.available
        && resourcePacks >= 1
        && resourcePacks <= 20,
    );

    async function submit(): Promise<void> {
        if (busy) return;
        setError('');

        if (kind === 'ai') {
            if (! aiValid) {
                setError(text(
                    `المبلغ يجب أن يكون بين ${money(credits.pricing.minimum_amount_minor, credits.pricing.currency, locale)} و ${money(credits.pricing.maximum_amount_minor, credits.pricing.currency, locale)}.`,
                    `Amount must be between ${money(credits.pricing.minimum_amount_minor, credits.pricing.currency, locale)} and ${money(credits.pricing.maximum_amount_minor, credits.pricing.currency, locale)}.`,
                ));
                return;
            }

            setBusy(true);
            try {
                const response = await apiRequest<{ data: { url: string } }>(
                    '/api/billing/ai-credits/checkout',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            amount_minor: aiAmountMinor,
                            auto_recharge: autoRecharge,
                            threshold_tokens: thresholdTokens,
                        }),
                    },
                );
                window.location.assign(response.data.url);
            } catch (failure) {
                setError(failure instanceof ApiError
                    ? failure.message
                    : text('تعذر بدء شراء الرصيد.', 'Could not start credit purchase.'));
                setBusy(false);
            }
            return;
        }

        if (! addon || ! resourceValid) {
            setError(text(
                `اختر كمية صحيحة على شكل حزم من ${resource?.baseLabel ?? ''}.`,
                `Choose a valid quantity in packs of ${resource?.baseLabel ?? ''}.`,
            ));
            return;
        }

        setBusy(true);
        try {
            const response = await apiRequest<{
                data: { payment_url: string | null; pending: boolean };
            }>('/api/billing/addons/purchase', {
                method: 'POST',
                body: JSON.stringify({ addon: addon.key, quantity: resourcePacks }),
            });

            if (response.data.payment_url) {
                window.location.assign(response.data.payment_url);
                return;
            }

            await onCompleted(text(
                kind === 'storage'
                    ? 'تمت إضافة مساحة التخزين إلى اشتراكك.'
                    : 'تمت إضافة المقاعد إلى اشتراكك.',
                kind === 'storage'
                    ? 'Storage was added to your subscription.'
                    : 'Seats were added to your subscription.',
            ));
            onClose();
        } catch (failure) {
            setError(failure instanceof ApiError
                ? failure.message
                : text('تعذر إتمام الشراء.', 'Could not complete the purchase.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-[2px]"
            dir={ar ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={event => {
                if (event.currentTarget === event.target && ! busy) onClose();
            }}
        >
            <section className="max-h-[92vh] w-full max-w-[620px] overflow-y-auto rounded-[24px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-[var(--acs-line)] px-5 py-5 sm:px-7">
                    <div className="flex items-start gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                            <Icon size={19} />
                        </span>
                        <div>
                            <h2 className="text-base font-extrabold text-[var(--acs-text)]">{title}</h2>
                            <p className="mt-1 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {kind === 'ai'
                                    ? text('اختر قيمة الرصيد، ثم أكمل الدفع الآمن من خلال Stripe.', 'Choose a credit amount, then complete secure payment with Stripe.')
                                    : text('اختر الكمية التي تحتاجها. سيتم تحديث نفس اشتراكك الحالي وحساب الفرق النسبي تلقائيًا.', 'Choose the quantity you need. Your existing subscription will be updated and prorated automatically.')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="flex size-9 shrink-0 items-center justify-center rounded-[11px] border border-[var(--acs-line)] text-[var(--acs-text-muted)] transition hover:border-[var(--acs-accent)] hover:text-[var(--acs-text)] disabled:opacity-40"
                    >
                        <X size={15} />
                    </button>
                </header>

                <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                    {kind === 'ai' ? (
                        <>
                            <div>
                                <div className="mb-2.5 flex items-center justify-between gap-3">
                                    <strong className="text-[10px] text-[var(--acs-text)]">{text('اختر مقدار الرصيد', 'Choose credit amount')}</strong>
                                    <span className="text-[8px] font-semibold text-[var(--acs-text-muted)]">
                                        {text('الرصيد الحالي', 'Current balance')}: {compact(credits.balance_tokens, locale)} Tokens
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                                    {credits.pricing.presets.map(preset => (
                                        <button
                                            key={preset.amount_minor}
                                            type="button"
                                            onClick={() => {
                                                setCustomAmountMode(false);
                                                setSelectedAmount(preset.amount_minor);
                                            }}
                                            className={[
                                                'min-h-[84px] rounded-[14px] border px-2.5 py-3 text-center transition',
                                                ! customAmountMode && selectedAmount === preset.amount_minor
                                                    ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] ring-1 ring-[var(--acs-accent)]'
                                                    : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                            ].join(' ')}
                                        >
                                            <strong className="block text-[13px] font-extrabold text-[var(--acs-text)]">
                                                {money(preset.amount_minor, preset.currency, locale)}
                                            </strong>
                                            <span className="mt-1.5 block text-[8px] font-semibold text-[var(--acs-text-muted)]">
                                                {compact(preset.tokens, locale)} Tokens
                                            </span>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setCustomAmountMode(true)}
                                        className={[
                                            'min-h-[84px] rounded-[14px] border px-2.5 py-3 text-center transition',
                                            customAmountMode
                                                ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] ring-1 ring-[var(--acs-accent)]'
                                                : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                        ].join(' ')}
                                    >
                                        <strong className="block text-[11px] font-extrabold text-[var(--acs-text)]">{text('مبلغ آخر', 'Other amount')}</strong>
                                        <span className="mt-1.5 block text-[8px] text-[var(--acs-text-muted)]">{text('حدد القيمة', 'Custom')}</span>
                                    </button>
                                </div>

                                {customAmountMode && (
                                    <div className="mt-3 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3.5">
                                        <label className="text-[8px] font-bold text-[var(--acs-text-muted)]">{text('المبلغ بالدولار', 'Amount in USD')}</label>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-sm font-bold text-[var(--acs-text-muted)]">$</span>
                                            <input
                                                autoFocus
                                                type="number"
                                                min={credits.pricing.minimum_amount_minor / 100}
                                                max={credits.pricing.maximum_amount_minor / 100}
                                                step="1"
                                                value={customAmount}
                                                onChange={event => setCustomAmount(event.target.value)}
                                                className="w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-surface)] px-3 py-2.5 text-sm font-bold text-[var(--acs-text)] outline-none focus:border-[var(--acs-accent)]"
                                            />
                                        </div>
                                        <p className="mt-2 text-[8px] text-[var(--acs-text-muted)]">
                                            {aiAmountMinor > 0 ? `${compact(aiTokens, locale)} Tokens` : '—'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="rounded-[16px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-4">
                                <label className="flex cursor-pointer items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={autoRecharge}
                                        onChange={event => setAutoRecharge(event.target.checked)}
                                        className="mt-0.5 size-4 accent-[var(--acs-accent)]"
                                    />
                                    <div className="flex-1">
                                        <strong className="block text-[10px] text-[var(--acs-text)]">{text('فعّل إعادة الشحن التلقائي', 'Enable automatic recharge')}</strong>
                                        <p className="mt-1 text-[8px] leading-4 text-[var(--acs-text-muted)]">
                                            {text(
                                                `عندما ينخفض رصيدك عن الحد المحدد، سنشتري تلقائيًا نفس قيمة الرصيد المختارة باستخدام وسيلة الدفع المحفوظة.`,
                                                'When your balance falls below the selected threshold, we will automatically buy the same selected credit amount using your saved payment method.',
                                            )}
                                        </p>
                                    </div>
                                </label>

                                {autoRecharge && (
                                    <div className="mt-3 border-t border-[var(--acs-line)] pt-3">
                                        <span className="text-[8px] font-bold text-[var(--acs-text-muted)]">{text('أعد الشحن عندما يصبح الرصيد أقل من', 'Recharge when balance is below')}</span>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {credits.pricing.threshold_options.map(option => (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => setThresholdTokens(option)}
                                                    className={[
                                                        'rounded-[10px] border px-3 py-2 text-[8px] font-bold transition',
                                                        thresholdTokens === option
                                                            ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]'
                                                            : 'border-[var(--acs-line)] text-[var(--acs-text-muted)] hover:border-[var(--acs-line-strong)]',
                                                    ].join(' ')}
                                                >
                                                    {compact(option, locale)} Tokens
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div>
                            <strong className="text-[10px] text-[var(--acs-text)]">
                                {kind === 'storage' ? text('اختر مساحة التخزين', 'Choose storage amount') : text('اختر عدد المقاعد', 'Choose number of seats')}
                            </strong>
                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {resource?.packOptions.map(pack => {
                                    const units = resource.perPack * pack;
                                    return (
                                        <button
                                            key={pack}
                                            type="button"
                                            onClick={() => {
                                                setCustomMode(false);
                                                setSelectedPack(pack);
                                            }}
                                            className={[
                                                'min-h-[88px] rounded-[14px] border px-3 py-3 text-center transition',
                                                ! customMode && selectedPack === pack
                                                    ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] ring-1 ring-[var(--acs-accent)]'
                                                    : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                            ].join(' ')}
                                        >
                                            <strong className="block text-base font-extrabold text-[var(--acs-text)]">
                                                {kind === 'storage' ? `${gb(units)} GB` : `+${units}`}
                                            </strong>
                                            <span className="mt-1 block text-[8px] text-[var(--acs-text-muted)]">
                                                {money((addon?.amount_minor ?? 0) * pack, addon?.currency ?? 'USD', locale)} / {addon?.interval === 'year' ? text('سنة', 'year') : text('شهر', 'month')}
                                            </span>
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => setCustomMode(true)}
                                    className={[
                                        'min-h-[88px] rounded-[14px] border px-3 py-3 text-center transition',
                                        customMode
                                            ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] ring-1 ring-[var(--acs-accent)]'
                                            : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                    ].join(' ')}
                                >
                                    <strong className="block text-[11px] font-extrabold text-[var(--acs-text)]">{text('عدد آخر', 'Other amount')}</strong>
                                </button>
                            </div>

                            {customMode && resource && (
                                <div className="mt-3 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3.5">
                                    <label className="text-[8px] font-bold text-[var(--acs-text-muted)]">
                                        {kind === 'storage' ? text('المساحة المطلوبة بالـ GB', 'Storage required in GB') : text('عدد المقاعد الإضافية', 'Additional seats')}
                                    </label>
                                    <input
                                        autoFocus
                                        type="number"
                                        min={kind === 'storage' ? gb(resource.perPack) : resource.perPack}
                                        step={kind === 'storage' ? gb(resource.perPack) : resource.perPack}
                                        value={customUnits}
                                        onChange={event => setCustomUnits(event.target.value)}
                                        className="mt-2 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-surface)] px-3 py-2.5 text-sm font-bold text-[var(--acs-text)] outline-none focus:border-[var(--acs-accent)]"
                                    />
                                    <p className="mt-2 text-[8px] text-[var(--acs-text-muted)]">
                                        {text(`يجب أن تكون الكمية بمضاعفات ${resource.baseLabel}.`, `Quantity must be in multiples of ${resource.baseLabel}.`)}
                                    </p>
                                </div>
                            )}

                            <div className="mt-4 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3.5">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] text-[var(--acs-text-muted)]">{text('الإضافة المختارة', 'Selected capacity')}</span>
                                    <strong className="text-[10px] text-[var(--acs-text)]">
                                        {kind === 'storage' ? `${gb(resourceUnits)} GB` : `${resourceUnits} ${text('مقعد', 'seats')}`}
                                    </strong>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <span className="text-[9px] text-[var(--acs-text-muted)]">{text('السعر الدوري', 'Recurring price')}</span>
                                    <strong className="text-[10px] text-[var(--acs-text)]">
                                        {money(resourceAmount, addon?.currency ?? 'USD', locale)} / {addon?.interval === 'year' ? text('سنة', 'year') : text('شهر', 'month')}
                                    </strong>
                                </div>
                                <p className="mt-2 border-t border-[var(--acs-line)] pt-2 text-[8px] leading-4 text-[var(--acs-text-muted)]">
                                    {text('Stripe سيحسب الفرق النسبي للفترة الحالية، وبعدها تدخل الإضافة مع تجديد اشتراكك المعتاد.', 'Stripe will prorate the current period; after that, this capacity renews with your normal subscription.')}
                                </p>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 rounded-[12px] border border-red-400/25 bg-red-500/8 px-3.5 py-3 text-[9px] text-red-500">
                            <CircleAlert size={14} className="mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <div className="rounded-[16px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <span className="flex size-9 items-center justify-center rounded-[11px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]"><CreditCard size={15} /></span>
                                <div>
                                    <strong className="block text-[9px] text-[var(--acs-text)]">{text('الدفع الآمن عبر Stripe', 'Secure payment with Stripe')}</strong>
                                    <span className="mt-0.5 block text-[7px] text-[var(--acs-text-muted)]">{text('البطاقات والمحافظ المتاحة تظهر تلقائيًا حسب جهاز العميل.', 'Available cards and wallets appear automatically for the customer.')}</span>
                                </div>
                            </div>
                            <Check size={15} className="text-emerald-500" />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={busy || (kind === 'ai' ? ! aiValid : ! resourceValid)}
                        className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--acs-accent)] bg-[var(--acs-accent)] px-4 py-3.5 text-[10px] font-extrabold text-white shadow-[0_10px_24px_rgba(35,120,220,.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Zap size={15} />}
                        {kind === 'ai'
                            ? text(`المتابعة للدفع — ${money(aiAmountMinor, credits.pricing.currency, locale)}`, `Continue to payment — ${money(aiAmountMinor, credits.pricing.currency, locale)}`)
                            : text(`تأكيد الإضافة — ${money(resourceAmount, addon?.currency ?? 'USD', locale)}`, `Confirm add-on — ${money(resourceAmount, addon?.currency ?? 'USD', locale)}`)}
                    </button>
                </div>
            </section>
        </div>
    );
}
