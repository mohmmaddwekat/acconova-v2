import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import { ArrowLeftRight, Check, Eye, Scale } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
    FPanel,
    FinanceHeader,
    Money,
    SummaryCard,
    apiErrorText,
    financeButton,
    financePrimary,
} from './shared';

type DualParty = {
    party_id: number;
    name: string;
    sales_open: number;
    purchases_open: number;
    available: number;
};

type Pair = {
    sale_number: string;
    sale_date: string;
    purchase_number: string;
    purchase_date: string;
    amount: string;
};

type Plan = {
    pairs: Pair[];
    total: number;
    available: number;
};

export default function PartyOffsets() {
    const ar = useLocale() === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const [parties, setParties] = useState<DualParty[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [amount, setAmount] = useState('');
    const [plan, setPlan] = useState<Plan | null>(null);

    const load = useCallback(async (): Promise<void> => {
        try {
            const response = await apiRequest<{ data: DualParty[] }>(
                '/api/parties/offsets',
            );

            setParties(response.data);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const body = (): string =>
        JSON.stringify(amount.trim() === '' ? {} : { amount });

    const preview = async (party: DualParty): Promise<void> => {
        setBusy(true);
        setError('');
        setMessage('');

        try {
            const response = await apiRequest<{ data: Plan }>(
                `/api/parties/${party.party_id}/offsets/preview`,
                { method: 'POST', body: body() },
            );

            setOpenId(party.party_id);
            setPlan(response.data);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    const apply = async (party: DualParty): Promise<void> => {
        setBusy(true);
        setError('');

        try {
            await apiRequest(`/api/parties/${party.party_id}/offsets`, {
                method: 'POST',
                body: body(),
            });
            setMessage(
                text(
                    'تمت المقاصة مع ' + party.name + '.',
                    'Offset completed with ' + party.name + '.',
                ),
            );
            setOpenId(null);
            setPlan(null);
            setAmount('');
            await load();
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    const total = parties.reduce((sum, party) => sum + party.available, 0);

    return (
        <AppShell>
            <Head title={text('مقاصة العملاء الموردين', 'Customer-supplier offsets')} />
            <main className="mx-auto w-full max-w-[1100px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
                <FinanceHeader
                    title={text('مقاصة العميل والمورد', 'Customer-supplier offsets')}
                    subtitle={text(
                        'طرف تبيع له وتشتري منه: تُسدَّد فواتير البيع المفتوحة من فواتير الشراء المفتوحة (الأقدم أولاً) دون حركة نقدية، فتنقص الفاتورتان معاً.',
                        'For parties you both sell to and buy from: open sales invoices are settled against open purchase invoices, oldest first, with no cash movement, so both invoices go down together.',
                    )}
                />

                <section className="grid gap-3 sm:grid-cols-2">
                    <SummaryCard
                        label={text('أطراف قابلة للمقاصة', 'Parties to offset')}
                        value={parties.length}
                        icon={ArrowLeftRight}
                        tone="blue"
                    />
                    <SummaryCard
                        label={text('إجمالي المتاح للمقاصة', 'Total available')}
                        value={<Money value={total} />}
                        icon={Scale}
                        tone="green"
                    />
                </section>

                {error && (
                    <div className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}
                {message && (
                    <div className="rounded-[14px] border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-500">
                        {message}
                    </div>
                )}

                <FPanel title={text('الأطراف', 'Parties')} icon={ArrowLeftRight}>
                    {loading ? (
                        <p className="p-10 text-center text-sm text-[var(--ac-text-muted)]">
                            {text('جارٍ التحميل…', 'Loading…')}
                        </p>
                    ) : !parties.length ? (
                        <p className="p-10 text-center text-sm text-[var(--ac-text-muted)]">
                            {text(
                                'لا يوجد طرف له فواتير بيع وشراء مفتوحة معاً.',
                                'No party has open sales and purchase invoices at the same time.',
                            )}
                        </p>
                    ) : (
                        <div className="divide-y divide-[var(--ac-line)]">
                            {parties.map((party) => {
                                const isOpen = openId === party.party_id;

                                return (
                                    <div key={party.party_id} className="p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold text-[var(--ac-text)]">
                                                    {party.name}
                                                </p>
                                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                                    {text('له علينا (شراء): ', 'We owe (purchases): ')}
                                                    <Money value={party.purchases_open} />
                                                    {' · '}
                                                    {text('لنا عليه (بيع): ', 'Owed to us (sales): ')}
                                                    <Money value={party.sales_open} />
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-[var(--ac-text-muted)]">
                                                    {text('المتاح', 'Available')}
                                                </span>
                                                <strong className="text-sm">
                                                    <Money value={party.available} />
                                                </strong>
                                                <button
                                                    type="button"
                                                    className={financeButton}
                                                    disabled={busy}
                                                    onClick={() => void preview(party)}
                                                >
                                                    <Eye className="size-4" />
                                                    {text('معاينة', 'Preview')}
                                                </button>
                                            </div>
                                        </div>

                                        {isOpen && plan && (
                                            <div className="mt-4 space-y-3 rounded-[14px] border border-[var(--ac-line)] p-4">
                                                <label className="flex flex-wrap items-center gap-2 text-xs text-[var(--ac-text-muted)]">
                                                    {text('مبلغ جزئي (اتركه فارغاً للكل)', 'Partial amount (blank for all)')}
                                                    <input
                                                        value={amount}
                                                        inputMode="decimal"
                                                        onChange={(event) => setAmount(event.target.value)}
                                                        className="w-32 rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 py-1.5 text-xs text-[var(--ac-text)]"
                                                    />
                                                    <button
                                                        type="button"
                                                        className={financeButton}
                                                        disabled={busy}
                                                        onClick={() => void preview(party)}
                                                    >
                                                        {text('تحديث المعاينة', 'Refresh')}
                                                    </button>
                                                </label>

                                                <table className="w-full text-start text-xs">
                                                    <thead>
                                                        <tr className="text-[10px] font-bold uppercase text-[var(--ac-text-muted)]">
                                                            <th className="py-2 text-start">{text('فاتورة البيع', 'Sale')}</th>
                                                            <th className="py-2 text-start">{text('فاتورة الشراء', 'Purchase')}</th>
                                                            <th className="py-2 text-start">{text('المبلغ', 'Amount')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {plan.pairs.map((pair, index) => (
                                                            <tr key={index} className="border-t border-[var(--ac-line)]">
                                                                <td className="py-2">{pair.sale_number} · {pair.sale_date}</td>
                                                                <td className="py-2">{pair.purchase_number} · {pair.purchase_date}</td>
                                                                <td className="py-2"><Money value={pair.amount} /></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>

                                                <div className="flex items-center justify-between">
                                                    <strong className="text-sm">
                                                        {text('إجمالي المقاصة: ', 'Offset total: ')}
                                                        <Money value={plan.total} />
                                                    </strong>
                                                    <button
                                                        type="button"
                                                        className={financePrimary}
                                                        disabled={busy || plan.pairs.length === 0}
                                                        onClick={() => void apply(party)}
                                                    >
                                                        <Check className="size-4" />
                                                        {text('تنفيذ المقاصة', 'Run offset')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </FPanel>
            </main>
        </AppShell>
    );
}
