import { apiRequest } from '@/lib/http';
import {
    ArrowLeftRight,
    Banknote,
    Building2,
    CalendarCheck,
    CheckCircle2,
    CircleX,
    FileText,
    Landmark,
    OctagonX,
    Pencil,
    Printer,
    RotateCcw,
    ShieldCheck,
    Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CashForm } from './CashForm';
import {
    FPanel,
    FinanceHeader,
    Money,
    StatusBadge,
    apiErrorText,
    financeButton,
} from './shared';
import type {
    AuditEvent,
    CashDetail as CashDetailType,
    FinanceLookups,
} from './types';

function localDateValue(): string {
    const now = new Date();

    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
}

export function CashDetail({
    id,
    direction,
    lookups,
    ar,
}: {
    id: number;
    direction: 'incoming' | 'outgoing';
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const incoming = direction === 'incoming';
    const [movement, setMovement] = useState<CashDetailType | null>(null);
    const [audit, setAudit] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError('');

        apiRequest<{
            data: CashDetailType;
            audit: AuditEvent[];
        }>('/api/finance/cash-movements/' + id, {
            signal: controller.signal,
        })
            .then((response) => {
                setMovement(response.data);
                setAudit(response.audit);
            })
            .catch((failure) => {
                if (! controller.signal.aborted) {
                    setError(apiErrorText(failure));
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [id, revision]);

    if (loading) {
        return (
            <div className="rounded-[18px] border border-[#dbe6f5] bg-white p-12 text-center text-sm text-slate-400">
                {text('جارٍ تحميل الحركة...', 'Loading movement...')}
            </div>
        );
    }

    if (error || ! movement) {
        return (
            <div className="rounded-[18px] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                {error || text('تعذر تحميل الحركة.', 'Movement could not be loaded.')}
            </div>
        );
    }

    if (movement.status === 'draft') {
        return (
            <CashForm
                direction={direction}
                lookups={lookups}
                ar={ar}
                initial={movement}
            />
        );
    }

    const canCorrect = lookups.permissions.cash_correct;

    async function correct(): Promise<void> {
        if (! canCorrect || busy) {
            return;
        }

        const reason = window.prompt(
            text(
                'اكتب سبب التصحيح. سيتم عكس الحركة القديمة وإنشاء مسودة جديدة بدلاً من تعديل السجل التاريخي.',
                'Enter the correction reason. The original will be reversed and a new draft created instead of rewriting history.',
            ),
        );

        if (! reason || reason.trim().length < 5) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{ data: CashDetailType }>(
                '/api/finance/cash-movements/' + movement.id + '/correct',
                {
                    method: 'POST',
                    body: JSON.stringify({ reason: reason.trim() }),
                },
            );

            window.location.assign(
                incoming
                    ? '/app/receipts/' + response.data.id
                    : '/app/payments/' + response.data.id,
            );
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    async function reverse(): Promise<void> {
        if (! canCorrect || busy) {
            return;
        }

        const reason = window.prompt(
            text(
                'اكتب سبب عكس الحركة. سيتم إنشاء حركة عكسية ولن يتم حذف السجل الأصلي.',
                'Enter the reversal reason. An opposite movement will be created and the original record will remain.',
            ),
        );

        if (! reason || reason.trim().length < 5) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/finance/cash-movements/' + movement.id + '/reverse',
                {
                    method: 'POST',
                    body: JSON.stringify({ reason: reason.trim() }),
                },
            );

            setRevision((value) => value + 1);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    async function updateCheckStatus(status: string): Promise<void> {
        if (! canCorrect || busy) {
            return;
        }

        const message = status === 'cleared'
            ? (
                incoming
                    ? text(
                        'تأكيد أن الشيك تم تحصيله فعلياً من البنك؟',
                        'Confirm that this check was actually cleared by the bank?',
                    )
                    : text(
                        'تأكيد أن الشيك تم صرفه فعلياً؟',
                        'Confirm that this check was actually paid?',
                    )
            )
            : status === 'bounced'
                ? text(
                    'تأكيد أن الشيك مرتجع؟ سيتم إلغاء أثره كدفعة فعالة وإعادة احتساب أرصدة الفواتير المرتبطة.',
                    'Confirm that this check bounced? Its payment effect will be removed and linked invoice balances recalculated.',
                )
                : status === 'cancelled'
                    ? text(
                        'تأكيد إلغاء الشيك؟ سيتم إلغاء أثره كدفعة فعالة وإعادة احتساب أرصدة الفواتير المرتبطة.',
                        'Confirm cancelling this check? Its payment effect will be removed and linked invoice balances recalculated.',
                    )
                    : text(
                        'إعادة الشيك إلى قيد التحصيل؟ سيتم إعادة احتساب أرصدة الفواتير المرتبطة.',
                        'Move this check back to pending? Linked invoice balances will be recalculated.',
                    );

        if (! window.confirm(message)) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/finance/cash-movements/'
                + movement.id
                + '/check-status',
                {
                    method: 'PATCH',
                    body: JSON.stringify({ status }),
                },
            );

            setRevision((value) => value + 1);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={
                    (incoming
                        ? text('مقبوض ', 'Receipt ')
                        : text('دفعة ', 'Payment '))
                    + movement.number
                }
                subtitle={text(
                    'تفاصيل الحركة، طريقة الدفع، التخصيص على الفواتير، الشيكات وسجل التدقيق.',
                    'Movement details, payment method, invoice allocation, check tracking and audit history.',
                )}
                actions={
                    <>
                        <button
                            type="button"
                            className={financeButton}
                            onClick={() => window.print()}
                        >
                            <Printer size={15} />
                            {text('طباعة سند', 'Print voucher')}
                        </button>

                        {movement.status === 'posted' && canCorrect && (
                            <>
                                <button
                                    type="button"
                                    className={financeButton}
                                    disabled={busy}
                                    onClick={() => void correct()}
                                >
                                    <Pencil size={15} />
                                    {text('تصحيح', 'Correct')}
                                </button>
                                <button
                                    type="button"
                                    className={financeButton + ' !text-red-600'}
                                    disabled={busy}
                                    onClick={() => void reverse()}
                                >
                                    <RotateCcw size={15} />
                                    {text('عكس العملية', 'Reverse')}
                                </button>
                            </>
                        )}
                    </>
                }
            />

            {error && (
                <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {movement.correction_reason && (
                <div className="rounded-[14px] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
                    <strong>{text('سبب التصحيح / العكس:', 'Correction / reversal reason:')}</strong>{' '}
                    {movement.correction_reason}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <InfoCard label={text('الحالة', 'Status')}>
                    <StatusBadge status={movement.status} ar={ar} />
                </InfoCard>
                <InfoCard label={text('المبلغ', 'Amount')}>
                    <Money value={movement.amount} currency={movement.currency} />
                </InfoCard>
                <InfoCard label={text('الفئة', 'Category')}>
                    {movement.category}
                </InfoCard>
                <InfoCard label={text('طريقة الدفع', 'Method')}>
                    {movement.method}
                </InfoCard>
                <InfoCard label={text('التاريخ', 'Date')}>
                    {movement.movement_date}
                </InfoCard>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
                <div className="space-y-4">
                    <FPanel title={text('تفاصيل الحركة', 'Movement details')} icon={Banknote}>
                        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
                            <Detail label={text('رقم الحركة', 'Movement number')} value={movement.number} />
                            <Detail label={text('المرجع', 'Reference')} value={movement.reference ?? '—'} />
                            <Detail label={text('الحساب / الصندوق', 'Account / cash box')} value={movement.account_label ?? '—'} />
                            <Detail label={text('مركز التكلفة', 'Cost center')} value={movement.cost_center ?? '—'} />
                            <Detail label={text('الفرع', 'Branch')} value={movement.branch_label ?? '—'} />
                            <Detail label={text('تاريخ الاعتماد', 'Posted at')} value={movement.posted_at ?? '—'} />
                            <Detail
                                label={incoming ? text('المصدر', 'Source') : text('المستفيد', 'Beneficiary')}
                                value={movement.party?.name ?? '—'}
                            />
                            <Detail label={text('ملاحظات', 'Notes')} value={movement.notes ?? '—'} />
                        </div>
                    </FPanel>

                    {movement.method === 'check' && (
                        <FPanel
                            title={text('تفاصيل الشيك ومتابعته', 'Check details & tracking')}
                            icon={Landmark}
                        >
                            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
                                <Detail label={text('رقم الشيك', 'Check number')} value={movement.check_number ?? '—'} />
                                <Detail label={text('البنك', 'Bank')} value={movement.check_bank ?? '—'} />
                                <Detail label={text('تاريخ الاستحقاق', 'Due date')} value={movement.check_due_date ?? '—'} />
                                <div>
                                    <p className="text-[10px] text-slate-400">{text('حالة الشيك', 'Check status')}</p>
                                    <div className="mt-2">
                                        <StatusBadge status={movement.check_status ?? 'pending'} ar={ar} />
                                    </div>
                                </div>
                            </div>

                            {(movement.check_status ?? 'pending') === 'pending' && movement.check_due_date && (
                                <div
                                    className={[
                                        'mx-4 mb-4 rounded-[13px] border px-4 py-3 text-[11px] leading-6',
                                        movement.check_due_date <= localDateValue()
                                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                                            : 'border-blue-100 bg-blue-50/70 text-blue-800',
                                    ].join(' ')}
                                >
                                    <strong className="block">
                                        {movement.check_due_date < localDateValue()
                                            ? text('الشيك تجاوز تاريخ الاستحقاق', 'Check is past due')
                                            : movement.check_due_date === localDateValue()
                                                ? text('الشيك مستحق اليوم', 'Check is due today')
                                                : text('الشيك ما زال قيد التحصيل', 'Check is still pending')}
                                    </strong>
                                    <span>
                                        {text(
                                            'الوصول لتاريخ الاستحقاق لا يعني أنه تم التحصيل تلقائياً. حدّث الحالة فقط بعد معرفة نتيجة البنك.',
                                            'Reaching the due date does not automatically mean the check cleared. Update the status only after you know the bank result.',
                                        )}
                                    </span>
                                </div>
                            )}

                            {canCorrect && movement.status === 'posted' && (
                                <div className="border-t border-[#edf3fa] p-4">
                                    <p className="mb-3 text-[10px] font-semibold text-[#6f86a8]">
                                        {text(
                                            'حدّث الحالة حسب النتيجة الفعلية للشيك:',
                                            'Update the status based on the actual bank result:',
                                        )}
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                        {(movement.check_status ?? 'pending') !== 'cleared' && (
                                            <button
                                                type="button"
                                                className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
                                                disabled={busy}
                                                onClick={() => void updateCheckStatus('cleared')}
                                            >
                                                <CheckCircle2 size={15} />
                                                {incoming
                                                    ? text('تم التحصيل', 'Mark cleared')
                                                    : text('تم صرف الشيك', 'Mark paid')}
                                            </button>
                                        )}

                                        {(movement.check_status ?? 'pending') !== 'bounced' && (
                                            <button
                                                type="button"
                                                className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-40"
                                                disabled={busy}
                                                onClick={() => void updateCheckStatus('bounced')}
                                            >
                                                <CircleX size={15} />
                                                {text('الشيك مرتجع', 'Mark bounced')}
                                            </button>
                                        )}

                                        {(movement.check_status ?? 'pending') !== 'cancelled' && (
                                            <button
                                                type="button"
                                                className="inline-flex min-h-10 items-center gap-2 rounded-[12px] border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
                                                disabled={busy}
                                                onClick={() => void updateCheckStatus('cancelled')}
                                            >
                                                <OctagonX size={15} />
                                                {text('إلغاء الشيك', 'Cancel check')}
                                            </button>
                                        )}

                                        {(movement.check_status ?? 'pending') !== 'pending' && (
                                            <button
                                                type="button"
                                                className={financeButton}
                                                disabled={busy}
                                                onClick={() => void updateCheckStatus('pending')}
                                            >
                                                <CalendarCheck size={15} />
                                                {text('إعادة إلى قيد التحصيل', 'Move back to pending')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </FPanel>
                    )}

                    <FPanel
                        title={
                            incoming
                                ? text('تخصيص المقبوض على الفواتير', 'Receipt allocation')
                                : text('تخصيص الدفع على الفواتير', 'Payment allocation')
                        }
                        icon={Wallet}
                    >
                        {movement.allocations.length ? (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-xs">
                                    <thead className="bg-[#f7faff] text-[#7188aa]">
                                        <tr>
                                            <th className="px-3 py-3 text-start">{text('الفاتورة', 'Invoice')}</th>
                                            <th className="px-3 py-3 text-start">{text('إجمالي الفاتورة', 'Invoice total')}</th>
                                            <th className="px-3 py-3 text-start">{text('المبلغ المخصص', 'Allocated')}</th>
                                            <th className="px-3 py-3 text-start">{text('الرصيد الحالي', 'Current balance')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movement.allocations.map((allocation) => (
                                            <tr key={allocation.id} className="border-t border-[#edf3fa]">
                                                <td className="px-3 py-3 font-semibold text-[#1265d8]">
                                                    {allocation.document_number ?? allocation.financial_document_id}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <Money value={allocation.document_total ?? 0} currency={movement.currency} compact />
                                                </td>
                                                <td className="px-3 py-3 text-emerald-700">
                                                    <Money value={allocation.amount} currency={movement.currency} compact />
                                                </td>
                                                <td className="px-3 py-3 text-red-600">
                                                    <Money value={allocation.document_balance_due ?? 0} currency={movement.currency} compact />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="p-5 text-xs leading-6 text-slate-400">
                                {text(
                                    'هذه الحركة غير مخصصة لفاتورة. هذا طبيعي للمصاريف التشغيلية أو التمويل أو الدخل غير المرتبط بفواتير.',
                                    'This movement is not allocated to an invoice. That is valid for operating expenses, funding or non-invoice income.',
                                )}
                            </p>
                        )}
                    </FPanel>

                    <FPanel title={text('سجل التدقيق', 'Audit trail')} icon={ShieldCheck}>
                        <div className="max-h-80 space-y-3 overflow-y-auto p-4">
                            {audit.length ? audit.map((event) => (
                                <div key={event.id} className="border-s border-blue-200 ps-3 text-xs">
                                    <strong className="text-[#173f78]">{event.action}</strong>
                                    <p className="mt-1 text-[10px] text-slate-400">{event.created_at ?? '—'}</p>
                                    {event.reason && (
                                        <p className="mt-1 text-[10px] leading-5 text-slate-500">{event.reason}</p>
                                    )}
                                </div>
                            )) : (
                                <p className="text-xs text-slate-400">{text('لا يوجد سجل بعد.', 'No audit events yet.')}</p>
                            )}
                        </div>
                    </FPanel>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-24">
                    <FPanel
                        title={incoming ? text('معلومات المصدر', 'Source information') : text('معلومات المستفيد', 'Beneficiary information')}
                        icon={Building2}
                    >
                        <div className="space-y-2 p-4 text-xs">
                            <strong className="block text-base text-[#123d78]">
                                {movement.party?.name ?? text('طرف غير مسجل', 'Unsaved party')}
                            </strong>
                            <p className="text-slate-500">{movement.category}</p>
                        </div>
                    </FPanel>

                    <FPanel
                        title={incoming ? text('ملخص المقبوض', 'Receipt summary') : text('ملخص الدفعة', 'Payment summary')}
                        icon={Banknote}
                    >
                        <div className="space-y-3 p-4 text-xs">
                            <div className="flex justify-between gap-4">
                                <span className="text-slate-500">{text('المبلغ', 'Amount')}</span>
                                <strong className="text-xl text-[#1265d8]">
                                    <Money value={movement.amount} currency={movement.currency} />
                                </strong>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-slate-500">{text('المخصص للفواتير', 'Allocated')}</span>
                                <strong className="text-emerald-600">
                                    <Money
                                        value={movement.allocations.reduce(
                                            (sum, allocation) => sum + Number(allocation.amount || 0),
                                            0,
                                        )}
                                        currency={movement.currency}
                                    />
                                </strong>
                            </div>
                        </div>
                    </FPanel>

                    {movement.government_obligation && (
                        <FPanel title={text('المستحق الحكومي', 'Government obligation')} icon={Landmark}>
                            <div className="space-y-2 p-4 text-xs">
                                <strong className="block text-[#123d78]">
                                    {movement.government_obligation.title}
                                </strong>
                                <p className="text-slate-500">
                                    {movement.government_obligation.authority_name}
                                </p>
                                <p className="font-semibold">
                                    {text('المتبقي:', 'Remaining:')}{' '}
                                    <Money
                                        value={movement.government_obligation.balance_due}
                                        currency={movement.currency}
                                    />
                                </p>
                            </div>
                        </FPanel>
                    )}

                    {movement.reversal_of_id && (
                        <div className="rounded-[18px] border border-violet-200 bg-violet-50 p-4 text-xs leading-6 text-violet-800">
                            <div className="flex items-center gap-2 font-bold">
                                <ArrowLeftRight size={15} />
                                {text('حركة عكسية', 'Reversal movement')}
                            </div>
                            <p className="mt-2">
                                {text('تعكس الحركة رقم ', 'Reverses movement #')}
                                {movement.reversal_of_id}.
                            </p>
                        </div>
                    )}

                    {movement.method === 'check' && movement.check_status === 'bounced' && (
                        <div className="rounded-[18px] border border-red-200 bg-red-50 p-4 text-xs leading-6 text-red-700">
                            <div className="flex items-center gap-2 font-bold">
                                <CalendarCheck size={15} />
                                {text('الشيك مرتجع', 'Check bounced')}
                            </div>
                            <p className="mt-2">
                                {text(
                                    'الحالة لا تمحو الحركة تلقائياً. استخدم «عكس العملية» أو «تصحيح» حتى يبقى المسار المالي واضحاً وقابلاً للتدقيق.',
                                    'The status does not silently erase the movement. Use Reverse or Correct so the financial trail stays explicit and auditable.',
                                )}
                            </p>
                        </div>
                    )}

                    <div className="rounded-[18px] border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-800">
                        <div className="flex items-center gap-2 font-bold">
                            <FileText size={15} />
                            {text('سجل غير قابل للمحو', 'Immutable record')}
                        </div>
                        <p className="mt-2">
                            {text(
                                'بعد الاعتماد، الأخطاء تُصحح بعكس/نسخة جديدة بدلاً من تغيير البيانات التاريخية بصمت.',
                                'After posting, errors are handled by reversal/replacement rather than silently changing history.',
                            )}
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function InfoCard({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-[16px] border border-[#dbe6f5] bg-white p-4">
            <p className="text-[10px] text-slate-400">{label}</p>
            <div className="mt-2 text-sm font-semibold text-[#163d77]">{children}</div>
        </div>
    );
}

function Detail({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div>
            <p className="text-[10px] text-slate-400">{label}</p>
            <div className="mt-1 break-words text-sm font-semibold text-[#163d77]">{value}</div>
        </div>
    );
}
