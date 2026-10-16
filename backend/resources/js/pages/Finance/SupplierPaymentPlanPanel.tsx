import { ApiError, apiRequest } from '@/lib/http';
import { CheckCircle2, LoaderCircle, TriangleAlert, Wand2 } from 'lucide-react';
import { useState } from 'react';

type Reason = { code: string; text: string };
type Payment = {
    key: string; party: string; label: string; kind: string; amount: string; pay_on: string; due_date: string;
    importance: string; depends_on_expected: boolean; reasons: Reason[];
};
type Proposal = {
    scenario: string; currency: string; disclaimer: string;
    opening: { confirmed_cash: string; operating_reserve: string; available_now: string };
    payments: Payment[];
    totals: { planned: string; unfunded: string; depends_on_expected_receipts: string };
    shortfalls: { key: string; party: string; label: string; amount: string; due_date: string; reason: string }[];
    warnings: { code: string; text: string }[];
};
type SavedPlan = { id: number; status: string; plan: Proposal };

const SCENARIOS = ['confirmed_only', 'expected', 'late_collection'] as const;

const names: Record<string, [string, string]> = {
    confirmed_only: ['المؤكد فقط', 'Confirmed only'],
    expected: ['المتوقع', 'Expected'],
    late_collection: ['تأخر التحصيل', 'Late collection'],
    full: ['كامل', 'Full'],
    partial: ['جزئي', 'Partial'],
    remainder: ['المتبقي', 'Remainder'],
};

const control =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold transition hover:border-[var(--ac-accent)] disabled:opacity-50';

/**
 * Proposes whom to pay, how much and when from the cash forecast. It only
 * proposes: approving records the decision and moves no money.
 */
