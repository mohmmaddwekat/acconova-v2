import { ApiError } from '@/lib/http';
import {
    CalendarDays,
    Check,
    CheckCircle2,
    Circle,
    Clock3,
    Flag,
    ListTodo,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    type ReactNode,
} from 'react';
import type {
    Member,
    Priority,
    Task,
    TaskStatus,
} from './types';

export const base = '/app/task-management';
export const api = '/api/task-management';
export const button = 'tm-button';
export const primary = 'tm-button tm-primary';
export const input = 'tm-input';

export type StatusMeta = {
    ar: string;
    en: string;
    color: string;
    icon: LucideIcon;
};

export type PriorityMeta = {
    ar: string;
    en: string;
    color: string;
};

export const statusMeta: Record<TaskStatus, StatusMeta> = {
    idea: {
        ar: 'أفكار',
        en: 'Ideas',
        color: 'slate',
        icon: Circle,
    },
    in_progress: {
        ar: 'قيد التنفيذ',
        en: 'In progress',
        color: 'blue',
        icon: Clock3,
    },
    review: {
        ar: 'للمراجعة',
        en: 'In review',
        color: 'amber',
        icon: Clock3,
    },
    completed: {
        ar: 'مكتملة',
        en: 'Completed',
        color: 'green',
        icon: CheckCircle2,
    },
};

export const priorityMeta: Record<Priority, PriorityMeta> = {
    high: {
        ar: 'عالية',
        en: 'High',
        color: 'red',
    },
    medium: {
        ar: 'متوسطة',
        en: 'Medium',
        color: 'amber',
    },
    low: {
        ar: 'منخفضة',
        en: 'Low',
        color: 'green',
    },
};

/**
 * Convert an API or runtime failure into readable inline text.
 */
export function errorText(error: unknown): string {
    if (error instanceof ApiError) {
        return [
            error.message,
            ...Object.values(error.errors).flat(),
        ]
            .filter(Boolean)
            .join(' ');
    }

    return error instanceof Error
        ? error.message
        : 'Request failed';
}

/**
 * Return today's local date in YYYY-MM-DD form.
 */
export function today(): string {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

/**
 * Determine whether an unfinished task is past its due date.
 */
export function overdue(task: Task): boolean {
    return Boolean(
        task.due_on
        && task.due_on < today()
        && task.status !== 'completed',
    );
}

/**
 * Format an API date for the active interface language.
 */
export function dateLabel(
    value: string | null,
    ar: boolean,
): string {
    if (! value) {
        return '—';
    }

    const normalized =
        value.length === 10
            ? `${value}T12:00:00`
            : value.includes('T')
                ? value
                : `${value.replace(' ', 'T')}Z`;

    const date = new Date(normalized);

    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return date.toLocaleDateString(
        ar ? 'ar' : 'en',
        {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        },
    );
}

/**
 * Render a reusable Task Management panel.
 */
export function Panel({
    title,
    icon: Icon,
    action,
    children,
    className = '',
}: {
    title: string;
    icon?: LucideIcon;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={`tm-panel ${className}`}>
            <header className="mb-4 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                    {Icon && (
                        <Icon
                            size={17}
                            className="text-blue-500"
                        />
                    )}
                    {title}
                </h2>
                {action}
            </header>
            {children}
        </section>
    );
}

/**
 * Render one dashboard statistic card.
 */
export function Stat({
    title,
    value,
    hint,
    icon: Icon,
    color = 'blue',
}: {
    title: string;
    value: string | number;
    hint?: string;
    icon: LucideIcon;
    color?: string;
}) {
    return (
        <div className="tm-panel flex items-start justify-between gap-3">
            <div>
                <p className="text-[11px] text-slate-500">{title}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
                {hint && (
                    <p className="mt-1 text-[10px] text-slate-400">{hint}</p>
                )}
            </div>
            <span className={`tm-icon tm-${color}`}>
                <Icon size={21} />
            </span>
        </div>
    );
}

/**
 * Render a small colored metadata badge.
 */
export function Badge({
    children,
    color = 'blue',
}: {
    children: ReactNode;
    color?: string;
}) {
    return (
        <span className={`tm-badge tm-${color}`}>
            {children}
        </span>
    );
}

/**
 * Render the localized task status badge.
 */
export function StatusBadge({
    status,
    ar,
}: {
    status: TaskStatus;
    ar: boolean;
}) {
    const meta = statusMeta[status];

    return (
        <Badge color={meta.color}>
            {meta[ar ? 'ar' : 'en']}
        </Badge>
    );
}

/**
 * Render the localized task priority badge.
 */
export function PriorityBadge({
    priority,
    ar,
}: {
    priority: Priority;
    ar: boolean;
}) {
    const meta = priorityMeta[priority];

    return (
        <Badge color={meta.color}>
            <Flag size={10} />
            {meta[ar ? 'ar' : 'en']}
        </Badge>
    );
}

