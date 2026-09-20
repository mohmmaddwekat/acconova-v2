import {
    Link,
    router,
    usePage,
} from '@inertiajs/react';
import {
    CalendarDays,
    Check,
    Eye,
    ListTodo,
    Paperclip,
    Plus,
    Save,
    ShieldCheck,
    Tag,
    UploadCloud,
    UsersRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from 'react';
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
import {
    api,
    base,
    Avatar,
    Badge,
    button,
    dateLabel,
    errorText,
    input,
    Panel,
    primary,
    PriorityBadge,
    Progress,
    Stat,
    statusMeta,
    StatusBadge,
} from './ui';
import type {
    ChecklistItem,
    Member,
    Task,
    TaskData,
    TaskDetail,
    TaskPayload,
    TaskStatus,
} from './types';

/**
 * Render the shared create/edit task form with permission-aware assignment,
 * attachments, checklist editing and a live task preview.
 */
export function TaskEditor({
    data,
    taskId,
    ar,
    userId,
}: {
    data: TaskData;
    taskId: number | null;
    ar: boolean;
    userId: number;
}) {
    const page = usePage();
    const initial = data.tasks.find((task: Task) => task.id === taskId);
    const queryParams = new URLSearchParams(
        page.url.split('?')[1] ?? '',
    );
    const requestedStatus = queryParams.get('status');
    const copyFromId =
        Number(
            queryParams.get(
                'copy_from',
            )
            ?? 0,
        );
    const initialStatus: TaskStatus =
        requestedStatus
        && Object.prototype.hasOwnProperty.call(statusMeta, requestedStatus)
            ? requestedStatus as TaskStatus
            : 'idea';

    const currentMember = data.members.find(
        (member: Member) => member.user_id === userId || member.id === userId,
    );

    const [record, setRecord] = useState<Task | null>(initial ?? null);
    const [draft, setDraft] = useState<TaskPayload>(() => (
        initial
            ? {
                  title: initial.title,
                  description: initial.description,
                  project_id: initial.project_id,
                  status: initial.status,
                  priority: initial.priority,
                  visibility: initial.visibility,
                  assignees: [...initial.assignees],
                  checklist: initial.checklist.map((item: ChecklistItem) => ({ ...item })),
                  tags: [...initial.tags],
                  progress: initial.progress,
                  starts_on: initial.starts_on,
                  due_on: initial.due_on,
                  estimated_hours: initial.estimated_hours,
                  revision: initial.revision,
              }
            : {
                  title: '',
                  description: '',
                  project_id: null,
                  status: initialStatus,
                  priority: 'medium',
                  visibility: 'workspace',
                  assignees: currentMember ? [currentMember.id] : [],
                  checklist: [],
                  tags: [],
                  progress: 0,
                  starts_on: null,
                  due_on: null,
                  estimated_hours: 0,
              }
    ));
    const [attachments, setAttachments] = useState<TaskDetail['attachments']>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [newItem, setNewItem] = useState('');
    const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(taskId !== null);
    const [retry, setRetry] = useState(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const canAssign = data.permissions.includes('tasks.assign');
    const canUpload = data.permissions.includes('tasks.update');

    /**
     * Return localized editor copy.
     */
    const text = (arabic: string, english: string): string => (
        ar ? arabic : english
    );

    useEffect(() => {
        if (! taskId) {
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setError('');

        apiRequest<TaskDetail>(
            `${api}/tasks/${taskId}`,
            { signal: controller.signal },
        )
            .then((detail: TaskDetail) => {
                setRecord(detail.task);
                setDraft({
                    title: detail.task.title,
                    description: detail.task.description,
                    project_id: detail.task.project_id,
                    status: detail.task.status,
                    priority: detail.task.priority,
                    visibility: detail.task.visibility,
                    assignees: [...detail.task.assignees],
                    checklist: detail.task.checklist.map((item: ChecklistItem) => ({ ...item })),
                    tags: [...detail.task.tags],
                    progress: detail.task.progress,
                    starts_on: detail.task.starts_on,
                    due_on: detail.task.due_on,
                    estimated_hours: detail.task.estimated_hours,
                    revision: detail.task.revision,
                });
                setTags(detail.task.tags.join(', '));
                setAttachments(detail.attachments);
            })
            .catch((failure: unknown) => {
                if (! controller.signal.aborted) {
                    setError(errorText(failure));
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [taskId, retry]);

    /**
     * Load a source task into a new copy without binding the editor to the
     * original id. Saving therefore creates a fresh task.
     */
    useEffect(() => {
        if (
            taskId
            || ! Number.isInteger(copyFromId)
            || copyFromId <= 0
        ) {
            return;
        }

        const controller =
            new AbortController();

        setLoading(
            true,
        );
        setError(
            '',
        );

        apiRequest<TaskDetail>(
            `${api}/tasks/${copyFromId}`,
            {
                signal:
                    controller.signal,
            },
        )
            .then(
                (
                    detail:
                        TaskDetail,
                ) => {
                    const source =
                        detail.task;

                    setRecord(
                        null,
                    );
                    setDraft({
                        title:
                            source.title
                            + (
                                ar
                                    ? ' - نسخة'
                                    : ' - Copy'
                            ),
                        description:
                            source.description,
                        project_id:
                            source.project_id,
                        status:
                            'idea',
                        priority:
                            source.priority,
                        visibility:
                            source.visibility,
                        assignees:
                            [
                                ...source
                                    .assignees,
                            ],
                        checklist:
                            source.checklist.map(
                                (
                                    item:
                                        ChecklistItem,
                                ) => ({
                                    ...item,
                                    done:
                                        false,
                                }),
                            ),
                        tags:
                            [
                                ...source.tags,
                            ],
                        progress:
                            0,
                        starts_on:
                            source.starts_on,
                        due_on:
                            source.due_on,
                        estimated_hours:
                            source.estimated_hours,
                    });
                    setTags(
                        source.tags.join(
                            ', ',
                        ),
                    );
                },
            )
            .catch(
                (
                    failure:
                        unknown,
                ) => {
                    if (
                        ! controller
                            .signal
                            .aborted
                    ) {
                        setError(
                            errorText(
                                failure,
                            ),
                        );
                    }
                },
            )
            .finally(
                () => {
                    if (
                        ! controller
                            .signal
                            .aborted
                    ) {
                        setLoading(
                            false,
                        );
                    }
                },
            );

        return () =>
            controller.abort();
    }, [
        taskId,
        copyFromId,
        ar,
    ]);

    const localDraftKey =
        'acconova:draft:task:'
        + String(
            taskId
            ?? 'new',
        );

    const localDraftValue = {
        draft,
        tags,
    };

    const initialDraftRef =
        useRef(
            JSON.stringify(
                localDraftValue,
            ),
        );

    const dirty =
        JSON.stringify(
            localDraftValue,
        ) !==
            initialDraftRef.current
        || files.length > 0;

    useUnsavedChanges(
        dirty && ! busy,
        ar,
    );

    useGlobalSave(
        () =>
            formRef.current
                ?.requestSubmit(),
        ! busy,
    );

    useLocalDraft(
        localDraftKey,
        localDraftValue,
        ! busy,
        900,
    );

    useEffect(() => {
        if (
            taskId
            || copyFromId > 0
            || typeof window ===
                'undefined'
        ) {
            return;
        }

        const stored =
            readLocalDraft<
                typeof localDraftValue
            >(
                localDraftKey,
            );

        if (
            ! stored
            || (
                ! stored.value
                    .draft.title
                    .trim()
                && ! stored.value
                    .draft.description
                    ?.trim()
                && ! stored.value
                    .tags.trim()
            )
        ) {
            return;
        }

        if (
            window.confirm(
                text(
                    'وجدت مسودة مهمة محفوظة تلقائياً. هل تريد استعادتها؟',
                    'An autosaved task draft was found. Restore it?',
                ),
            )
        ) {
            setDraft(
                stored.value
                    .draft,
            );
            setTags(
                stored.value
                    .tags,
            );
        }
    }, [
        taskId,
        copyFromId,
        localDraftKey,
    ]);

    /**
     * Update one strongly typed task payload field.
     */
    function field<K extends keyof TaskPayload>(
        key: K,
        value: TaskPayload[K],
    ): void {
        setDraft((current: TaskPayload) => ({
            ...current,
            [key]: value,
        }));
    }

    /**
     * Queue files after enforcing the browser-side attachment limits.
     */
    function chooseFiles(selected: File[]): void {
        if (selected.some((file: File) => file.size > 20 * 1024 * 1024)) {
            setError(
                text(
                    'الحد الأقصى لكل مرفق 20 MB.',
                    'Each attachment must be 20 MB or less.',
                ),
            );
            return;
        }

        setFiles((current: File[]) => [
            ...current,
            ...selected,
        ].slice(0, 10));
    }

    /**
     * Persist the task first, then upload queued attachments sequentially so
     * failed uploads never discard a successfully saved task.
     */
    async function submit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        const submitter = (
            event.nativeEvent as SubmitEvent
        ).submitter as HTMLButtonElement | null;

        const normalizedTags = Array.from(
            new Set(
                tags
                    .split(/[,،]/)
                    .map((tag: string) => tag.trim())
                    .filter(Boolean),
            ),
        ).slice(0, 15);

        const payload: TaskPayload = {
            ...draft,
            status: submitter?.value === 'draft'
                ? 'idea'
                : draft.status,
            tags: normalizedTags,
            ...(record
                ? { revision: record.revision }
                : {}),
        };

        try {
            const result = await apiRequest<{ task: Task }>(
                record
                    ? `${api}/tasks/${record.id}`
                    : `${api}/tasks`,
                {
                    method: record ? 'PATCH' : 'POST',
                    body: JSON.stringify(payload),
                },
            );

            setRecord(result.task);
            setDraft({
                title: result.task.title,
                description: result.task.description,
                project_id: result.task.project_id,
                status: result.task.status,
                priority: result.task.priority,
                visibility: result.task.visibility,
                assignees: [...result.task.assignees],
                checklist: result.task.checklist.map((item: ChecklistItem) => ({ ...item })),
                tags: [...result.task.tags],
                progress: result.task.progress,
                starts_on: result.task.starts_on,
                due_on: result.task.due_on,
                estimated_hours: result.task.estimated_hours,
                revision: result.task.revision,
            });

            const remaining = [...files];

            for (const file of files) {
                const body = new FormData();
                body.append('file', file);

                try {
                    await apiRequest(
                        `${api}/tasks/${result.task.id}/attachments`,
                        {
                            method: 'POST',
                            body,
                        },
                    );
                    remaining.shift();
                    setFiles([...remaining]);
                } catch (failure) {
                    setError(
                        `${text(
                            'تم حفظ المهمة، لكن تعذر رفع أحد المرفقات. الملفات المتبقية جاهزة لإعادة المحاولة.',
                            'Task saved, but an attachment failed. Remaining files can be retried.',
                        )} ${errorText(failure)}`,
                    );
                    return;
                }
            }

            clearLocalDraft(
                localDraftKey,
            );

            router.visit(`${base}/${result.task.id}`);
        } catch (failure) {
            setError(errorText(failure));
        } finally {
            setBusy(false);
        }
    }

    const progress =
        draft.status === 'completed'
            ? 100
            : draft.checklist.length
                ? Math.round(
                      draft.checklist.filter((item: ChecklistItem) => item.done).length
                      / draft.checklist.length
                      * 100,
                  )
                : draft.progress;

    if (loading) {
        return (
            <div
                role="status"
                className="tm-panel p-12 text-center text-sm text-slate-400"
            >
                {text('جارٍ تحميل المهمة…', 'Loading task…')}
            </div>
        );
    }

    if (taskId && ! record) {
        return (
            <div
                role="alert"
                className="tm-panel text-sm text-red-500"
            >
                {error}
                <button
                    type="button"
                    className={`${button} ms-3`}
                    onClick={() => setRetry((value: number) => value + 1)}
                >
                    {text('إعادة المحاولة', 'Retry')}
                </button>
            </div>
        );
    }

    return (
        <form
            ref={formRef}
            onSubmit={submit}
        >
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Stat
                    title={text('المهام قيد التنفيذ', 'Tasks in progress')}
                    value={data.tasks.filter((task: Task) => task.status === 'in_progress').length}
                    icon={ListTodo}
                />
                <Stat
                    title={text('المهام المكتملة', 'Completed tasks')}
                    value={data.tasks.filter((task: Task) => task.status === 'completed').length}
                    icon={Check}
                    color="green"
                />
                <Stat
                    title={text('أعضاء الفريق', 'Team members')}
                    value={data.members.length}
                    icon={UsersRound}
                    color="purple"
                />
            </div>

            <fieldset
                disabled={busy}
                className="min-w-0"
            >
                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="min-w-0 space-y-4">
                        <Panel
                            title={text('معلومات أساسية', 'Basic information')}
                            icon={ListTodo}
                        >
                            <div className="grid gap-4 md:grid-cols-2">
                                <label className="tm-field">
                                    {text('عنوان المهمة', 'Task title')}
                                    <input
                                        autoFocus
                                        className={input}
                                        required
                                        maxLength={255}
                                        placeholder={text(
                                            'مثال: تصميم الواجهة الرئيسية للمشروع',
                                            'e.g. Design the project homepage',
                                        )}
                                        value={draft.title}
                                        onChange={(event) => field('title', event.target.value)}
                                    />
                                </label>

                                <label className="tm-field md:row-span-2">
                                    {text('وصف المهمة', 'Task description')}
                                    <textarea
                                        className={`${input} min-h-32`}
                                        maxLength={20000}
                                        rows={5}
                                        placeholder={text(
                                            'اكتب تفاصيل المهمة والنتائج المتوقعة…',
                                            'Describe the work and expected outcome…',
                                        )}
                                        value={draft.description ?? ''}
                                        onChange={(event) => field('description', event.target.value)}
                                    />
                                    <span className="text-end text-[9px] font-normal text-slate-400">
                                        {draft.description?.length ?? 0} / 20000
                                    </span>
                                </label>

                                <div className="grid grid-cols-2 gap-3">
                                    <label className="tm-field">
                                        {text('المشروع', 'Project')}
                                        <select
                                            className={input}
                                            required
                                            value={draft.project_id ?? ''}
                                            onChange={(event) => field(
                                                'project_id',
                                                event.target.value
                                                    ? Number(event.target.value)
                                                    : null,
                                            )}
                                        >
                                            <option value="" disabled>
                                                {text('اختر مشروعًا', 'Choose a project')}
                                            </option>
                                            {data.projects.map((project) => (
                                                <option
                                                    key={project.id}
                                                    value={project.id}
                                                >
                                                    {project.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="tm-field">
                                        {text('الحالة', 'Status')}
                                        <select
                                            className={input}
                                            value={draft.status}
                                            onChange={(event) => field(
                                                'status',
                                                event.target.value as TaskStatus,
                                            )}
                                        >
                                            {(Object.entries(statusMeta) as Array<[
                                                TaskStatus,
                                                (typeof statusMeta)[TaskStatus],
                                            ]>).map(([status, meta]) => (
                                                <option
                                                    key={status}
                                                    value={status}
                                                >
                                                    {meta[ar ? 'ar' : 'en']}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="tm-field">
                                        {text('الأولوية', 'Priority')}
                                        <select
                                            className={input}
                                            value={draft.priority}
                                            onChange={(event) => field(
                                                'priority',
                                                event.target.value as Task['priority'],
                                            )}
                                        >
                                            <option value="high">{text('عالية', 'High')}</option>
                                            <option value="medium">{text('متوسطة', 'Medium')}</option>
                                            <option value="low">{text('منخفضة', 'Low')}</option>
                                        </select>
                                    </label>

                                    <label className="tm-field">
                                        {text('نسبة الإنجاز', 'Progress')}
                                        <input
                                            className={input}
                                            type="number"
                                            min={0}
                                            max={100}
                                            disabled={
                                                draft.checklist.length > 0
                                                || draft.status === 'completed'
                                            }
                                            value={progress}
                                            onChange={(event) => field(
                                                'progress',
                                                Math.min(100, Math.max(0, Number(event.target.value))),
                                            )}
                                        />
                                    </label>
                                </div>
                            </div>
                        </Panel>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Panel
                                title={text('المسؤولية والجدول الزمني', 'Ownership & timeline')}
                                icon={CalendarDays}
                            >
                                <div className="mb-4">
                                    <p className="mb-2 text-[11px] font-semibold">
                                        {text('المسؤولون عن المهمة', 'Task assignees')}
                                    </p>
                                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
                                        {data.members.map((member: Member) => {
                                            const isSelf = currentMember?.id === member.id;
                                            const assignmentLocked =
                                                ! canAssign
                                                && (
                                                    Boolean(record)
                                                    || ! isSelf
                                                );

                                            return (
                                                <label
                                                    key={member.id}
                                                    className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-blue-50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        className="accent-blue-500"
                                                        disabled={assignmentLocked}
                                                        checked={draft.assignees.includes(member.id)}
                                                        onChange={(event) => field(
                                                            'assignees',
                                                            event.target.checked
                                                                ? Array.from(new Set([
                                                                      ...draft.assignees,
                                                                      member.id,
                                                                  ]))
                                                                : draft.assignees.filter(
                                                                      (id: number) => id !== member.id,
                                                                  ),
                                                        )}
                                                    />
                                                    <Avatar member={member} />
                                                    <span className="flex-1">{member.name}</span>
                                                    <span className="text-[9px] text-slate-400">
                                                        {member.department ?? '—'}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {! canAssign && (
                                        <p className="mt-2 text-[10px] text-slate-400">
                                            {text(
                                                'إسناد المهمة لأعضاء آخرين يحتاج صلاحية الإسناد.',
                                                'Assigning other members requires assignment permission.',
                                            )}
                                        </p>
                                    )}
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label className="tm-field">
                                        {text('تاريخ البدء', 'Start date')}
                                        <input
                                            className={input}
                                            type="date"
                                            required
                                            value={draft.starts_on ?? ''}
                                            onChange={(event) => field(
                                                'starts_on',
                                                event.target.value || null,
                                            )}
                                        />
                                    </label>

                                    <label className="tm-field">
                                        {text('تاريخ الاستحقاق', 'Due date')}
                                        <input
                                            className={input}
                                            type="date"
                                            required
                                            min={draft.starts_on ?? undefined}
                                            value={draft.due_on ?? ''}
                                            onChange={(event) => field(
                                                'due_on',
                                                event.target.value || null,
                                            )}
                                        />
                                    </label>

                                    <label className="tm-field sm:col-span-2">
                                        {text('الوقت المخطط بالساعات', 'Estimated hours')}
                                        <input
                                            className={input}
                                            type="number"
                                            required
                                            min={0.25}
                                            max={10000}
                                            step="0.25"
                                            value={draft.estimated_hours || ''}
                                            onChange={(event) => field(
                                                'estimated_hours',
                                                event.target.value
                                                    ? Math.max(0, Number(event.target.value))
                                                    : 0,
                                            )}
                                        />
                                        <span className="text-[9px] font-normal text-slate-400">
                                            {text(
                                                'مطلوب ويجب أن يكون أكبر من صفر.',
                                                'Required and must be greater than zero.',
                                            )}
                                        </span>
                                    </label>
                                </div>
                            </Panel>

                            <Panel
                                title={text('الصلاحيات وسير العمل', 'Access & workflow')}
                                icon={ShieldCheck}
                            >
                                <p className="mb-4 text-[11px] leading-6 text-slate-400">
                                    {text(
                                        'حدد من يمكنه الوصول إلى المهمة، ضمن صلاحيات مساحة العمل.',
                                        'Choose who can access this task within their workspace permissions.',
                                    )}
                                </p>
                                <div className="space-y-3">
                                    {([
                                        [
                                            'workspace',
                                            'مساحة العمل',
                                            'Workspace',
                                            'يراها المسؤولون المخوّلون بعرض جميع المهام.',
                                            'Visible to members with permission to view all tasks.',
                                        ],
                                        [
                                            'participants',
                                            'المشاركون فقط',
                                            'Participants only',
                                            'يراها المنشئ والمسند إليهم، إضافة إلى المالك ومدير النظام.',
                                            'Visible to the creator, assignees, owner and administrator.',
                                        ],
                                    ] as const).map(([
                                        value,
                                        arabic,
                                        english,
                                        hintAr,
                                        hintEn,
                                    ]) => (
                                        <label
                                            key={value}
                                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${draft.visibility === value ? 'border-blue-200 bg-blue-50/50' : 'border-slate-100'}`}
                                        >
                                            <input
                                                type="radio"
                                                className="mt-1 accent-blue-500"
                                                name="visibility"
                                                value={value}
                                                checked={draft.visibility === value}
                                                onChange={() => field('visibility', value)}
                                            />
                                            <span>
                                                <strong className="text-xs">
                                                    {ar ? arabic : english}
                                                </strong>
                                                <span className="mt-2 block text-[10px] leading-5 text-slate-400">
                                                    {ar ? hintAr : hintEn}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <div className="mt-5 rounded-lg bg-emerald-50 p-3 text-[10px] leading-6 text-emerald-700">
                                    {text(
                                        'تُحفظ التغييرات في سجل نشاط المهمة، ويخضع التعديل والتعليق لصلاحيات المستخدم.',
                                        'Changes are recorded in the task history. Editing and commenting follow user permissions.',
                                    )}
                                </div>
                            </Panel>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <Panel
                                title={text('الوسوم والتصنيفات', 'Tags & labels')}
                                icon={Tag}
                            >
                                <label className="tm-field">
                                    {text('وسوم مفصولة بفواصل', 'Comma-separated tags')}
                                    <input
                                        className={input}
                                        value={tags}
                                        maxLength={600}
                                        onChange={(event) => setTags(event.target.value)}
                                        placeholder={text(
                                            'تصميم، واجهة، عاجل',
                                            'Design, interface, urgent',
                                        )}
                                    />
                                </label>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {Array.from(
                                        new Set(
                                            tags
                                                .split(/[,،]/)
                                                .map((tag: string) => tag.trim())
                                                .filter(Boolean),
                                        ),
                                    ).map((tag: string) => (
                                        <Badge
                                            color="purple"
                                            key={tag}
                                        >
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                                <p className="mt-4 text-[10px] leading-6 text-slate-400">
                                    {text(
                                        'حتى 15 وسمًا، وبحد أقصى 40 حرفًا لكل وسم.',
                                        'Up to 15 tags, with a maximum of 40 characters each.',
                                    )}
                                </p>
                            </Panel>

                            <Panel
                                title={text('المرفقات والروابط', 'Attachments')}
                                icon={Paperclip}
                            >
                                {canUpload ? (
                                    <>
                                        <div
                                            className="cursor-pointer rounded-xl border border-dashed border-blue-200 bg-blue-50/30 p-5 text-center transition hover:border-blue-300 hover:bg-blue-50/60"
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                                if (! busy) {
                                                    fileInput.current?.click();
                                                }
                                            }}
                                            onKeyDown={(event) => {
                                                if (
                                                    ! busy
                                                    && (
                                                        event.key === 'Enter'
                                                        || event.key === ' '
                                                    )
                                                ) {
                                                    event.preventDefault();
                                                    fileInput.current?.click();
                                                }
                                            }}
                                            onDragOver={(event) => {
                                                event.preventDefault();
                                            }}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                if (! busy) {
                                                    chooseFiles(Array.from(event.dataTransfer.files));
                                                }
                                            }}
                                        >
                                            <UploadCloud
                                                size={27}
                                                className="mx-auto text-blue-400"
                                            />
                                            <span className="my-2 block text-[11px] font-semibold text-blue-500">
                                                {text(
                                                    'اسحب الملفات هنا أو اضغط لاختيارها من جهازك',
                                                    'Drop files here or click to browse',
                                                )}
                                            </span>
                                            <p className="text-[9px] text-slate-400">
                                                20 MB · {text('10 ملفات كحد أقصى', 'Up to 10 files')}
                                            </p>
                                            <input
                                                ref={fileInput}
                                                type="file"
                                                multiple
                                                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip"
                                                className="hidden"
                                                onChange={(event) => {
                                                    chooseFiles(Array.from(event.target.files ?? []));
                                                    event.target.value = '';
                                                }}
                                            />
                                        </div>

                                        {files.length > 0 && (
                                            <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[9px] leading-5 text-blue-600">
                                                {record
                                                    ? text(
                                                        'تم تجهيز الملفات. سيتم رفعها عند حفظ تعديلات المهمة.',
                                                        'Files are queued and will upload when you save the task.',
                                                    )
                                                    : text(
                                                        'تم تجهيز الملفات. سيتم رفعها بعد إنشاء المهمة.',
                                                        'Files are queued and will upload after the task is created.',
                                                    )}
                                            </p>
                                        )}

                                        <div className="mt-3 space-y-2">
                                            {files.map((file: File, index: number) => (
                                                <div
                                                    key={`${file.name}-${index}`}
                                                    className="flex items-center gap-2 rounded border border-slate-100 p-2 text-[10px]"
                                                >
                                                    <Paperclip size={12} />
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {file.name}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        aria-label={text('إزالة المرفق', 'Remove attachment')}
                                                        onClick={() => setFiles(
                                                            files.filter(
                                                                (_file: File, position: number) => position !== index,
                                                            ),
                                                        )}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs leading-6 text-slate-400">
                                        {text(
                                            'إضافة المرفقات تحتاج صلاحية تعديل المهام.',
                                            'Adding attachments requires task editing permission.',
                                        )}
                                    </p>
                                )}

                                {attachments.map((attachment) => (
                                    <a
                                        key={attachment.id}
                                        href={attachment.url}
                                        className="mt-2 flex items-center gap-2 rounded border border-slate-100 p-2 text-[10px] text-blue-500"
                                    >
                                        <Paperclip size={12} />
                                        {attachment.name}
                                    </a>
                                ))}
                            </Panel>

                            <Panel
                                title={text('قائمة المهام الفرعية', 'Subtask checklist')}
                                icon={ListTodo}
                            >
                                <div className="space-y-2">
                                    {draft.checklist.map((item: ChecklistItem, index: number) => (
                                        <div
                                            key={`${index}-${item.title}`}
                                            className="flex items-center gap-2"
                                        >
                                            <input
                                                className="accent-blue-500"
                                                type="checkbox"
                                                aria-label={item.title || text('مهمة فرعية', 'Subtask')}
                                                checked={item.done}
                                                onChange={(event) => field(
                                                    'checklist',
                                                    draft.checklist.map(
                                                        (entry: ChecklistItem, position: number) => (
                                                            position === index
                                                                ? {
                                                                      ...entry,
                                                                      done: event.target.checked,
                                                                  }
                                                                : entry
                                                        ),
                                                    ),
                                                )}
                                            />
                                            <input
                                                className={`${input} !min-h-7 !p-1.5`}
                                                aria-label={text('عنوان المهمة الفرعية', 'Subtask title')}
                                                value={item.title}
                                                required
                                                maxLength={255}
                                                onChange={(event) => field(
                                                    'checklist',
                                                    draft.checklist.map(
                                                        (entry: ChecklistItem, position: number) => (
                                                            position === index
                                                                ? {
                                                                      ...entry,
                                                                      title: event.target.value,
                                                                  }
                                                                : entry
                                                        ),
                                                    ),
                                                )}
                                            />
                                            <button
                                                type="button"
                                                aria-label={text('حذف المهمة الفرعية', 'Remove subtask')}
                                                onClick={() => field(
                                                    'checklist',
                                                    draft.checklist.filter(
                                                        (_entry: ChecklistItem, position: number) => position !== index,
                                                    ),
                                                )}
                                            >
                                                <X
                                                    size={12}
                                                    className="text-slate-400"
                                                />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-3 flex gap-2">
                                    <input
                                        className={input}
                                        value={newItem}
                                        maxLength={255}
                                        placeholder={text('مهمة فرعية جديدة', 'New subtask')}
                                        aria-label={text('مهمة فرعية جديدة', 'New subtask')}
                                        onChange={(event) => setNewItem(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter') {
                                                return;
                                            }

                                            event.preventDefault();

                                            if (
                                                newItem.trim()
                                                && draft.checklist.length < 100
                                            ) {
                                                field('checklist', [
                                                    ...draft.checklist,
                                                    {
                                                        title: newItem.trim(),
                                                        done: false,
                                                    },
                                                ]);
                                                setNewItem('');
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        className={button}
                                        aria-label={text('إضافة مهمة فرعية', 'Add subtask')}
                                        disabled={! newItem.trim() || draft.checklist.length >= 100}
                                        onClick={() => {
                                            field('checklist', [
                                                ...draft.checklist,
                                                {
                                                    title: newItem.trim(),
                                                    done: false,
                                                },
                                            ]);
                                            setNewItem('');
                                        }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>

                                <p className="mt-4 text-[10px] leading-6 text-slate-400">
                                    {text(
                                        'عند إضافة مهام فرعية، تُحسب نسبة الإنجاز تلقائيًا.',
                                        'Progress is calculated automatically when subtasks are added.',
                                    )}
                                </p>
                            </Panel>
                        </div>
                    </div>

                    <aside className="space-y-4 xl:sticky xl:top-5">
                        <Panel
                            title={text('معاينة المهمة', 'Task preview')}
                            icon={Eye}
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-[10px] text-slate-400">
                                    {record
                                        ? `TSK-${record.id}`
                                        : text('مهمة جديدة', 'New task')}
                                </span>
                                <PriorityBadge
                                    priority={draft.priority}
                                    ar={ar}
                                />
                            </div>
                            <h2 className="mb-2 text-sm font-bold leading-7">
                                {draft.title || text('عنوان المهمة', 'Task title')}
                            </h2>
                            <p className="mb-4 text-[11px] text-blue-500">
                                {data.projects.find(
                                    (project) => project.id === draft.project_id,
                                )?.name ?? text('بدون مشروع', 'No project')}
                            </p>
                            <p className="mb-5 line-clamp-5 whitespace-pre-wrap text-[11px] leading-6 text-slate-400">
                                {draft.description || text(
                                    'سيظهر وصف المهمة هنا…',
                                    'Your task description appears here…',
                                )}
                            </p>
                            <div className="mb-5 flex flex-wrap gap-1">
                                {draft.assignees.map((id: number) => (
                                    <Avatar
                                        key={id}
                                        member={data.members.find(
                                            (member: Member) => member.id === id,
                                        )}
                                    />
                                ))}
                            </div>
                            <dl className="space-y-4 text-[11px]">
                                <div className="flex justify-between">
                                    <dt className="text-slate-400">
                                        {text('تاريخ الاستحقاق', 'Due date')}
                                    </dt>
                                    <dd>{dateLabel(draft.due_on, ar)}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-400">
                                        {text('الحالة', 'Status')}
                                    </dt>
                                    <dd>
                                        <StatusBadge
                                            status={draft.status}
                                            ar={ar}
                                        />
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-slate-400">
                                        {text('الوقت المخطط', 'Estimated time')}
                                    </dt>
                                    <dd>
                                        {draft.estimated_hours} {text('ساعة', 'hours')}
                                    </dd>
                                </div>
                            </dl>
                            <div className="mt-5">
                                <Progress value={progress} />
                            </div>
                        </Panel>

                        <Panel
                            title={text('ملخص المهمة', 'Task summary')}
                            icon={Check}
                        >
                            <div className="space-y-3 text-[11px] text-slate-500">
                                <p>
                                    {draft.assignees.length} {text('أعضاء مسؤولون', 'assigned members')}
                                </p>
                                <p>
                                    {draft.checklist.length} {text('مهام فرعية', 'subtasks')}
                                </p>
                                <p>
                                    {files.length + attachments.length} {text('مرفقات', 'attachments')}
                                </p>
                                <p>
                                    {draft.visibility === 'participants'
                                        ? text('وصول خاص للمشاركين', 'Private participant access')
                                        : text('وصول حسب صلاحيات مساحة العمل', 'Access follows workspace permissions')}
                                </p>
                            </div>
                        </Panel>
                    </aside>
                </div>
            </fieldset>

            {error && (
                <div
                    role="alert"
                    className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-xs leading-6 text-red-600"
                >
                    {error}
                </div>
            )}

            <footer className="tm-panel sticky bottom-3 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 !p-3 shadow-lg">
                <Link
                    className={button}
                    href={`${base}/tasks`}
                >
                    {text('إلغاء', 'Cancel')}
                </Link>
                <div className="flex gap-2">
                    <button
                        type="submit"
                        value="draft"
                        className={button}
                        disabled={busy}
                    >
                        <Save size={14} />
                        {text('حفظ كفكرة', 'Save as idea')}
                    </button>
                    <button
                        type="submit"
                        className={primary}
                        disabled={busy}
                    >
                        <Check size={15} />
                        {busy
                            ? text('جارٍ الحفظ…', 'Saving…')
                            : record
                                ? text('حفظ التعديلات', 'Save changes')
                                : text('إنشاء المهمة', 'Create task')}
                    </button>
                </div>
            </footer>
        </form>
    );
}
