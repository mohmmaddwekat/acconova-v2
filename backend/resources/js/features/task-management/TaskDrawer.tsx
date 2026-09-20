import { Link } from '@inertiajs/react';
import { RecordQuickActions } from '@/components/data/RecordQuickActions';
import {
    Activity,
    Check,
    Copy,
    Download,
    Edit3,
    FileText,
    ListTodo,
    LockKeyhole,
    Paperclip,
    Send,
    Trash2,
    UploadCloud,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type ReactNode,
} from 'react';
import { apiRequest } from '@/lib/http';
import {
    api,
    base,
    Assignees,
    Badge,
    button,
    dateLabel,
    Empty,
    errorText,
    input,
    Modal,
    primary,
    PriorityBadge,
    StatusBadge,
    statusMeta,
} from './ui';
import type {
    ChecklistItem,
    Task,
    TaskActivityEvent,
    TaskAttachment,
    TaskComment,
    TaskData,
    TaskDetail,
    TaskStatus,
} from './types';

type DrawerTab =
    | 'details'
    | 'checklist'
    | 'comments'
    | 'attachments'
    | 'activity';

/**
 * Render the task detail drawer with status changes, checklist, discussion,
 * attachments, activity history and archive/delete controls.
 */
export function TaskDrawer({
    taskId,
    data,
    ar,
    onClose,
    onChanged,
}: {
    taskId: number;
    data: TaskData;
    ar: boolean;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [detail, setDetail] = useState<TaskDetail | null>(null);
    const [tab, setTab] = useState<DrawerTab>('details');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [comment, setComment] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);

    /**
     * Check one task permission returned by the server.
     */
    const can = (permission: string): boolean => (
        data.permissions.includes(permission)
    );

    /**
     * Return localized drawer copy.
     */
    const text = (arabic: string, english: string): string => (
        ar ? arabic : english
    );

    useEffect(() => {
        const controller = new AbortController();
        setError('');

        apiRequest<TaskDetail>(
            `${api}/tasks/${taskId}`,
            { signal: controller.signal },
        )
            .then((value: TaskDetail) => setDetail(value))
            .catch((failure: unknown) => {
                if (! controller.signal.aborted) {
                    setError(errorText(failure));
                }
            });

        return () => controller.abort();
    }, [taskId, revision]);

    /**
     * Run one task mutation and refresh both the drawer and parent surface.
     */
    async function mutate(
        path: string,
        method: string,
        body?: string | FormData,
    ): Promise<boolean> {
        if (busy) {
            return false;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                `${api}/tasks/${taskId}${path}`,
                {
                    method,
                    body,
                },
            );
            setRevision((value: number) => value + 1);
            onChanged();
            return true;
        } catch (failure) {
            setError(errorText(failure));
            return false;
        } finally {
            setBusy(false);
        }
    }

    /**
     * Patch editable task fields using the server revision for concurrency.
     */
    async function patch(payload: Partial<Task>): Promise<void> {
        if (! detail) {
            return;
        }

        await mutate(
            '',
            'PATCH',
            JSON.stringify({
                ...payload,
                revision: detail.task.revision,
            }),
        );
    }

    /**
     * Add a comment to the current task.
     */
    async function addComment(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        const body = comment.trim();

        if (! body) {
            return;
        }

        if (
            await mutate(
                '/comments',
                'POST',
                JSON.stringify({ body }),
            )
        ) {
            setComment('');
        }
    }

    const task = detail?.task;

    const tabs: Array<[
        DrawerTab,
        string,
        string,
        number | undefined,
    ]> = [
        ['details', 'التفاصيل', 'Details', undefined],
        ['checklist', 'قائمة المهام', 'Checklist', task?.checklist.length],
        ['comments', 'التعليقات', 'Comments', detail?.comments.length],
        ['attachments', 'المرفقات', 'Attachments', detail?.attachments.length],
        ['activity', 'سجل النشاط', 'Activity', detail?.events.length],
    ];

    const actions: Record<string, [string, string]> = {
        created: ['أنشأ المهمة', 'Created the task'],
        updated: ['عدّل المهمة', 'Updated the task'],
        status_changed: ['غيّر حالة المهمة', 'Changed the status'],
        commented: ['أضاف تعليقًا', 'Added a comment'],
        attachment_added: ['أرفق ملفًا', 'Attached a file'],
    };

    const checklist = task ? (
        <div className="space-y-3">
            {task.checklist.length ? (
                task.checklist.map((item: ChecklistItem, index: number) => (
                    <label
                        key={`${index}-${item.title}`}
                        className="flex items-start gap-2 rounded-lg border border-slate-100 p-3 text-xs"
                    >
                        <input
                            type="checkbox"
                            className="mt-0.5 accent-blue-500"
                            checked={item.done}
                            disabled={! can('tasks.update') || busy}
                            onChange={(event) => void patch({
                                checklist: task.checklist.map(
                                    (entry: ChecklistItem, position: number) => (
                                        position === index
                                            ? {
                                                  ...entry,
                                                  done: event.target.checked,
                                              }
                                            : entry
                                    ),
                                ),
                                ...(
                                    task.status === 'completed'
                                    && ! event.target.checked
                                        ? { status: 'in_progress' as TaskStatus }
                                        : {}
                                ),
                            })}
                        />
                        <span className={item.done ? 'text-slate-400 line-through' : ''}>
                            {item.title}
                        </span>
                    </label>
                ))
            ) : (
                <Empty
                    ar={ar}
                    text={text('لم تُضف مهام فرعية بعد.', 'No subtasks yet.')}
                />
            )}

            {can('tasks.update') && (
                <Link
                    className={`${button} w-full`}
                    href={`${base}/${task.id}/edit`}
                >
                    <ListTodo size={13} />
                    {text('تعديل قائمة المهام', 'Edit checklist')}
                </Link>
            )}
        </div>
    ) : null;

    const attachmentList = detail ? (
        <div className="grid gap-2 sm:grid-cols-2">
            {detail.attachments.map((file: TaskAttachment) => (
                <a
                    key={file.id}
                    href={file.url}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 p-3 hover:bg-blue-50"
                >
                    <FileText
                        size={23}
                        className="shrink-0 text-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold">
                            {file.name}
                        </p>
                        <p className="mt-1 text-[9px] text-slate-400">
                            {(file.size / 1048576).toFixed(2)} MB
                        </p>
                    </div>
                    <Download
                        size={14}
                        className="text-slate-400"
                    />
                </a>
            ))}
        </div>
    ) : null;

    return (
        <Modal
            open
            drawer
            title={text('تفاصيل المهمة', 'Task details')}
            onClose={() => {
                if (! busy) {
                    onClose();
                }
            }}
        >
            <header className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex flex-wrap gap-2">
                    {can('tasks.update') && (
                        <Link
                            href={`${base}/${taskId}/edit`}
                            className={primary}
                        >
                            <Edit3 size={13} />
                            {text('تعديل', 'Edit')}
                        </Link>
                    )}

                    {task && can('tasks.create') && (
                        <Link
                            href={`${base}/create?copy_from=${task.id}`}
                            className={button}
                        >
                            <Copy size={13} />
                            {text('نسخ المهمة', 'Copy task')}
                        </Link>
                    )}

                    {task
                        && can('tasks.update')
                        && task.status !== 'completed' && (
                        <button
                            type="button"
                            className={`${button} !border-emerald-100 !bg-emerald-50 !text-emerald-600`}
                            disabled={busy}
                            onClick={() => void patch({ status: 'completed' })}
                        >
                            <Check size={13} />
                            {text('إتمام المهمة', 'Complete')}
                        </button>
                    )}

                    {can('tasks.delete') && (
                        <button
                            type="button"
                            className={`${button} !text-red-500`}
                            disabled={busy}
                            onClick={() => setConfirmDelete(true)}
                        >
                            <Trash2 size={13} />
                            {text('حذف', 'Delete')}
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {task && (
                        <RecordQuickActions
                            recordKey={'task-' + String(task.id)}
                            kind="task"
                            label={task.title}
                            detail={data.projects.find(
                                (project) => project.id === task.project_id,
                            )?.name ?? null}
                            href={`${base}/${task.id}`}
                            ar={ar}
                        />
                    )}

                <button
                    type="button"
                    disabled={busy}
                    aria-label={text('إغلاق التفاصيل', 'Close details')}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"
                    onClick={onClose}
                >
                    <X size={19} />
                </button>
                </div>
            </header>

            {error && (
                <div
                    role="alert"
                    className="mb-4 rounded-xl bg-red-50 p-3 text-xs leading-6 text-red-600"
                >
                    {error}
                    <button
                        type="button"
                        className={`${button} ms-2`}
                        onClick={() => {
                            setError('');
                            setRevision((value: number) => value + 1);
                        }}
                    >
                        {text('تحديث', 'Refresh')}
                    </button>
                </div>
            )}

            {confirmDelete && (
                <div
                    role="alert"
                    className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4"
                >
                    <p className="mb-3 text-xs leading-6 text-red-600">
                        {text(
                            'حذف هذه المهمة سيحذف تعليقاتها ومرفقاتها أيضًا. هل تريد المتابعة؟',
                            'Deleting this task also removes its comments and attachments. Continue?',
                        )}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            className={`${button} !bg-red-500 !text-white`}
                            onClick={async () => {
                                if (await mutate('', 'DELETE')) {
                                    onClose();
                                }
                            }}
                        >
                            {text('تأكيد الحذف', 'Confirm deletion')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className={button}
                            onClick={() => setConfirmDelete(false)}
                        >
                            {text('إلغاء', 'Cancel')}
                        </button>
                    </div>
                </div>
            )}

            {! detail || ! task ? (
                <p
                    role="status"
                    className="p-10 text-center text-xs text-slate-400"
                >
                    {text('جارٍ تحميل التفاصيل…', 'Loading details…')}
                </p>
            ) : (
                <>
                    <div className="mb-6 flex items-start justify-between gap-5">
                        <div>
                            <p className="mb-2 text-[10px] text-slate-400">
                                #TSK-{task.id}
                            </p>
                            <h1 className="text-lg font-bold leading-8">
                                {task.title}
                            </h1>
                            <p className="mt-2 text-xs leading-6 text-slate-400">
                                {data.projects.find(
                                    (project) => project.id === task.project_id,
                                )?.name ?? text('بدون مشروع', 'No project')}
                            </p>
                        </div>

                        <div
                            className="flex size-20 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: `conic-gradient(#1670ff ${Math.min(100, Math.max(0, task.progress))}%, #edf3ff 0)`,
                            }}
                        >
                            <div className="flex size-[66px] flex-col items-center justify-center rounded-full bg-white">
                                <strong className="text-lg">{task.progress}%</strong>
                                <span className="text-[8px] text-slate-400">
                                    {text('نسبة الإنجاز', 'Progress')}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-100 p-4 sm:grid-cols-4">
                        <DetailCell label={text('الأولوية', 'Priority')}>
                            <PriorityBadge
                                priority={task.priority}
                                ar={ar}
                            />
                        </DetailCell>

                        <DetailCell label={text('الحالة', 'Status')}>
                            {can('tasks.update') ? (
                                <select
                                    aria-label={text('حالة المهمة', 'Task status')}
                                    disabled={busy}
                                    className={`${input} !min-h-6 !p-1 !text-[10px]`}
                                    value={task.status}
                                    onChange={(event) => void patch({
                                        status: event.target.value as TaskStatus,
                                    })}
                                >
                                    {(Object.entries(statusMeta) as Array<[
                                        TaskStatus,
                                        (typeof statusMeta)[TaskStatus],
                                    ]>).map(([key, value]) => (
                                        <option
                                            key={key}
                                            value={key}
                                        >
                                            {value[ar ? 'ar' : 'en']}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <StatusBadge
                                    status={task.status}
                                    ar={ar}
                                />
                            )}
                        </DetailCell>

                        <DetailCell label={text('تاريخ الاستحقاق', 'Due date')}>
                            {dateLabel(task.due_on, ar)}
                        </DetailCell>

                        <DetailCell label={text('المشروع', 'Project')}>
                            {data.projects.find(
                                (project) => project.id === task.project_id,
                            )?.name ?? '—'}
                        </DetailCell>

                        <DetailCell label={text('المسؤولون', 'Assignees')}>
                            <Assignees
                                task={task}
                                members={data.members}
                            />
                        </DetailCell>

                        <DetailCell label={text('تاريخ الإنشاء', 'Created')}>
                            {dateLabel(task.created_at, ar)}
                        </DetailCell>

                        <DetailCell label={text('الوقت المخطط', 'Estimated time')}>
                            {task.estimated_hours} {text('ساعة', 'hours')}
                        </DetailCell>

                        <DetailCell label={text('الوصول', 'Access')}>
                            <LockKeyhole size={12} />
                            {task.visibility === 'participants'
                                ? text('خاص بالمشاركين', 'Participants')
                                : text('مساحة العمل', 'Workspace')}
                        </DetailCell>
                    </div>

                    <nav
                        className="mb-5 flex overflow-x-auto border-b border-slate-100"
                        aria-label={text('أقسام المهمة', 'Task sections')}
                    >
                        {tabs.map(([key, arabic, english, count]) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={tab === key}
                                onClick={() => setTab(key)}
                                className={`min-w-max border-b-2 px-3 py-3 text-[11px] ${tab === key ? 'border-blue-500 font-semibold text-blue-600' : 'border-transparent text-slate-400'}`}
                            >
                                {ar ? arabic : english}
                                {count !== undefined && ` (${count})`}
                            </button>
                        ))}
                    </nav>

                    {tab === 'details' && (
                        <>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <h2 className="mb-3 flex items-center gap-2 text-xs font-bold">
                                        <FileText
                                            size={15}
                                            className="text-blue-500"
                                        />
                                        {text('الوصف', 'Description')}
                                    </h2>
                                    <p className="whitespace-pre-wrap text-xs leading-7 text-slate-500">
                                        {task.description || text(
                                            'لا يوجد وصف لهذه المهمة.',
                                            'No description provided.',
                                        )}
                                    </p>

                                    <h3 className="mb-3 mt-6 text-xs font-bold">
                                        {text('الوسوم', 'Tags')}
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {task.tags.map((tag: string) => (
                                            <Badge
                                                key={tag}
                                                color="purple"
                                            >
                                                {tag}
                                            </Badge>
                                        ))}
                                        {! task.tags.length && (
                                            <span className="text-xs text-slate-400">—</span>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h2 className="mb-3 text-xs font-bold">
                                        {text('قائمة المهام الفرعية', 'Subtasks')}
                                    </h2>
                                    {checklist}
                                </div>
                            </div>

                            <div className="mt-6">
                                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold">
                                    <Paperclip size={14} />
                                    {text('الملفات المرفقة', 'Attachments')} ({detail.attachments.length})
                                </h2>
                                {attachmentList}
                                {! detail.attachments.length && (
                                    <p className="text-xs text-slate-400">
                                        {text('لا توجد مرفقات.', 'No attachments.')}
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {tab === 'checklist' && checklist}

                    {tab === 'comments' && (
                        <div>
                            <div className="mb-5 space-y-4">
                                {detail.comments.length ? (
                                    detail.comments.map((item: TaskComment) => (
                                        <article
                                            key={item.id}
                                            className="rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                                        >
                                            <header className="flex justify-between gap-3 text-[11px]">
                                                <strong>{item.name}</strong>
                                                <span className="text-[9px] text-slate-400">
                                                    {dateLabel(item.created_at, ar)}
                                                </span>
                                            </header>
                                            <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-500">
                                                {item.body}
                                            </p>
                                        </article>
                                    ))
                                ) : (
                                    <Empty
                                        ar={ar}
                                        text={text(
                                            'ابدأ النقاش حول هذه المهمة.',
                                            'Start the discussion about this task.',
                                        )}
                                    />
                                )}
                            </div>

                            {can('tasks.comment') && (
                                <form onSubmit={addComment}>
                                    <label className="tm-field">
                                        {text('تعليق جديد', 'New comment')}
                                        <textarea
                                            className={input}
                                            rows={3}
                                            required
                                            maxLength={5000}
                                            value={comment}
                                            onChange={(event) => setComment(event.target.value)}
                                        />
                                    </label>
                                    <button
                                        className={`${primary} mt-3`}
                                        disabled={busy || ! comment.trim()}
                                    >
                                        <Send size={13} />
                                        {text('إضافة تعليق', 'Add comment')}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {tab === 'attachments' && (
                        <div>
                            {attachmentList}

                            {! detail.attachments.length && (
                                <Empty
                                    ar={ar}
                                    text={text(
                                        'لا توجد مرفقات لهذه المهمة.',
                                        'No attachments for this task.',
                                    )}
                                />
                            )}

                            {can('tasks.update') && (
                                <div className="mt-5 rounded-xl border border-dashed border-blue-200 p-6 text-center">
                                    <UploadCloud
                                        size={27}
                                        className="mx-auto mb-3 text-blue-400"
                                    />
                                    <button
                                        type="button"
                                        className={primary}
                                        disabled={busy}
                                        onClick={() => fileInput.current?.click()}
                                    >
                                        {text('رفع مرفق', 'Upload attachment')}
                                    </button>
                                    <p className="mt-3 text-[10px] text-slate-400">
                                        {text(
                                            'الحد الأقصى لحجم الملف 20 MB',
                                            'Maximum file size: 20 MB',
                                        )}
                                    </p>
                                    <input
                                        ref={fileInput}
                                        type="file"
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip"
                                        className="hidden"
                                        onChange={async (event) => {
                                            const file = event.target.files?.[0];

                                            if (! file) {
                                                return;
                                            }

                                            if (file.size > 20 * 1024 * 1024) {
                                                setError(text(
                                                    'حجم الملف أكبر من 20 MB.',
                                                    'File exceeds 20 MB.',
                                                ));
                                                event.target.value = '';
                                                return;
                                            }

                                            const body = new FormData();
                                            body.append('file', file);

                                            if (await mutate('/attachments', 'POST', body)) {
                                                event.target.value = '';
                                            }
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'activity' && (
                        <div className="space-y-4">
                            {detail.events.map((event: TaskActivityEvent) => (
                                <div
                                    key={event.id}
                                    className="flex items-start gap-3 rounded-lg border border-slate-100 p-4"
                                >
                                    <Activity
                                        size={17}
                                        className="text-blue-400"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <strong className="text-xs">{event.name}</strong>
                                        <p className="mt-2 text-[11px] text-slate-500">
                                            {actions[event.action]?.[ar ? 0 : 1] ?? event.action}
                                        </p>
                                    </div>
                                    <span className="text-[9px] text-slate-400">
                                        {dateLabel(event.created_at, ar)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}

/**
 * Render one label/value cell in the task metadata grid.
 */
function DetailCell({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div>
            <p className="mb-2 text-[9px] text-slate-400">{label}</p>
            <div className="flex flex-wrap items-center gap-1 text-[10px] font-medium">
                {children}
            </div>
        </div>
    );
}
