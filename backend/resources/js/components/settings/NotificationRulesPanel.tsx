import { ApiError, apiRequest } from '@/lib/http';
import {
    BellRing,
    Plus,
    RefreshCcw,
    Trash2,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

type NotificationRule = {
    id: number;
    name: string;
    category: string | null;
    kind: string | null;
    field: string;
    operator: string;
    threshold: string;
    active: boolean;
};

type Metadata = {
    categories: string[];
    kinds: string[];
    fields: string[];
};

type Response = {
    data: NotificationRule[];
    meta: Metadata;
};

const control =
    'h-10 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-control)] px-3 text-xs text-[var(--acs-text)] outline-none transition focus:border-[var(--acs-accent)] disabled:opacity-50';

const outline =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-line-strong)] bg-[var(--acs-control)] px-3 text-xs font-semibold text-[var(--acs-accent)] transition hover:bg-[var(--acs-control-hover)] disabled:opacity-45';

function label(
    value: string,
    ar: boolean,
): string {
    const labels: Record<
        string,
        [string, string]
    > = {
        stock: ['المخزون', 'Stock'],
        payments: ['المدفوعات', 'Payments'],
        activity: ['النشاط', 'Activity'],
        messages: ['الرسائل', 'Messages'],
        low_stock: ['مخزون منخفض', 'Low stock'],
        out_of_stock: ['نفاد مخزون', 'Out of stock'],
        inventory_expiry: ['انتهاء مخزون', 'Inventory expiry'],
        payment_due: ['دفعة مستحقة', 'Payment due'],
        payment_soon: ['دفعة قريبة', 'Payment soon'],
        payment_recorded: ['دفعة مسجلة', 'Payment recorded'],
        approval_required: ['موافقة مطلوبة', 'Approval required'],
        contract_expiry: ['انتهاء عقد', 'Contract expiry'],
        document_expiry: ['انتهاء وثيقة', 'Document expiry'],
        follow_up_due: ['متابعة مستحقة', 'Follow-up due'],
        amount: ['المبلغ', 'Amount'],
        stock_quantity: ['كمية المخزون', 'Stock quantity'],
        invoice_total: ['إجمالي الفاتورة', 'Invoice total'],
        count: ['العدد', 'Count'],
        gt: ['أكبر من', 'Greater than'],
        gte: ['أكبر أو يساوي', 'Greater than or equal'],
        lt: ['أقل من', 'Less than'],
        lte: ['أقل أو يساوي', 'Less than or equal'],
        eq: ['يساوي', 'Equals'],
    };

    return labels[value]
        ? (
            ar
                ? labels[value][0]
                : labels[value][1]
        )
        : value;
}

