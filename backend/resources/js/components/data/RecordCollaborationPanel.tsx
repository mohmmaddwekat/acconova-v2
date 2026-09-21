import { apiRequest } from '@/lib/http';
import {
    BellPlus,
    Building2,
    CheckCircle2,
    FileText,
    Image,
    Link2,
    MessageSquareText,
    Paperclip,
    Plus,
    Tag,
    Trash2,
    Upload,
    UserRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

export type CollaborationRecordType =
    | 'party'
    | 'product'
    | 'document'
    | 'task'
    | 'staff';

type CollaborationData = {
    tags: Array<{
        id: number;
        name: string;
        slug: string;
        color: string | null;
    }>;
    comments: Array<{
        id: number;
        body: string;
        user_id: number;
        user_name: string;
        edited_at: string | null;
        created_at: string;
    }>;
    attachments: Array<{
        id: number;
        original_name: string;
        mime_type: string | null;
        size_bytes: number;
        uploaded_by: number;
        uploaded_by_name: string;
        created_at: string;
        preview_url: string;
    }>;
    reminders: Array<{
        id: number;
        note: string | null;
        due_at: string;
        notified_at: string | null;
        completed_at: string | null;
    }>;
    mentionables: Array<{
        id: number;
        name: string;
        email: string;
    }>;
    relationships: Array<{
        id: number;
        person_party_id: number;
        company_party_id: number;
        person_name: string | null;
        person_email: string | null;
        company_name: string | null;
        title: string | null;
        department: string | null;
        is_primary: boolean;
    }>;
};

type RelationshipOption = {
    id: number;
    type: 'person' | 'company';
    name: string;
    email: string | null;
};

const button =
    'inline-flex h-9 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)]';

export function RecordCollaborationPanel({
    type,
    recordId,
    ar,
    title,
    allowRelationships = false,
    allowReminders = false,
}: {
    type: CollaborationRecordType;
    recordId: number;
    ar: boolean;
    title?: string;
    allowRelationships?: boolean;
    allowReminders?: boolean;
}) {
    const [data, setData] = useState<CollaborationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [tagName, setTagName] = useState('');
    const [comment, setComment] = useState('');
    const [reminderAt, setReminderAt] = useState('');
    const [reminderNote, setReminderNote] = useState('');
    const [preview, setPreview] = useState<CollaborationData['attachments'][number] | null>(null);
    const [relationshipSearch, setRelationshipSearch] = useState('');
    const [relationshipOptions, setRelationshipOptions] = useState<RelationshipOption[]>([]);
    const [relationshipPartyId, setRelationshipPartyId] = useState('');
    const [relationshipTitle, setRelationshipTitle] = useState('');
    const [relationshipDepartment, setRelationshipDepartment] = useState('');
    const fileRef = useRef<HTMLInputElement | null>(null);

    const base =
        '/api/records/'
        + type
        + '/'
        + String(recordId);

    const heading = title ?? (
        ar
            ? 'التعاون والسجل الداخلي'
            : 'Collaboration & internal record'
    );

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: CollaborationData;
                }>(base + '/collaboration');

            setData(response.data);
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحميل بيانات التعاون.'
                            : 'Collaboration data could not be loaded.'
                    ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [
        type,
        recordId,
    ]);

    useEffect(() => {
        if (! allowRelationships || type !== 'party') {
            return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(() => {
            void apiRequest<{
                data: RelationshipOption[];
            }>(
                base
                + '/relationship-options?search='
                + encodeURIComponent(
                    relationshipSearch,
                ),
                {
                    signal: controller.signal,
                },
            )
                .then((response) =>
                    setRelationshipOptions(
                        response.data,
                    ),
                )
                .catch(() => {
                    if (! controller.signal.aborted) {
                        setRelationshipOptions([]);
                    }
                });
        }, 180);

        return () => {
            controller.abort();
            window.clearTimeout(timeout);
        };
    }, [
        allowRelationships,
        type,
        recordId,
        relationshipSearch,
    ]);

    async function action(
        work: () => Promise<unknown>,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await work();
            await load();
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تنفيذ العملية.'
                            : 'The action could not be completed.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function addTag(): Promise<void> {
        const name = tagName.trim();
        if (! name) {
            return;
        }

        await action(() =>
            apiRequest(
                base + '/tags',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name,
                    }),
                },
            ),
        );

        setTagName('');
    }

    async function addComment(): Promise<void> {
        const body = comment.trim();
        if (! body) {
            return;
        }

        await action(() =>
            apiRequest(
                base + '/comments',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        body,
                    }),
                },
            ),
        );

        setComment('');
    }

    async function upload(
        file: File,
    ): Promise<void> {
        const body = new FormData();
        body.append(
            'file',
            file,
        );

        await action(() =>
            apiRequest(
                base + '/attachments',
                {
                    method: 'POST',
                    body,
                },
            ),
        );

        if (fileRef.current) {
            fileRef.current.value = '';
        }
    }

    async function addReminder(): Promise<void> {
        if (! reminderAt) {
            return;
        }

        await action(() =>
            apiRequest(
                base + '/reminders',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        due_at: new Date(
                            reminderAt,
                        ).toISOString(),
                        note:
                            reminderNote.trim()
                            || null,
                    }),
                },
            ),
        );

        setReminderAt('');
        setReminderNote('');
    }

    async function addRelationship(): Promise<void> {
        if (! relationshipPartyId) {
            return;
        }

        await action(() =>
            apiRequest(
                base + '/relationships',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        other_party_id:
                            Number(
                                relationshipPartyId,
                            ),
                        title:
                            relationshipTitle.trim()
                            || null,
                        department:
                            relationshipDepartment.trim()
                            || null,
                    }),
                },
            ),
        );

        setRelationshipPartyId('');
        setRelationshipTitle('');
        setRelationshipDepartment('');
        setRelationshipSearch('');
    }

    const sortedComments = useMemo(
        () =>
            [...(data?.comments ?? [])]
                .sort(
                    (a, b) =>
                        new Date(a.created_at).getTime()
                        - new Date(b.created_at).getTime(),
                ),
        [data?.comments],
    );

    return (
        <section className="mt-5 rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                        {ar ? 'داخلي' : 'Internal'}
                    </p>
                    <h3 className="mt-1 text-sm font-bold text-[var(--ac-text)]">
                        {heading}
                    </h3>
                </div>

                {loading && (
                    <span className="text-[10px] text-[var(--ac-text-muted)]">
                        {ar ? 'جارٍ التحميل…' : 'Loading…'}
                    </span>
                )}
            </div>

            {error && (
                <div className="mt-3 rounded-[12px] border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
                    {error}
                </div>
            )}

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-3">
                    <div className="flex items-center gap-2">
                        <Tag size={14} className="text-[var(--ac-accent)]" />
                        <strong className="text-xs">
                            {ar ? 'الوسوم' : 'Tags'}
                        </strong>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {(data?.tags ?? []).map((tag) => (
                            <span
                                key={tag.id}
                                className="inline-flex items-center gap-1 rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ac-text-soft)]"
                            >
                                #{tag.name}
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        void action(() =>
                                            apiRequest(
                                                base
                                                + '/tags/'
                                                + String(tag.id),
                                                {
                                                    method: 'DELETE',
                                                },
                                            ),
                                        )}
                                    className="text-[var(--ac-text-muted)] hover:text-red-600"
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        ))}

                        {! data?.tags.length && ! loading && (
                            <span className="text-[10px] text-[var(--ac-text-muted)]">
                                {ar ? 'لا توجد وسوم بعد.' : 'No tags yet.'}
                            </span>
                        )}
                    </div>

                    <div className="mt-3 flex gap-2">
                        <input
                            value={tagName}
                            onChange={(event) =>
                                setTagName(
                                    event.target.value,
                                )}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void addTag();
                                }
                            }}
                            placeholder={ar ? 'VIP، موسمي، Wholesale…' : 'VIP, seasonal, wholesale…'}
                            className="h-9 min-w-0 flex-1 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />
                        <button
                            type="button"
                            disabled={busy || ! tagName.trim()}
                            onClick={() => void addTag()}
                            className={button}
                        >
                            <Plus size={12} />
                            {ar ? 'إضافة' : 'Add'}
                        </button>
                    </div>
                </div>

                <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-3">
                    <div className="flex items-center gap-2">
                        <Paperclip size={14} className="text-[var(--ac-accent)]" />
                        <strong className="text-xs">
                            {ar ? 'المرفقات' : 'Attachments'}
                        </strong>
                    </div>

                    <div className="mt-3 space-y-2">
                        {(data?.attachments ?? []).slice(0, 8).map((attachment) => {
                            const image =
                                attachment.mime_type?.startsWith('image/')
                                ?? false;

                            return (
                                <div
                                    key={attachment.id}
                                    className="flex items-center gap-2 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 py-2"
                                >
                                    {image
                                        ? <Image size={14} className="shrink-0 text-[var(--ac-accent)]" />
                                        : <FileText size={14} className="shrink-0 text-[var(--ac-accent)]" />}

                                    <button
                                        type="button"
                                        onClick={() => setPreview(attachment)}
                                        className="min-w-0 flex-1 truncate text-start text-[10px] font-semibold text-[var(--ac-text-soft)] hover:text-[var(--ac-accent)]"
                                    >
                                        {attachment.original_name}
                                    </button>

                                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                                        {formatBytes(attachment.size_bytes)}
                                    </span>

                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                            void action(() =>
                                                apiRequest(
                                                    base
                                                    + '/attachments/'
                                                    + String(attachment.id),
                                                    {
                                                        method: 'DELETE',
                                                    },
                                                ),
                                            )}
                                        className="flex size-7 items-center justify-center rounded-[8px] text-[var(--ac-text-muted)] hover:bg-red-50 hover:text-red-600"
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            );
                        })}

                        {! data?.attachments.length && ! loading && (
                            <p className="py-2 text-[10px] text-[var(--ac-text-muted)]">
                                {ar ? 'لا توجد ملفات مرفقة.' : 'No attachments yet.'}
                            </p>
                        )}
                    </div>

                    <input
                        ref={fileRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                        onChange={(event) => {
                            const file =
                                event.target.files?.[0];

                            if (file) {
                                void upload(file);
                            }
                        }}
                    />

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => fileRef.current?.click()}
                        className={button + ' mt-3'}
                    >
                        <Upload size={12} />
                        {ar ? 'إرفاق ملف' : 'Attach file'}
                    </button>
                </div>
            </div>

            <div className="mt-4 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)]/45 p-3">
                <div className="flex items-center gap-2">
                    <MessageSquareText size={14} className="text-[var(--ac-accent)]" />
                    <strong className="text-xs">
                        {ar ? 'التعليقات والنشاط' : 'Comments & activity'}
                    </strong>
                </div>

                <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pe-1">
                    {sortedComments.map((item) => (
                        <article
                            key={item.id}
                            className="rounded-[12px] bg-[var(--ac-surface-soft)] p-3"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <strong className="text-[10px] text-[var(--ac-text)]">
                                    {item.user_name}
                                </strong>
                                <time className="text-[9px] text-[var(--ac-text-muted)]">
                                    {new Date(item.created_at).toLocaleString()}
                                </time>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-5 text-[var(--ac-text-soft)]">
                                {item.body}
                            </p>
                        </article>
                    ))}

                    {! sortedComments.length && ! loading && (
                        <p className="py-4 text-center text-[10px] text-[var(--ac-text-muted)]">
                            {ar ? 'لا توجد تعليقات داخلية بعد.' : 'No internal comments yet.'}
                        </p>
                    )}
                </div>

                <div className="mt-3">
                    <textarea
                        rows={3}
                        value={comment}
                        onChange={(event) =>
                            setComment(
                                event.target.value,
                            )}
                        placeholder={
                            ar
                                ? 'اكتب تعليقاً… استخدم @Mohammed لتنبيه زميل.'
                                : 'Write a comment… use @Mohammed to notify a teammate.'
                        }
                        className="w-full resize-y rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    />

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[9px] text-[var(--ac-text-muted)]">
                            {data?.mentionables.length
                                ? (
                                    ar
                                        ? 'المنشن الداخلي يرسل إشعاراً للمستخدم المذكور.'
                                        : 'Internal mentions notify the mentioned teammate.'
                                )
                                : ''}
                        </p>

                        <button
                            type="button"
                            disabled={busy || ! comment.trim()}
                            onClick={() => void addComment()}
                            className={button}
                        >
                            <MessageSquareText size={12} />
                            {ar ? 'إضافة تعليق' : 'Add comment'}
                        </button>
                    </div>
                </div>
            </div>

            {allowReminders && (
                <div className="mt-4 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)]/45 p-3">
                    <div className="flex items-center gap-2">
                        <BellPlus size={14} className="text-[var(--ac-accent)]" />
                        <strong className="text-xs">
                            {ar ? 'متابعة وتذكير' : 'Follow-up reminder'}
                        </strong>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <input
                            type="datetime-local"
                            value={reminderAt}
                            onChange={(event) =>
                                setReminderAt(
                                    event.target.value,
                                )}
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-xs text-[var(--ac-text)]"
                        />
                        <input
                            value={reminderNote}
                            onChange={(event) =>
                                setReminderNote(
                                    event.target.value,
                                )}
                            placeholder={ar ? 'مثال: اتصل بالعميل بخصوص العرض' : 'Example: call customer about the quote'}
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                        />
                        <button
                            type="button"
                            disabled={busy || ! reminderAt}
                            onClick={() => void addReminder()}
                            className={button + ' md:col-span-2 md:justify-self-start'}
                        >
                            <BellPlus size={12} />
                            {ar ? 'ذكرني' : 'Remind me'}
                        </button>
                    </div>

                    {(data?.reminders ?? []).length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {data?.reminders.map((reminder) => (
                                <div
                                    key={reminder.id}
                                    className="flex items-center gap-2 rounded-[11px] bg-[var(--ac-surface-soft)] px-3 py-2"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[10px] font-semibold">
                                            {reminder.note || (ar ? 'متابعة' : 'Follow up')}
                                        </p>
                                        <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                            {new Date(reminder.due_at).toLocaleString()}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                            void action(() =>
                                                apiRequest(
                                                    base
                                                    + '/reminders/'
                                                    + String(reminder.id)
                                                    + '/complete',
                                                    {
                                                        method: 'PATCH',
                                                    },
                                                ),
                                            )}
                                        className="flex size-8 items-center justify-center rounded-[9px] border border-emerald-400/20 text-emerald-300 transition hover:bg-emerald-500/10"
                                    >
                                        <CheckCircle2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {allowRelationships && type === 'party' && (
                <div className="mt-4 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)]/45 p-3">
                    <div className="flex items-center gap-2">
                        <Link2 size={14} className="text-[var(--ac-accent)]" />
                        <strong className="text-xs">
                            {ar ? 'روابط الأشخاص والشركات' : 'People & company links'}
                        </strong>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <div className="relative md:col-span-2">
                            <input
                                value={relationshipSearch}
                                onChange={(event) =>
                                    setRelationshipSearch(
                                        event.target.value,
                                    )}
                                placeholder={ar ? 'ابحث عن الشخص/الشركة…' : 'Search person/company…'}
                                className="h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                            />
                            {relationshipOptions.length > 0 && (
                                <select
                                    value={relationshipPartyId}
                                    onChange={(event) =>
                                        setRelationshipPartyId(
                                            event.target.value,
                                        )}
                                    className="mt-2 h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2 text-xs"
                                >
                                    <option value="">
                                        {ar ? 'اختر نتيجة' : 'Choose result'}
                                    </option>
                                    {relationshipOptions.map((option) => (
                                        <option key={option.id} value={option.id}>
                                            {option.name}
                                            {option.email ? ' · ' + option.email : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <input
                            value={relationshipTitle}
                            onChange={(event) =>
                                setRelationshipTitle(
                                    event.target.value,
                                )}
                            placeholder={ar ? 'المسمى: مدير مشتريات' : 'Title: Purchasing manager'}
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        />

                        <input
                            value={relationshipDepartment}
                            onChange={(event) =>
                                setRelationshipDepartment(
                                    event.target.value,
                                )}
                            placeholder={ar ? 'القسم' : 'Department'}
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        />

                        <button
                            type="button"
                            disabled={busy || ! relationshipPartyId}
                            onClick={() => void addRelationship()}
                            className={button + ' md:col-span-2 md:justify-self-start'}
                        >
                            <Plus size={12} />
                            {ar ? 'ربط' : 'Link'}
                        </button>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {(data?.relationships ?? []).map((link) => (
                            <div
                                key={link.id}
                                className="flex items-center gap-3 rounded-[12px] bg-[var(--ac-surface-soft)] p-3"
                            >
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                    {link.person_party_id === recordId
                                        ? <Building2 size={14} />
                                        : <UserRound size={14} />}
                                </span>

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-semibold">
                                        {link.person_party_id === recordId
                                            ? link.company_name
                                            : link.person_name}
                                    </p>
                                    <p className="mt-0.5 truncate text-[9px] text-[var(--ac-text-muted)]">
                                        {[link.title, link.department]
                                            .filter(Boolean)
                                            .join(' · ')
                                            || (ar ? 'علاقة عمل' : 'Business relationship')}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        void action(() =>
                                            apiRequest(
                                                base
                                                + '/relationships/'
                                                + String(link.id),
                                                {
                                                    method: 'DELETE',
                                                },
                                            ),
                                        )}
                                    className="flex size-8 items-center justify-center rounded-[9px] border border-transparent text-[var(--ac-text-muted)] transition hover:border-red-400/25 hover:bg-red-500/10 hover:text-red-300"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {preview && (
                <AttachmentPreview
                    attachment={preview}
                    ar={ar}
                    onClose={() => setPreview(null)}
                />
            )}
        </section>
    );
}

function AttachmentPreview({
    attachment,
    ar,
    onClose,
}: {
    attachment: CollaborationData['attachments'][number];
    ar: boolean;
    onClose: () => void;
}) {
    if (typeof document === 'undefined') {
        return null;
    }

    const image =
        attachment.mime_type?.startsWith('image/')
        ?? false;
    const pdf =
        attachment.mime_type === 'application/pdf';

    return createPortal(
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label={ar ? 'إغلاق' : 'Close'}
                className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                onClick={onClose}
            />

            <section className="relative z-10 flex h-[min(86vh,900px)] w-[min(94vw,1100px)] flex-col overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[0_30px_100px_rgba(0,0,0,.35)]">
                <header className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] px-4 py-3">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                            {attachment.original_name}
                        </p>
                        <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                            {attachment.mime_type ?? 'file'}
                            {' · '}
                            {formatBytes(attachment.size_bytes)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-9 items-center justify-center rounded-[10px] hover:bg-[var(--ac-surface-soft)]"
                    >
                        <X size={15} />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-auto bg-[var(--ac-bg)] p-3">
                    {image ? (
                        <img
                            src={attachment.preview_url}
                            alt={attachment.original_name}
                            className="mx-auto max-h-full max-w-full rounded-[12px] object-contain"
                        />
                    ) : pdf ? (
                        <iframe
                            title={attachment.original_name}
                            src={attachment.preview_url}
                            className="h-full min-h-[65vh] w-full rounded-[12px] bg-white"
                        />
                    ) : (
                        <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
                            <FileText size={34} className="text-[var(--ac-accent)]" />
                            <p className="mt-3 text-sm font-semibold">
                                {ar
                                    ? 'المعاينة داخل AccoNova متاحة للصور وPDF.'
                                    : 'In-app preview is available for images and PDF files.'}
                            </p>
                            <a
                                href={attachment.preview_url}
                                target="_blank"
                                rel="noreferrer"
                                className={button + ' mt-4'}
                            >
                                {ar ? 'فتح الملف' : 'Open file'}
                            </a>
                        </div>
                    )}
                </div>
            </section>
        </div>,
        document.body,
    );
}

function formatBytes(
    bytes: number,
): string {
    if (bytes < 1024) {
        return bytes + ' B';
    }

    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }

    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
