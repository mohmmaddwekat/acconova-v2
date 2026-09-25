import { ApiError, apiRequest } from '@/lib/http';
import {
    Bot,
    Check,
    CircleAlert,
    CreditCard,
    HardDrive,
    LoaderCircle,
    Save,
    Trash2,
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
    unit_quantity?: number;
    display_bundle_quantity?: number;
    amount_minor: number;
    unit_amount_minor?: number;
    currency: string;
    interval: 'month' | 'year';
    active_quantity: number;
    active_entitlement?: number;
    max_quantity?: number;
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

function bytesToGb(bytes: number): number {
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

    const [targetQuantity, setTargetQuantity] = useState(0);
    const [customQuantity, setCustomQuantity] = useState('');
    const [customMode, setCustomMode] = useState(false);
    const [selectedAmount, setSelectedAmount] = useState(0);
    const [customAmount, setCustomAmount] = useState('');
    const [customAmountMode, setCustomAmountMode] = useState(false);
    const [autoRecharge, setAutoRecharge] = useState(false);
    const [thresholdTokens, setThresholdTokens] = useState(100000);
    const [busy, setBusy] = useState(false);
    const [settingsBusy, setSettingsBusy] = useState(false);
    const [error, setError] = useState('');
    const [settingsMessage, setSettingsMessage] = useState('');

    const capacity = useMemo(() => {
        if (! addon || kind === 'ai') return null;

        const unitEntitlement = Math.max(1, addon.unit_quantity ?? (
            kind === 'storage' ? 1024 ** 3 : 1
        ));
        const unitAmount = Math.max(
            0,
            addon.unit_amount_minor
                ?? Math.round(addon.amount_minor / Math.max(1, addon.display_bundle_quantity ?? 1)),
        );
        const currentProviderQuantity = Math.max(0, addon.active_quantity ?? 0);
        const maxQuantity = Math.max(1, addon.max_quantity ?? (kind === 'storage' ? 10000 : 500));
        const displayPerProviderUnit = kind === 'storage'
            ? bytesToGb(unitEntitlement)
            : unitEntitlement;

        return {
            unitAmount,
            currentProviderQuantity,
            maxQuantity,
            displayPerProviderUnit,
            presets: kind === 'storage' ? [5, 25, 50, 100] : [1, 3, 5, 10],
        };
    }, [addon, kind]);

    useEffect(() => {
        if (! open) return;

        const current = Math.max(0, addon?.active_quantity ?? 0);
        setTargetQuantity(current > 0 ? current : (kind === 'storage' ? 25 : 5));
        setCustomQuantity('');
        setCustomMode(false);
        setCustomAmount('');
        setCustomAmountMode(false);
        setSelectedAmount(
            credits.auto_recharge.recharge_amount_minor > 0
                ? credits.auto_recharge.recharge_amount_minor
                : credits.pricing.presets[0]?.amount_minor
                    ?? credits.pricing.minimum_amount_minor,
        );
        setAutoRecharge(credits.auto_recharge.enabled);
        setThresholdTokens(
            credits.auto_recharge.threshold_tokens
                || credits.pricing.threshold_options[0]
                || 100000,
        );
        setBusy(false);
        setSettingsBusy(false);
        setError('');
        setSettingsMessage('');
    }, [open, kind, addon?.active_quantity, credits]);

    if (! open || ! kind) return null;

    const Icon = kind === 'ai' ? Bot : kind === 'storage' ? HardDrive : UsersRound;
    const title = kind === 'ai'
        ? text('إضافة رصيد AccoNova AI', 'Add AccoNova AI credits')
        : kind === 'storage'
            ? text('إدارة مساحة التخزين', 'Manage storage')
            : text('إدارة الموظفين / المقاعد', 'Manage employees / seats');

    const customAmountMinor = Math.round(Number(customAmount || 0) * 100);
    const aiAmountMinor = customAmountMode ? customAmountMinor : selectedAmount;
    const aiTokens = Math.max(0, Math.floor(
        aiAmountMinor * credits.pricing.tokens_per_dollar / 100,
    ));
    const aiValid = aiAmountMinor >= credits.pricing.minimum_amount_minor
        && aiAmountMinor <= credits.pricing.maximum_amount_minor;

    const customNumeric = Number(customQuantity);
    const requestedTarget = customMode && Number.isFinite(customNumeric)
        ? Math.max(0, Math.floor(customNumeric))
        : targetQuantity;
    const currentQuantity = capacity?.currentProviderQuantity ?? 0;
    const resourceValid = Boolean(
        addon?.available
        && capacity
        && requestedTarget >= 0
        && requestedTarget <= capacity.maxQuantity,
    );
    const recurringAmount = capacity
        ? requestedTarget * capacity.unitAmount
        : 0;
    const currentRecurringAmount = capacity
        ? currentQuantity * capacity.unitAmount
        : 0;
    const resourceChanged = requestedTarget !== currentQuantity;

    const displayCapacity = (quantity: number): string => {
        if (! capacity) return '—';
        const displayed = quantity * capacity.displayPerProviderUnit;
        return kind === 'storage'
            ? `${displayed} GB`
            : `${displayed} ${text(displayed === 1 ? 'مقعد' : 'مقاعد', displayed === 1 ? 'seat' : 'seats')}`;
    };

    async function saveAutoRechargeSettings(): Promise<void> {
        if (settingsBusy || busy) return;
        setError('');
        setSettingsMessage('');

        if (autoRecharge && ! aiValid) {
            setError(text(
                'اختر مبلغًا صحيحًا لإعادة الشحن التلقائي.',
                'Choose a valid automatic recharge amount.',
            ));
            return;
        }

        setSettingsBusy(true);
        try {
            await apiRequest('/api/billing/ai-credits/auto-recharge', {
                method: 'PUT',
                body: JSON.stringify({
                    enabled: autoRecharge,
                    threshold_tokens: thresholdTokens,
                    amount_minor: aiValid ? aiAmountMinor : undefined,
                }),
            });

            setSettingsMessage(text(
                autoRecharge
                    ? 'تم حفظ إعدادات إعادة الشحن التلقائي.'
                    : 'تم إيقاف إعادة الشحن التلقائي.',
                autoRecharge
                    ? 'Auto-recharge settings saved.'
                    : 'Auto-recharge has been disabled.',
            ));

            await onCompleted(text(
                'تم تحديث إعدادات رصيد AI.',
                'AI credit settings were updated.',
            ));
        } catch (failure) {
            setError(failure instanceof ApiError
                ? failure.message
                : text('تعذر حفظ إعدادات إعادة الشحن.', 'Could not save auto-recharge settings.'));
        } finally {
            setSettingsBusy(false);
        }
    }

    async function submit(): Promise<void> {
        if (busy || settingsBusy) return;
        setError('');
        setSettingsMessage('');

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

        if (! addon || ! resourceValid || ! capacity) {
            setError(text('أدخل كمية صحيحة.', 'Enter a valid quantity.'));
            return;
        }

        if (! resourceChanged) {
            setError(text('الكمية الجديدة مساوية للكمية الحالية.', 'The new quantity is the same as the current quantity.'));
            return;
        }

        setBusy(true);
        try {
            const response = await apiRequest<{
                data: { payment_url: string | null; pending: boolean };
            }>('/api/billing/addons/purchase', {
                method: 'POST',
                body: JSON.stringify({
                    addon: addon.key,
                    target_quantity: requestedTarget,
                }),
            });

            if (response.data.payment_url) {
                window.location.assign(response.data.payment_url);
                return;
            }

            await onCompleted(text(
                requestedTarget === 0
                    ? (kind === 'storage' ? 'تمت إزالة التخزين الإضافي من الاشتراك.' : 'تمت إزالة المقاعد الإضافية من الاشتراك.')
                    : (kind === 'storage' ? 'تم تحديث مساحة التخزين في اشتراكك.' : 'تم تحديث عدد المقاعد في اشتراكك.'),
                requestedTarget === 0
                    ? (kind === 'storage' ? 'Extra storage was removed from your subscription.' : 'Extra seats were removed from your subscription.')
                    : (kind === 'storage' ? 'Storage was updated on your subscription.' : 'Seats were updated on your subscription.'),
            ));
            onClose();
        } catch (failure) {
            setError(failure instanceof ApiError
                ? failure.message
                : text('تعذر تحديث الإضافة.', 'Could not update the add-on.'));
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
                if (event.currentTarget === event.target && ! busy && ! settingsBusy) onClose();
            }}
        >
            <section className="max-h-[92vh] w-full max-w-[650px] overflow-y-auto rounded-[24px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-2xl">
                <header className="flex items-start justify-between gap-4 border-b border-[var(--acs-line)] px-5 py-5 sm:px-7">
                    <div className="flex items-start gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                            <Icon size={19} />
                        </span>
                        <div>
                            <h2 className="text-base font-extrabold text-[var(--acs-text)]">{title}</h2>
                            <p className="mt-1 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {kind === 'ai'
                                    ? text('اشترِ الرصيد الذي تحتاجه، ويمكنك تشغيل أو إيقاف إعادة الشحن التلقائي في أي وقت.', 'Buy the credits you need and turn auto-recharge on or off at any time.')
                                    : text('اختر العدد النهائي الذي تريده. يمكنك الزيادة أو التخفيض أو الإلغاء بالكامل، ويُحدّث نفس اشتراك Stripe.', 'Choose the final amount you want. Increase, reduce, or remove it completely on the same Stripe subscription.')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy || settingsBusy}
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
                                        <strong className="block text-[10px] text-[var(--acs-text)]">{text('إعادة الشحن التلقائي', 'Automatic recharge')}</strong>
                                        <p className="mt-1 text-[8px] leading-4 text-[var(--acs-text-muted)]">
                                            {text('يمكنك تفعيلها أو إيقافها دون شراء رصيد جديد. عند التفعيل تستخدم وسيلة الدفع المحفوظة.', 'You can enable or disable it without buying new credits. When enabled, it uses the saved payment method.')}
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

                                <button
                                    type="button"
                                    onClick={() => void saveAutoRechargeSettings()}
                                    disabled={busy || settingsBusy || (autoRecharge && ! aiValid)}
                                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-line-strong)] bg-transparent px-3 py-2.5 text-[9px] font-bold text-[var(--acs-text)] transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    {settingsBusy ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
                                    {autoRecharge ? text('حفظ إعدادات إعادة الشحن', 'Save auto-recharge settings') : text('حفظ وإيقاف إعادة الشحن', 'Save and disable auto-recharge')}
                                </button>
                                {settingsMessage && <p className="mt-2 text-[8px] font-bold text-emerald-500">{settingsMessage}</p>}
                            </div>
                        </>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <strong className="text-[10px] text-[var(--acs-text)]">
                                    {kind === 'storage' ? text('اختر إجمالي التخزين الإضافي', 'Choose total extra storage') : text('اختر إجمالي المقاعد الإضافية', 'Choose total extra seats')}
                                </strong>
                                <span className="rounded-full border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] px-2.5 py-1 text-[8px] font-bold text-[var(--acs-text-muted)]">
                                    {text('الحالي', 'Current')}: {displayCapacity(currentQuantity)}
                                </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                {capacity?.presets.map(option => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => {
                                            setCustomMode(false);
                                            setTargetQuantity(option);
                                        }}
                                        className={[
                                            'min-h-[88px] rounded-[14px] border px-3 py-3 text-center transition',
                                            ! customMode && targetQuantity === option
                                                ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] ring-1 ring-[var(--acs-accent)]'
                                                : 'border-[var(--acs-line)] bg-[var(--acs-surface-soft)] hover:border-[var(--acs-line-strong)]',
                                        ].join(' ')}
                                    >
                                        <strong className="block text-base font-extrabold text-[var(--acs-text)]">
                                            {kind === 'storage' ? `${option} GB` : option}
                                        </strong>
                                        <span className="mt-1 block text-[8px] text-[var(--acs-text-muted)]">
                                            {capacity ? money(capacity.unitAmount * option, addon?.currency ?? 'USD', locale) : '—'} / {addon?.interval === 'year' ? text('سنة', 'year') : text('شهر', 'month')}
                                        </span>
                                    </button>
                                ))}
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
                                    <strong className="block text-[11px] font-extrabold text-[var(--acs-text)]">{text('مخصص', 'Custom')}</strong>
                                    <span className="mt-1 block text-[8px] text-[var(--acs-text-muted)]">{text('مثلاً 3', 'e.g. 3')}</span>
                                </button>
                            </div>

                            {customMode && capacity && (
                                <div className="mt-3 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3.5">
                                    <label className="text-[8px] font-bold text-[var(--acs-text-muted)]">
                                        {kind === 'storage' ? text('إجمالي التخزين الإضافي بالـ GB', 'Total extra storage in GB') : text('إجمالي المقاعد الإضافية', 'Total extra seats')}
                                    </label>
                                    <input
                                        autoFocus
                                        type="number"
                                        min={0}
                                        max={capacity.maxQuantity}
                                        step={1}
                                        value={customQuantity}
                                        onChange={event => setCustomQuantity(event.target.value)}
                                        placeholder={kind === 'storage' ? '25' : '3'}
                                        className="mt-2 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-surface)] px-3 py-2.5 text-sm font-bold text-[var(--acs-text)] outline-none focus:border-[var(--acs-accent)]"
                                    />
                                    <p className="mt-2 text-[8px] text-[var(--acs-text-muted)]">
                                        {text('اكتب العدد النهائي الذي تريده. اكتب 0 لإزالة الإضافة بالكامل.', 'Enter the final amount you want. Enter 0 to remove the add-on completely.')}
                                    </p>
                                </div>
                            )}

                            {currentQuantity > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCustomMode(false);
                                        setTargetQuantity(0);
                                    }}
                                    className={[
                                        'mt-3 flex w-full items-center justify-center gap-2 rounded-[11px] border px-3 py-2.5 text-[9px] font-bold transition',
                                        ! customMode && targetQuantity === 0
                                            ? 'border-red-400/50 bg-red-500/10 text-red-500'
                                            : 'border-[var(--acs-line)] text-[var(--acs-text-muted)] hover:border-red-400/40 hover:text-red-500',
                                    ].join(' ')}
                                >
                                    <Trash2 size={13} />
                                    {text('إزالة الإضافة بالكامل', 'Remove this add-on completely')}
                                </button>
                            )}

                            <div className="mt-4 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3.5">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] text-[var(--acs-text-muted)]">{text('الحالي', 'Current')}</span>
                                    <strong className="text-[10px] text-[var(--acs-text)]">{displayCapacity(currentQuantity)}</strong>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <span className="text-[9px] text-[var(--acs-text-muted)]">{text('بعد التعديل', 'After change')}</span>
                                    <strong className="text-[10px] text-[var(--acs-accent)]">{displayCapacity(requestedTarget)}</strong>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3">
                                    <span className="text-[9px] text-[var(--acs-text-muted)]">{text('السعر الدوري الجديد', 'New recurring price')}</span>
                                    <strong className="text-[10px] text-[var(--acs-text)]">
                                        {money(recurringAmount, addon?.currency ?? 'USD', locale)} / {addon?.interval === 'year' ? text('سنة', 'year') : text('شهر', 'month')}
                                    </strong>
                                </div>
                                {currentQuantity > 0 && (
                                    <div className="mt-2 flex items-center justify-between gap-3">
                                        <span className="text-[8px] text-[var(--acs-text-muted)]">{text('السعر الحالي للإضافة', 'Current add-on price')}</span>
                                        <span className="text-[8px] text-[var(--acs-text-muted)]">{money(currentRecurringAmount, addon?.currency ?? 'USD', locale)}</span>
                                    </div>
                                )}
                                <p className="mt-2 border-t border-[var(--acs-line)] pt-2 text-[8px] leading-4 text-[var(--acs-text-muted)]">
                                    {text('Stripe يحسب الفرق النسبي للفترة الحالية تلقائيًا. الزيادة أو التخفيض يبقيان داخل نفس اشتراكك الرئيسي.', 'Stripe automatically prorates the current period. Increases and decreases stay on your main subscription.')}
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
                                    <span className="mt-0.5 block text-[7px] text-[var(--acs-text-muted)]">{text('الإضافات الدورية تُربط بنفس الاشتراك الرئيسي، ولا ننشئ اشتراكًا ثانيًا.', 'Recurring add-ons are attached to the same main subscription; no second subscription is created.')}</span>
                                </div>
                            </div>
                            <Check size={15} className="text-emerald-500" />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={busy || settingsBusy || (kind === 'ai' ? ! aiValid : ! resourceValid || ! resourceChanged)}
                        className="flex w-full items-center justify-center gap-2 rounded-[13px] border border-[var(--acs-accent)] bg-[var(--acs-accent)] px-4 py-3.5 text-[10px] font-extrabold text-white shadow-[0_10px_24px_rgba(35,120,220,.2)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        {busy ? <LoaderCircle size={15} className="animate-spin" /> : kind !== 'ai' && requestedTarget === 0 ? <Trash2 size={15} /> : <Zap size={15} />}
                        {kind === 'ai'
                            ? text(`المتابعة للدفع — ${money(aiAmountMinor, credits.pricing.currency, locale)}`, `Continue to payment — ${money(aiAmountMinor, credits.pricing.currency, locale)}`)
                            : requestedTarget === 0
                                ? text('تأكيد إزالة الإضافة', 'Confirm add-on removal')
                                : text(`حفظ الكمية الجديدة — ${money(recurringAmount, addon?.currency ?? 'USD', locale)}`, `Save new quantity — ${money(recurringAmount, addon?.currency ?? 'USD', locale)}`)}
                    </button>
                </div>
            </section>
        </div>
    );
}
