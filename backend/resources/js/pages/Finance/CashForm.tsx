import { apiRequest } from '@/lib/http';
import {
    useGlobalSave,
    useUnsavedChanges,
} from '@/lib/editorSafety';
import {
    clearLocalDraft,
    readLocalDraft,
    useLocalDraft,
} from '@/lib/localDraft';
import { Link } from '@inertiajs/react';
import {
    ArrowLeft,
    Banknote,
    Building2,
    CalendarDays,
    CheckCircle2,
    FileText,
    Landmark,
    Link2,
    Save,
    Send,
    ShieldCheck,
    Wallet,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    FPanel,
    FinanceHeader,
    Money,
    apiErrorText,
    financeButton,
    financeInput,
    financePrimary,
    todayValue,
} from './shared';
import type {
    CashDetail,
    DocumentDetail,
    FinanceLookups,
} from './types';

type AllocationDraft = {
    financial_document_id: number;
    document_number: string;
    document_total: string;
    document_balance_due: string;
    amount: string;
};

export function CashForm({
    direction,
    lookups,
    ar,
    initial,
}: {
    direction: 'incoming' | 'outgoing';
    lookups: FinanceLookups;
    ar: boolean;
    initial?: CashDetail | null;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const incoming = direction === 'incoming';
    const canManage = incoming
        ? lookups.permissions.cash_receive
        : lookups.permissions.cash_pay;
    const enabledMethodValues =
        lookups.settings.payment_methods.length
            ? lookups.settings.payment_methods
            : ['bank_transfer'];
    const initialMethodValue =
        initial?.method
        ?? enabledMethodValues[0]
        ?? 'bank_transfer';
    const configuredBankAccounts =
        lookups.settings.bank_accounts;
    const primaryBankAccount =
        configuredBankAccounts.find(account => account.is_primary)
        ?? configuredBankAccounts[0]
        ?? null;
    const bankAccountLabel = (
        account: FinanceLookups['settings']['bank_accounts'][number],
    ): string => [
        account.bank_name,
        account.account_name,
        account.iban || account.account_number,
    ].filter(Boolean).join(' · ');

    const [partyId, setPartyId] = useState(
        initial?.party_id ? String(initial.party_id) : '',
    );
    const [governmentObligationId, setGovernmentObligationId] = useState(
        initial?.government_obligation_id
            ? String(initial.government_obligation_id)
            : '',
    );
    const [category, setCategory] = useState(
        initial?.category
            ?? (incoming ? 'customer_receipt' : 'supplier_payment'),
    );
    const [amount, setAmount] = useState(initial?.amount ?? '0');
    const currency = lookups.currency;
    const [movementDate, setMovementDate] = useState(
        initial?.movement_date ?? todayValue(),
    );
    const [method, setMethod] = useState(initialMethodValue);
    const [accountLabel, setAccountLabel] = useState(
        initial?.account_label
        ?? (
            initialMethodValue === 'bank_transfer' && primaryBankAccount
                ? bankAccountLabel(primaryBankAccount)
                : ''
        ),
    );
    const [branchLabel, setBranchLabel] = useState(initial?.branch_label ?? '');
    const [costCenter, setCostCenter] = useState(initial?.cost_center ?? '');
    const [departmentId, setDepartmentId] = useState(
        initial?.department_id ? String(initial.department_id) : '',
    );
    const [reference, setReference] = useState(initial?.reference ?? '');
    const [notes, setNotes] = useState(initial?.notes ?? '');
    const [checkNumber, setCheckNumber] = useState(initial?.check_number ?? '');
    const [checkBank, setCheckBank] = useState(initial?.check_bank ?? '');
    const [checkDueDate, setCheckDueDate] = useState(initial?.check_due_date ?? '');
    const [allocations, setAllocations] = useState<AllocationDraft[]>(
        initial?.allocations.map((allocation) => ({
            financial_document_id: allocation.financial_document_id,
            document_number: allocation.document_number ?? String(allocation.financial_document_id),
            document_total: allocation.document_total ?? '0',
            document_balance_due: allocation.document_balance_due ?? '0',
            amount: allocation.amount,
        })) ?? [],
    );
    const [allocationSearch, setAllocationSearch] = useState('');
    const [invoiceOptions, setInvoiceOptions] = useState<DocumentDetail[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [prefilled, setPrefilled] = useState(false);

    const localDraftKey =
        'acconova:draft:cash:'
        + direction
        + ':'
        + String(
            initial?.id
            ?? 'new',
        );

    const draftState = {
        partyId,
        governmentObligationId,
        category,
        amount,
        movementDate,
        method,
        accountLabel,
        branchLabel,
        costCenter,
        departmentId,
        reference,
        notes,
        checkNumber,
        checkBank,
        checkDueDate,
        allocations,
    };

    const initialDraftRef =
        useRef(
            JSON.stringify(
                draftState,
            ),
        );

    const dirty =
        JSON.stringify(
            draftState,
        ) !==
            initialDraftRef.current;

    useUnsavedChanges(
        dirty && ! busy,
        ar,
    );

    useGlobalSave(
        () => {
            if (
                canManage
                && ! busy
            ) {
                void save(
                    false,
                );
            }
        },
        canManage,
    );

    useLocalDraft(
        localDraftKey,
        draftState,
        canManage
        && ! busy,
        900,
    );

    const parties = lookups.parties.filter((party) =>
        party.roles.includes(incoming ? 'customer' : 'supplier'),
    );

    const selectedParty = lookups.parties.find(
        (party) => String(party.id) === partyId,
    ) ?? null;

    const selectedObligation = lookups.government_obligations.find(
        (obligation) => String(obligation.id) === governmentObligationId,
    ) ?? null;

    useEffect(() => {
        if (prefilled || initial) {
            return;
        }

        setPrefilled(true);

        const params = new URLSearchParams(window.location.search);
        const documentId = params.get('document_id');
        const obligationId = params.get('government_obligation_id');
        const partyIdParam = params.get('party_id');
        const amountParam = params.get('amount');

        if (
            ! documentId
            && partyIdParam
        ) {
            const party = lookups.parties.find(
                item =>
                    String(item.id)
                    === partyIdParam
                    && item.roles.includes(
                        incoming
                            ? 'customer'
                            : 'supplier',
                    ),
            );

            if (party) {
                setPartyId(
                    String(party.id),
                );
                setCategory(
                    incoming
                        ? 'customer_receipt'
                        : 'supplier_payment',
                );

                if (
                    amountParam
                    && Number(amountParam) > 0
                ) {
                    setAmount(amountParam);
                }
            }
        }

        if (documentId) {
            apiRequest<{ data: DocumentDetail }>(
                '/api/finance/documents/' + documentId,
            )
                .then((response) => {
                    const document = response.data;
                    const expectedKind = incoming ? 'sale_invoice' : 'purchase_invoice';

                    if (document.kind !== expectedKind) {
                        return;
                    }

                    setPartyId(document.party?.id ? String(document.party.id) : '');
                    setAmount(document.balance_due);
                    setCategory(incoming ? 'customer_receipt' : 'supplier_payment');
                    setAllocations([
                        {
                            financial_document_id: document.id,
                            document_number: document.number,
                            document_total: document.total,
                            document_balance_due: document.balance_due,
                            amount: document.balance_due,
                        },
                    ]);
                })
                .catch(() => undefined);
        }

        if (! incoming && obligationId) {
            const obligation = lookups.government_obligations.find(
                (item) => String(item.id) === obligationId,
            );

            if (obligation) {
                setGovernmentObligationId(String(obligation.id));
                setCategory(
                    obligation.title.toLowerCase().includes('tax')
                        ? 'tax_payment'
                        : 'government_fee',
                );
                setAmount(obligation.balance_due);
                setReference(obligation.authority_name);
            }
        }
    }, [prefilled, initial, incoming, lookups.government_obligations]);

    useEffect(() => {
        if (
            initial
            || typeof window === 'undefined'
        ) {
            return;
        }

        const params =
            new URLSearchParams(
                window.location.search,
            );

        if (
            params.has(
                'document_id',
            )
            || params.has(
                'government_obligation_id',
            )
            || params.has(
                'party_id',
            )
        ) {
            return;
        }

        const stored =
            readLocalDraft<
                typeof draftState
            >(
                localDraftKey,
            );

        if (
            ! stored
            || ! (
                stored.value
                    .partyId
                || Number(
                    stored.value
                        .amount,
                ) > 0
                || stored.value
                    .reference
                    ?.trim()
                || stored.value
                    .notes
                    ?.trim()
                || stored.value
                    .allocations
                    ?.length
            )
        ) {
            return;
        }

        if (
            ! window.confirm(
                text(
                    'وجدت مسودة حركة مالية محفوظة تلقائياً. هل تريد استعادتها؟',
                    'An autosaved cash draft was found. Restore it?',
                ),
            )
        ) {
            return;
        }

        const draft =
            stored.value;

        setPartyId(
            draft.partyId
            ?? '',
        );
        setGovernmentObligationId(
            draft.governmentObligationId
            ?? '',
        );
        setCategory(
            draft.category
            ?? (
                incoming
                    ? 'customer_receipt'
                    : 'supplier_payment'
            ),
        );
        setAmount(
            draft.amount
            ?? '0',
        );
        setMovementDate(
            draft.movementDate
            ?? todayValue(),
        );
        setMethod(
            draft.method
            ?? initialMethodValue,
        );
        setAccountLabel(
            draft.accountLabel
            ?? '',
        );
        setBranchLabel(
            draft.branchLabel
            ?? '',
        );
        setCostCenter(
            draft.costCenter
            ?? '',
        );
        setDepartmentId(
            draft.departmentId
            ?? '',
        );
        setReference(
            draft.reference
            ?? '',
        );
        setNotes(
            draft.notes
            ?? '',
        );
        setCheckNumber(
            draft.checkNumber
            ?? '',
        );
        setCheckBank(
            draft.checkBank
            ?? '',
        );
        setCheckDueDate(
            draft.checkDueDate
            ?? '',
        );
        setAllocations(
            draft.allocations
            ?? [],
        );
    }, [
        initial?.id,
        direction,
        localDraftKey,
    ]);

    const allocated = useMemo(
        () => allocations.reduce(
            (sum, allocation) => sum + (Number(allocation.amount) || 0),
            0,
        ),
        [allocations],
    );

    const unallocated = Math.max((Number(amount) || 0) - allocated, 0);

    async function searchInvoices(): Promise<void> {
        setLoadingInvoices(true);
        setError('');

        try {
            const params = new URLSearchParams({
                kind: incoming ? 'sale_invoice' : 'purchase_invoice',
                per_page: '100',
            });

            if (partyId) {
                params.set('party_id', partyId);
            }

            if (allocationSearch.trim()) {
                params.set('search', allocationSearch.trim());
            }

            const response = await apiRequest<{
                data: {
                    id: number;
                    number: string;
                    status: string;
                    party: { id: number; name: string } | null;
                    total: string;
                    balance_due: string;
                    currency: string;
                }[];
            }>('/api/finance/documents?' + params.toString());

            const details = await Promise.all(
                response.data
                    .filter((row) =>
                        ['issued', 'partially_paid', 'overpaid', 'paid'].includes(row.status),
                    )
                    .filter((row) => Number(row.balance_due) > 0)
                    .slice(0, 20)
                    .map((row) =>
                        apiRequest<{ data: DocumentDetail }>(
                            '/api/finance/documents/' + row.id,
                        ).then((detail) => detail.data),
                    ),
            );

            setInvoiceOptions(details);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setLoadingInvoices(false);
        }
    }

    function addAllocation(document: DocumentDetail): void {
        if (allocations.some((item) => item.financial_document_id === document.id)) {
            return;
        }

        if (partyId && document.party?.id && String(document.party.id) !== partyId) {
            setError(
                text(
                    'لا يمكن توزيع حركة واحدة على فواتير لأطراف مختلفة.',
                    'One cash movement cannot be allocated across different counterparties.',
                ),
            );
            return;
        }

        if (! partyId && document.party?.id) {
            setPartyId(String(document.party.id));
        }

        if (document.currency !== currency && allocations.length > 0) {
            setError(
                text(
                    'يجب أن تكون كل الفواتير المخصصة بنفس عملة الحركة.',
                    'All allocated invoices must use the cash movement currency.',
                ),
            );
            return;
        }

        if (! allocations.length) {
        }

        const remainingAmount = Math.max(
            (Number(amount) || 0) - allocated,
            0,
        );

        setAllocations((current) => [
            ...current,
            {
                financial_document_id: document.id,
                document_number: document.number,
                document_total: document.total,
                document_balance_due: document.balance_due,
                amount: String(
                    Math.min(
                        Number(document.balance_due) || 0,
                        remainingAmount > 0
                            ? remainingAmount
                            : Number(document.balance_due) || 0,
                    ),
                ),
            },
        ]);
    }

    function payload() {
        return {
            direction,
            party_id: partyId ? Number(partyId) : null,
            government_obligation_id:
                ! incoming && governmentObligationId
                    ? Number(governmentObligationId)
                    : null,
            department_id: departmentId ? Number(departmentId) : null,
            category,
            amount,
            currency,
            movement_date: movementDate,
            method,
            account_label: accountLabel || null,
            branch_label: branchLabel || null,
            cost_center: costCenter || null,
            reference: reference || null,
            check_number: method === 'check' ? checkNumber : null,
            check_bank: method === 'check' ? checkBank : null,
            check_due_date: method === 'check' ? checkDueDate : null,
            check_status: method === 'check' ? 'pending' : null,
            notes: notes || null,
            allocations: allocations
                .filter((allocation) => Number(allocation.amount) > 0)
                .map((allocation) => ({
                    financial_document_id: allocation.financial_document_id,
                    amount: allocation.amount,
                })),
        };
    }

    async function save(post: boolean): Promise<void> {
        if (busy || ! canManage) {
            return;
        }

        if (
            ['customer_receipt', 'supplier_payment'].includes(category)
            && ! partyId
        ) {
            setError(
                text(
                    incoming
                        ? 'اختر عميلاً مسجلاً حتى نحفظ أي مبلغ زائد أو دفعة مقدمة كرصيد له.'
                        : 'اختر مورداً مسجلاً حتى نحفظ أي مبلغ زائد أو دفعة مقدمة كرصيد له.',
                    incoming
                        ? 'Select a saved customer so any overpayment or advance is kept as their credit.'
                        : 'Select a saved supplier so any overpayment or advance is kept as their credit.',
                ),
            );
            return;
        }

        if ((Number(amount) || 0) <= 0) {
            setError(text('أدخل مبلغاً صحيحاً.', 'Enter a valid amount.'));
            return;
        }

        const overAllocatedInvoice =
            allocations.find(
                allocation =>
                    (Number(allocation.amount) || 0)
                    > (Number(allocation.document_balance_due) || 0)
                        + 0.00005,
            );

        if (overAllocatedInvoice) {
            setError(
                text(
                    'المبلغ المخصص للفاتورة لا يمكن أن يتجاوز المتبقي عليها. أي مبلغ زائد سيبقى تلقائياً رصيداً مقدماً للطرف.',
                    'An invoice allocation cannot exceed its outstanding balance. Any extra amount will remain as advance credit for the party.',
                ),
            );
            return;
        }

        if (allocated > (Number(amount) || 0) + 0.00005) {
            setError(
                text(
                    'إجمالي المبالغ المخصصة للفواتير أكبر من مبلغ الحركة.',
                    'Invoice allocations exceed the cash movement amount.',
                ),
            );
            return;
        }

        if (method === 'check' && (! checkNumber || ! checkBank || ! checkDueDate)) {
            setError(
                text(
                    'رقم الشيك والبنك وتاريخ الاستحقاق مطلوبة عند اختيار طريقة الدفع شيك.',
                    'Check number, bank and due date are required for check payments.',
                ),
            );
            return;
        }

        let duplicateAcknowledged =
            false;

        if (post) {
            try {
                const duplicateResponse = await apiRequest<{
                    data: Array<{
                        id: number;
                        number: string;
                        status: string;
                        movement_date: string | null;
                        amount: string;
                        method: string;
                        reference: string | null;
                    }>;
                }>(
                    '/api/finance/cash-movements/duplicate-check',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            direction,
                            party_id: partyId
                                ? Number(partyId)
                                : null,
                            amount,
                            movement_date: movementDate,
                            method,
                            reference: reference || null,
                            exclude_id: initial?.id ?? null,
                        }),
                    },
                );

                const duplicateCandidates =
                    duplicateResponse.data;

                if (
                    duplicateCandidates.length >
                    0
                ) {
                    if (
                        ! window.confirm(
                            text(
                                'تنبيه: يوجد '
                                + String(duplicateCandidates.length)
                                + ' دفعة/مقبوض مشابه جداً خلال ±3 أيام بنفس المبلغ. أقرب حركة: '
                                + duplicateCandidates[0].number
                                + ' بتاريخ '
                                + (duplicateCandidates[0].movement_date ?? '—')
                                + '. هل راجعت أنها ليست دفعة مكررة وتريد المتابعة؟',
                                'Warning: '
                                + String(duplicateCandidates.length)
                                + ' very similar payment/receipt record(s) exist within ±3 days with the same amount. Closest: '
                                + duplicateCandidates[0].number
                                + ' dated '
                                + (duplicateCandidates[0].movement_date ?? '—')
                                + '. Did you verify this is not a duplicate and want to continue?',
                            ),
                        )
                    ) {
                        return;
                    }

                    duplicateAcknowledged =
                        true;
                }
            } catch {
                /*
                 * Duplicate detection is a safety layer, not a reason to lose
                 * an otherwise valid draft if the check endpoint is
                 * temporarily unavailable.
                 */
            }
        }

        if (
            post
            && ! window.confirm(
                text(
                    (incoming ? 'تأكيد القبض: ' : 'تأكيد الدفع: ')
                    + new Intl.NumberFormat().format(Number(amount) || 0)
                    + ' '
                    + currency
                    + ' بطريقة '
                    + method
                    + '. بعد الاعتماد لن يتم تعديل الحركة بصمت؛ أي خطأ لاحق يحتاج عكساً أو تصحيحاً موثقاً. هل راجعت المبلغ؟',
                    (incoming ? 'Confirm receipt: ' : 'Confirm payment: ')
                    + new Intl.NumberFormat().format(Number(amount) || 0)
                    + ' '
                    + currency
                    + ' via '
                    + method
                    + '. After posting, the movement cannot be silently edited; later mistakes require a documented reversal or correction. Did you review the amount?',
                ),
            )
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{ data: CashDetail }>(
                initial?.id
                    ? '/api/finance/cash-movements/' + initial.id
                    : '/api/finance/cash-movements',
                {
                    method: initial?.id ? 'PATCH' : 'POST',
                    body: JSON.stringify(payload()),
                },
            );

            let movement = response.data;

            if (post) {
                const posted = await apiRequest<{ data: CashDetail }>(
                    '/api/finance/cash-movements/' + movement.id + '/post',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            acknowledge_duplicate:
                                duplicateAcknowledged,
                        }),
                    },
                );

                movement = posted.data;
            }

            clearLocalDraft(
                localDraftKey,
            );

            window.location.assign(
                incoming
                    ? '/app/receipts/' + movement.id
                    : '/app/payments/' + movement.id,
            );
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    const incomingCategories = [
        ['customer_receipt', text('دفعة عميل / تحصيل / دفعة مقدمة', 'Customer payment / collection / advance')],
        ['capital', text('تمويل أو رأس مال', 'Capital / funding')],
        ['loan', text('قرض مستلم', 'Loan received')],
        ['asset_sale', text('بيع أصل', 'Asset sale')],
        ['refund', text('مرتجع / تسوية', 'Refund / settlement')],
        ['other_income', text('دخل آخر', 'Other income')],
        ['other', text('أخرى', 'Other')],
    ];

    const outgoingCategories = [
        ['supplier_payment', text('دفعة مورد / دفعة مقدمة', 'Supplier payment / advance')],
        ['raw_material', text('مواد خام', 'Raw materials')],
        ['goods_for_resale', text('بضائع لإعادة البيع', 'Goods for resale')],
        ['packaging', text('تعبئة وتغليف', 'Packaging')],
        ['operating_expense', text('مصروف تشغيلي', 'Operating expense')],
        ['rent', text('إيجار', 'Rent')],
        ['utilities', text('كهرباء ومياه', 'Utilities')],
        ['shipping_customs', text('شحن وجمارك', 'Freight & customs')],
        ['maintenance', text('صيانة', 'Maintenance')],
        ['marketing', text('تسويق', 'Marketing')],
        ['tax_payment', text('دفع ضريبة', 'Tax payment')],
        ['government_fee', text('رسوم حكومية', 'Government fee')],
        ['asset_purchase', text('شراء أصل', 'Asset purchase')],
        ['other_expense', text('مصروف آخر', 'Other expense')],
        ['other', text('أخرى', 'Other')],
    ];

    const allMethods = [
        ['cash', text('نقدي', 'Cash')],
        ['bank_transfer', text('تحويل بنكي', 'Bank transfer')],
        ['check', text('شيك', 'Check')],
        ['card', text('بطاقة ائتمان / خصم', 'Card')],
        ['electronic_wallet', text('محفظة إلكترونية', 'E-wallet')],
        ['direct_debit', text('خصم مباشر', 'Direct debit')],
        ['other', text('طريقة أخرى', 'Other')],
    ];

    const methods = allMethods.filter(
        ([value]) =>
            enabledMethodValues.includes(value)
            || value === initial?.method,
    );

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={
                    initial
                        ? incoming
                            ? text('تعديل مسودة مقبوض', 'Edit receipt draft')
                            : text('تعديل مسودة دفعة', 'Edit payment draft')
                        : incoming
                          ? text('تسجيل مقبوض', 'Record receipt')
                          : text('تسجيل دفعة', 'Record payment')
                }
                subtitle={
                    incoming
                        ? text(
                            'سجل المقبوضات سواء كانت مرتبطة بفواتير بيع أو دفعات مقدمة أو تمويلاً أو دخلاً آخر.',
                            'Record incoming cash whether linked to sales invoices, advances, funding or other income.',
                        )
                        : text(
                            'سجل أي دفع: موردين، مواد خام، مصاريف تشغيل، ضرائب، رسوم حكومية أو أي مصروف غير مرتبط بالمخزون.',
                            'Record any outgoing payment: suppliers, raw materials, operating expenses, taxes, government fees or non-inventory costs.',
                        )
                }
                actions={
                    <>
                        <Link
                            href={incoming ? '/app/receipts' : '/app/payments'}
                            className={financeButton}
                        >
                            <ArrowLeft size={15} className="rtl:rotate-180" />
                            {text('رجوع', 'Back')}
                        </Link>

                        <button
                            type="button"
                            className={financeButton}
                            disabled={busy || ! canManage}
                            onClick={() => void save(false)}
                        >
                            <Save size={15} />
                            {text('حفظ كمسودة', 'Save draft')}
                        </button>
                        <button
                            type="button"
                            className={financePrimary}
                            disabled={busy || ! canManage}
                            onClick={() => void save(true)}
                        >
                            <Send size={15} />
                            {incoming
                                ? text('اعتماد القبض', 'Post receipt')
                                : text('اعتماد الصرف', 'Post payment')}
                        </button>
                    </>
                }
            />

            {! canManage && (
                <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    {text(
                        'دورك الحالي يسمح بالعرض فقط.',
                        'Your current role is read-only.',
                    )}
                </div>
            )}

            <div className="rounded-[14px] border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-700">
                {text(
                    'الحقول التي تحمل علامة * مطلوبة. الحقول الأخرى اختيارية، وبيانات الشيك تصبح مطلوبة فقط عند اختيار شيك.',
                    'Fields marked * are required. Other fields are optional; check details become required only when Check is selected.',
                )}
            </div>

            {initial?.correction_reason && (
                <div className="rounded-[14px] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
                    <strong>{text('مسودة تصحيح:', 'Correction draft:')}</strong>{' '}
                    {initial.correction_reason}
                </div>
            )}

            {error && (
                <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
                <div className="space-y-4">
                    <FPanel
                        title={text('معلومات الحركة', 'Movement information')}
                        icon={Banknote}
                    >
                        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {incoming
                                    ? text('مصدر المقبوض *', 'Receipt source *')
                                    : text('فئة الدفع *', 'Payment category *')}
                                <select
                                    className={financeInput + ' mt-2'}
                                    value={category}
                                    onChange={(event) => {
                                        setCategory(event.target.value);
                                        if (! incoming && ! ['tax_payment', 'government_fee'].includes(event.target.value)) {
                                            setGovernmentObligationId('');
                                        }
                                    }}
                                >
                                    {(incoming ? incomingCategories : outgoingCategories)
                                        .map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {incoming
                                    ? text(
                                        category === 'customer_receipt'
                                            ? 'العميل *'
                                            : 'العميل / المصدر',
                                        category === 'customer_receipt'
                                            ? 'Customer *'
                                            : 'Customer / source',
                                    )
                                    : text(
                                        category === 'supplier_payment'
                                            ? 'المورد *'
                                            : 'المستفيد / المورد',
                                        category === 'supplier_payment'
                                            ? 'Supplier *'
                                            : 'Beneficiary / supplier',
                                    )}
                                <select
                                    className={financeInput + ' mt-2'}
                                    value={partyId}
                                    onChange={(event) => setPartyId(event.target.value)}
                                >
                                    <option value="">
                                        {text('بدون طرف مسجل', 'No saved party')}
                                    </option>
                                    {parties.map((party) => (
                                        <option key={party.id} value={party.id}>
                                            {party.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('المبلغ *', 'Amount *')}
                                <input
                                    type="number"
                                    min="0.0001"
                                    step="0.0001"
                                    className={financeInput + ' mt-2'}
                                    value={amount}
                                    onChange={(event) => setAmount(event.target.value)}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('العملة', 'Currency')}
                                <input
                                    className={financeInput + ' mt-2'}
                                    maxLength={3}
                                    value={currency}
                                    readOnly
                                    aria-readonly="true"
                                    title={text(
                                        'العملة محددة من إعدادات مساحة العمل',
                                        'Currency is controlled by workspace settings',
                                    )}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('تاريخ الحركة *', 'Movement date *')}
                                <input
                                    type="date"
                                    className={financeInput + ' mt-2'}
                                    value={movementDate}
                                    onChange={(event) => setMovementDate(event.target.value)}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('طريقة الدفع / القبض *', 'Payment method *')}
                                <select
                                    className={financeInput + ' mt-2'}
                                    value={method}
                                    onChange={(event) => {
                                        const nextMethod = event.target.value;
                                        setMethod(nextMethod);

                                        if (
                                            nextMethod === 'bank_transfer'
                                            && ! accountLabel
                                            && primaryBankAccount
                                        ) {
                                            setAccountLabel(
                                                bankAccountLabel(primaryBankAccount),
                                            );
                                        }
                                    }}
                                >
                                    {methods.map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('الحساب / الصندوق (اختياري)', 'Account / cash box (optional)')}
                                {method === 'bank_transfer' && configuredBankAccounts.length > 0 ? (
                                    <select
                                        className={financeInput + ' mt-2'}
                                        value={accountLabel}
                                        onChange={(event) => setAccountLabel(event.target.value)}
                                    >
                                        <option value="">
                                            {text('اختر حساباً بنكياً', 'Select bank account')}
                                        </option>
                                        {configuredBankAccounts.map((account) => {
                                            const label = bankAccountLabel(account);

                                            return (
                                                <option key={account.id} value={label}>
                                                    {label}
                                                    {account.is_primary
                                                        ? text(' · أساسي', ' · Primary')
                                                        : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                ) : (
                                    <input
                                        className={financeInput + ' mt-2'}
                                        value={accountLabel}
                                        onChange={(event) => setAccountLabel(event.target.value)}
                                        placeholder={text('مثال: الصندوق الرئيسي', 'Example: Main cash box')}
                                    />
                                )}
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('رقم المرجع (اختياري)', 'Reference (optional)')}
                                <input
                                    className={financeInput + ' mt-2'}
                                    value={reference}
                                    onChange={(event) => setReference(event.target.value)}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('القسم (اختياري)', 'Department (optional)')}
                                <select
                                    className={financeInput + ' mt-2'}
                                    value={departmentId}
                                    onChange={(event) => setDepartmentId(event.target.value)}
                                >
                                    <option value="">{text('بدون قسم', 'No department')}</option>
                                    {lookups.departments.map((department) => (
                                        <option key={department.id} value={department.id}>
                                            {department.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('الفرع / الموقع (اختياري)', 'Branch / location (optional)')}
                                <input
                                    className={financeInput + ' mt-2'}
                                    value={branchLabel}
                                    onChange={(event) => setBranchLabel(event.target.value)}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('مركز التكلفة (اختياري)', 'Cost center (optional)')}
                                <input
                                    className={financeInput + ' mt-2'}
                                    value={costCenter}
                                    onChange={(event) => setCostCenter(event.target.value)}
                                />
                            </label>

                            {! incoming && (
                                <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                    {text('مستحق حكومي مرتبط (اختياري)', 'Government obligation (optional)')}
                                    <select
                                        className={financeInput + ' mt-2'}
                                        value={governmentObligationId}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            setGovernmentObligationId(value);
                                            const obligation = lookups.government_obligations.find(
                                                (item) => String(item.id) === value,
                                            );

                                            if (obligation) {
                                                setAmount(obligation.balance_due);
                                                setCategory('tax_payment');
                                                setReference(obligation.authority_name);
                                            }
                                        }}
                                    >
                                        <option value="">
                                            {text('بدون مستحق حكومي', 'No government obligation')}
                                        </option>
                                        {lookups.government_obligations
                                            .filter((obligation) => obligation.currency === currency)
                                            .map((obligation) => (
                                            <option key={obligation.id} value={obligation.id}>
                                                {obligation.title} · {obligation.authority_name} · {obligation.balance_due} {obligation.currency}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            )}
                        </div>
                    </FPanel>

                    {method === 'check' && (
                        <FPanel
                            title={text('بيانات الشيك', 'Check details')}
                            icon={Landmark}
                        >
                            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
                                <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                    {text('رقم الشيك *', 'Check number *')}
                                    <input
                                        className={financeInput + ' mt-2'}
                                        value={checkNumber}
                                        onChange={(event) => setCheckNumber(event.target.value)}
                                    />
                                </label>

                                <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                    {text('البنك *', 'Bank *')}
                                    <input
                                        className={financeInput + ' mt-2'}
                                        value={checkBank}
                                        onChange={(event) => setCheckBank(event.target.value)}
                                    />
                                </label>

                                <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                    {text('تاريخ الاستحقاق *', 'Due date *')}
                                    <input
                                        type="date"
                                        className={financeInput + ' mt-2'}
                                        value={checkDueDate}
                                        onChange={(event) => setCheckDueDate(event.target.value)}
                                    />
                                </label>

                                <div className="rounded-[13px] border border-blue-100 bg-blue-50/70 p-3">
                                    <p className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                                        {text('حالة الشيك', 'Check status')}
                                    </p>

                                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-[var(--ac-surface)] px-3 py-1.5 text-[11px] font-bold text-[var(--ac-accent)]">
                                        <span className="size-2 rounded-full bg-[var(--ac-accent-solid)]" />
                                        {text('قيد التحصيل تلقائياً', 'Pending automatically')}
                                    </div>

                                    <p className="mt-2 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                        {text(
                                            'عند تسجيل الشيك لا تحتاج لاختيار حالته. بعد اعتماد الحركة غيّر الحالة من صفحة تفاصيل الشيك إلى محصل أو مرتجع أو ملغي.',
                                            'You do not choose the check status while recording it. After posting, update it from the check details page to cleared, bounced or cancelled.',
                                        )}
                                    </p>
                                </div>
                            </div>
                        </FPanel>
                    )}

                    <FPanel
                        title={
                            incoming
                                ? text('توزيع المقبوض على فواتير البيع', 'Allocate receipt to sales invoices')
                                : text('توزيع الدفع على فواتير الشراء', 'Allocate payment to purchase invoices')
                        }
                        icon={Link2}
                        action={
                            <button
                                type="button"
                                className={financeButton}
                                disabled={loadingInvoices}
                                onClick={() => void searchInvoices()}
                            >
                                {text('بحث عن فواتير', 'Find invoices')}
                            </button>
                        }
                    >
                        <div className="space-y-4 p-4">
                            <div className="rounded-[12px] border border-blue-100 bg-blue-50/70 p-3 text-[11px] leading-6 text-blue-800">
                                {text(
                                    'التوزيع اختياري وآمن: لا يمكن تخصيص أكثر من المتبقي على الفاتورة، وأي زيادة في المبلغ تبقى رصيداً مقدماً للطرف. مسودة الفاتورة يمكن حذفها قبل الإصدار فقط؛ أما الفاتورة الصادرة المرتبطة بدفعة فلا تُحذف، بل تُصحح أو تُلغى بعد معالجة الدفعة المرتبطة.',
                                    'Allocation is optional and protected: you cannot allocate more than the invoice outstanding balance, and any extra amount remains party advance credit. An invoice draft can only be deleted before issue; an issued invoice linked to a payment is corrected or voided after the linked payment is handled, never silently deleted.',
                                )}
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    className={financeInput}
                                    value={allocationSearch}
                                    onChange={(event) => setAllocationSearch(event.target.value)}
                                    placeholder={text('رقم الفاتورة أو اسم الطرف...', 'Invoice number or party...')}
                                />
                                <button
                                    type="button"
                                    className={financeButton}
                                    disabled={loadingInvoices}
                                    onClick={() => void searchInvoices()}
                                >
                                    {loadingInvoices
                                        ? text('جارٍ البحث...', 'Searching...')
                                        : text('بحث', 'Search')}
                                </button>
                            </div>

                            {invoiceOptions.length > 0 && (
                                <div className="grid gap-2 md:grid-cols-2">
                                    {invoiceOptions.map((document) => (
                                        <button
                                            type="button"
                                            key={document.id}
                                            onClick={() => addAllocation(document)}
                                            className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--ac-line)] p-3 text-start text-xs hover:bg-blue-50"
                                        >
                                            <div>
                                                <strong className="text-[var(--ac-accent)]">{document.number}</strong>
                                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                    {document.party?.name ?? '—'}
                                                </p>
                                            </div>
                                            <Money
                                                value={document.balance_due}
                                                currency={document.currency}
                                                compact
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {allocations.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[620px] text-xs">
                                        <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                            <tr>
                                                <th className="px-3 py-3 text-start">{text('الفاتورة', 'Invoice')}</th>
                                                <th className="px-3 py-3 text-start">{text('إجمالي الفاتورة', 'Invoice total')}</th>
                                                <th className="px-3 py-3 text-start">{text('المتبقي', 'Outstanding')}</th>
                                                <th className="px-3 py-3 text-start">{text('المبلغ المخصص', 'Allocated')}</th>
                                                <th className="px-3 py-3 text-start">{text('إجراء', 'Action')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allocations.map((allocation) => (
                                                <tr
                                                    key={allocation.financial_document_id}
                                                    className="border-t border-[var(--ac-line)]"
                                                >
                                                    <td className="px-3 py-3 font-semibold text-[var(--ac-accent)]">
                                                        {allocation.document_number}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <Money value={allocation.document_total} currency={currency} compact />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <Money value={allocation.document_balance_due} currency={currency} compact />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max={allocation.document_balance_due}
                                                            step="0.0001"
                                                            className={financeInput + ' max-w-36'}
                                                            value={allocation.amount}
                                                            onChange={(event) =>
                                                                setAllocations((current) =>
                                                                    current.map((item) =>
                                                                        item.financial_document_id === allocation.financial_document_id
                                                                            ? { ...item, amount: event.target.value }
                                                                            : item,
                                                                    ),
                                                                )
                                                            }
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <button
                                                            type="button"
                                                            className={financeButton}
                                                            onClick={() =>
                                                                setAllocations((current) =>
                                                                    current.filter(
                                                                        (item) =>
                                                                            item.financial_document_id !== allocation.financial_document_id,
                                                                    ),
                                                                )
                                                            }
                                                        >
                                                            {text('إزالة', 'Remove')}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-xs leading-6 text-[var(--ac-text-muted)]">
                                    {incoming
                                        ? text(
                                            'ربط المقبوض بالفواتير اختياري. يمكنك تسجيل دخل أو دفعة مقدمة بدون فاتورة.',
                                            'Invoice allocation is optional. You can record income or an advance without an invoice.',
                                        )
                                        : text(
                                            'ربط الدفع بفاتورة شراء اختياري. مصروف الصيانة أو الإيجار أو الضرائب مثلاً يمكن تسجيله بدون فاتورة مخزون.',
                                            'Purchase-invoice allocation is optional. Maintenance, rent or tax payments can be recorded without an inventory invoice.',
                                        )}
                                </p>
                            )}
                        </div>
                    </FPanel>

                    <FPanel title={text('ملاحظات', 'Notes')} icon={FileText}>
                        <div className="p-4">
                            <textarea
                                className={financeInput + ' min-h-28'}
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                            />
                        </div>
                    </FPanel>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-24">
                    <FPanel
                        title={incoming ? text('ملخص المقبوض', 'Receipt summary') : text('ملخص الدفعة', 'Payment summary')}
                        icon={Wallet}
                    >
                        <div className="space-y-3 p-4 text-xs">
                            <SummaryLine
                                label={text('المبلغ الإجمالي', 'Total amount')}
                                value={amount}
                                currency={currency}
                            />
                            <SummaryLine
                                label={text('المخصص للفواتير', 'Allocated')}
                                value={String(allocated)}
                                currency={currency}
                                className="text-emerald-600"
                            />
                            <SummaryLine
                                label={
                                    incoming && selectedParty && category === 'customer_receipt'
                                        ? text('رصيد مقدم للعميل', 'Customer advance credit')
                                        : ! incoming && selectedParty && category === 'supplier_payment'
                                          ? text('دفعة مقدمة للمورد', 'Supplier advance credit')
                                          : text('غير المخصص', 'Unallocated')
                                }
                                value={String(unallocated)}
                                currency={currency}
                                className={unallocated > 0 ? 'text-amber-600' : 'text-emerald-600'}
                                strong
                            />
                        </div>
                    </FPanel>

                    {unallocated > 0
                        && selectedParty
                        && (
                            (incoming && category === 'customer_receipt')
                            || (! incoming && category === 'supplier_payment')
                        ) && (
                        <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-xs leading-6 text-emerald-800">
                            <strong>
                                {incoming
                                    ? text('رصيد عميل محفوظ', 'Saved customer credit')
                                    : text('دفعة مورد مقدمة محفوظة', 'Saved supplier advance')}
                            </strong>
                            <p className="mt-1">
                                {incoming
                                    ? text(
                                        'سيبقى هذا المبلغ رصيداً مقدماً باسم العميل ويمكن استخدامه لاحقاً على فاتورة جديدة.',
                                        'This amount remains as customer credit and can be applied to a future invoice.',
                                    )
                                    : text(
                                        'سيبقى هذا المبلغ دفعة مقدمة باسم المورد ويمكن ربطه لاحقاً بفاتورة شراء.',
                                        'This amount remains as a supplier advance and can be linked to a future purchase invoice.',
                                    )}
                            </p>
                        </div>
                    )}

                    <FPanel
                        title={incoming ? text('معلومات المصدر', 'Source information') : text('معلومات المستفيد', 'Beneficiary information')}
                        icon={Building2}
                    >
                        <div className="space-y-2 p-4 text-xs">
                            <strong className="block text-base text-[var(--ac-text)]">
                                {selectedParty?.name ?? text('طرف غير مسجل', 'Unsaved party')}
                            </strong>
                            <p className="text-[var(--ac-text-muted)]">{selectedParty?.phone ?? '—'}</p>
                            <p className="text-[var(--ac-text-muted)]">{selectedParty?.email ?? '—'}</p>
                        </div>
                    </FPanel>

                    {selectedObligation && (
                        <FPanel
                            title={text('المستحق الحكومي', 'Government obligation')}
                            icon={Landmark}
                        >
                            <div className="space-y-2 p-4 text-xs">
                                <strong className="block text-[var(--ac-text)]">{selectedObligation.title}</strong>
                                <p className="text-[var(--ac-text-muted)]">{selectedObligation.authority_name}</p>
                                <p className="text-[var(--ac-text-muted)]">
                                    {selectedObligation.country_code}
                                    {selectedObligation.region_code
                                        ? ' / ' + selectedObligation.region_code
                                        : ''}
                                </p>
                                <p className="font-semibold">
                                    <Money
                                        value={selectedObligation.balance_due}
                                        currency={selectedObligation.currency}
                                    />
                                </p>
                            </div>
                        </FPanel>
                    )}

                    <div className="rounded-[18px] border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-800">
                        <div className="flex items-center gap-2 font-bold">
                            <ShieldCheck size={16} />
                            {text('تصحيح آمن', 'Safe correction')}
                        </div>
                        <p className="mt-2">
                            {text(
                                'بعد اعتماد الحركة لا يتم تعديل المبلغ أو الطريقة بصمت. التصحيح يعكس الحركة القديمة ويحفظ نسخة جديدة مع السبب والسجل.',
                                'After posting, amount or method is never silently overwritten. Corrections reverse the original and create a new traceable draft.',
                            )}
                        </p>
                    </div>

                    {method === 'check' && (
                        <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800">
                            <div className="flex items-center gap-2 font-bold">
                                <CalendarDays size={16} />
                                {text('متابعة الشيك', 'Check tracking')}
                            </div>
                            <p className="mt-2">
                                {text(
                                    'حالة الشيك مستقلة: قيد التحصيل، محصل، مرتجع أو ملغي. الشيك المرتجع لا يمحو السجل؛ يمكن عكس الحركة أو تصحيحها.',
                                    'Check status is tracked separately: pending, cleared, bounced or cancelled. A bounced check never erases history; reverse or correct it explicitly.',
                                )}
                            </p>
                        </div>
                    )}

                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-xs leading-6 text-emerald-800">
                        <div className="flex items-center gap-2 font-bold">
                            <CheckCircle2 size={16} />
                            {text('الحركة لا تتطلب مخزوناً', 'No inventory required')}
                        </div>
                        <p className="mt-2">
                            {text(
                                'تسجيل الدفع أو القبض هنا حركة مالية مستقلة. لا تتغير كميات المخزون إلا من فواتير بيع/شراء مفعّل عليها أثر المخزون.',
                                'Cash movements are independent financial records. Inventory changes only through invoice lines explicitly marked to affect stock.',
                            )}
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function SummaryLine({
    label,
    value,
    currency,
    className = '',
    strong = false,
}: {
    label: string;
    value: string;
    currency: string;
    className?: string;
    strong?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--ac-text-muted)]">{label}</span>
            <span className={(strong ? 'text-base font-bold ' : 'font-semibold ') + className}>
                <Money value={value} currency={currency} />
            </span>
        </div>
    );
}
