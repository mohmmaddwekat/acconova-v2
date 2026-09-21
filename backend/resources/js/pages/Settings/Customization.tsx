import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import { Plus, RefreshCcw, ShieldCheck, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type FieldDef = {
    id: number;
    entity_type: string;
    key: string;
    label: string;
    field_type: string;
    options: string[];
    required: boolean;
    active: boolean;
};

type StatusDef = {
    id: number;
    entity_type: string;
    key: string;
    label: string;
    color: string | null;
    is_closed: boolean;
    active: boolean;
};

type ApprovalRule = {
    id: number;
    name: string;
    subject_type: string;
    condition_field: string;
    operator: string;
    threshold: string;
    required_approvals: number;
    active: boolean;
};

type Payload = {
    fields: FieldDef[];
    statuses: StatusDef[];
    approval_rules: ApprovalRule[];
};

type Tab = 'fields' | 'statuses' | 'approvals';

const input =
    'h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';

const button =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-50';

const primary =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-4 text-xs font-bold text-[var(--ac-accent)] transition hover:bg-[var(--ac-accent-soft)] disabled:opacity-50';

const entities = ['party', 'product', 'staff', 'task', 'project'];

function friendly(value: string, ar: boolean): string {
    const labels: Record<string, [string, string]> = {
        party: ['العملاء والموردون', 'Parties'],
        product: ['المنتجات', 'Products'],
        staff: ['الموظفون', 'Staff'],
        task: ['المهام', 'Tasks'],
        project: ['المشاريع', 'Projects'],
        text: ['نص', 'Text'],
        number: ['رقم', 'Number'],
        date: ['تاريخ', 'Date'],
        select: ['قائمة اختيار', 'Select'],
        checkbox: ['صح / خطأ', 'Checkbox'],
        financial_document: ['الفواتير', 'Invoices'],
        cash_movement: ['المدفوعات', 'Payments'],
        total: ['إجمالي الفاتورة', 'Invoice total'],
        discount_percent: ['نسبة الخصم', 'Discount %'],
        amount: ['المبلغ', 'Amount'],
        method: ['طريقة الدفع', 'Payment method'],
        gte: ['أكبر أو يساوي', 'Greater than or equal'],
        gt: ['أكبر من', 'Greater than'],
        lte: ['أقل أو يساوي', 'Less than or equal'],
        lt: ['أقل من', 'Less than'],
        eq: ['يساوي', 'Equals'],
    };

    return labels[value]
        ? (ar ? labels[value][0] : labels[value][1])
        : value;
}

export default function Customization() {
    const ar = useLocale() === 'ar';
    const [tab, setTab] = useState<Tab>('fields');
    const [payload, setPayload] = useState<Payload>({
        fields: [],
        statuses: [],
        approval_rules: [],
    });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const [fieldForm, setFieldForm] = useState({
        entity_type: 'party',
        key: '',
        label: '',
        field_type: 'text',
        options: '',
        required: false,
    });

    const [statusForm, setStatusForm] = useState({
        entity_type: 'party',
        key: '',
        label: '',
        color: '',
        is_closed: false,
    });

    const [ruleForm, setRuleForm] = useState({
        name: '',
        subject_type: 'financial_document',
        condition_field: 'total',
        operator: 'gte',
        threshold: '10000',
        required_approvals: '1',
    });

    const load = async (): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            setPayload(
                await apiRequest<Payload>(
                    '/api/workspace-customization',
                ),
            );
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (ar
                        ? 'تعذر تحميل إعدادات التخصيص.'
                        : 'Could not load customization settings.'),
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const fields = useMemo(
        () => payload.fields.filter(item => item.active),
        [payload.fields],
    );

    const statuses = useMemo(
        () => payload.statuses.filter(item => item.active),
        [payload.statuses],
    );

    const rules = useMemo(
        () => payload.approval_rules.filter(item => item.active),
        [payload.approval_rules],
    );

    async function post(
        path: string,
        body: Record<string, unknown>,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(path, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (ar ? 'تعذر حفظ التغيير.' : 'Could not save the change.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function disable(
        kind: 'fields' | 'statuses' | 'approval-rules',
        id: number,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/workspace-customization/' + kind + '/' + id,
                { method: 'DELETE' },
            );
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (ar ? 'تعذر إيقاف السجل.' : 'Could not disable the record.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function createField(event: FormEvent): Promise<void> {
        event.preventDefault();

        await post('/api/workspace-customization/fields', {
            entity_type: fieldForm.entity_type,
            key: fieldForm.key.trim(),
            label: fieldForm.label.trim(),
            field_type: fieldForm.field_type,
            options:
                fieldForm.field_type === 'select'
                    ? fieldForm.options
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean)
                    : [],
            required: fieldForm.required,
            position: 0,
        });

        setFieldForm(current => ({
            ...current,
            key: '',
            label: '',
            options: '',
            required: false,
        }));
    }

    async function createStatus(event: FormEvent): Promise<void> {
        event.preventDefault();

        await post('/api/workspace-customization/statuses', {
            entity_type: statusForm.entity_type,
            key: statusForm.key.trim(),
            label: statusForm.label.trim(),
            color: statusForm.color.trim() || null,
            is_closed: statusForm.is_closed,
            position: 0,
        });

        setStatusForm(current => ({
            ...current,
            key: '',
            label: '',
            color: '',
            is_closed: false,
        }));
    }

    async function createRule(event: FormEvent): Promise<void> {
        event.preventDefault();

        await post('/api/workspace-customization/approval-rules', {
            name: ruleForm.name.trim(),
            subject_type: ruleForm.subject_type,
            condition_field: ruleForm.condition_field,
            operator: ruleForm.operator,
            threshold: ruleForm.threshold.trim(),
            required_approvals: Number(ruleForm.required_approvals),
            priority: 100,
        });

        setRuleForm(current => ({
            ...current,
            name: '',
        }));
    }

    return (
        <AppShell>
            <Head title={ar ? 'تخصيص النظام' : 'Workspace customization'} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                Settings
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {ar
                                    ? 'تخصيص AccoNova بدون برمجة'
                                    : 'Customize AccoNova without code'}
                            </h1>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'أنشئ حقولاً وحالات خاصة وقواعد موافقة متعددة المستويات بدون تغيير الكود.'
                                    : 'Create custom fields, statuses and multi-reviewer approval rules without code changes.'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className={button}
                        >
                            <RefreshCcw size={14} />
                            {ar ? 'تحديث' : 'Refresh'}
                        </button>
                    </div>
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-300">
                        {error}
                    </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-2">
                    {([
                        ['fields', ar ? 'الحقول الخاصة' : 'Custom fields'],
                        ['statuses', ar ? 'الحالات الخاصة' : 'Custom statuses'],
                        ['approvals', ar ? 'قواعد الموافقة' : 'Approval rules'],
                    ] as const).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            className={[
                                'h-10 rounded-[11px] px-3 text-xs font-semibold transition',
                                tab === key
                                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                    : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]',
                            ].join(' ')}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {tab === 'fields' && (
                    <section className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                        <form
                            onSubmit={event => void createField(event)}
                            className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4"
                        >
                            <h2 className="text-sm font-bold text-[var(--ac-text)]">
                                {ar ? 'حقل جديد' : 'New custom field'}
                            </h2>

                            <div className="mt-4 space-y-3">
                                <select
                                    className={input}
                                    value={fieldForm.entity_type}
                                    onChange={event =>
                                        setFieldForm(current => ({
                                            ...current,
                                            entity_type: event.target.value,
                                        }))
                                    }
                                >
                                    {entities.map(entity => (
                                        <option key={entity} value={entity}>
                                            {friendly(entity, ar)}
                                        </option>
                                    ))}
                                </select>

                                <input
                                    className={input}
                                    value={fieldForm.label}
                                    required
                                    placeholder={ar ? 'اسم الحقل: رقم الفرع' : 'Field label: Branch number'}
                                    onChange={event =>
                                        setFieldForm(current => ({
                                            ...current,
                                            label: event.target.value,
                                        }))
                                    }
                                />

                                <input
                                    className={input}
                                    value={fieldForm.key}
                                    required
                                    placeholder="branch_number"
                                    onChange={event =>
                                        setFieldForm(current => ({
                                            ...current,
                                            key: event.target.value
                                                .toLowerCase()
                                                .replace(/[^a-z0-9_]/g, '_'),
                                        }))
                                    }
                                />

                                <select
                                    className={input}
                                    value={fieldForm.field_type}
                                    onChange={event =>
                                        setFieldForm(current => ({
                                            ...current,
                                            field_type: event.target.value,
                                        }))
                                    }
                                >
                                    {['text', 'number', 'date', 'select', 'checkbox'].map(value => (
                                        <option key={value} value={value}>
                                            {friendly(value, ar)}
                                        </option>
                                    ))}
                                </select>

                                {fieldForm.field_type === 'select' && (
                                    <input
                                        className={input}
                                        required
                                        value={fieldForm.options}
                                        placeholder={ar ? 'VIP, عادي, جملة' : 'VIP, Standard, Wholesale'}
                                        onChange={event =>
                                            setFieldForm(current => ({
                                                ...current,
                                                options: event.target.value,
                                            }))
                                        }
                                    />
                                )}

                                <label className="flex items-center gap-2 text-xs text-[var(--ac-text-soft)]">
                                    <input
                                        type="checkbox"
                                        checked={fieldForm.required}
                                        onChange={event =>
                                            setFieldForm(current => ({
                                                ...current,
                                                required: event.target.checked,
                                            }))
                                        }
                                    />
                                    {ar ? 'الحقل مطلوب' : 'Required field'}
                                </label>

                                <button type="submit" disabled={busy} className={primary + ' w-full'}>
                                    <Plus size={14} />
                                    {ar ? 'إضافة الحقل' : 'Add field'}
                                </button>
                            </div>
                        </form>

                        <List
                            loading={loading}
                            empty={ar ? 'لا توجد حقول خاصة بعد.' : 'No custom fields yet.'}
                            rows={fields.map(field => ({
                                id: field.id,
                                title: field.label,
                                detail:
                                    friendly(field.entity_type, ar)
                                    + ' · '
                                    + friendly(field.field_type, ar)
                                    + ' · '
                                    + field.key
                                    + (field.required ? (ar ? ' · مطلوب' : ' · Required') : ''),
                                color: null,
                            }))}
                            onDelete={id => void disable('fields', id)}
                            busy={busy}
                        />
                    </section>
                )}

                {tab === 'statuses' && (
                    <section className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
                        <form
                            onSubmit={event => void createStatus(event)}
                            className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4"
                        >
                            <h2 className="text-sm font-bold text-[var(--ac-text)]">
                                {ar ? 'حالة خاصة جديدة' : 'New custom status'}
                            </h2>

                            <div className="mt-4 space-y-3">
                                <select
                                    className={input}
                                    value={statusForm.entity_type}
                                    onChange={event =>
                                        setStatusForm(current => ({
                                            ...current,
                                            entity_type: event.target.value,
                                        }))
                                    }
                                >
                                    {entities.map(entity => (
                                        <option key={entity} value={entity}>
                                            {friendly(entity, ar)}
                                        </option>
                                    ))}
                                </select>

                                <input
                                    className={input}
                                    value={statusForm.label}
                                    required
                                    placeholder={ar ? 'مثال: بانتظار التوقيع' : 'Example: Awaiting signature'}
                                    onChange={event =>
                                        setStatusForm(current => ({
                                            ...current,
                                            label: event.target.value,
                                        }))
                                    }
                                />

                                <input
                                    className={input}
                                    value={statusForm.key}
                                    required
                                    placeholder="awaiting_signature"
                                    onChange={event =>
                                        setStatusForm(current => ({
                                            ...current,
                                            key: event.target.value
                                                .toLowerCase()
                                                .replace(/[^a-z0-9_]/g, '_'),
                                        }))
                                    }
                                />

                                <input
                                    className={input}
                                    value={statusForm.color}
                                    placeholder="#3B82F6"
                                    onChange={event =>
                                        setStatusForm(current => ({
                                            ...current,
                                            color: event.target.value,
                                        }))
                                    }
                                />

                                <label className="flex items-center gap-2 text-xs text-[var(--ac-text-soft)]">
                                    <input
                                        type="checkbox"
                                        checked={statusForm.is_closed}
                                        onChange={event =>
                                            setStatusForm(current => ({
                                                ...current,
                                                is_closed: event.target.checked,
                                            }))
                                        }
                                    />
                                    {ar ? 'تعتبر حالة مغلقة' : 'Treat as closed'}
                                </label>

                                <button type="submit" disabled={busy} className={primary + ' w-full'}>
                                    <Tags size={14} />
                                    {ar ? 'إضافة الحالة' : 'Add status'}
                                </button>
                            </div>
                        </form>

                        <List
                            loading={loading}
                            empty={ar ? 'لا توجد حالات خاصة بعد.' : 'No custom statuses yet.'}
                            rows={statuses.map(status => ({
                                id: status.id,
                                title: status.label,
                                detail:
                                    friendly(status.entity_type, ar)
                                    + ' · '
                                    + status.key
                                    + (status.is_closed ? (ar ? ' · مغلقة' : ' · Closed') : ''),
                                color: status.color,
                            }))}
                            onDelete={id => void disable('statuses', id)}
                            busy={busy}
                        />
                    </section>
                )}

                {tab === 'approvals' && (
                    <section className="mt-4 grid gap-4 xl:grid-cols-[440px_minmax(0,1fr)]">
                        <form
                            onSubmit={event => void createRule(event)}
                            className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4"
                        >
                            <h2 className="text-sm font-bold text-[var(--ac-text)]">
                                {ar ? 'قاعدة موافقة جديدة' : 'New approval rule'}
                            </h2>

                            <div className="mt-4 space-y-3">
                                <input
                                    className={input}
                                    required
                                    value={ruleForm.name}
                                    placeholder={ar ? 'مثال: فاتورة فوق 50 ألف' : 'Example: Invoice over 50k'}
                                    onChange={event =>
                                        setRuleForm(current => ({
                                            ...current,
                                            name: event.target.value,
                                        }))
                                    }
                                />

                                <select
                                    className={input}
                                    value={ruleForm.subject_type}
                                    onChange={event => {
                                        const subject = event.target.value;
                                        setRuleForm(current => ({
                                            ...current,
                                            subject_type: subject,
                                            condition_field:
                                                subject === 'financial_document'
                                                    ? 'total'
                                                    : 'amount',
                                        }));
                                    }}
                                >
                                    {['financial_document', 'cash_movement'].map(value => (
                                        <option key={value} value={value}>
                                            {friendly(value, ar)}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    className={input}
                                    value={ruleForm.condition_field}
                                    onChange={event =>
                                        setRuleForm(current => ({
                                            ...current,
                                            condition_field: event.target.value,
                                        }))
                                    }
                                >
                                    {(ruleForm.subject_type === 'financial_document'
                                        ? ['total', 'discount_percent']
                                        : ['amount', 'method']
                                    ).map(value => (
                                        <option key={value} value={value}>
                                            {friendly(value, ar)}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    className={input}
                                    value={ruleForm.operator}
                                    onChange={event =>
                                        setRuleForm(current => ({
                                            ...current,
                                            operator: event.target.value,
                                        }))
                                    }
                                >
                                    {['gte', 'gt', 'lte', 'lt', 'eq'].map(value => (
                                        <option key={value} value={value}>
                                            {friendly(value, ar)}
                                        </option>
                                    ))}
                                </select>

                                <input
                                    className={input}
                                    required
                                    value={ruleForm.threshold}
                                    placeholder={
                                        ruleForm.condition_field === 'method'
                                            ? 'bank_transfer'
                                            : '50000'
                                    }
                                    onChange={event =>
                                        setRuleForm(current => ({
                                            ...current,
                                            threshold: event.target.value,
                                        }))
                                    }
                                />

                                <label className="block text-[10px] font-semibold text-[var(--ac-text-muted)]">
                                    {ar ? 'عدد الموافقين المطلوب' : 'Required reviewers'}
                                    <input
                                        type="number"
                                        min="1"
                                        max="5"
                                        className={input + ' mt-1'}
                                        value={ruleForm.required_approvals}
                                        onChange={event =>
                                            setRuleForm(current => ({
                                                ...current,
                                                required_approvals: event.target.value,
                                            }))
                                        }
                                    />
                                </label>

                                <button type="submit" disabled={busy} className={primary + ' w-full'}>
                                    <ShieldCheck size={14} />
                                    {ar ? 'إضافة القاعدة' : 'Add rule'}
                                </button>
                            </div>
                        </form>

                        <List
                            loading={loading}
                            empty={
                                ar
                                    ? 'لا توجد قواعد مخصصة. القواعد الأساسية ما زالت تعمل.'
                                    : 'No custom rules. Core approval thresholds remain active.'
                            }
                            rows={rules.map(rule => ({
                                id: rule.id,
                                title: rule.name,
                                detail:
                                    friendly(rule.subject_type, ar)
                                    + ' · '
                                    + friendly(rule.condition_field, ar)
                                    + ' '
                                    + friendly(rule.operator, ar)
                                    + ' '
                                    + rule.threshold
                                    + ' · '
                                    + String(rule.required_approvals)
                                    + (ar ? ' موافق' : ' reviewer(s)'),
                                color: null,
                            }))}
                            onDelete={id => void disable('approval-rules', id)}
                            busy={busy}
                        />
                    </section>
                )}
            </main>
        </AppShell>
    );
}

function List({
    loading,
    empty,
    rows,
    busy,
    onDelete,
}: {
    loading: boolean;
    empty: string;
    rows: Array<{
        id: number;
        title: string;
        detail: string;
        color: string | null;
    }>;
    busy: boolean;
    onDelete: (id: number) => void;
}) {
    if (loading) {
        return (
            <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-10 text-center text-sm text-[var(--ac-text-muted)]">
                Loading…
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="rounded-[18px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-10 text-center text-sm text-[var(--ac-text-muted)]">
                {empty}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {rows.map(row => (
                <article
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        {row.color && (
                            <span
                                className="size-3 shrink-0 rounded-full border border-[var(--ac-line)]"
                                style={{ background: row.color }}
                            />
                        )}
                        <div className="min-w-0">
                            <strong className="block truncate text-sm text-[var(--ac-text)]">
                                {row.title}
                            </strong>
                            <p className="mt-1 truncate text-[10px] text-[var(--ac-text-muted)]">
                                {row.detail}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDelete(row.id)}
                        className="inline-flex size-9 items-center justify-center rounded-[10px] border border-red-400/40 text-red-400 disabled:opacity-50"
                    >
                        <Trash2 size={14} />
                    </button>
                </article>
            ))}
        </div>
    );
}
