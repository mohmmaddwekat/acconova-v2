import { apiRequest } from '@/lib/http';
import { Activity, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

type Day = { date: string; tokens: number; messages: number };

type Usage = {
    period: { start: string; end: string; resets_on: string; days_left: number };
    allowance: {
        included_tokens: number | null;
        used_tokens: number;
        remaining_included_tokens: number | null;
        percent_used: number | null;
        overage_tokens: number;
        wallet_balance_tokens: number;
    };
    me: { tokens: number; messages: number; today_tokens: number; daily: Day[] };
    by_model: { model: string; tokens: number }[];
    workspace: { tokens: number; messages: number; daily: Day[]; top_users: { user_id: number; tokens: number }[] } | null;
    conversation: { id: number; tokens: number } | null;
};

const fmt = (value: number): string => value.toLocaleString();

/**
 * Plan usage for the assistant, in the style of a usage page: how much of the
 * monthly allowance is used, when it resets, the recent trend and what this
 * conversation has cost. Refreshes after every exchange.
 */
export function AiUsagePanel({
    ar,
    conversationId,
    refreshKey,
}: {
    ar: boolean;
    conversationId: number | null;
    refreshKey: number;
}) {
    const [usage, setUsage] = useState<Usage | null>(null);
    const [open, setOpen] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();

        apiRequest<{ data: Usage }>(
            '/api/ai/usage' + (conversationId ? '?conversation=' + String(conversationId) : ''),
            { signal: controller.signal },
        )
            .then((response) => {
                setUsage(response.data);
                setFailed(false);
            })
            .catch(() => {
                if (! controller.signal.aborted) {
                    setFailed(true);
                }
            });

        return () => controller.abort();
    }, [conversationId, refreshKey]);

    if (failed || ! usage) {
        return null;
    }

    const { allowance } = usage;
    const percent = allowance.percent_used;
    const tone = percent === null ? 'bg-[var(--ac-accent)]' : percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-[var(--ac-accent)]';
    const series = (usage.workspace ?? usage.me).daily.slice(-14);
    const peak = Math.max(1, ...series.map((day) => day.tokens));

    return (
        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 py-3">
            <button type="button" onClick={() => setOpen(! open)} className="flex w-full items-center gap-3 text-start" aria-expanded={open}>
                <Activity size={15} className="shrink-0 text-[var(--ac-accent)]" />
                <span className="text-xs font-bold">{ar ? 'الاستهلاك' : 'Usage'}</span>
                <span className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-[var(--ac-line)]">
                    <span className={'block h-full rounded-full transition-all ' + tone} style={{ width: String(percent ?? 0) + '%' }} />
                </span>
                <span className="text-[11px] text-[var(--ac-text-muted)]">
                    {percent === null
                        ? (ar ? 'استُهلك ' : 'Used ') + fmt(allowance.used_tokens)
                        : String(percent) + '% ' + (ar ? 'من حصة الشهر' : 'of this month\'s allowance')}
                </span>
                <ChevronDown size={14} className={'shrink-0 transition ' + (open ? 'rotate-180' : '')} />
            </button>

            {open && (
                <div className="mt-3 grid gap-4 text-xs lg:grid-cols-3">
                    <div className="space-y-1.5">
                        <p className="font-bold">{ar ? 'حصة الشهر' : 'Monthly allowance'}</p>
                        <p>
                            {ar ? 'المستهلك: ' : 'Used: '}
                            <b>{fmt(allowance.used_tokens)}</b>
                            {allowance.included_tokens !== null && ' / ' + fmt(allowance.included_tokens)}
                        </p>
                        {allowance.remaining_included_tokens !== null && (
                            <p>{ar ? 'المتبقي: ' : 'Remaining: '}<b>{fmt(allowance.remaining_included_tokens)}</b></p>
                        )}
                        {allowance.included_tokens === null && (
                            <p className="text-[var(--ac-text-muted)]">{ar ? 'لا يوجد حد شهري في خطتك.' : 'No monthly limit on your plan.'}</p>
                        )}
                        {allowance.overage_tokens > 0 && (
                            <p className="text-amber-700">{ar ? 'تجاوز الحصة: ' : 'Over the allowance: '}<b>{fmt(allowance.overage_tokens)}</b></p>
                        )}
                        <p>{ar ? 'رصيد الشحن: ' : 'Top-up balance: '}<b>{fmt(allowance.wallet_balance_tokens)}</b></p>
                        <p className="text-[var(--ac-text-muted)]">
                            {ar ? 'تتجدد في ' : 'Resets on '}{usage.period.resets_on}{' · '}{usage.period.days_left}{ar ? ' يوم' : ' days'}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <p className="font-bold">{ar ? 'استهلاكي' : 'My usage'}</p>
                        <p>{ar ? 'هذا الشهر: ' : 'This month: '}<b>{fmt(usage.me.tokens)}</b>{' · '}{usage.me.messages}{ar ? ' رسالة' : ' messages'}</p>
                        <p>{ar ? 'اليوم: ' : 'Today: '}<b>{fmt(usage.me.today_tokens)}</b></p>
                        {usage.conversation && <p>{ar ? 'هذه المحادثة: ' : 'This conversation: '}<b>{fmt(usage.conversation.tokens)}</b></p>}
                        {usage.workspace && <p>{ar ? 'كل مساحة العمل: ' : 'Whole workspace: '}<b>{fmt(usage.workspace.tokens)}</b></p>}
                        {usage.by_model.map((row) => (
                            <p key={row.model} className="text-[var(--ac-text-muted)]">{row.model}: {fmt(row.tokens)}</p>
                        ))}
                    </div>

                    <div>
                        <p className="mb-2 font-bold">{ar ? 'آخر الأيام' : 'Recent days'}</p>
                        <div className="flex h-16 items-end gap-1" role="img" aria-label={ar ? 'استهلاك يومي' : 'Daily usage'}>
                            {series.length === 0 && <span className="text-[var(--ac-text-muted)]">{ar ? 'لا استهلاك بعد.' : 'No usage yet.'}</span>}
                            {series.map((day) => (
                                <span
                                    key={day.date}
                                    title={day.date + ': ' + fmt(day.tokens)}
                                    className="w-3 rounded-t bg-[var(--ac-accent)]/70"
                                    style={{ height: String(Math.max(6, Math.round(day.tokens / peak * 100))) + '%' }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
