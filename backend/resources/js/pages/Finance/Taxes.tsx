import { apiRequest } from '@/lib/http';
import { Link } from '@inertiajs/react';
import {
    CalendarDays,
    CheckCircle2,
    Globe2,
    Landmark,
    Pencil,
    Plus,
    ReceiptText,
    Save,
    ShieldCheck,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { FinanceNav } from './FinanceNav';
import {
    FPanel,
    FinanceHeader,
    Money,
    StatusBadge,
    SummaryCard,
    apiErrorText,
    financeButton,
    financeInput,
    financePrimary,
    todayValue,
} from './shared';
import type {
    FinanceLookups,
    GovernmentObligation,
    TaxRule,
} from './types';

type TaxResponse = {
    currency: string;
    rules: TaxRule[];
    obligations: GovernmentObligation[];
};

type RuleDraft = {
    id?: number;
    name: string;
    code: string;
    tax_type: string;
    country_code: string;
    region_code: string;
    applies_to: 'sales' | 'purchases' | 'both';
    rate: string;
    inclusive: boolean;
    recoverable: boolean;
    effective_from: string;
    effective_to: string;
    active: boolean;
    notes: string;
};

const blankRule: RuleDraft = {
    name: '',
    code: '',
    tax_type: 'vat',
    country_code: '',
    region_code: '',
    applies_to: 'both',
    rate: '0',
    inclusive: false,
    recoverable: false,
    effective_from: '',
    effective_to: '',
    active: true,
    notes: '',
};

export function Taxes({
    lookups,
    ar,
}: {
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const [data, setData] = useState<TaxResponse | null>(null);
    const [ruleDraft, setRuleDraft] = useState<RuleDraft>(blankRule);
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [showObligationForm, setShowObligationForm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setError('');

        apiRequest<TaxResponse>('/api/finance/taxes', {
            signal: controller.signal,
        })
            .then(setData)
            .catch((failure) => {
                if (! controller.signal.aborted) {
                    setError(apiErrorText(failure));
                }
            });

        return () => controller.abort();
    }, [revision]);

    const rules = data?.rules ?? [];
    const obligations = data?.obligations ?? [];
    const openObligations = obligations.filter((item) =>
        ['open', 'partial'].includes(item.status),
    );
    const outstanding = openObligations.reduce(
        (sum, item) => sum + Number(item.balance_due || 0),
        0,
    );

    async function saveRule(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (busy || ! lookups.permissions.taxes_manage) {
            return;
        }

        setBusy(true);
        setError('');
        setMessage('');

        try {
            await apiRequest(
                ruleDraft.id
                    ? '/api/finance/tax-rules/' + ruleDraft.id
                    : '/api/finance/tax-rules',
                {
                    method: ruleDraft.id ? 'PATCH' : 'POST',
                    body: JSON.stringify({
                        name: ruleDraft.name.trim(),
                        code: ruleDraft.code.trim(),
                        tax_type: ruleDraft.tax_type,
                        country_code: ruleDraft.country_code.trim().toUpperCase(),
                        region_code: ruleDraft.region_code.trim() || null,
                        applies_to: ruleDraft.applies_to,
                        rate: ruleDraft.rate,
                        inclusive: ruleDraft.inclusive,
                        recoverable: ruleDraft.recoverable,
                        effective_from: ruleDraft.effective_from || null,
                        effective_to: ruleDraft.effective_to || null,
                        active: ruleDraft.active,
                        notes: ruleDraft.notes.trim() || null,
                    }),
                },
            );

            setRuleDraft(blankRule);
            setShowRuleForm(false);
            setMessage(text('تم حفظ قاعدة الضريبة.', 'Tax rule saved.'));
            setRevision((value) => value + 1);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    async function saveObligation(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (busy || ! lookups.permissions.taxes_manage) {
            return;
        }

        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));

        setBusy(true);
        setError('');
        setMessage('');

        try {
            await apiRequest('/api/finance/government-obligations', {
                method: 'POST',
                body: JSON.stringify({
                    tax_rule_id: values.tax_rule_id
                        ? Number(values.tax_rule_id)
                        : null,
                    authority_name: String(values.authority_name ?? '').trim(),
                    title: String(values.title ?? '').trim(),
                    obligation_type: String(values.obligation_type ?? 'other'),
                    country_code: String(values.country_code ?? '').trim().toUpperCase(),
                    region_code: String(values.region_code ?? '').trim() || null,
                    period_start: values.period_start || null,
                    period_end: values.period_end || null,
                    due_date: values.due_date,
                    amount: values.amount,
                    currency: String(values.currency ?? data?.currency ?? lookups.currency).toUpperCase(),
                    notes: String(values.notes ?? '').trim() || null,
                }),
            });

            form.reset();
            setShowObligationForm(false);
            setMessage(text('تمت إضافة المستحق الحكومي.', 'Government obligation added.'));
            setRevision((value) => value + 1);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
        }
    }

    function editRule(rule: TaxRule): void {
        setRuleDraft({
            id: rule.id,
            name: rule.name,
            code: rule.code,
            tax_type: rule.tax_type,
            country_code: rule.country_code,
            region_code: rule.region_code ?? '',
            applies_to: rule.applies_to,
            rate: rule.rate,
            inclusive: rule.inclusive,
            recoverable: rule.recoverable,
            effective_from: rule.effective_from ?? '',
            effective_to: rule.effective_to ?? '',
            active: rule.active ?? true,
            notes: rule.notes ?? '',
        });
        setShowRuleForm(true);
        window.scrollTo({ top: 250, behavior: 'smooth' });
    }

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={text('الضرائب والمستحقات الحكومية', 'Taxes & government obligations')}
                subtitle={text(
                    'إعداد قواعد ضريبية حسب الدولة والمنطقة وفترة السريان، ثم متابعة المبالغ المستحقة للجهات الحكومية وسدادها.',
                    'Configure tax rules by country, region and effective period, then track and pay government obligations.',
                )}
                actions={
                    lookups.permissions.taxes_manage
                        ? <>
                            <button
                                type="button"
                                className={financeButton}
                                onClick={() => {
                                    setRuleDraft(blankRule);
                                    setShowRuleForm((value) => ! value);
                                }}
                            >
                                <Plus size={15} />
                                {text('قاعدة ضريبة', 'Tax rule')}
                            </button>
                            <button
                                type="button"
                                className={financePrimary}
                                onClick={() => setShowObligationForm((value) => ! value)}
                            >
                                <Plus size={15} />
                                {text('مستحق حكومي', 'Government obligation')}
                            </button>
                        </>
                        : undefined
                }
            />

            <FinanceNav
                lookups={lookups}
                ar={ar}
                active="taxes"
            />

            <div className="rounded-[18px] border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-800">
                <div className="flex items-center gap-2 font-bold">
                    <ShieldCheck size={16} />
                    {text('ضرائب مرنة حسب الولاية القضائية', 'Jurisdiction-aware tax configuration')}
                </div>
                <p className="mt-2">
                    {text(
                        'AccoNova لا يفترض أن نسبة ضريبة واحدة صحيحة لكل الدول. أنت تحدد الدولة والمنطقة/الولاية والنوع والنسبة وفترة السريان. هذا يسمح بوجود قواعد مختلفة بين الولايات الأمريكية أو بين بريطانيا وألمانيا وفرنسا وغيرها. يجب مراجعة الإعدادات مع المختص المحلي قبل الاعتماد القانوني.',
                        'AccoNova does not assume one tax rate is correct everywhere. Configure country, state/region, tax type, rate and effective dates. This supports different U.S. states and different countries such as the UK, Germany or France. Local professional review is still required for legal compliance.',
                    )}
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    label={text('قواعد ضريبية', 'Tax rules')}
                    value={rules.length}
                    icon={Globe2}
                />
                <SummaryCard
                    label={text('قواعد فعالة', 'Active rules')}
                    value={rules.filter((rule) => rule.active).length}
                    icon={CheckCircle2}
                    tone="green"
                />
                <SummaryCard
                    label={text('مستحقات مفتوحة', 'Open obligations')}
                    value={openObligations.length}
                    icon={Landmark}
                    tone="amber"
                />
                <SummaryCard
                    label={text('إجمالي المتبقي', 'Outstanding')}
                    value={
                        <Money
                            value={outstanding}
                            currency={data?.currency ?? lookups.currency}
                        />
                    }
                    icon={ReceiptText}
                    tone="red"
                />
            </div>

            {error && (
                <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {message && (
                <div role="status" className="rounded-[14px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    {message}
                </div>
            )}

            {showRuleForm && (
                <FPanel
                    title={
                        ruleDraft.id
                            ? text('تعديل قاعدة ضريبة', 'Edit tax rule')
                            : text('إضافة قاعدة ضريبة', 'Add tax rule')
                    }
                    icon={Globe2}
                >
                    <form onSubmit={(event) => void saveRule(event)}>
                        <fieldset disabled={busy} className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('اسم القاعدة', 'Rule name')}
                                <input
                                    required
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.name}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, name: event.target.value }))}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('رمز القاعدة', 'Rule code')}
                                <input
                                    required
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.code}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, code: event.target.value }))}
                                    placeholder="VAT-DE-19"
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('نوع الضريبة', 'Tax type')}
                                <select
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.tax_type}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, tax_type: event.target.value }))}
                                >
                                    {[
                                        ['vat', 'VAT'],
                                        ['sales_tax', text('ضريبة مبيعات', 'Sales tax')],
                                        ['gst', 'GST'],
                                        ['withholding', text('استقطاع', 'Withholding')],
                                        ['payroll', text('رواتب', 'Payroll')],
                                        ['corporate', text('شركات', 'Corporate')],
                                        ['customs', text('جمارك', 'Customs')],
                                        ['excise', text('انتقائية', 'Excise')],
                                        ['property', text('عقار', 'Property')],
                                        ['other', text('أخرى', 'Other')],
                                    ].map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('النسبة %', 'Rate %')}
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.0001"
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.rate}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, rate: event.target.value }))}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('رمز الدولة ISO', 'Country ISO code')}
                                <input
                                    required
                                    maxLength={2}
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.country_code}
                                    onChange={(event) => setRuleDraft((current) => ({
                                        ...current,
                                        country_code: event.target.value.toUpperCase(),
                                    }))}
                                    placeholder="US / GB / DE"
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('الولاية / المنطقة', 'State / region')}
                                <input
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.region_code}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, region_code: event.target.value }))}
                                    placeholder="CA / NY / Bavaria"
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('تطبق على', 'Applies to')}
                                <select
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.applies_to}
                                    onChange={(event) => setRuleDraft((current) => ({
                                        ...current,
                                        applies_to: event.target.value as RuleDraft['applies_to'],
                                    }))}
                                >
                                    <option value="both">{text('البيع والشراء', 'Sales & purchases')}</option>
                                    <option value="sales">{text('البيع', 'Sales')}</option>
                                    <option value="purchases">{text('الشراء', 'Purchases')}</option>
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('من تاريخ', 'Effective from')}
                                <input
                                    type="date"
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.effective_from}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, effective_from: event.target.value }))}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('إلى تاريخ', 'Effective to')}
                                <input
                                    type="date"
                                    className={financeInput + ' mt-2'}
                                    value={ruleDraft.effective_to}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, effective_to: event.target.value }))}
                                />
                            </label>

                            <label className="flex items-center gap-2 rounded-[12px] border border-[var(--ac-line)] p-3 text-xs font-semibold text-[var(--ac-text-soft)]">
                                <input
                                    type="checkbox"
                                    checked={ruleDraft.inclusive}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, inclusive: event.target.checked }))}
                                />
                                {text('السعر شامل الضريبة', 'Tax inclusive')}
                            </label>

                            <label className="flex items-center gap-2 rounded-[12px] border border-[var(--ac-line)] p-3 text-xs font-semibold text-[var(--ac-text-soft)]">
                                <input
                                    type="checkbox"
                                    checked={ruleDraft.recoverable}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, recoverable: event.target.checked }))}
                                />
                                {text('ضريبة مشتريات قابلة للاسترداد', 'Recoverable input tax')}
                            </label>

                            <label className="flex items-center gap-2 rounded-[12px] border border-[var(--ac-line)] p-3 text-xs font-semibold text-[var(--ac-text-soft)]">
                                <input
                                    type="checkbox"
                                    checked={ruleDraft.active}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, active: event.target.checked }))}
                                />
                                {text('القاعدة فعالة', 'Rule active')}
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)] md:col-span-2 xl:col-span-4">
                                {text('ملاحظات', 'Notes')}
                                <textarea
                                    className={financeInput + ' mt-2 min-h-24'}
                                    value={ruleDraft.notes}
                                    onChange={(event) => setRuleDraft((current) => ({ ...current, notes: event.target.value }))}
                                />
                            </label>

                            <div className="flex gap-2 md:col-span-2 xl:col-span-4">
                                <button className={financePrimary} disabled={busy}>
                                    <Save size={15} />
                                    {text('حفظ القاعدة', 'Save rule')}
                                </button>
                                <button
                                    type="button"
                                    className={financeButton}
                                    onClick={() => {
                                        setShowRuleForm(false);
                                        setRuleDraft(blankRule);
                                    }}
                                >
                                    {text('إلغاء', 'Cancel')}
                                </button>
                            </div>
                        </fieldset>
                    </form>
                </FPanel>
            )}

            {showObligationForm && (
                <FPanel title={text('إضافة مستحق حكومي', 'Add government obligation')} icon={Landmark}>
                    <form onSubmit={(event) => void saveObligation(event)}>
                        <fieldset disabled={busy} className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('الجهة الحكومية', 'Authority')}
                                <input required name="authority_name" className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('اسم المستحق', 'Obligation title')}
                                <input required name="title" className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('النوع', 'Type')}
                                <select name="obligation_type" className={financeInput + ' mt-2'} defaultValue="vat">
                                    {[
                                        ['vat', 'VAT'],
                                        ['sales_tax', text('ضريبة مبيعات', 'Sales tax')],
                                        ['gst', 'GST'],
                                        ['withholding', text('استقطاع', 'Withholding')],
                                        ['payroll', text('رواتب', 'Payroll')],
                                        ['corporate', text('شركات', 'Corporate')],
                                        ['customs', text('جمارك', 'Customs')],
                                        ['excise', text('انتقائية', 'Excise')],
                                        ['property', text('عقار', 'Property')],
                                        ['government_fee', text('رسوم حكومية', 'Government fee')],
                                        ['other', text('أخرى', 'Other')],
                                    ].map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('قاعدة مرتبطة', 'Linked tax rule')}
                                <select name="tax_rule_id" className={financeInput + ' mt-2'} defaultValue="">
                                    <option value="">{text('بدون قاعدة', 'No rule')}</option>
                                    {rules.map((rule) => (
                                        <option key={rule.id} value={rule.id}>
                                            {rule.name} · {rule.country_code}{rule.region_code ? '-' + rule.region_code : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('الدولة', 'Country')}
                                <input required maxLength={2} name="country_code" className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('الولاية / المنطقة', 'State / region')}
                                <input name="region_code" className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('بداية الفترة', 'Period start')}
                                <input type="date" name="period_start" className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('نهاية الفترة', 'Period end')}
                                <input type="date" name="period_end" className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('تاريخ الاستحقاق', 'Due date')}
                                <input required type="date" name="due_date" defaultValue={todayValue()} className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('المبلغ', 'Amount')}
                                <input required type="number" min="0.0001" step="0.0001" name="amount" className={financeInput + ' mt-2'} />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('العملة', 'Currency')}
                                <input
                                    required
                                    readOnly
                                    aria-readonly="true"
                                    maxLength={3}
                                    name="currency"
                                    value={data?.currency ?? lookups.currency}
                                    className={financeInput + ' mt-2'}
                                    title={text(
                                        'العملة محددة من إعدادات مساحة العمل',
                                        'Currency is controlled by workspace settings',
                                    )}
                                />
                            </label>

                            <label className="text-xs font-semibold text-[var(--ac-text-soft)] md:col-span-2 xl:col-span-4">
                                {text('ملاحظات', 'Notes')}
                                <textarea name="notes" className={financeInput + ' mt-2 min-h-24'} />
                            </label>

                            <div className="flex gap-2 md:col-span-2 xl:col-span-4">
                                <button className={financePrimary} disabled={busy}>
                                    <Save size={15} />
                                    {text('حفظ المستحق', 'Save obligation')}
                                </button>
                                <button type="button" className={financeButton} onClick={() => setShowObligationForm(false)}>
                                    {text('إلغاء', 'Cancel')}
                                </button>
                            </div>
                        </fieldset>
                    </form>
                </FPanel>
            )}

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
                <FPanel title={text('قواعد الضرائب', 'Tax rules')} icon={Globe2}>
                    {rules.length ? (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-xs">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        {[
                                            text('القاعدة', 'Rule'),
                                            text('الدولة / المنطقة', 'Jurisdiction'),
                                            text('النوع', 'Type'),
                                            text('النسبة', 'Rate'),
                                            text('تطبق على', 'Applies to'),
                                            text('السريان', 'Effective'),
                                            text('الحالة', 'Status'),
                                            text('إجراء', 'Action'),
                                        ].map((label) => (
                                            <th key={label} className="px-3 py-3 text-start">{label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rules.map((rule) => (
                                        <tr key={rule.id} className="border-t border-[var(--ac-line)]">
                                            <td className="px-3 py-3">
                                                <strong className="text-[var(--ac-text)]">{rule.name}</strong>
                                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">{rule.code}</p>
                                            </td>
                                            <td className="px-3 py-3">
                                                {rule.country_code}{rule.region_code ? ' / ' + rule.region_code : ''}
                                            </td>
                                            <td className="px-3 py-3">{rule.tax_type}</td>
                                            <td className="px-3 py-3 font-bold">{rule.rate}%</td>
                                            <td className="px-3 py-3">{rule.applies_to}</td>
                                            <td className="px-3 py-3">
                                                {rule.effective_from ?? '—'} → {rule.effective_to ?? '∞'}
                                            </td>
                                            <td className="px-3 py-3">
                                                <StatusBadge status={rule.active ? 'posted' : 'cancelled'} ar={ar} />
                                            </td>
                                            <td className="px-3 py-3">
                                                {lookups.permissions.taxes_manage && (
                                                    <button type="button" className={financeButton} onClick={() => editRule(rule)}>
                                                        <Pencil size={14} />
                                                        {text('تعديل', 'Edit')}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="p-8 text-center text-xs text-[var(--ac-text-muted)]">
                            {text('لم تتم إضافة قواعد ضريبية بعد.', 'No tax rules configured yet.')}
                        </p>
                    )}
                </FPanel>

                <FPanel title={text('المستحقات الحكومية', 'Government obligations')} icon={Landmark}>
                    <div className="space-y-3 p-4">
                        {obligations.length ? obligations.map((obligation) => (
                            <div key={obligation.id} className="rounded-[14px] border border-[var(--ac-line)] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <strong className="text-sm text-[var(--ac-text)]">{obligation.title}</strong>
                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {obligation.authority_name} · {obligation.country_code}
                                            {obligation.region_code ? ' / ' + obligation.region_code : ''}
                                        </p>
                                    </div>
                                    <StatusBadge status={obligation.status} ar={ar} />
                                </div>

                                <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
                                    <div>
                                        <p className="text-[var(--ac-text-muted)]">{text('الإجمالي', 'Total')}</p>
                                        <strong><Money value={obligation.amount} currency={obligation.currency} compact /></strong>
                                    </div>
                                    <div>
                                        <p className="text-[var(--ac-text-muted)]">{text('المدفوع', 'Paid')}</p>
                                        <strong className="text-emerald-600">
                                            <Money value={obligation.paid_total} currency={obligation.currency} compact />
                                        </strong>
                                    </div>
                                    <div>
                                        <p className="text-[var(--ac-text-muted)]">{text('المتبقي', 'Balance')}</p>
                                        <strong className="text-red-600">
                                            <Money value={obligation.balance_due} currency={obligation.currency} compact />
                                        </strong>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-[var(--ac-text-muted)]">
                                    <span>
                                        <CalendarDays size={12} className="me-1 inline" />
                                        {obligation.due_date}
                                    </span>

                                    {lookups.permissions.cash_pay
                                        && ['open', 'partial'].includes(obligation.status)
                                        && (
                                            <Link
                                                href={
                                                    '/app/payments/create?government_obligation_id='
                                                    + obligation.id
                                                }
                                                className={financePrimary}
                                            >
                                                {text('تسجيل دفع', 'Pay')}
                                            </Link>
                                        )}
                                </div>
                            </div>
                        )) : (
                            <p className="py-8 text-center text-xs text-[var(--ac-text-muted)]">
                                {text('لا توجد مستحقات حكومية.', 'No government obligations.')}
                            </p>
                        )}
                    </div>
                </FPanel>
            </div>

            <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800">
                <strong>{text('مهم:', 'Important:')}</strong>{' '}
                {text(
                    'النظام يخزن القواعد التي تعتمدها الشركة ولا يدّعي تلقائياً معرفة التشريع الصحيح لكل دولة أو ولاية. أي تحديث قانوني يجب إدخاله بتاريخ سريان جديد بدلاً من تغيير الفواتير التاريخية.',
                    'The system stores the rules approved by your company and does not claim automatic knowledge of every jurisdiction. Legal rate changes should be added with new effective dates rather than rewriting historical invoices.',
                )}
            </div>
        </div>
    );
}
