import { apiRequest } from '@/lib/http';
import {
    CalendarClock,
    CopyPlus,
    RefreshCcw,
    X,
} from 'lucide-react';
import {
    useState,
} from 'react';
import { createPortal } from 'react-dom';

export function InvoiceAutomationActions({
    documentId,
    ar,
    canManage,
    onError,
}: {
    documentId: number;
    ar: boolean;
    canManage: boolean;
    onError?: (message: string) => void;
}) {
    const [mode, setMode] =
        useState<
            'template'
            | 'recurring'
            | null
        >(null);
    const [name, setName] = useState('');
    const [frequency, setFrequency] =
        useState<
            'weekly'
            | 'monthly'
            | 'quarterly'
        >('monthly');
    const [nextRunOn, setNextRunOn] =
        useState('');
    const [endsOn, setEndsOn] =
        useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    if (! canManage) {
        return null;
    }

    async function save(): Promise<void> {
        if (
            busy
            || ! name.trim()
            || (
                mode === 'recurring'
                && ! nextRunOn
            )
        ) {
            return;
        }

        setBusy(true);
        setMessage('');

        try {
            if (mode === 'template') {
                await apiRequest(
                    '/api/finance/documents/'
                    + documentId
                    + '/templates',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            name:
                                name.trim(),
                        }),
                    },
                );

                setMessage(
                    ar
                        ? 'تم حفظ قالب الفاتورة.'
                        : 'Invoice template saved.',
                );
            } else {
                await apiRequest(
                    '/api/finance/documents/'
                    + documentId
                    + '/recurring',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            name:
                                name.trim(),
                            frequency,
                            interval: 1,
                            next_run_on:
                                nextRunOn,
                            ends_on:
                                endsOn
                                || null,
                        }),
                    },
                );

                setMessage(
                    ar
                        ? 'تم إنشاء التكرار. كل استحقاق سينشئ مسودة للمراجعة فقط.'
                        : 'Recurring schedule created. Each occurrence creates a review-only draft.',
                );
            }
        } catch (failure) {
            const error =
                failure instanceof Error
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر حفظ الإعداد.'
                            : 'The automation could not be saved.'
                    );

            setMessage(error);
            onError?.(error);
        } finally {
            setBusy(false);
        }
    }

    function open(
        next:
            'template'
            | 'recurring',
    ): void {
        setMode(next);
        setName('');
        setFrequency('monthly');
        setNextRunOn('');
        setEndsOn('');
        setMessage('');
    }

    return (
        <>
            <button
                type="button"
                onClick={() => open('template')}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)]"
            >
                <CopyPlus size={14} />
                {ar ? 'حفظ كقالب' : 'Save template'}
            </button>

            <button
                type="button"
                onClick={() => open('recurring')}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)]"
            >
                <RefreshCcw size={14} />
                {ar ? 'تكرار الفاتورة' : 'Make recurring'}
            </button>

            {mode && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[330] flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label={ar ? 'إغلاق' : 'Close'}
                        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                        onClick={() => setMode(null)}
                    />

                    <section className="relative z-10 w-full max-w-lg rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[0_30px_100px_rgba(0,0,0,.3)]">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <span className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                    {mode === 'template'
                                        ? <CopyPlus size={17} />
                                        : <CalendarClock size={17} />}
                                </span>
                                <h2 className="mt-3 text-lg font-bold">
                                    {mode === 'template'
                                        ? (
                                            ar
                                                ? 'حفظ قالب فاتورة'
                                                : 'Save invoice template'
                                        )
                                        : (
                                            ar
                                                ? 'فاتورة متكررة'
                                                : 'Recurring invoice'
                                        )}
                                </h2>
                                <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                    {mode === 'template'
                                        ? (
                                            ar
                                                ? 'استخدم نفس البنود والإعدادات لاحقاً لإنشاء مسودة جديدة بسرعة.'
                                                : 'Reuse the same lines and settings later to create a new draft quickly.'
                                        )
                                        : (
                                            ar
                                                ? 'AccoNova سينشئ مسودة فقط في كل موعد. لن يتم إصدار أي فاتورة تلقائياً.'
                                                : 'AccoNova creates drafts only on schedule. Nothing is auto-issued.'
                                        )}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setMode(null)}
                                className="flex size-9 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <label className="mt-5 block text-xs font-semibold text-[var(--ac-text-soft)]">
                            {ar ? 'الاسم' : 'Name'}
                            <input
                                value={name}
                                onChange={(event) =>
                                    setName(
                                        event.target.value,
                                    )}
                                className="mt-2 h-11 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm outline-none focus:border-[var(--ac-accent)]"
                                placeholder={
                                    ar
                                        ? 'مثال: اشتراك شهري'
                                        : 'Example: Monthly subscription'
                                }
                            />
                        </label>

                        {mode === 'recurring' && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                    {ar ? 'التكرار' : 'Frequency'}
                                    <select
                                        value={frequency}
                                        onChange={(event) =>
                                            setFrequency(
                                                event.target.value as typeof frequency,
                                            )}
                                        className="mt-2 h-11 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm"
                                    >
                                        <option value="weekly">
                                            {ar ? 'أسبوعي' : 'Weekly'}
                                        </option>
                                        <option value="monthly">
                                            {ar ? 'شهري' : 'Monthly'}
                                        </option>
                                        <option value="quarterly">
                                            {ar ? 'ربع سنوي' : 'Quarterly'}
                                        </option>
                                    </select>
                                </label>

                                <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                    {ar ? 'أول موعد' : 'First run'}
                                    <input
                                        type="date"
                                        value={nextRunOn}
                                        onChange={(event) =>
                                            setNextRunOn(
                                                event.target.value,
                                            )}
                                        className="mt-2 h-11 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm"
                                    />
                                </label>

                                <label className="text-xs font-semibold text-[var(--ac-text-soft)] sm:col-span-2">
                                    {ar ? 'تاريخ الانتهاء (اختياري)' : 'End date (optional)'}
                                    <input
                                        type="date"
                                        value={endsOn}
                                        onChange={(event) =>
                                            setEndsOn(
                                                event.target.value,
                                            )}
                                        className="mt-2 h-11 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm"
                                    />
                                </label>
                            </div>
                        )}

                        {message && (
                            <div className="mt-4 rounded-[12px] bg-[var(--ac-surface-soft)] p-3 text-xs text-[var(--ac-text-soft)]">
                                {message}
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setMode(null)}
                                className="h-10 rounded-[11px] border border-[var(--ac-line)] px-4 text-xs font-semibold"
                            >
                                {ar ? 'إغلاق' : 'Close'}
                            </button>
                            <button
                                type="button"
                                disabled={
                                    busy
                                    || ! name.trim()
                                    || (
                                        mode === 'recurring'
                                        && ! nextRunOn
                                    )
                                }
                                onClick={() => void save()}
                                className="h-10 rounded-[11px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-50"
                            >
                                {busy
                                    ? (ar ? 'جارٍ الحفظ…' : 'Saving…')
                                    : (ar ? 'حفظ' : 'Save')}
                            </button>
                        </div>
                    </section>
                </div>,
                document.body,
            )}
        </>
    );
}
