import type { Party } from '@/features/parties/types';
import { ApiError, apiRequest } from '@/lib/http';
import { Gauge, LoaderCircle, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Reason = { code: string; text: string; value?: unknown; threshold?: unknown };

type Assessment = {
    recommendation: {
        key: string;
        summary: string;
        credit_limit: string | null;
        credit_days: number | null;
        advance_percent: number | null;
        fallback?: string;
        conditions: string[];
    };
    reasons: Reason[];
    sufficiency: { enough: boolean; missing: { code: string; have: number; need: number }[] };
    data: Record<string, string | number | null>;
    latest_decision: { decision: string; overrides_recommendation: boolean; credit_limit: string | null; credit_days: number | null; decided_at: string; notes: string | null } | null;
    disclaimer: string;
};

type Policy = Record<string, string | number | null>;

const KEYS = ['credit', 'cheque_with_conditions', 'advance_payment', 'cash_only', 'stop_credit'] as const;

const names: Record<string, [string, string]> = {
    credit: ['آجل بسقف ومدة', 'Credit with a limit and term'],
    cheque_with_conditions: ['شيك بشروط', 'Cheque with conditions'],
    advance_payment: ['دفعة مقدمة', 'Advance payment'],
    cash_only: ['نقد فقط', 'Cash only'],
    stop_credit: ['وقف الآجل مؤقتًا', 'Pause credit'],
    insufficient_data: ['بيانات غير كافية', 'Insufficient data'],
};

const tones: Record<string, string> = {
    credit: 'bg-emerald-500/15 text-emerald-700',
    cheque_with_conditions: 'bg-amber-500/15 text-amber-700',
    advance_payment: 'bg-amber-500/15 text-amber-700',
    cash_only: 'bg-orange-500/15 text-orange-700',
    stop_credit: 'bg-red-500/15 text-red-600',
    insufficient_data: 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]',
};

const dataLabels: [string, string, string][] = [
    ['invoices', 'عدد الفواتير', 'Invoices'],
    ['history_days', 'مدة التعامل (يوم)', 'History (days)'],
    ['on_time_ratio', 'نسبة السداد في الموعد', 'Paid on time'],
    ['avg_days_late', 'متوسط التأخر (يوم)', 'Average delay (days)'],
    ['outstanding', 'المستحق', 'Outstanding'],
    ['overdue', 'المتأخر', 'Overdue'],
    ['oldest_overdue_days', 'أقدم تأخر (يوم)', 'Oldest overdue (days)'],
    ['avg_monthly_sales', 'متوسط المبيعات الشهرية', 'Average monthly sales'],
    ['credit_limit', 'السقف الحالي', 'Current limit'],
    ['exposure', 'الانكشاف (رصيد + شيكات معلقة)', 'Exposure (balance + pending cheques)'],
    ['pending_cheques_amount', 'شيكات معلقة', 'Pending cheques'],
    ['bounced_cheques', 'شيكات مرتجعة', 'Bounced cheques'],
    ['missed_promises', 'وعود فائتة', 'Missed promises'],
];

const policyFields: [string, string, string][] = [
    ['min_history_invoices', 'أقل عدد فواتير', 'Minimum invoices'],
    ['min_history_days', 'أقل مدة تعامل (يوم)', 'Minimum history (days)'],
    ['min_on_time_ratio', 'أقل نسبة سداد في الموعد (0-1)', 'Minimum on-time ratio (0-1)'],
    ['max_avg_days_late', 'أقصى متوسط تأخر (يوم)', 'Maximum average delay (days)'],
    ['max_overdue_ratio', 'أقصى نسبة متأخر (0-1)', 'Maximum overdue share (0-1)'],
    ['stop_credit_overdue_days', 'وقف الآجل عند تأخر (يوم)', 'Pause credit at overdue (days)'],
    ['stop_credit_bounced_cheques', 'وقف الآجل عند شيكات مرتجعة', 'Pause credit at bounced cheques'],
    ['stop_credit_missed_promises', 'وقف الآجل عند وعود فائتة', 'Pause credit at missed promises'],
    ['credit_days', 'مدة الآجل (يوم)', 'Credit term (days)'],
    ['advance_percent', 'نسبة الدفعة المقدمة %', 'Advance %'],
    ['limit_months_of_sales', 'السقف = أشهر من متوسط المبيعات', 'Limit = months of average sales'],
    ['max_credit_limit', 'أعلى سقف مسموح', 'Maximum limit'],
];