/**
 * Render initials for a workspace member.
 */
export function Avatar({
    member,
    size = 'normal',
}: {
    member?: Pick<Member, 'id' | 'name'>;
    size?: 'normal' | 'large';
}) {
    const colors = [
        '#e0e7ff',
        '#ccfbf1',
        '#fef3c7',
        '#fce7f3',
        '#ede9fe',
    ];

    const initials = member?.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part: string) => part.charAt(0))
        .join('') || '?';

    return (
        <span
            title={member?.name ?? '—'}
            className={`inline-flex shrink-0 items-center justify-center rounded-full border-2 border-white font-bold text-slate-600 ${size === 'large' ? 'size-11 text-sm' : 'size-7 text-[9px]'}`}
            style={{
                background:
                    colors[(member?.id ?? 0) % colors.length],
            }}
        >
            {initials}
        </span>
    );
}

/**
 * Render the first assigned members for a task.
 */
export function Assignees({
    task,
    members,
}: {
    task: Task;
    members: Member[];
}) {
    return (
        <span className="flex items-center -space-x-1.5 rtl:space-x-reverse">
            {task.assignees.slice(0, 3).map((id: number) => (
                <Avatar
                    key={id}
                    member={members.find((member: Member) => member.id === id)}
                />
            ))}
            {task.assignees.length > 3 && (
                <span className="text-[10px] text-slate-400">
                    +{task.assignees.length - 3}
                </span>
            )}
        </span>
    );
}

/**
 * Render a clamped progress bar.
 */
export function Progress({
    value,
    label = true,
}: {
    value: number;
    label?: boolean;
}) {
    const safeValue = Math.min(100, Math.max(0, Math.round(value)));

    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                    className={`h-full rounded-full ${safeValue === 100 ? 'bg-emerald-400' : 'bg-blue-500'}`}
                    style={{
                        width: `${safeValue}%`,
                    }}
                />
            </div>
            {label && (
                <span className="text-[10px] tabular-nums">
                    {safeValue}%
                </span>
            )}
        </div>
    );
}

/**
 * Render an empty Task Management state.
 */
export function Empty({
    ar,
    text,
}: {
    ar: boolean;
    text?: string;
}) {
    return (
        <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <ListTodo
                size={29}
                className="text-blue-300"
            />
            <p className="text-xs leading-6 text-slate-500">
                {text ?? (
                    ar
                        ? 'لا توجد مهام تطابق الفلاتر الحالية.'
                        : 'No tasks match the current filters.'
                )}
            </p>
        </div>
    );
}

/**
 * Render a native dialog as a centered modal or right-side drawer.
 */
export function Modal({
    open,
    onClose,
    title,
    children,
    drawer = false,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    drawer?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = ref.current;

        if (! dialog) {
            return;
        }

        if (open && ! dialog.open) {
            dialog.showModal();
            return;
        }

        if (! open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    return (
        <dialog
            ref={ref}
            className={
                drawer
                    ? 'tm-dialog tm-drawer task-module'
                    : 'tm-dialog task-module'
            }
            onCancel={(event) => {
                event.preventDefault();
                onClose();
            }}
            aria-label={title}
        >
            {children}
        </dialog>
    );
}

/**
 * Render a task due date and highlight overdue work.
 */
export function DueDate({
    task,
    ar,
}: {
    task: Task;
    ar: boolean;
}) {
    let tone =
        'border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]';

    if (task.due_on) {
        const due =
            new Date(
                task.due_on
                + 'T12:00:00',
            );
        const current =
            new Date();
        current.setHours(
            12,
            0,
            0,
            0,
        );

        const days =
            Math.ceil(
                (
                    due.getTime()
                    - current.getTime()
                )
                / 86400000,
            );

        if (task.status === 'completed') {
            tone =
                'border-emerald-200 bg-emerald-50 text-emerald-700';
        } else if (days < 0) {
            tone =
                'border-red-200 bg-red-50 text-red-700';
        } else if (days <= 3) {
            tone =
                'border-amber-200 bg-amber-50 text-amber-700';
        } else {
            tone =
                'border-emerald-200 bg-emerald-50 text-emerald-700';
        }
    }

    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${tone}`}
        >
            <CalendarDays size={12} />
            {dateLabel(task.due_on, ar)}
        </span>
    );
}

/**
 * Render a compact boolean check indicator.
 */
export function CheckMark({
    value,
}: {
    value: boolean;
}) {
    return (
        <span
            className={`inline-flex size-4 items-center justify-center rounded-full ${value ? 'bg-emerald-100 text-emerald-500' : 'bg-slate-100 text-slate-300'}`}
        >
            <Check size={10} />
        </span>
    );
}
