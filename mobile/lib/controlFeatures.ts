import { todayISO } from './format';

export type FieldType = 'text' | 'number' | 'date' | 'month' | 'choice' | 'department' | 'party';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Record<string, string>;
  initial?: string;
  placeholder?: string;
}

export interface FeatureAction {
  label: string;
  tone?: 'ok' | 'bad' | 'neutral';
  /** Hide the button unless this returns true for the row. */
  visible: (raw: Record<string, unknown>) => boolean;
  /** Opens a small form first when set. */
  fields?: Field[];
  request: (raw: Record<string, unknown>, values: Record<string, string>) => { method: 'patch' | 'post'; url: string; body: Record<string, unknown> };
  success: string;
}

export interface ControlFeature {
  key: string;
  title: string;
  intro: string;
  createLabel?: string;
  fields?: Field[];
  actions?: FeatureAction[];
}

const CURRENCY: Field = { key: 'currency', label: 'العملة (3 أحرف)', type: 'text', required: true, initial: '', placeholder: 'ILS' };

const FREQUENCY = { weekly: 'أسبوعي', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
const status = (raw: Record<string, unknown>) => String(raw.status ?? '');

export const CONTROL_FEATURES: Record<string, ControlFeature> = {
  'petty-cash': {
    key: 'petty-cash',
    title: 'صناديق النثريات',
    intro: 'صناديق نقدية صغيرة بسقف محدد لكل قسم أو مسؤول.',
    createLabel: 'صندوق جديد',
    fields: [
      { key: 'name', label: 'اسم الصندوق', type: 'text', required: true },
      { key: 'department_id', label: 'القسم (اختياري)', type: 'department' },
      { key: 'limit_amount', label: 'سقف الصندوق', type: 'number', required: true },
      { key: 'opening_balance', label: 'الرصيد الافتتاحي (اختياري)', type: 'number' },
      CURRENCY,
      { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
    ],
    actions: [
      {
        label: 'إدخال أو صرف',
        visible: () => true,
        fields: [
          { key: 'direction', label: 'الحركة', type: 'choice', required: true, options: { in: 'إيداع في الصندوق', out: 'صرف من الصندوق' }, initial: 'out' },
          { key: 'amount', label: 'المبلغ', type: 'number', required: true },
          { key: 'category', label: 'البند (اختياري)', type: 'text' },
          { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
        ],
        request: (raw, v) => ({ method: 'post', url: `/control/petty-cash/${raw.id}/transactions`, body: { direction: v.direction, amount: v.amount, transaction_date: todayISO(), ...(v.category ? { category: v.category } : {}), ...(v.notes ? { notes: v.notes } : {}) } }),
        success: 'تم تسجيل الحركة',
      },
    ],
  },
  'recurring-expenses': {
    key: 'recurring-expenses',
    title: 'المصاريف المتكررة',
    intro: 'التزامات دورية مثل الإيجار والاشتراكات تذكّرك بموعدها.',
    createLabel: 'مصروف متكرر جديد',
    fields: [
      { key: 'title', label: 'العنوان', type: 'text', required: true, placeholder: 'إيجار المكتب' },
      { key: 'amount', label: 'المبلغ', type: 'number', required: true },
      CURRENCY,
      { key: 'frequency', label: 'التكرار', type: 'choice', required: true, options: FREQUENCY, initial: 'monthly' },
      { key: 'next_due_on', label: 'الاستحقاق القادم', type: 'date', required: true, initial: todayISO() },
      { key: 'department_id', label: 'القسم (اختياري)', type: 'department' },
      { key: 'party_id', label: 'الجهة (اختياري)', type: 'party' },
      { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
    ],
    actions: [
      { label: 'تم الدفع، انقله للدورة القادمة', tone: 'ok', visible: (r) => r.active !== false, request: (r) => ({ method: 'patch', url: `/control/recurring-expenses/${r.id}`, body: { advance_next_due: true } }), success: 'تم تحديث الاستحقاق القادم' },
      { label: 'إيقاف', tone: 'neutral', visible: (r) => r.active !== false, request: (r) => ({ method: 'patch', url: `/control/recurring-expenses/${r.id}`, body: { active: false } }), success: 'تم إيقاف المصروف' },
      { label: 'تفعيل', tone: 'ok', visible: (r) => r.active === false, request: (r) => ({ method: 'patch', url: `/control/recurring-expenses/${r.id}`, body: { active: true } }), success: 'تم تفعيل المصروف' },
    ],
  },
  budgets: {
    key: 'budgets',
    title: 'الميزانية مقابل الفعلي',
    intro: 'ميزانية شهرية لكل قسم، ويقارنها النظام بما صُرف فعلاً.',
    createLabel: 'ميزانية جديدة',
    fields: [
      { key: 'department_id', label: 'القسم', type: 'department', required: true },
      { key: 'month', label: 'الشهر', type: 'month', required: true, initial: todayISO().slice(0, 7) },
      { key: 'amount', label: 'المبلغ', type: 'number', required: true },
      CURRENCY,
      { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
    ],
  },
  'spending-limits': {
    key: 'spending-limits',
    title: 'سقوف صرف الأقسام',
    intro: 'حد أعلى للصرف الشهري لكل قسم.',
    createLabel: 'سقف جديد',
    fields: [
      { key: 'department_id', label: 'القسم', type: 'department', required: true },
      { key: 'monthly_limit', label: 'السقف الشهري', type: 'number', required: true },
      CURRENCY,
      { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
    ],
  },
  'expense-claims': {
    key: 'expense-claims',
    title: 'مطالبات المصاريف',
    intro: 'مصاريف دفعها الموظفون من جيبهم وتنتظر الموافقة والصرف.',
    createLabel: 'مطالبة جديدة',
    fields: [
      { key: 'title', label: 'العنوان', type: 'text', required: true, placeholder: 'مواصلات زيارة عميل' },
      { key: 'amount', label: 'المبلغ', type: 'number', required: true },
      CURRENCY,
      { key: 'expense_date', label: 'تاريخ المصروف', type: 'date', required: true, initial: todayISO() },
      { key: 'merchant', label: 'الجهة (اختياري)', type: 'text' },
      { key: 'reference', label: 'رقم الإيصال (اختياري)', type: 'text' },
      { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
    ],
    actions: [
      { label: 'اعتماد', tone: 'ok', visible: (r) => status(r) === 'submitted', request: (r) => ({ method: 'patch', url: `/control/expense-claims/${r.id}`, body: { status: 'approved' } }), success: 'تم اعتماد المطالبة' },
      {
        label: 'رفض', tone: 'bad', visible: (r) => status(r) === 'submitted' || status(r) === 'approved',
        fields: [{ key: 'reason', label: 'سبب الرفض', type: 'text', required: true }],
        request: (r, v) => ({ method: 'patch', url: `/control/expense-claims/${r.id}`, body: { status: 'rejected', rejection_reason: v.reason } }), success: 'تم رفض المطالبة',
      },
      {
        label: 'تم الصرف', tone: 'ok', visible: (r) => status(r) === 'approved',
        fields: [{ key: 'ref', label: 'مرجع الدفع', type: 'text', required: true, placeholder: 'رقم التحويل أو السند' }],
        request: (r, v) => ({ method: 'patch', url: `/control/expense-claims/${r.id}`, body: { status: 'paid', payout_reference: v.ref } }), success: 'تم تسجيل الصرف',
      },
    ],
  },
  contracts: {
    key: 'contracts',
    title: 'العقود',
    intro: 'عقود العملاء والموردين مع تنبيه قبل الانتهاء.',
    createLabel: 'عقد جديد',
    fields: [
      { key: 'title', label: 'عنوان العقد', type: 'text', required: true },
      { key: 'contract_type', label: 'النوع', type: 'choice', required: true, options: { customer: 'عميل', supplier: 'مورد', other: 'أخرى' }, initial: 'customer' },
      { key: 'party_id', label: 'الطرف (اختياري)', type: 'party' },
      { key: 'starts_on', label: 'تاريخ البدء', type: 'date', required: true, initial: todayISO() },
      { key: 'ends_on', label: 'تاريخ الانتهاء', type: 'date', required: true },
      { key: 'value', label: 'قيمة العقد (اختياري)', type: 'number' },
      CURRENCY,
      { key: 'renewal_type', label: 'التجديد', type: 'choice', required: true, options: { none: 'بدون', manual: 'يدوي', auto: 'تلقائي' }, initial: 'manual' },
      { key: 'reminder_days', label: 'تذكير قبل (أيام)', type: 'number', initial: '30' },
      { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
    ],
  },
  'document-expiry': {
    key: 'document-expiry',
    title: 'انتهاء الوثائق',
    intro: 'إقامات ورخص وشهادات تنبهك قبل انتهائها.',
    createLabel: 'وثيقة جديدة',
    fields: [
      { key: 'subject_type', label: 'تخص', type: 'choice', required: true, options: { staff: 'موظف', party: 'عميل أو مورد', organization: 'المؤسسة', other: 'أخرى' }, initial: 'staff' },
      { key: 'subject_label', label: 'اسم صاحب الوثيقة', type: 'text', placeholder: 'مثال: أحمد خالد' },
      { key: 'document_type', label: 'نوع الوثيقة', type: 'text', required: true, placeholder: 'رخصة قيادة، إقامة…' },
      { key: 'document_number', label: 'رقم الوثيقة (اختياري)', type: 'text' },
      { key: 'expires_on', label: 'تاريخ الانتهاء', type: 'date', required: true },
      { key: 'reminder_days', label: 'تذكير قبل (أيام)', type: 'number', initial: '30' },
      { key: 'notes', label: 'ملاحظات (اختياري)', type: 'text' },
    ],
  },
  'landed-costs': { key: 'landed-costs', title: 'تكلفة الاستيراد والتوريد', intro: 'توزيع الشحن والجمارك على تكلفة البضاعة المستوردة.' },
  'expiry-alerts': { key: 'expiry-alerts', title: 'انتهاء الصلاحية', intro: 'دفعات من المخزون تقترب من تاريخ الانتهاء.' },
};