const input = 'h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs outline-none focus:border-[var(--ac-accent)]';
const button = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] border border-[var(--ac-line)] px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-50';

function errorText(failure: unknown, ar: boolean): string {
    return failure instanceof ApiError
        ? [failure.message, ...Object.values(failure.errors ?? {}).flat()].join(' ')
        : ar ? 'تعذر إكمال العملية.' : 'The action could not be completed.';
}

/** Arabic wording for a reason; falls back to the server's English text. */
function reasonText(reason: Reason, ar: boolean): string {
    if (! ar) {
        return reason.text;
    }

    const value = String(reason.value ?? '');
    const threshold = String(reason.threshold ?? '');
    const pct = (raw: unknown): string => String(Math.round(Number(raw) * 100)) + '%';

    switch (reason.code) {
        case 'overdue_days': return 'أقدم فاتورة متأخرة ' + value + ' يومًا (يوقف الآجل عند ' + threshold + ').';
        case 'bounced_cheques': return value + ' شيك/شيكات مرتجعة ضمن فترة المراجعة (الحد ' + threshold + ').';
        case 'missed_promises': return value + ' وعد/وعود دفع فائتة ضمن فترة المراجعة (الحد ' + threshold + ').';
        case 'over_limit': return 'الانكشاف ' + value + ' يتجاوز السقف ' + threshold + ' مع وجود متأخرات.';
        case 'on_time_ratio': return 'نسبة الفواتير المسددة في موعدها ' + pct(reason.value) + ' (الحد الأدنى ' + pct(reason.threshold) + ').';
        case 'avg_days_late': return 'متوسط التأخر في السداد ' + value + ' يومًا (الحد الأقصى ' + threshold + ').';
        case 'overdue_ratio': return 'نسبة المتأخر من الرصيد ' + pct(reason.value) + ' (الحد الأقصى ' + pct(reason.threshold) + ').';
        case 'good_record': return 'سجل السداد ضمن كل حدود السياسة.';
        case 'limit_basis': return 'السقف = متوسط المبيعات الشهرية × عدد الأشهر في السياسة.';
        case 'insufficient_history_invoices': return 'عدد الفواتير ' + value + ' فقط؛ السياسة تحتاج ' + threshold + '.';
        case 'insufficient_history_days': return 'مدة التعامل ' + value + ' يومًا؛ السياسة تحتاج ' + threshold + '.';
        case 'insufficient_paid_invoices': return 'لا توجد فاتورة مسددة بالكامل بعد، فسلوك السداد غير معروف.';
        default: return reason.text;
    }
}

/**
 * Explained credit recommendation for a customer. It is advice: the merchant
 * records the final decision here, and may differ from the recommendation.
 */
