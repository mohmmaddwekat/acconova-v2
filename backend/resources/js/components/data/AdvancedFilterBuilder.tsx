import {
    Filter,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import {
    useMemo,
    useState,
} from 'react';

export type AdvancedFilterOperator =
    | 'equals'
    | 'contains'
    | 'gte'
    | 'lte'
    | 'before'
    | 'after';

export type AdvancedFilterCondition = {
    id: string;
    field: string;
    operator: AdvancedFilterOperator;
    value: string;
};

export type AdvancedFilterField = {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date';
    operators?: AdvancedFilterOperator[];
    placeholder?: string;
};

const DEFAULT_OPERATORS: Record<
    AdvancedFilterField['type'],
    AdvancedFilterOperator[]
> = {
    text: ['contains', 'equals'],
    number: ['gte', 'lte', 'equals'],
    date: ['after', 'before', 'equals'],
};

function operatorLabel(
    operator: AdvancedFilterOperator,
    ar: boolean,
): string {
    const labels: Record<
        AdvancedFilterOperator,
        [string, string]
    > = {
        equals: ['يساوي', 'Equals'],
        contains: ['يحتوي', 'Contains'],
        gte: ['أكبر أو يساوي', 'At least'],
        lte: ['أقل أو يساوي', 'At most'],
        before: ['قبل', 'Before'],
        after: ['بعد', 'After'],
    };

    return labels[operator][ar ? 0 : 1];
}

function makeId(): string {
    return [
        Date.now().toString(36),
        Math.random().toString(36).slice(2),
    ].join('-');
}

export function AdvancedFilterBuilder({
    fields,
    value,
    onChange,
    ar,
}: {
    fields: AdvancedFilterField[];
    value: AdvancedFilterCondition[];
    onChange: (conditions: AdvancedFilterCondition[]) => void;
    ar: boolean;
}) {
    const [open, setOpen] = useState(false);
    const fieldMap = useMemo(
        () => new Map(fields.map((field) => [field.key, field])),
        [fields],
    );

    function addCondition(): void {
        const first = fields[0];
        if (! first) {
            return;
        }

        onChange([
            ...value,
            {
                id: makeId(),
                field: first.key,
                operator:
                    first.operators?.[0]
                    ?? DEFAULT_OPERATORS[first.type][0]
                    ?? 'equals',
                value: '',
            },
        ]);
    }

    function patch(
        id: string,
        next: Partial<AdvancedFilterCondition>,
    ): void {
        onChange(
            value.map((condition) => {
                if (condition.id !== id) {
                    return condition;
                }

                if (next.field) {
                    const field = fieldMap.get(next.field);
                    return {
                        ...condition,
                        ...next,
                        operator:
                            field?.operators?.[0]
                            ?? (field
                                ? DEFAULT_OPERATORS[field.type][0]
                                : condition.operator)
                            ?? 'equals',
                        value: '',
                    };
                }

                return {
                    ...condition,
                    ...next,
                };
            }),
        );
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((current) => ! current)}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)]"
            >
                <Filter size={14} />
                {ar ? 'فلترة متقدمة' : 'Advanced filters'}
                {value.length > 0 && (
                    <span className="rounded-full bg-[var(--ac-accent-soft)] px-1.5 py-0.5 text-[9px] text-[var(--ac-accent)]">
                        {value.length}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute end-0 top-12 z-[90] w-[min(94vw,620px)] rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[0_24px_70px_rgba(1,20,35,.22)]">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-bold text-[var(--ac-text)]">
                                {ar ? 'منشئ الفلاتر المتقدمة' : 'Advanced filter builder'}
                            </h3>
                            <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'كل الشروط أدناه تطبق معاً باستخدام AND.'
                                    : 'All conditions below are applied together with AND.'}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="flex size-8 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="mt-4 space-y-2">
                        {value.length === 0 && (
                            <div className="rounded-[14px] border border-dashed border-[var(--ac-line)] px-4 py-7 text-center text-xs text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'لا توجد شروط متقدمة بعد.'
                                    : 'No advanced conditions yet.'}
                            </div>
                        )}

                        {value.map((condition, index) => {
                            const field =
                                fieldMap.get(condition.field)
                                ?? fields[0];
                            if (! field) {
                                return null;
                            }

                            const operators =
                                field.operators
                                ?? DEFAULT_OPERATORS[field.type];

                            return (
                                <div
                                    key={condition.id}
                                    className="grid gap-2 rounded-[14px] bg-[var(--ac-surface-soft)] p-2 sm:grid-cols-[auto_1fr_150px_1fr_auto] sm:items-center"
                                >
                                    <span className="px-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                        {index === 0
                                            ? (ar ? 'حيث' : 'Where')
                                            : 'AND'}
                                    </span>

                                    <select
                                        value={condition.field}
                                        onChange={(event) =>
                                            patch(condition.id, {
                                                field: event.target.value,
                                            })}
                                        className="h-10 rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2 text-xs text-[var(--ac-text)]"
                                    >
                                        {fields.map((item) => (
                                            <option key={item.key} value={item.key}>
                                                {item.label}
                                            </option>
                                        ))}
                                    </select>

                                    <select
                                        value={condition.operator}
                                        onChange={(event) =>
                                            patch(condition.id, {
                                                operator: event.target.value as AdvancedFilterOperator,
                                            })}
                                        className="h-10 rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2 text-xs text-[var(--ac-text)]"
                                    >
                                        {operators.map((operator) => (
                                            <option key={operator} value={operator}>
                                                {operatorLabel(operator, ar)}
                                            </option>
                                        ))}
                                    </select>

                                    <input
                                        type={
                                            field.type === 'number'
                                                ? 'number'
                                                : field.type === 'date'
                                                    ? 'date'
                                                    : 'text'
                                        }
                                        value={condition.value}
                                        placeholder={field.placeholder}
                                        onChange={(event) =>
                                            patch(condition.id, {
                                                value: event.target.value,
                                            })}
                                        className="h-10 rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                    />

                                    <button
                                        type="button"
                                        aria-label={ar ? 'حذف الشرط' : 'Remove condition'}
                                        onClick={() =>
                                            onChange(
                                                value.filter((item) => item.id !== condition.id),
                                            )}
                                        className="flex size-9 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] hover:bg-red-50 hover:text-red-600"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={addCondition}
                            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-dashed border-[var(--ac-line-strong)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                        >
                            <Plus size={13} />
                            {ar ? 'إضافة شرط' : 'Add condition'}
                        </button>

                        {value.length > 0 && (
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                className="h-9 rounded-[10px] px-3 text-[10px] font-semibold text-[var(--ac-danger)] hover:bg-red-50"
                            >
                                {ar ? 'مسح الشروط' : 'Clear conditions'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