export function NotificationRulesPanel({
    ar,
}: {
    ar: boolean;
}) {
    const [
        rules,
        setRules,
    ] = useState<NotificationRule[]>([]);
    const [
        meta,
        setMeta,
    ] = useState<Metadata>({
        categories: [],
        kinds: [],
        fields: [],
    });
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        error,
        setError,
    ] = useState('');
    const [
        form,
        setForm,
    ] = useState({
        name: '',
        category: '',
        kind: '',
        field: 'amount',
        operator: 'gt',
        threshold: '5000',
    });

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar
            ? arabic
            : english;

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<Response>(
                    '/api/notification-rules',
                );

            setRules(
                response.data,
            );
            setMeta(
                response.meta,
            );
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر تحميل قواعد التنبيه.',
                        'Could not load notification rules.',
                    ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    async function create(
        event: FormEvent,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
            || ! form.name.trim()
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/notification-rules',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name:
                            form.name.trim(),
                        category:
                            form.category
                            || null,
                        kind:
                            form.kind
                            || null,
                        field:
                            form.field,
                        operator:
                            form.operator,
                        threshold:
                            form.threshold,
                        active:
                            true,
                    }),
                },
            );

            setForm(current => ({
                ...current,
                name: '',
            }));
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر حفظ قاعدة التنبيه.',
                        'Could not save notification rule.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function toggle(
        rule: NotificationRule,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/notification-rules/'
                + rule.id,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name:
                            rule.name,
                        category:
                            rule.category,
                        kind:
                            rule.kind,
                        field:
                            rule.field,
                        operator:
                            rule.operator,
                        threshold:
                            rule.threshold,
                        active:
                            ! rule.active,
                    }),
                },
            );
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر تحديث قاعدة التنبيه.',
                        'Could not update notification rule.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function remove(
        id: number,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/notification-rules/'
                + id,
                {
                    method: 'DELETE',
                },
            );
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر حذف قاعدة التنبيه.',
                        'Could not delete notification rule.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="overflow-hidden rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-[0_10px_28px_rgba(30,75,140,.045)] xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--acs-line-soft)] px-5 py-4">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--acs-text)]">
                        <BellRing
                            size={17}
                            className="text-[var(--acs-accent)]"
                        />
                        {text(
                            'قواعد الإشعارات',
                            'Notification rules',
                        )}
                    </h2>
                    <p className="mt-1 text-[10px] leading-5 text-[var(--acs-text-muted)]">
                        {text(
                            'مثال: لا ترسل تنبيه موافقة إلا إذا إجمالي الفاتورة أكبر من 5000، أو نبهني عندما كمية المخزون أقل من 10. القواعد تطبق على الإشعارات الجديدة فقط.',
                            'Example: only send approval alerts when invoice total exceeds 5,000, or notify when stock quantity drops below 10. Rules apply to newly generated notifications only.',
                        )}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() =>
                        void load()
                    }
                    disabled={loading}
                    className={outline}
                >
                    <RefreshCcw
                        size={13}
                    />
                    {text(
                        'تحديث',
                        'Refresh',
                    )}
                </button>
            </div>

            <div className="grid gap-5 p-4 sm:p-5 xl:grid-cols-[420px_minmax(0,1fr)]">
                <form
                    onSubmit={
                        event =>
                            void create(
                                event,
                            )
                    }
                    className="rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-4"
                >
                    <h3 className="text-xs font-bold text-[var(--acs-text)]">
                        {text(
                            'قاعدة جديدة',
                            'New rule',
                        )}
                    </h3>

                    <div className="mt-3 space-y-3">
                        <input
                            className={control}
                            required
                            value={
                                form.name
                            }
                            onChange={
                                event =>
                                    setForm(
                                        current => ({
                                            ...current,
                                            name:
                                                event
                                                    .target
                                                    .value,
                                        }),
                                    )
                            }
                            placeholder={text(
                                'مثال: الفواتير الكبيرة فقط',
                                'Example: Large invoices only',
                            )}
                        />

                        <div className="grid gap-2 sm:grid-cols-2">
                            <select
                                className={control}
                                value={
                                    form.category
                                }
                                onChange={
                                    event =>
                                        setForm(
                                            current => ({
                                                ...current,
                                                category:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                }
                            >
                                <option value="">
                                    {text(
                                        'كل الفئات',
                                        'All categories',
                                    )}
                                </option>
                                {meta.categories.map(
                                    value => (
                                        <option
                                            key={
                                                value
                                            }
                                            value={
                                                value
                                            }
                                        >
                                            {label(
                                                value,
                                                ar,
                                            )}
                                        </option>
                                    ),
                                )}
                            </select>

                            <select
                                className={control}
                                value={
                                    form.kind
                                }
                                onChange={
                                    event =>
                                        setForm(
                                            current => ({
                                                ...current,
                                                kind:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                }
                            >
                                <option value="">
                                    {text(
                                        'كل أنواع التنبيه',
                                        'All notification kinds',
                                    )}
                                </option>
                                {meta.kinds.map(
                                    value => (
                                        <option
                                            key={
                                                value
                                            }
                                            value={
                                                value
                                            }
                                        >
                                            {label(
                                                value,
                                                ar,
                                            )}
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3">
                            <select
                                className={control}
                                value={
                                    form.field
                                }
                                onChange={
                                    event =>
                                        setForm(
                                            current => ({
                                                ...current,
                                                field:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                }
                            >
                                {meta.fields.map(
                                    value => (
                                        <option
                                            key={
                                                value
                                            }
                                            value={
                                                value
                                            }
                                        >
                                            {label(
                                                value,
                                                ar,
                                            )}
                                        </option>
                                    ),
                                )}
                            </select>

                            <select
                                className={control}
                                value={
                                    form.operator
                                }
                                onChange={
                                    event =>
                                        setForm(
                                            current => ({
                                                ...current,
                                                operator:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                }
                            >
                                {[
                                    'gt',
                                    'gte',
                                    'lt',
                                    'lte',
                                    'eq',
                                ].map(
                                    value => (
                                        <option
                                            key={
                                                value
                                            }
                                            value={
                                                value
                                            }
                                        >
                                            {label(
                                                value,
                                                ar,
                                            )}
                                        </option>
                                    ),
                                )}
                            </select>

                            <input
                                className={control}
                                value={
                                    form.threshold
                                }
                                required
                                onChange={
                                    event =>
                                        setForm(
                                            current => ({
                                                ...current,
                                                threshold:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                }
                                placeholder="5000"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={busy}
                            className={outline + ' w-full'}
                        >
                            <Plus
                                size={13}
                            />
                            {text(
                                'إضافة القاعدة',
                                'Add rule',
                            )}
                        </button>
                    </div>
                </form>

                <div className="space-y-2">
                    {error && (
                        <div className="rounded-[12px] border border-red-400/30 bg-red-500/10 p-3 text-[10px] text-red-300">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="rounded-[14px] border border-[var(--acs-line)] p-8 text-center text-xs text-[var(--acs-text-muted)]">
                            {text(
                                'جارٍ التحميل…',
                                'Loading…',
                            )}
                        </div>
                    ) : rules.length === 0 ? (
                        <div className="rounded-[14px] border border-dashed border-[var(--acs-line)] p-8 text-center text-xs text-[var(--acs-text-muted)]">
                            {text(
                                'لا توجد قواعد إشعارات خاصة بعد.',
                                'No custom notification rules yet.',
                            )}
                        </div>
                    ) : (
                        rules.map(
                            rule => (
                                <article
                                    key={
                                        rule.id
                                    }
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <strong className="text-xs text-[var(--acs-text)]">
                                                {
                                                    rule.name
                                                }
                                            </strong>
                                            <span className={[
                                                'rounded-full border px-2 py-0.5 text-[8px] font-semibold',
                                                rule.active
                                                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                                                    : 'border-[var(--acs-line)] text-[var(--acs-text-muted)]',
                                            ].join(' ')}>
                                                {rule.active
                                                    ? text(
                                                        'مفعلة',
                                                        'Active',
                                                    )
                                                    : text(
                                                        'متوقفة',
                                                        'Paused',
                                                    )}
                                            </span>
                                        </div>

                                        <p className="mt-1 text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                            {[
                                                rule.category
                                                    ? label(
                                                        rule.category,
                                                        ar,
                                                    )
                                                    : text(
                                                        'كل الفئات',
                                                        'All categories',
                                                    ),
                                                rule.kind
                                                    ? label(
                                                        rule.kind,
                                                        ar,
                                                    )
                                                    : text(
                                                        'كل الأنواع',
                                                        'All kinds',
                                                    ),
                                                label(
                                                    rule.field,
                                                    ar,
                                                ),
                                                label(
                                                    rule.operator,
                                                    ar,
                                                ),
                                                rule.threshold,
                                            ].join(
                                                ' · ',
                                            )}
                                        </p>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() =>
                                                void toggle(
                                                    rule,
                                                )
                                            }
                                            className={outline}
                                        >
                                            {rule.active
                                                ? text(
                                                    'إيقاف',
                                                    'Pause',
                                                )
                                                : text(
                                                    'تفعيل',
                                                    'Activate',
                                                )}
                                        </button>

                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() =>
                                                void remove(
                                                    rule.id,
                                                )
                                            }
                                            className="flex size-10 items-center justify-center rounded-[11px] border border-red-400/30 text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                                        >
                                            <Trash2
                                                size={13}
                                            />
                                        </button>
                                    </div>
                                </article>
                            ),
                        )
                    )}
                </div>
            </div>
        </section>
    );
}