export function PartyCreditPanel({ party, ar }: { party: Party; ar: boolean }) {
    const t = (key: string): string => names[key]?.[ar ? 0 : 1] ?? key;
    const [data, setData] = useState<Assessment | null>(null);
    const [policy, setPolicy] = useState<Policy | null>(null);
    const [showPolicy, setShowPolicy] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState('');

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            setData((await apiRequest<{ data: Assessment }>('/api/parties/' + String(party.id) + '/credit-assessment')).data);
        } catch (failure) {
            setError(errorText(failure, ar));
        } finally {
            setLoading(false);
        }
    }, [party.id, ar]);

    useEffect(() => {
        void load();
    }, [load]);

    async function openPolicy(): Promise<void> {
        const next = ! showPolicy;
        setShowPolicy(next);

        if (next && ! policy) {
            try {
                setPolicy((await apiRequest<{ data: Policy }>('/api/credit-policy')).data);
            } catch (failure) {
                setError(errorText(failure, ar));
            }
        }
    }

    async function savePolicy(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(event.currentTarget));
        const payload: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(form)) {
            payload[key] = value === '' ? null : value;
        }

        setBusy(true);
        setError('');

        try {
            setPolicy((await apiRequest<{ data: Policy }>('/api/credit-policy', { method: 'PUT', body: JSON.stringify(payload) })).data);
            setSaved(ar ? 'تم حفظ السياسة.' : 'Policy saved.');
            await load();
        } catch (failure) {
            setError(errorText(failure, ar));
        } finally {
            setBusy(false);
        }
    }

    async function decide(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const form = Object.fromEntries(new FormData(event.currentTarget));
        const payload: Record<string, unknown> = { ...form, apply_credit_limit: form.apply_credit_limit === 'on' };

        for (const key of Object.keys(payload)) {
            if (payload[key] === '') {
                delete payload[key];
            }
        }

        setBusy(true);
        setError('');
        setSaved('');

        try {
            await apiRequest('/api/parties/' + String(party.id) + '/credit-decisions', { method: 'POST', body: JSON.stringify(payload) });
            setSaved(ar ? 'تم تسجيل القرار.' : 'Decision recorded.');
            await load();
        } catch (failure) {
            setError(errorText(failure, ar));
        } finally {
            setBusy(false);
        }
    }

    if (! party.roles.includes('customer')) {
        return null;
    }

    const recommended = data?.recommendation.key ?? 'insufficient_data';

    return (
        <section className="mt-5 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Gauge size={16} className="text-[var(--ac-accent)]" />
                    <h3 className="text-sm font-bold">{ar ? 'توصية الائتمان' : 'Credit recommendation'}</h3>
                </div>
                <button type="button" className={button} onClick={() => void openPolicy()}>
                    <Settings2 size={13} />
                    {ar ? 'سياسة الائتمان' : 'Credit policy'}
                </button>
            </header>

            {loading && <LoaderCircle size={16} className="mt-3 animate-spin text-[var(--ac-text-muted)]" />}
            {error && <p role="alert" className="mt-3 rounded-[12px] bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>}
            {saved && <p role="status" className="mt-3 rounded-[12px] bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">{saved}</p>}

            {data && (
                <div className="mt-3 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={'rounded-full px-3 py-1 text-[11px] font-bold ' + (tones[recommended] ?? tones.insufficient_data)}>
                            {t(recommended)}
                        </span>
                        {data.recommendation.credit_limit && (
                            <span>{ar ? 'السقف المقترح ' : 'Suggested limit '}<b>{Number(data.recommendation.credit_limit).toLocaleString()}</b>{' · '}{data.recommendation.credit_days}{ar ? ' يوم' : ' days'}</span>
                        )}
                        {data.recommendation.advance_percent && <span>{ar ? 'دفعة مقدمة ' : 'Advance '}<b>{data.recommendation.advance_percent}%</b></span>}
                    </div>

                    <p className="text-[var(--ac-text-soft)]">{data.recommendation.summary}</p>

                    {data.recommendation.conditions.length > 0 && (
                        <ul className="list-disc space-y-0.5 ps-5 text-[var(--ac-text-soft)]">
                            {data.recommendation.conditions.map((condition) => <li key={condition}>{condition}</li>)}
                        </ul>
                    )}

                    {! data.sufficiency.enough && (
                        <p className="rounded-[12px] bg-[var(--ac-accent-soft)] px-3 py-2 text-[var(--ac-accent)]">
                            {ar ? 'البيانات غير كافية للتوصية بثقة: ' : 'Not enough data for a confident recommendation: '}
                            {data.sufficiency.missing.map((item) => item.code + ' ' + String(item.have) + '/' + String(item.need)).join(' · ')}
                        </p>
                    )}

                    <div>
                        <p className="mb-1 font-bold">{ar ? 'الأسباب' : 'Reasons'}</p>
                        <ul className="list-disc space-y-0.5 ps-5">
                            {data.reasons.map((reason) => <li key={reason.code}>{reasonText(reason, ar)}</li>)}
                        </ul>
                    </div>

                    <div>
                        <p className="mb-1 font-bold">{ar ? 'البيانات المرجعية' : 'Reference data'}</p>
                        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                            {dataLabels.map(([key, arabic, english]) => (
                                <div key={key} className="flex justify-between gap-2 border-b border-[var(--ac-line)] py-0.5">
                                    <dt className="text-[var(--ac-text-muted)]">{ar ? arabic : english}</dt>
                                    <dd className="font-semibold">{data.data[key] ?? '—'}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>

                    {data.latest_decision && (
                        <p className="rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2">
                            {ar ? 'آخر قرار: ' : 'Latest decision: '}
                            <b>{t(data.latest_decision.decision)}</b>
                            {data.latest_decision.overrides_recommendation ? (ar ? ' (خالف التوصية)' : ' (overrode the recommendation)') : ''}
                            {' · '}
                            {data.latest_decision.decided_at.slice(0, 10)}
                        </p>
                    )}

                    <form onSubmit={(event) => void decide(event)} className="grid gap-2 rounded-[14px] border border-[var(--ac-line)] p-3 sm:grid-cols-2">
                        <p className="font-bold sm:col-span-2">{ar ? 'القرار النهائي للتاجر' : 'Merchant\'s final decision'}</p>
                        <label>
                            {ar ? 'القرار' : 'Decision'}
                            <select name="decision" defaultValue={KEYS.includes(recommended as typeof KEYS[number]) ? recommended : data.recommendation.fallback ?? 'cash_only'} className={input}>
                                {KEYS.map((key) => <option key={key} value={key}>{t(key)}</option>)}
                            </select>
                        </label>
                        <label>
                            {ar ? 'السقف' : 'Credit limit'}
                            <input name="credit_limit" type="number" min={0} step="0.01" defaultValue={data.recommendation.credit_limit ?? ''} className={input} />
                        </label>
                        <label>
                            {ar ? 'مدة الآجل (يوم)' : 'Credit term (days)'}
                            <input name="credit_days" type="number" min={1} max={365} defaultValue={data.recommendation.credit_days ?? ''} className={input} />
                        </label>
                        <label>
                            {ar ? 'دفعة مقدمة %' : 'Advance %'}
                            <input name="advance_percent" type="number" min={1} max={100} defaultValue={data.recommendation.advance_percent ?? ''} className={input} />
                        </label>
                        <label className="sm:col-span-2">
                            {ar ? 'ملاحظات' : 'Notes'}
                            <input name="notes" maxLength={2000} className={input} />
                        </label>
                        <label className="flex items-center gap-2 sm:col-span-2">
                            <input name="apply_credit_limit" type="checkbox" className="size-4 accent-[var(--ac-accent)]" />
                            {ar ? 'طبّق السقف على بطاقة العميل' : 'Apply the limit to the customer record'}
                        </label>
                        <button type="submit" disabled={busy} className={button + ' sm:col-span-2'}>
                            {ar ? 'تسجيل القرار' : 'Record decision'}
                        </button>
                    </form>

                    <p className="text-[10px] text-[var(--ac-text-muted)]">
                        {ar ? 'هذه توصية فقط والقرار النهائي لتاجر مخوَّل.' : data.disclaimer}
                    </p>
                </div>
            )}

            {showPolicy && policy && (
                <form onSubmit={(event) => void savePolicy(event)} className="mt-4 grid gap-2 rounded-[14px] border border-[var(--ac-line)] p-3 text-xs sm:grid-cols-2">
                    {policyFields.map(([key, arabic, english]) => (
                        <label key={key}>
                            {ar ? arabic : english}
                            <input name={key} type="number" step="any" defaultValue={policy[key] ?? ''} className={input} />
                        </label>
                    ))}
                    <label className="sm:col-span-2">
                        {ar ? 'شروط العميل الجديد' : 'New customer terms'}
                        <select name="new_customer_terms" defaultValue={String(policy.new_customer_terms ?? 'advance_payment')} className={input}>
                            <option value="advance_payment">{t('advance_payment')}</option>
                            <option value="cash_only">{t('cash_only')}</option>
                        </select>
                    </label>
                    <button type="submit" disabled={busy} className={button + ' sm:col-span-2'}>{ar ? 'حفظ السياسة' : 'Save policy'}</button>
                </form>
            )}
        </section>
    );
}
