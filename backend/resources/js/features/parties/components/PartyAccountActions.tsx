import type { Party } from '@/features/parties/types';
import { apiRequest } from '@/lib/http';
import { PaymentDialog } from '@/pages/Finance/PaymentDialog';
import type { FinanceLookups } from '@/pages/Finance/types';
import {
    Banknote,
    FilePlus2,
    FileText,
    LoaderCircle,
    Printer,
    ReceiptText,
    ShoppingCart,
    Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';

const link =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-50';

/**
 * Shortcuts from a party's card: the sales or purchases and receipts or
 * payments of that party, adding a new one without leaving the list, and the
 * printable statement of account (which starts from the carried balance).
 */
export function PartyAccountActions({ party, ar }: { party: Party; ar: boolean }) {
    const text = (arabic: string, english: string): string => (ar ? arabic : english);
    const [lookups, setLookups] = useState<FinanceLookups | null>(null);
    const [dialog, setDialog] = useState<'incoming' | 'outgoing' | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    const isCustomer = party.roles.includes('customer');
    const isSupplier = party.roles.includes('supplier');
    const base = '/app/parties/' + String(party.id);

    if (!isCustomer && !isSupplier) {
        return null;
    }

    async function openDialog(direction: 'incoming' | 'outgoing'): Promise<void> {
        setFailed(false);

        if (lookups) {
            setDialog(direction);

            return;
        }

        setLoading(true);

        try {
            const response = await apiRequest<{ data?: FinanceLookups } & Partial<FinanceLookups>>('/api/finance/lookups');
            setLookups((response.data ?? response) as FinanceLookups);
            setDialog(direction);
        } catch {
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }

    function group(title: string, children: ReactNode): ReactNode {
        return (
            <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">{title}</p>
                <div className="grid gap-2 sm:grid-cols-2">{children}</div>
            </div>
        );
    }

    return (
        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 sm:p-5">
            <h3 className="text-sm font-bold">{text('الحساب والحركات', 'Account and activity')}</h3>
            <p className="mt-1 text-[11px] text-[var(--ac-text-muted)]">
                {text('شاهد حركات هذا الطرف وأضف عليها من هنا، أو نزّل كشف الحساب.', 'See this party’s activity, add to it from here, or download the statement.')}
            </p>

            <div className="mt-4 space-y-4">
                {isCustomer && group(text('كعميل', 'As a customer'), (
                    <>
                        <a href={base + '/invoices'} className={link}><ReceiptText size={14} />{text('المبيعات (فواتير البيع)', 'Sales invoices')}</a>
                        <a href={base + '/payments'} className={link}><Wallet size={14} />{text('المقبوضات', 'Receipts')}</a>
                        <a href={'/app/invoices/sales/create?party_id=' + String(party.id)} className={link}><FilePlus2 size={14} />{text('فاتورة بيع جديدة', 'New sales invoice')}</a>
                        <button type="button" className={link} disabled={loading} onClick={() => void openDialog('incoming')}>
                            {loading ? <LoaderCircle size={14} className="animate-spin" /> : <Banknote size={14} />}{text('إضافة مقبوض', 'Add receipt')}
                        </button>
                    </>
                ))}

                {isSupplier && group(text('كمورد', 'As a supplier'), (
                    <>
                        <a href={base + '/invoices'} className={link}><ShoppingCart size={14} />{text('المشتريات (فواتير الشراء)', 'Purchase invoices')}</a>
                        <a href={base + '/payments'} className={link}><Wallet size={14} />{text('الدفعات', 'Payments')}</a>
                        <a href={'/app/invoices/purchases/create?party_id=' + String(party.id)} className={link}><FilePlus2 size={14} />{text('فاتورة شراء جديدة', 'New purchase invoice')}</a>
                        <button type="button" className={link} disabled={loading} onClick={() => void openDialog('outgoing')}>
                            {loading ? <LoaderCircle size={14} className="animate-spin" /> : <Banknote size={14} />}{text('إضافة دفعة', 'Add payment')}
                        </button>
                    </>
                ))}

                {group(text('كشف الحساب', 'Statement of account'), (
                    <>
                        <a href={base + '/statement'} className={link}><FileText size={14} />{text('عرض كشف الحساب', 'View statement')}</a>
                        <a href={base + '/statement'} className={link} title={text('افتح الكشف ثم اختر طباعة أو تنزيل', 'Open the statement, then choose Print or Download')}>
                            <Printer size={14} />{text('طباعة / تنزيل الكشف', 'Print / download')}
                        </a>
                    </>
                ))}
            </div>

            {failed && <p className="mt-3 text-xs text-red-700">{text('تعذر فتح نافذة الدفعة. حاول مرة أخرى.', 'Could not open the payment window. Try again.')}</p>}

            {dialog && lookups && (
                <PaymentDialog
                    direction={dialog}
                    lookups={lookups}
                    ar={ar}
                    defaultPartyId={party.id}
                    onChanged={() => undefined}
                    onClose={() => setDialog(null)}
                />
            )}
        </section>
    );
}