export function SupplierPaymentPlanPanel({ ar }: { ar: boolean }) {
    const text = (arabic: string, english: string): string => (ar ? arabic : english);
    const label = (key: string): string => (names[key] ? names[key][ar ? 0 : 1] : key);
    const [scenario, setScenario] = useState<(typeof SCENARIOS)[number]>('expected');
    const [proposal, setProposal] = useState<Proposal | null>(null);
    const [saved, setSaved] = useState<SavedPlan | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function run(task: () => Promise<void>): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await task();
        } catch (failure) {
            setError(failure instanceof ApiError ? [failure.message, ...Object.values(failure.errors).flat()].join(' ') : text('تعذر تنفيذ الطلب.', 'Could not complete the request.'));
        } finally {
            setBusy(false);
        }
    }

    const build = () => run(async () => {
        const response = await apiRequest<{ data: Proposal }>('/api/finance/supplier-payment-proposal', { method: 'POST', body: JSON.stringify({ scenario }) });
        setProposal(response.data);
        setSaved(null);
    });

    const save = () => run(async () => {
        const response = await apiRequest<{ data: SavedPlan }>('/api/finance/supplier-payment-plans', { method: 'POST', body: JSON.stringify({ scenario }) });
        setSaved(response.data);
        setProposal(response.data.plan);
    });

    const approve = () => run(async () => {
        if (!saved) return;
        const response = await apiRequest<{ data: SavedPlan }>(`/api/finance/supplier-payment-plans/${saved.id}/approve`, { method: 'POST' });
        setSaved(response.data);
    });

    return (
        <section className="mt-6 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-bold"><Wand2 size={17} />{text('اقتراح خطة سداد الموردين', 'Supplier payment plan proposal')}</h2>
                    <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                        {text('من تدفع ومتى وكم، ضمن النقد المتاح بعد الاحتياطي التشغيلي. اقتراح فقط: لا يُنفَّذ تحويل ولا يُسجَّل سداد.', 'Whom to pay, when and how much, within the cash available after the operating reserve. A proposal only: no transfer is made and no payment is recorded.')}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={text('السيناريو', 'Scenario')} value={scenario} onChange={(event) => setScenario(event.target.value as (typeof SCENARIOS)[number])} className={control}>
                        {SCENARIOS.map((item) => <option key={item} value={item}>{label(item)}</option>)}
                    </select>
                    <button type="button" className={control} disabled={busy} onClick={() => void build()}>
                        {busy ? <LoaderCircle size={14} className="animate-spin" /> : null}{text('اقترح خطة', 'Propose a plan')}
                    </button>
                </div>
            </div>

            {error && <p className="mt-3 rounded-[12px] bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

            {proposal && (
                <div className="mt-5 space-y-4">
                    <div className="grid gap-2 text-xs sm:grid-cols-4">
                        <Metric title={text('النقد المؤكد', 'Confirmed cash')} value={proposal.opening.confirmed_cash} />
                        <Metric title={text('الاحتياطي', 'Reserve')} value={proposal.opening.operating_reserve} />
                        <Metric title={text('المقترح دفعه', 'Proposed')} value={proposal.totals.planned} />
                        <Metric title={text('غير ممول', 'Unfunded')} value={proposal.totals.unfunded} tone={Number(proposal.totals.unfunded) > 0 ? 'warn' : undefined} />
                    </div>

                    {proposal.warnings.map((warning) => (
                        <p key={warning.code} className="flex items-start gap-2 rounded-[12px] bg-amber-50 px-3 py-2 text-xs text-amber-900"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{warning.text}</p>
                    ))}

                    <div className="overflow-x-auto rounded-[14px] border border-[var(--ac-line)]">
                        <table className="w-full min-w-[720px] text-start text-xs">
                            <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                                <tr>
                                    <th className="px-3 py-2 text-start">{text('المورد', 'Supplier')}</th>
                                    <th className="px-3 py-2 text-start">{text('التاريخ', 'Pay on')}</th>
                                    <th className="px-3 py-2 text-start">{text('المبلغ', 'Amount')}</th>
                                    <th className="px-3 py-2 text-start">{text('النوع', 'Type')}</th>
                                    <th className="px-3 py-2 text-start">{text('السبب', 'Why')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--ac-line)]">
                                {proposal.payments.map((payment, index) => (
                                    <tr key={payment.key + index} className={payment.depends_on_expected ? 'bg-amber-50/60' : ''}>
                                        <td className="px-3 py-2"><strong className="block">{payment.party}</strong><span className="text-[10px] text-[var(--ac-text-muted)]">{payment.label}</span></td>
                                        <td className="px-3 py-2">{payment.pay_on}</td>
                                        <td className="px-3 py-2 font-semibold">{payment.amount} {proposal.currency}</td>
                                        <td className="px-3 py-2">{label(payment.kind)}{payment.depends_on_expected && <span className="ms-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px]">{text('يعتمد على متوقع', 'Depends on expected')}</span>}</td>
                                        <td className="px-3 py-2 text-[10px] leading-4 text-[var(--ac-text-soft)]">{payment.reasons.map((reason) => reason.text).join(' ')}</td>
                                    </tr>
                                ))}
                                {!proposal.payments.length && <tr><td colSpan={5} className="p-6 text-center text-[var(--ac-text-muted)]">{text('لا توجد دفعات يمكن اقتراحها ضمن النقد المتاح.', 'No payment fits the cash available.')}</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    {proposal.shortfalls.length > 0 && (
                        <div className="rounded-[14px] border border-red-200 bg-red-50/60 p-3 text-xs">
                            <p className="font-semibold text-red-800">{text('مستحقات لا يكفيها النقد', 'Dues the cash cannot cover')}</p>
                            <ul className="mt-1 space-y-0.5">
                                {proposal.shortfalls.map((item) => <li key={item.key}>{item.party} · {item.label} · {item.amount} · {item.due_date}</li>)}
                            </ul>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        {!saved && <button type="button" className={control} disabled={busy} onClick={() => void save()}>{text('احفظ كمسودة', 'Save as draft')}</button>}
                        {saved?.status === 'draft' && <button type="button" className={control} disabled={busy} onClick={() => void approve()}><CheckCircle2 size={14} />{text('اعتماد الخطة', 'Approve the plan')}</button>}
                        {saved?.status === 'approved' && <span className="text-xs font-semibold text-emerald-700">{text('تم اعتماد الخطة. لم يُنفَّذ أي تحويل.', 'Plan approved. No transfer was made.')}</span>}
                        <span className="text-[10px] text-[var(--ac-text-muted)]">{proposal.disclaimer}</span>
                    </div>
                </div>
            )}
        </section>
    );
}

function Metric({ title, value, tone }: { title: string; value: string; tone?: 'warn' }) {
    return (
        <div className={`rounded-[12px] border border-[var(--ac-line)] p-3 ${tone === 'warn' ? 'bg-red-50' : 'bg-[var(--ac-surface-soft)]'}`}>
            <p className="text-[10px] text-[var(--ac-text-muted)]">{title}</p>
            <p className="mt-1 text-sm font-bold">{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
        </div>
    );
}
