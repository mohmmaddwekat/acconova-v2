import { ApiError, apiRequest } from '@/lib/http';
import { Check, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type CustomField = {
    id: number;
    label: string;
    key: string;
    field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
    options: string[];
    required: boolean;
};

type CustomStatus = {
    id: number;
    label: string;
    color: string | null;
};

type Response = {
    fields: CustomField[];
    values: Record<string, string | null>;
    statuses: CustomStatus[];
    status_id: number | null;
    can_edit: boolean;
};

export function RecordCustomizationPanel({
    type,
    recordId,
    ar,
}: {
    type: 'party' | 'product' | 'staff' | 'task' | 'project';
    recordId: number;
    ar: boolean;
}) {
    const [data, setData] = useState<Response | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [statusId, setStatusId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = async (): Promise<void> => {
        setError('');

        try {
            const response = await apiRequest<Response>(
                '/api/records/'
                + type
                + '/'
                + String(recordId)
                + '/customization',
            );

            setData(response);
            setValues(
                Object.fromEntries(
                    response.fields.map(field => [
                        String(field.id),
                        response.values[String(field.id)] ?? '',
                    ]),
                ),
            );
            setStatusId(
                response.status_id
                    ? String(response.status_id)
                    : '',
            );
        } catch (failure) {
            if (
                failure instanceof ApiError
                && failure.status === 403
            ) {
                return;
            }

            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحميل الحقول الخاصة.'
                            : 'Could not load custom fields.'
                    ),
            );
        }
    };

    useEffect(() => {
        void load();
    }, [type, recordId]);

    const hasContent = useMemo(
        () =>
            Boolean(
                data
                && (
                    data.fields.length > 0
                    || data.statuses.length > 0
                ),
            ),
        [data],
    );

    if (! data || ! hasContent) {
        return null;
    }

    async function save(): Promise<void> {
        if (! data?.can_edit || busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<Response>(
                '/api/records/'
                + type
                + '/'
                + String(recordId)
                + '/customization',
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        values,
                        status_id:
                            statusId
                                ? Number(statusId)
                                : null,
                    }),
                },
            );

            setData(response);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر حفظ الحقول الخاصة.'
                            : 'Could not save custom fields.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="mt-6 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal
                        size={15}
                        className="text-[var(--ac-accent)]"
                    />
                    <div>
                        <p className="text-xs font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'الحقول والحالة الخاصة'
                                : 'Custom fields & status'}
                        </p>
                        <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                            {ar
                                ? 'حقول معرفة من إعدادات مساحة العمل.'
                                : 'Workspace-defined fields for this record.'}
                        </p>
                    </div>
                </div>

                {data.can_edit && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save()}
                        className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)] disabled:opacity-40"
                    >
                        <Check size={12} />
                        {ar ? 'حفظ' : 'Save'}
                    </button>
                )}
            </div>

            {error && (
                <div className="mt-3 rounded-[11px] border border-red-300/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">
                    {error}
                </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {data.statuses.length > 0 && (
                    <label>
                        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                            {ar ? 'الحالة الخاصة' : 'Custom status'}
                        </span>
                        <select
                            value={statusId}
                            disabled={! data.can_edit}
                            onChange={event =>
                                setStatusId(event.target.value)
                            }
                            className="mt-1 h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)] disabled:opacity-60"
                        >
                            <option value="">
                                {ar ? '— بدون حالة —' : '— No status —'}
                            </option>
                            {data.statuses.map(status => (
                                <option
                                    key={status.id}
                                    value={status.id}
                                >
                                    {status.label}
                                </option>
                            ))}
                        </select>
                    </label>
                )}

                {data.fields.map(field => (
                    <label
                        key={field.id}
                        className={
                            field.field_type === 'text'
                                ? ''
                                : ''
                        }
                    >
                        <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                            {field.label}
                            {field.required ? ' *' : ''}
                        </span>

                        {field.field_type === 'select' ? (
                            <select
                                value={values[String(field.id)] ?? ''}
                                disabled={! data.can_edit}
                                onChange={event =>
                                    setValues(current => ({
                                        ...current,
                                        [String(field.id)]:
                                            event.target.value,
                                    }))
                                }
                                className="mt-1 h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)] disabled:opacity-60"
                            >
                                <option value="">
                                    {ar ? '— اختر —' : '— Select —'}
                                </option>
                                {field.options.map(option => (
                                    <option key={option} value={option}>
                                        {option}
                                    </option>
                                ))}
                            </select>
                        ) : field.field_type === 'checkbox' ? (
                            <label className="mt-2 flex h-10 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text-soft)]">
                                <input
                                    type="checkbox"
                                    checked={
                                        (values[String(field.id)] ?? '0')
                                        === '1'
                                    }
                                    disabled={! data.can_edit}
                                    onChange={event =>
                                        setValues(current => ({
                                            ...current,
                                            [String(field.id)]:
                                                event.target.checked
                                                    ? '1'
                                                    : '0',
                                        }))
                                    }
                                />
                                {ar ? 'مفعّل' : 'Enabled'}
                            </label>
                        ) : (
                            <input
                                type={
                                    field.field_type === 'number'
                                        ? 'number'
                                        : field.field_type === 'date'
                                            ? 'date'
                                            : 'text'
                                }
                                value={values[String(field.id)] ?? ''}
                                disabled={! data.can_edit}
                                onChange={event =>
                                    setValues(current => ({
                                        ...current,
                                        [String(field.id)]:
                                            event.target.value,
                                    }))
                                }
                                className="mt-1 h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)] disabled:opacity-60"
                            />
                        )}
                    </label>
                ))}
            </div>
        </section>
    );
}
