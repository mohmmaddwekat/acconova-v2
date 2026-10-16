import { ApiError, apiRequest } from '@/lib/http';
import { BellRing, ChevronDown, LoaderCircle, PhoneCall, RefreshCw, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type NextAction = {
    key: string;
    suggested_channel: string;
    approved_channels: string[];
    requires_approval: boolean;
    outbound_message_allowed: boolean;
};

type FollowUp = {
    party_id: number;
    party: string;
    phone: string | null;
    overdue_amount: string;
    outstanding: string;
    days_late: number;
    last_payment_on: string | null;
    alerts: { id: number; kind: string; severity: string; days_late: number; reason: { promise?: { promised_on: string } } }[];
    last_contact: { days_ago: number; channel: string; outcome: string; note: string | null } | null;
    next_action: NextAction;
};

type Rule = {
    kind: string;
    enabled: boolean;
    threshold_days: number;
    min_amount: string;
    repeat_after_days: number;
    approved_channels: string[];
};

const CHANNELS = ['call', 'visit', 'email', 'whatsapp', 'sms'];
const OUTCOMES = ['reached', 'no_answer', 'promised', 'refused', 'other'];

const labels = {
    kinds: {
        overdue: ['متأخر عن الاستحقاق', 'Overdue'],
        stopped_paying: ['انقطع عن الدفع', 'Stopped paying'],
        missed_promise: ['وعد دفع فائت', 'Missed promise'],
    } as Record<string, [string, string]>,
    actions: {
        contact_customer: ['تواصل مع العميل', 'Contact the customer'],
        call_about_missed_promise: ['اتصل بخصوص الوعد الفائت', 'Call about the missed promise'],
        escalate_to_manager: ['ارفع الحالة للمدير', 'Escalate to a manager'],
        wait_for_promise: ['انتظر موعد الوعد', 'Wait for the promised date'],
        ask_for_reason: ['اسأل عن سبب التوقف', 'Ask why payments stopped'],
        follow_up_again: ['تابع مرة أخرى', 'Follow up again'],
    } as Record<string, [string, string]>,
    channels: {
        call: ['اتصال', 'Call'], visit: ['زيارة', 'Visit'], email: ['إيميل', 'Email'], whatsapp: ['واتساب', 'WhatsApp'], sms: ['رسالة نصية', 'SMS'],
    } as Record<string, [string, string]>,
    outcomes: {
        reached: ['تم الرد', 'Reached'], no_answer: ['لا يوجد رد', 'No answer'], promised: ['وعد بالدفع', 'Promised to pay'], refused: ['رفض', 'Refused'], other: ['أخرى', 'Other'],
    } as Record<string, [string, string]>,
};

const inputClass = 'h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs outline-none focus:border-[var(--ac-accent)]';
const buttonClass = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] border border-[var(--ac-line)] px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-50';

function errorText(failure: unknown, ar: boolean): string {
    if (failure instanceof ApiError) {
        return [failure.message, ...Object.values(failure.errors ?? {}).flat()].join(' ');
    }

    return ar ? 'تعذر إكمال العملية.' : 'The action could not be completed.';
}

/**
 * The collections follow-up queue: who to chase first, why, when they were last
 * contacted and what to do next. Messages are never sent from here.
 */
export function CollectionFollowUpPanel({ ar }: { ar: boolean }) {
    const t = (pair: [string, string] | undefined, fallback: string): string => (pair ? (ar ? pair[0] : pair[1]) : fallback);
    const [items, setItems] = useState<FollowUp[]>([]);
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openContact, setOpenContact] = useState<number | null>(null);
    const [showRules, setShowRules] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async (refresh = false): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            const response = await apiRequest<{ data: FollowUp[] }>('/api/collections/follow-ups' + (refresh ? '?refresh=1' : ''));
            setItems(response.data);
        } catch (failure) {
            setError(errorText(failure, ar));
        } finally {
            setLoading(false);
        }
    }, [ar]);

    useEffect(() => {
        void load();
    }, [load]);

    async function toggleRules(): Promise<void> {
        const next = ! showRules;
        setShowRules(next);

        if (next && rules.length === 0) {
            try {
                setRules((await apiRequest<{ data: Rule[] }>('/api/collections/rules')).data);
            } catch (failure) {
                setError(errorText(failure, ar));
            }
        }
    }

    async function act(path: string, body: Record<string, unknown>, method = 'POST'): Promise<boolean> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(path, { method, body: JSON.stringify(body) });

            return true;
        } catch (failure) {
            setError(errorText(failure, ar));

            return false;
        } finally {
            setBusy(false);
        }
    }

    async function logContact(event: FormEvent<HTMLFormElement>, partyId: number): Promise<void> {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));

        for (const key of Object.keys(data)) {
            if (data[key] === '') {
                delete data[key];
            }
        }

        if (await act('/api/parties/' + String(partyId) + '/collection-contacts', data)) {
            setOpenContact(null);
            await load();
        }
    }

    async function saveRule(rule: Rule): Promise<void> {
        const ok = await act('/api/collections/rules/' + rule.kind, {
            enabled: rule.enabled,
            threshold_days: rule.threshold_days,
            min_amount: rule.min_amount,
            repeat_after_days: rule.repeat_after_days,
            approved_channels: rule.approved_channels,
        }, 'PUT');

        if (ok) {
            await load(true);
        }
    }

    function patchRule(kind: string, patch: Partial<Rule>): void {
        setRules((current) => current.map((rule) => (rule.kind === kind ? { ...rule, ...patch } : rule)));
    }

    return (
        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <BellRing size={16} className="text-[var(--ac-accent)]" />
                    <h2 className="text-sm font-bold">{ar ? 'قائمة المتابعة' : 'Follow-up queue'}</h2>
                    <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--ac-accent)]">{items.length}</span>
                </div>
                <div className="flex gap-2">
                    <button type="button" className={buttonClass} onClick={() => void load(true)} disabled={loading}>
                        {loading ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        {ar ? 'تحديث' : 'Refresh'}
                    </button>
                    <button type="button" className={buttonClass} onClick={() => void toggleRules()}>
                        <Settings2 size={13} />
                        {ar ? 'قواعد التنبيه' : 'Alert rules'}
                        <ChevronDown size={12} className={showRules ? 'rotate-180' : ''} />
                    </button>
                </div>
            </header>

            <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">
                {ar
                    ? 'مرتبة بالمبلغ المتأخر ثم مدة التأخر. لا تُرسل أي رسالة للعميل تلقائيًا؛ الإرسال يحتاج موافقة شخص وقناة معتمدة.'
                    : 'Sorted by overdue amount, then delay. Nothing is sent to a customer automatically; sending needs a person\'s approval and an approved channel.'}
            </p>

            {error && <p role="alert" className="mt-3 rounded-[12px] bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>}

            {showRules && (
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {rules.map((rule) => (
                        <div key={rule.kind} className="space-y-2 rounded-[14px] border border-[var(--ac-line)] p-3 text-xs">
                            <label className="flex items-center justify-between gap-2 font-semibold">
                                {t(labels.kinds[rule.kind], rule.kind)}
                                <input type="checkbox" checked={rule.enabled} onChange={(event) => patchRule(rule.kind, { enabled: event.target.checked })} className="size-4 accent-[var(--ac-accent)]" />
                            </label>
                            <label className="block">
                                {rule.kind === 'overdue' ? (ar ? 'تنبيه بعد (أيام تأخر)' : 'Alert after (days late)') : rule.kind === 'stopped_paying' ? (ar ? 'أيام دون دفع' : 'Days without payment') : (ar ? 'أيام بعد موعد الوعد' : 'Days after the promised date')}
                                <input type="number" min={0} max={365} value={rule.threshold_days} onChange={(event) => patchRule(rule.kind, { threshold_days: Number(event.target.value) })} className={inputClass} />
                            </label>
                            <label className="block">
                                {ar ? 'أقل مبلغ' : 'Minimum amount'}
                                <input type="number" min={0} step="0.01" value={rule.min_amount} onChange={(event) => patchRule(rule.kind, { min_amount: event.target.value })} className={inputClass} />
                            </label>
                            <label className="block">
                                {ar ? 'لا تكرر التنبيه قبل (أيام)' : 'Do not repeat before (days)'}
                                <input type="number" min={1} max={90} value={rule.repeat_after_days} onChange={(event) => patchRule(rule.kind, { repeat_after_days: Number(event.target.value) })} className={inputClass} />
                            </label>
                            <fieldset>
                                <legend className="mb-1">{ar ? 'قنوات التواصل المعتمدة' : 'Approved channels'}</legend>
                                <div className="flex flex-wrap gap-2">
                                    {CHANNELS.map((channel) => (
                                        <label key={channel} className="flex items-center gap-1">
                                            <input
                                                type="checkbox"
                                                checked={rule.approved_channels.includes(channel)}
                                                onChange={(event) => patchRule(rule.kind, {
                                                    approved_channels: event.target.checked
                                                        ? [...rule.approved_channels, channel]
                                                        : rule.approved_channels.filter((item) => item !== channel),
                                                })}
                                                className="size-3.5 accent-[var(--ac-accent)]"
                                            />
                                            {t(labels.channels[channel], channel)}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            <button type="button" className={buttonClass + ' w-full'} disabled={busy} onClick={() => void saveRule(rule)}>
                                {ar ? 'حفظ القاعدة' : 'Save rule'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {! loading && items.length === 0 && ! error && (
                <p className="mt-4 rounded-[14px] border border-dashed border-[var(--ac-line)] px-4 py-6 text-center text-xs text-[var(--ac-text-muted)]">
                    {ar ? 'لا توجد حالات تحتاج متابعة الآن.' : 'Nothing needs follow-up right now.'}
                </p>
            )}

            <ul className="mt-4 space-y-3">
                {items.map((item) => (
                    <li key={item.party_id} className="rounded-[14px] border border-[var(--ac-line)] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-bold">{item.party}</p>
                                <p className="mt-0.5 text-[11px] text-[var(--ac-text-muted)]">
                                    {ar ? 'متأخر ' : 'Overdue '}
                                    <b>{Number(item.overdue_amount).toLocaleString()}</b>
                                    {' · '}
                                    {item.days_late}
                                    {ar ? ' يومًا' : ' days'}
                                    {item.last_payment_on ? (ar ? ' · آخر دفعة ' : ' · last payment ') + item.last_payment_on : ar ? ' · لا دفعات سابقة' : ' · no payment yet'}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {item.alerts.map((alert) => (
                                    <span
                                        key={alert.id}
                                        className={'rounded-full px-2 py-0.5 text-[10px] font-bold ' + (alert.severity === 'critical' ? 'bg-red-500/15 text-red-600' : alert.severity === 'warning' ? 'bg-amber-500/15 text-amber-700' : 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]')}
                                    >
                                        {t(labels.kinds[alert.kind], alert.kind)}
                                        {' · '}
                                        {alert.days_late}
                                        {ar ? ' ي' : 'd'}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <p className="mt-2 text-[11px] text-[var(--ac-text-soft)]">
                            {item.last_contact
                                ? (ar ? 'آخر تواصل: ' : 'Last contact: ')
                                    + t(labels.channels[item.last_contact.channel], item.last_contact.channel)
                                    + ' · '
                                    + t(labels.outcomes[item.last_contact.outcome], item.last_contact.outcome)
                                    + (ar ? ' · قبل ' : ' · ')
                                    + String(item.last_contact.days_ago)
                                    + (ar ? ' يوم' : ' days ago')
                                    + (item.last_contact.note ? ' — ' + item.last_contact.note : '')
                                : ar ? 'لم يُسجَّل أي تواصل بعد.' : 'No contact logged yet.'}
                        </p>

                        <p className="mt-1 text-[11px]">
                            <span className="font-semibold text-[var(--ac-accent)]">
                                {ar ? 'الخطوة التالية: ' : 'Next step: '}
                                {t(labels.actions[item.next_action.key], item.next_action.key)}
                            </span>
                            {' ('}
                            {t(labels.channels[item.next_action.suggested_channel], item.next_action.suggested_channel)}
                            {item.next_action.requires_approval ? (ar ? ' · يحتاج موافقة قبل الإرسال' : ' · needs approval before sending') : ''}
                            {')'}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" className={buttonClass} onClick={() => setOpenContact(openContact === item.party_id ? null : item.party_id)}>
                                <PhoneCall size={13} />
                                {ar ? 'تسجيل تواصل' : 'Log contact'}
                            </button>
                            {item.phone && (
                                <a href={'tel:' + item.phone} className={buttonClass}>{ar ? 'اتصال' : 'Call'}</a>
                            )}
                            <button
                                type="button"
                                className={buttonClass}
                                disabled={busy}
                                onClick={async () => {
                                    const until = window.prompt(ar ? 'تأجيل التنبيه حتى (YYYY-MM-DD)' : 'Snooze until (YYYY-MM-DD)');

                                    if (until && await act('/api/collections/alerts/' + String(item.alerts[0].id) + '/snooze', { until })) {
                                        await load();
                                    }
                                }}
                            >
                                {ar ? 'تأجيل' : 'Snooze'}
                            </button>
                        </div>

                        {openContact === item.party_id && (
                            <form onSubmit={(event) => void logContact(event, item.party_id)} className="mt-3 grid gap-2 rounded-[12px] bg-[var(--ac-surface-soft)] p-3 sm:grid-cols-2">
                                <label className="text-xs">
                                    {ar ? 'القناة' : 'Channel'}
                                    <select name="channel" className={inputClass} defaultValue={item.next_action.suggested_channel}>
                                        {CHANNELS.map((channel) => <option key={channel} value={channel}>{t(labels.channels[channel], channel)}</option>)}
                                    </select>
                                </label>
                                <label className="text-xs">
                                    {ar ? 'النتيجة' : 'Outcome'}
                                    <select name="outcome" className={inputClass} defaultValue="reached">
                                        {OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{t(labels.outcomes[outcome], outcome)}</option>)}
                                    </select>
                                </label>
                                <label className="text-xs sm:col-span-2">
                                    {ar ? 'ملاحظة' : 'Note'}
                                    <input name="note" maxLength={1000} className={inputClass} />
                                </label>
                                <label className="text-xs">
                                    {ar ? 'التواصل القادم (يهدّئ التنبيه حتى ذلك التاريخ)' : 'Next contact (quiets alerts until then)'}
                                    <input name="next_contact_on" type="date" min={new Date().toISOString().slice(0, 10)} className={inputClass} />
                                </label>
                                <div className="flex items-end">
                                    <button type="submit" className={buttonClass + ' w-full'} disabled={busy}>{ar ? 'حفظ' : 'Save'}</button>
                                </div>
                            </form>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
