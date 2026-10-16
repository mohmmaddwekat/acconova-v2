import { AppShell } from '@/layouts/AppShell';
import { AiUsagePanel } from '@/components/ai/AiUsagePanel';
import {
    aiImageErrorMessage,
    aiMessageHasImage,
    prepareAiImage,
    visibleAiMessageContent,
    type AiPreparedImage,
} from '@/lib/ai-image';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import {
    BarChart3,
    Bot,
    CircleAlert,
    FileUp,
    ImagePlus,
    ListChecks,
    LoaderCircle,
    MessageSquare,
    Plus,
    Receipt,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
    Undo2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from 'react';

type WorkTask = {
    id: number;
    position: number;
    title: string;
    status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'cancelled';
    note: string | null;
};

type Conversation = {
    id: number;
    title: string | null;
    mode?: 'chat' | 'work';
    last_message_at: string | null;
    created_at: string;
};

type Message = {
    id: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
};

type AiStatus = {
    configured: boolean;
    memory: {
        recent_messages: number;
        summarize_after_messages: number;
    };
    vision?: {
        enabled: boolean;
        max_images_per_message: number;
        max_upload_bytes: number;
        detail: string;
    };
};

type ImportFile = {
    name: string;
    mime: string;
    dataUrl: string;
    bytes: number;
};

const IMPORT_MIME_BY_EXTENSION: Record<string, string> = {
    csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pdf: 'application/pdf',
    json: 'application/json',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};

const IMPORT_MAX_BYTES = 1_000_000;

type ImportDraft = {
    id: number;
    file_name: string;
    target_entity: string | null;
    status: 'draft' | 'confirmed' | 'committed' | 'cancelled' | 'rolled_back';
    rows: number;
    processed: number;
    summary: { created?: number; updated?: number; skipped?: number };
    rollback: { removed: number; restored: number } | null;
};

const outlineButton =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--ac-line)] bg-transparent px-3 py-2 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-button-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45';

export default function AiAssistant() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const [status, setStatus] = useState<AiStatus | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState('');
    const [image, setImage] = useState<AiPreparedImage | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [preparingImage, setPreparingImage] = useState(false);
    const [error, setError] = useState('');
    const [importDrafts, setImportDrafts] = useState<ImportDraft[]>([]);
    const [tasks, setTasks] = useState<WorkTask[]>([]);
    const [newMode, setNewMode] = useState<'chat' | 'work'>('chat');
    const [rollingBack, setRollingBack] = useState<number | null>(null);
    const [importFile, setImportFile] = useState<ImportFile | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const activeConversation = useMemo(
        () => conversations.find(item => item.id === activeId) ?? null,
        [conversations, activeId],
    );
    const visionEnabled = status?.vision?.enabled !== false;

    useEffect(() => {
        const controller = new AbortController();

        Promise.all([
            apiRequest<{ data: AiStatus }>('/api/ai/status', {
                signal: controller.signal,
            }),
            apiRequest<{ data: Conversation[] }>('/api/ai/conversations', {
                signal: controller.signal,
            }),
        ])
            .then(([statusResponse, conversationResponse]) => {
                setStatus(statusResponse.data);
                setConversations(conversationResponse.data);

                const first = conversationResponse.data[0];
                if (first) setActiveId(first.id);
            })
            .catch((failure: unknown) => {
                if (! controller.signal.aborted) {
                    setError(
                        failure instanceof ApiError
                            ? failure.message
                            : ar
                                ? 'تعذر تحميل مساعد الذكاء الاصطناعي.'
                                : 'Could not load the AI assistant.',
                    );
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [ar]);

    useEffect(() => {
        if (! activeId) {
            setImportDrafts([]);
            return;
        }

        let cancelled = false;
        const load = () => apiRequest<{ data: ImportDraft[] }>(
            `/api/ai/conversations/${activeId}/import-drafts`,
        )
            .then(response => {
                if (! cancelled) setImportDrafts(response.data);
            })
            .catch(() => undefined);

        void load();
        // Commits run inside the message request, so poll while it is in flight.
        const timer = sending ? window.setInterval(load, 1500) : undefined;

        return () => {
            cancelled = true;
            if (timer) window.clearInterval(timer);
        };
    }, [activeId, messages.length, sending]);

    useEffect(() => {
        if (! activeId || ! sending || activeConversation?.mode !== 'work') {
            return;
        }

        // Steps run inside the message request, so poll the plan while it is in flight.
        const timer = window.setInterval(() => {
            apiRequest<{ data: WorkTask[] }>(`/api/ai/conversations/${activeId}/tasks`)
                .then(response => setTasks(response.data))
                .catch(() => undefined);
        }, 1500);

        return () => window.clearInterval(timer);
    }, [activeId, sending, activeConversation?.mode]);

    async function cancelPlan(): Promise<void> {
        if (! activeId) {
            return;
        }

        try {
            await apiRequest(`/api/ai/conversations/${activeId}/tasks/cancel`, { method: 'POST' });
            setTasks(current => current.map(task => (['pending', 'in_progress', 'blocked'].includes(task.status) ? { ...task, status: 'cancelled' } : task)));
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : ar ? 'تعذر إلغاء الخطة.' : 'Could not cancel the plan.');
        }
    }

    const visibleDrafts = importDrafts.filter(item => item.status !== 'cancelled').slice(0, 5);
    const pendingDraft = importDrafts.find(item => item.status === 'draft' && item.target_entity !== null);

    async function rollbackImport(draftId: number): Promise<void> {
        if (! window.confirm(ar
            ? 'التراجع عن هذا الاستيراد؟ ستُؤرشف السجلات المضافة وتُستعاد القيم القديمة.'
            : 'Undo this import? Created records are archived and updated ones restored.')) {
            return;
        }

        setRollingBack(draftId);
        setError('');

        try {
            await apiRequest(`/api/ai/import-drafts/${draftId}/rollback`, {
                method: 'POST',
            });
            setImportDrafts(current => current.map(item =>
                item.id === draftId ? { ...item, status: 'rolled_back' } : item,
            ));
        } catch (failure) {
            setError(failure instanceof ApiError
                ? failure.message
                : ar ? 'تعذر التراجع عن الاستيراد.' : 'Could not undo the import.');
        } finally {
            setRollingBack(null);
        }
    }

    useEffect(() => {
        if (! activeId) {
            setMessages([]);
            return;
        }

        const controller = new AbortController();
        setError('');

        apiRequest<{
            data: {
                conversation: Conversation;
                messages: Message[];
                tasks?: WorkTask[];
            };
        }>(`/api/ai/conversations/${activeId}`, {
            signal: controller.signal,
        })
            .then(response => {
                setMessages(response.data.messages);
                setTasks(response.data.tasks ?? []);
            })
            .catch((failure: unknown) => {
                if (! controller.signal.aborted) {
                    setError(
                        failure instanceof ApiError
                            ? failure.message
                            : ar
                                ? 'تعذر تحميل المحادثة.'
                                : 'Could not load the conversation.',
                    );
                }
            });

        return () => controller.abort();
    }, [activeId, ar]);

    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages, sending]);

    function clearImage(): void {
        setImage(null);
        if (imageInputRef.current) imageInputRef.current.value = '';
    }

    function newConversation(mode: 'chat' | 'work' = 'chat'): void {
        setNewMode(mode);
        setTasks([]);
        setActiveId(null);
        setMessages([]);
        setDraft('');
        setError('');
        clearImage();
    }

    async function createConversation(
        firstMessage?: string,
    ): Promise<Conversation> {
        const response = await apiRequest<{ data: Conversation }>(
            '/api/ai/conversations',
            {
                method: 'POST',
                body: JSON.stringify({
                    title: firstMessage ? firstMessage.slice(0, 80) : null,
                    mode: newMode,
                }),
            },
        );

        setConversations(current => [response.data, ...current]);
        setActiveId(response.data.id);
        return response.data;
    }

    async function refreshConversation(
        conversationId: number,
    ): Promise<void> {
        const response = await apiRequest<{
            data: {
                conversation: Conversation;
                messages: Message[];
                tasks?: WorkTask[];
            };
        }>(`/api/ai/conversations/${conversationId}`);

        setMessages(response.data.messages);
        setTasks(response.data.tasks ?? []);
        setConversations(current =>
            current
                .map(item =>
                    item.id === conversationId
                        ? response.data.conversation
                        : item,
                )
                .sort((a, b) =>
                    (b.last_message_at ?? b.created_at).localeCompare(
                        a.last_message_at ?? a.created_at,
                    ),
                ),
        );
    }

    async function chooseImage(
        event: ChangeEvent<HTMLInputElement>,
    ): Promise<void> {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (! file) return;

        setPreparingImage(true);
        setError('');

        try {
            setImage(await prepareAiImage(file));
        } catch (failure) {
            setImage(null);
            setError(aiImageErrorMessage(failure, ar));
        } finally {
            setPreparingImage(false);
        }
    }

    async function chooseImportFile(
        event: ChangeEvent<HTMLInputElement>,
    ): Promise<void> {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (! file) return;

        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const mime = IMPORT_MIME_BY_EXTENSION[extension] ?? '';

        if (! mime) {
            setError(ar
                ? 'نوع الملف غير مدعوم. استخدم CSV أو Excel أو PDF أو JSON أو صورة.'
                : 'Unsupported file type. Use CSV, Excel, PDF, JSON, or an image.');
            return;
        }

        if (file.size > IMPORT_MAX_BYTES) {
            setError(ar
                ? 'الملف أكبر من 1MB. قسّمه إلى ملفات أصغر.'
                : 'The file is larger than 1MB. Split it into smaller files.');
            return;
        }

        setError('');

        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        }).catch(() => '');

        if (! dataUrl) {
            setError(ar ? 'تعذر قراءة الملف.' : 'Could not read the file.');
            return;
        }

        setImportFile({ name: file.name, mime, dataUrl, bytes: file.size });
    }

    function send(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        return submit();
    }

    async function submit(override?: string): Promise<void> {
        const message = (override ?? draft).trim();
        const effectiveMessage = message || (
            importFile
                ? (ar ? 'استورد بيانات هذا الملف.' : 'Import the data in this file.')
                : ar
                    ? 'حلل هذه الصورة وساعدني بناءً على ما يظهر فيها.'
                    : 'Analyze this image and help me based on what is visible.'
        );

        if (
            (! message && ! image && ! importFile)
            || sending
            || preparingImage
            || ! status?.configured
        ) {
            return;
        }

        setSending(true);
        setError('');

        let conversationId = activeId;

        try {
            if (! conversationId) {
                const conversation = await createConversation(effectiveMessage);
                conversationId = conversation.id;
            }

            setMessages(current => [
                ...current,
                {
                    id: -Date.now(),
                    role: 'user',
                    content: effectiveMessage,
                    created_at: new Date().toISOString(),
                },
            ]);

            await apiRequest(
                `/api/ai/conversations/${conversationId}/messages`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        message: effectiveMessage,
                        image: image
                            ? {
                                data_url: image.dataUrl,
                                name: image.name,
                                mime: image.mime,
                            }
                            : null,
                        import_file: importFile
                            ? {
                                data_url: importFile.dataUrl,
                                name: importFile.name,
                                mime: importFile.mime,
                            }
                            : null,
                    }),
                },
            );

            setDraft('');
            setImportFile(null);
            clearImage();
            await refreshConversation(conversationId);
        } catch (failure) {
            if (conversationId) {
                await refreshConversation(conversationId)
                    .catch(() => undefined);
            }

            setError(
                failure instanceof ApiError
                    ? failure.message
                    : ar
                        ? 'تعذر إرسال الرسالة إلى AccoNova AI.'
                        : 'Could not send the message to AccoNova AI.',
            );
        } finally {
            setSending(false);
        }
    }

    async function removeConversation(
        conversation: Conversation,
    ): Promise<void> {
        const approved = window.confirm(
            ar
                ? 'حذف هذه المحادثة نهائيًا؟'
                : 'Delete this conversation permanently?',
        );

        if (! approved) return;

        try {
            await apiRequest(`/api/ai/conversations/${conversation.id}`, {
                method: 'DELETE',
            });

            const remaining = conversations.filter(
                item => item.id !== conversation.id,
            );
            setConversations(remaining);

            if (activeId === conversation.id) {
                setActiveId(remaining[0]?.id ?? null);
                setMessages([]);
            }
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : ar
                        ? 'تعذر حذف المحادثة.'
                        : 'Could not delete the conversation.',
            );
        }
    }

    return (
        <AppShell>
            <Head title="AccoNova AI" />

            <main className="min-h-[calc(100dvh-72px)] bg-[var(--ac-bg)] px-4 py-5 text-[var(--ac-text)] sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
                    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                        <div className="flex items-center gap-4">
                            <span className="flex size-12 items-center justify-center rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                <Sparkles size={21} />
                            </span>

                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                                        AccoNova AI
                                    </h1>
                                    <span className="rounded-full border border-[var(--ac-line)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--ac-text-muted)]">
                                        {status?.configured
                                            ? (ar ? 'جاهز' : 'Ready')
                                            : (ar ? 'غير متاح حاليًا' : 'Unavailable')}
                                    </span>
                                </div>

                                <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'مساعد ذكي يفهم بيانات العمل ويمكنه تحليل صورة مضغوطة مرة واحدة بدون إعادة دفع تكلفة الصورة في كل سؤال.'
                                        : 'A business-aware assistant that can analyze one compressed image once without paying the image cost again on every follow-up.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => newConversation('chat')}
                                className={outlineButton}
                            >
                                <Plus size={15} />
                                {ar ? 'محادثة جديدة' : 'New chat'}
                            </button>
                            <button
                                type="button"
                                onClick={() => newConversation('work')}
                                className={outlineButton}
                            >
                                <ListChecks size={15} />
                                {ar ? 'جلسة عمل جديدة' : 'New work session'}
                            </button>
                        </div>
                    </header>

                    <AiUsagePanel
                        ar={ar}
                        conversationId={activeId}
                        refreshKey={messages.length}
                    />

                    {! status?.configured && ! loading && (
                        <section className="flex items-start gap-3 rounded-[18px] border border-amber-400/30 bg-amber-500/10 p-4">
                            <CircleAlert
                                size={18}
                                className="mt-0.5 shrink-0 text-amber-500"
                            />
                            <div>
                                <p className="text-sm font-semibold">
                                    {ar
                                        ? 'AccoNova AI غير متاح حاليًا.'
                                        : 'AccoNova AI is currently unavailable.'}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'حاول مرة أخرى لاحقًا أو تحقق من إعداد مزود الذكاء الاصطناعي.'
                                        : 'Try again later or check the AI provider configuration.'}
                                </p>
                            </div>
                        </section>
                    )}

                    {error && (
                        <div
                            role="alert"
                            className="rounded-[16px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                        >
                            {error}
                        </div>
                    )}

                    <section className="grid min-h-[660px] overflow-hidden rounded-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)] lg:grid-cols-[250px_minmax(0,1fr)_290px]">
                        <aside className="border-b border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 lg:border-b-0 lg:border-e">
                            <div className="flex items-center justify-between px-2 py-2">
                                <div>
                                    <p className="text-xs font-bold">
                                        {ar ? 'المحادثات' : 'Conversations'}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-[var(--ac-text-muted)]">
                                        {ar
                                            ? 'ذاكرة محفوظة لكل مستخدم'
                                            : 'Private memory per user'}
                                    </p>
                                </div>
                                <MessageSquare
                                    size={16}
                                    className="text-[var(--ac-accent)]"
                                />
                            </div>

                            <div className="mt-2 max-h-[220px] space-y-1.5 overflow-y-auto lg:max-h-[570px]">
                                {loading ? (
                                    <div className="flex items-center justify-center py-10 text-[var(--ac-text-muted)]">
                                        <LoaderCircle
                                            size={18}
                                            className="animate-spin"
                                        />
                                    </div>
                                ) : conversations.length === 0 ? (
                                    <p className="rounded-[14px] border border-dashed border-[var(--ac-line)] px-3 py-6 text-center text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                        {ar
                                            ? 'لا توجد محادثات بعد. ابدأ أول سؤال.'
                                            : 'No conversations yet. Start with your first question.'}
                                    </p>
                                ) : (
                                    conversations.map(conversation => (
                                        <div
                                            key={conversation.id}
                                            className={[
                                                'group flex items-center gap-1 rounded-[14px] border p-1 transition',
                                                activeId === conversation.id
                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                                    : 'border-transparent hover:border-[var(--ac-line)] hover:bg-[var(--ac-surface)]',
                                            ].join(' ')}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveId(conversation.id);
                                                    clearImage();
                                                }}
                                                className="min-w-0 flex-1 px-2 py-2 text-start"
                                            >
                                                <p className="truncate text-xs font-semibold">
                                                    {conversation.mode === 'work' && (
                                                        <span className="me-1.5 rounded-full bg-[var(--ac-accent-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--ac-accent)]">
                                                            {ar ? 'عمل' : 'Work'}
                                                        </span>
                                                    )}
                                                    {conversation.title
                                                        || (ar ? 'محادثة جديدة' : 'New conversation')}
                                                </p>
                                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                    {new Date(
                                                        conversation.last_message_at
                                                        ?? conversation.created_at,
                                                    ).toLocaleString()}
                                                </p>
                                            </button>

                                            <button
                                                type="button"
                                                aria-label={ar ? 'حذف المحادثة' : 'Delete conversation'}
                                                onClick={() => void removeConversation(conversation)}
                                                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] opacity-60 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </aside>

                        <div className="flex min-h-[620px] min-w-0 flex-col">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ac-line)] px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <span className="flex size-9 items-center justify-center rounded-xl border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] text-[var(--ac-accent)]">
                                        <Bot size={17} />
                                    </span>
                                    <div>
                                        <p className="text-xs font-bold">
                                            {activeConversation?.title
                                                || (ar ? 'محادثة جديدة' : 'New conversation')}
                                        </p>
                                        <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                            {ar
                                                ? 'مساعد AccoNova الذكي'
                                                : 'AccoNova intelligent assistant'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 rounded-xl border border-[var(--ac-line)] px-3 py-2 text-[10px] text-[var(--ac-text-muted)]">
                                    <ShieldCheck
                                        size={13}
                                        className="text-[var(--ac-accent)]"
                                    />
                                    {ar
                                        ? 'نفس صلاحيات المستخدم'
                                        : 'User permissions enforced'}
                                </div>
                            </div>

                            <div
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto px-4 py-6 sm:px-7"
                            >
                                {messages.length === 0 ? (
                                    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
                                        <span className="flex size-16 items-center justify-center rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                            <Sparkles size={26} />
                                        </span>
                                        <h2 className="mt-5 text-lg font-bold">
                                            {ar
                                                ? 'شو بدك تعرف عن شغلك اليوم؟'
                                                : 'What do you want to understand about your business today?'}
                                        </h2>
                                        <p className="mt-2 max-w-lg text-xs leading-6 text-[var(--ac-text-muted)]">
                                            {ar
                                                ? 'ارفع صورة فاتورة أو إيصال أو شاشة إذا احتجت. نضغطها تلقائيًا ونستخدم تحليل منخفض التفاصيل مرة واحدة، ثم نحفظ النتيجة النصية فقط للمحادثة.'
                                                : 'Upload an invoice, receipt, or screenshot when useful. It is compressed automatically, analyzed once at low detail, then only the text observation remains in chat context.'}
                                        </p>
                                        <div className="mt-6 grid w-full max-w-xl gap-3 sm:grid-cols-3">
                                            {[
                                                { icon: FileUp, title: ar ? 'استورد ملف' : 'Import a file', hint: ar ? 'عملاء، منتجات، موظفون' : 'Parties, products, staff', action: () => importInputRef.current?.click() },
                                                { icon: Receipt, title: ar ? 'الفواتير المتأخرة' : 'Overdue invoices', hint: ar ? 'من الأقدم للأحدث' : 'Oldest first', action: () => void submit(ar ? 'اعرض الفواتير المتأخرة.' : 'Show my overdue invoices.') },
                                                { icon: BarChart3, title: ar ? 'ملخص المبيعات' : 'Sales summary', hint: ar ? 'هذا الشهر' : 'This month', action: () => void submit(ar ? 'أعطني ملخص المبيعات لهذا الشهر.' : 'Give me the sales summary for this month.') },
                                            ].map(card => (
                                                <button
                                                    key={card.title}
                                                    type="button"
                                                    onClick={card.action}
                                                    disabled={sending || ! status?.configured}
                                                    className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-start transition hover:border-[var(--ac-accent)] hover:shadow-[var(--ac-shadow-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                                                >
                                                    <card.icon size={18} className="text-[var(--ac-accent)]" />
                                                    <p className="mt-2 text-xs font-bold">{card.title}</p>
                                                    <p className="mt-0.5 text-[10px] text-[var(--ac-text-muted)]">{card.hint}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mx-auto max-w-3xl space-y-5">
                                        {messages
                                            .filter(message => message.role !== 'system')
                                            .map(message => (
                                                <article
                                                    key={message.id}
                                                    className={[
                                                        'flex',
                                                        message.role === 'user'
                                                            ? 'justify-end'
                                                            : 'justify-start',
                                                    ].join(' ')}
                                                >
                                                    <div
                                                        className={[
                                                            'max-w-[88%] rounded-[20px] border px-4 py-3 text-sm leading-6 sm:max-w-[78%]',
                                                            message.role === 'user'
                                                                ? 'border-[var(--ac-accent)]/40 bg-[var(--ac-accent-soft)]'
                                                                : 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)]',
                                                        ].join(' ')}
                                                    >
                                                        {aiMessageHasImage(message.content) && (
                                                            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--ac-accent)]">
                                                                <ImagePlus size={13} />
                                                                {ar
                                                                    ? 'صورة تم تحليلها مرة واحدة وحفظ وصفها النصي'
                                                                    : 'Image analyzed once; text observation saved'}
                                                            </div>
                                                        )}
                                                        <p className="whitespace-pre-wrap break-words">
                                                            {visibleAiMessageContent(message.content)}
                                                        </p>
                                                    </div>
                                                </article>
                                            ))}

                                        {pendingDraft && ! sending && (
                                            <div className="max-w-[92%] rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]">
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="text-xs font-bold">{pendingDraft.file_name}</p>
                                                    <span className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--ac-accent)]">
                                                        {ar ? `مسودة · ${pendingDraft.rows} صف` : `Draft · ${pendingDraft.rows} rows`}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-[11px] text-[var(--ac-text-muted)]">
                                                    {ar ? 'اختر ماذا يحدث للسجلات الموجودة مسبقًا، وسيؤكد المساعد الاستيراد.' : 'Choose what happens to records that already exist; the assistant will confirm the import.'}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <button type="button" className={outlineButton} onClick={() => void submit(ar ? 'أكّد الاستيراد وتخطَّ السجلات المكررة.' : 'Confirm the import and skip duplicate records.')}>
                                                        {ar ? 'تخطي المكرر' : 'Skip duplicates'}
                                                    </button>
                                                    <button type="button" className={outlineButton} onClick={() => void submit(ar ? 'أكّد الاستيراد وحدّث السجلات المكررة.' : 'Confirm the import and update duplicate records.')}>
                                                        {ar ? 'تحديث المكرر' : 'Update duplicates'}
                                                    </button>
                                                    <button type="button" className={outlineButton} onClick={() => void submit(ar ? 'ألغِ هذا الاستيراد.' : 'Cancel this import.')}>
                                                        {ar ? 'إلغاء' : 'Cancel'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {sending && (
                                            <div className="flex justify-start">
                                                <div className="flex items-center gap-2 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 text-xs text-[var(--ac-text-muted)]">
                                                    <LoaderCircle
                                                        size={14}
                                                        className="animate-spin"
                                                    />
                                                    {image
                                                        ? (ar ? 'يحلل الصورة مرة واحدة ثم يجهز الرد…' : 'Analyzing the image once, then preparing the answer…')
                                                        : (ar ? 'AccoNova AI يفكر…' : 'AccoNova AI is thinking…')}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <form
                                onSubmit={event => void send(event)}
                                className="border-t border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 sm:p-5"
                            >
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={event => void chooseImage(event)}
                                />

                                <input
                                    ref={importInputRef}
                                    type="file"
                                    accept=".csv,.xlsx,.xls,.pdf,.json,image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={event => void chooseImportFile(event)}
                                />

                                {importFile && (
                                    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-2.5">
                                        <FileUp size={18} className="shrink-0 text-[var(--ac-accent)]" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-semibold">{importFile.name}</p>
                                            <p className="mt-0.5 text-[10px] text-[var(--ac-text-muted)]">
                                                {Math.max(1, Math.round(importFile.bytes / 1024))} KB · {ar ? 'ستظهر لك معاينة قبل أي حفظ' : 'You will see a preview before anything is saved'}
                                            </p>
                                        </div>
                                        <button type="button" onClick={() => setImportFile(null)} className="flex size-8 shrink-0 items-center justify-center rounded-xl text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-red-400" aria-label={ar ? 'إزالة الملف' : 'Remove file'}>
                                            <X size={15} />
                                        </button>
                                    </div>
                                )}

                                {image && (
                                    <div className="mx-auto mb-2 flex max-w-3xl items-center gap-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-2.5">
                                        <img
                                            src={image.dataUrl}
                                            alt=""
                                            className="size-14 shrink-0 rounded-xl object-cover"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-semibold">
                                                {image.name}
                                            </p>
                                            <p className="mt-0.5 text-[10px] leading-4 text-[var(--ac-text-muted)]">
                                                {Math.max(1, Math.round(image.bytes / 1024))} KB · {image.width}×{image.height} · {ar
                                                    ? 'مضغوطة تلقائيًا، صورة واحدة، تحليل منخفض التكلفة مرة واحدة فقط'
                                                    : 'auto-compressed, one image, one low-cost analysis only'}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={clearImage}
                                            className="flex size-8 shrink-0 items-center justify-center rounded-xl text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-red-400"
                                            aria-label={ar ? 'إزالة الصورة' : 'Remove image'}
                                        >
                                            <X size={15} />
                                        </button>
                                    </div>
                                )}

                                <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-2 focus-within:border-[var(--ac-accent)]">
                                    <button
                                        type="button"
                                        onClick={() => imageInputRef.current?.click()}
                                        disabled={
                                            ! visionEnabled
                                            || sending
                                            || preparingImage
                                            || Boolean(image)
                                            || ! status?.configured
                                        }
                                        className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-line)] bg-transparent text-[var(--ac-accent)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)] disabled:cursor-not-allowed disabled:opacity-35"
                                        title={ar ? 'إرفاق صورة' : 'Attach image'}
                                    >
                                        {preparingImage ? (
                                            <LoaderCircle
                                                size={17}
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <ImagePlus size={18} />
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => importInputRef.current?.click()}
                                        disabled={sending || Boolean(importFile) || ! status?.configured}
                                        className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-line)] bg-transparent text-[var(--ac-accent)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)] disabled:cursor-not-allowed disabled:opacity-35"
                                        title={ar ? 'استيراد ملف (CSV، Excel، PDF)' : 'Import a file (CSV, Excel, PDF)'}
                                    >
                                        <FileUp size={18} />
                                    </button>

                                    <textarea
                                        value={draft}
                                        onChange={event => setDraft(event.target.value)}
                                        onKeyDown={event => {
                                            if (
                                                event.key === 'Enter'
                                                && ! event.shiftKey
                                            ) {
                                                event.preventDefault();
                                                event.currentTarget.form?.requestSubmit();
                                            }
                                        }}
                                        rows={2}
                                        maxLength={12000}
                                        disabled={sending || ! status?.configured}
                                        placeholder={
                                            status?.configured
                                                ? (ar
                                                    ? 'اسأل AccoNova AI أو أرفق صورة…'
                                                    : 'Ask AccoNova AI or attach an image…')
                                                : (ar
                                                    ? 'AccoNova AI غير متاح حاليًا…'
                                                    : 'AccoNova AI is currently unavailable…')
                                        }
                                        className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--ac-text-muted)] disabled:cursor-not-allowed"
                                    />

                                    <button
                                        type="submit"
                                        disabled={
                                            sending
                                            || preparingImage
                                            || (! draft.trim() && ! image && ! importFile)
                                            || ! status?.configured
                                        }
                                        className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-accent)] bg-transparent text-[var(--ac-accent)] transition hover:bg-[var(--ac-accent-soft)] disabled:cursor-not-allowed disabled:opacity-35"
                                        aria-label={ar ? 'إرسال' : 'Send'}
                                    >
                                        {sending ? (
                                            <LoaderCircle
                                                size={17}
                                                className="animate-spin"
                                            />
                                        ) : (
                                            <Send size={17} />
                                        )}
                                    </button>
                                </div>

                                <p className="mx-auto mt-2 max-w-3xl px-1 text-[9px] leading-4 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'لتقليل التكلفة: صورة واحدة فقط لكل رسالة، تضغط إلى ≤ 1024px وأقل من 1MB، وترسل إلى Vision بتفاصيل منخفضة مرة واحدة فقط. الأسئلة التالية تستخدم الوصف النصي المحفوظ.'
                                        : 'Cost control: one image per message, compressed to ≤1024px and under 1MB, sent to low-detail vision once. Follow-ups reuse the saved text observation.'}
                                </p>
                            </form>
                        </div>

                        <aside className="border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 lg:border-s lg:border-t-0">
                            {(activeConversation?.mode === 'work' || tasks.length > 0 || (! activeId && newMode === 'work')) && (
                                <div className="mb-4">
                                    <div className="flex items-center justify-between px-2 py-2">
                                        <p className="text-xs font-bold">{ar ? 'خطة العمل' : 'Work plan'}</p>
                                        {tasks.some(task => ['pending', 'in_progress', 'blocked'].includes(task.status)) && (
                                            <button type="button" className="text-[10px] font-semibold text-[var(--ac-text-muted)] hover:text-red-500" onClick={() => void cancelPlan()}>
                                                {ar ? 'إلغاء الخطة' : 'Cancel plan'}
                                            </button>
                                        )}
                                    </div>
                                    {tasks.length === 0 && (
                                        <p className="rounded-[14px] border border-dashed border-[var(--ac-line)] px-3 py-5 text-center text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                            {ar ? 'جلسة عمل: اكتب المهمة وسأقسمها إلى خطوات وأنفذها واحدة واحدة.' : 'Work session: describe the job and I will split it into steps and run them one by one.'}
                                        </p>
                                    )}
                                    <ol className="space-y-1.5">
                                        {tasks.map(task => (
                                            <li key={task.id} className="flex gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 py-2 text-[11px]">
                                                <span aria-hidden className="mt-0.5 shrink-0">
                                                    {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '◐' : task.status === 'blocked' ? '!' : task.status === 'cancelled' ? '✕' : '○'}
                                                </span>
                                                <span className={'min-w-0 flex-1 ' + (task.status === 'done' ? 'text-[var(--ac-text-muted)] line-through' : task.status === 'blocked' ? 'font-semibold text-amber-700' : '')}>
                                                    {task.title}
                                                    {task.status === 'blocked' && (
                                                        <span className="mt-0.5 block text-[10px] font-normal">{ar ? 'بانتظار ردك أو موافقتك' : 'Waiting for your answer or approval'}</span>
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                    {tasks.some(task => task.status === 'pending') && ! sending && (
                                        <button type="button" className={`${outlineButton} mt-2 w-full`} onClick={() => void submit(ar ? 'تابع' : 'continue')}>
                                            {ar ? 'تابع الخطوات' : 'Continue'}
                                        </button>
                                    )}
                                </div>
                            )}

                            <p className="px-2 py-2 text-xs font-bold">{ar ? 'الاستيراد' : 'Imports'}</p>
                            <div className="mt-1 space-y-2.5">
                                {visibleDrafts.length === 0 && (
                                    <p className="rounded-[14px] border border-dashed border-[var(--ac-line)] px-3 py-6 text-center text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                        {ar ? 'لا توجد عمليات استيراد في هذه المحادثة. ارفع ملفًا لتبدأ.' : 'No imports in this chat yet. Upload a file to start.'}
                                    </p>
                                )}
                                {visibleDrafts.map(item => (
                                    <div key={item.id} className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                                        <p className="truncate text-xs font-bold">{item.file_name}</p>
                                        <p className="mt-0.5 text-[10px] text-[var(--ac-text-muted)]">
                                            {item.target_entity ?? (ar ? 'بانتظار التصنيف' : 'Awaiting classification')} · {ar ? `${item.rows} صف` : `${item.rows} rows`}
                                        </p>
                                        {item.status === 'draft' && (
                                            <>
                                                <progress className="mt-2 h-1.5 w-full" max={item.rows} value={item.processed} />
                                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                    {item.processed > 0 ? `${item.processed} / ${item.rows}` : (ar ? 'بانتظار موافقتك' : 'Waiting for your approval')}
                                                </p>
                                            </>
                                        )}
                                        {item.status === 'committed' && (
                                            <>
                                                <p className="mt-2 text-[11px]">
                                                    {ar
                                                        ? `أنشئ ${item.summary.created ?? 0} · حدّث ${item.summary.updated ?? 0} · تخطى ${item.summary.skipped ?? 0}`
                                                        : `Created ${item.summary.created ?? 0} · updated ${item.summary.updated ?? 0} · skipped ${item.summary.skipped ?? 0}`}
                                                </p>
                                                <button type="button" className={`${outlineButton} mt-2 w-full`} disabled={rollingBack === item.id} onClick={() => void rollbackImport(item.id)}>
                                                    <Undo2 size={13} />
                                                    {ar ? 'تراجع عن الاستيراد' : 'Undo import'}
                                                </button>
                                            </>
                                        )}
                                        {item.status === 'rolled_back' && (
                                            <p className="mt-2 text-[11px] text-[var(--ac-text-muted)]">
                                                {ar
                                                    ? `تم التراجع · أُرشف ${item.rollback?.removed ?? 0} · استُعيد ${item.rollback?.restored ?? 0}`
                                                    : `Rolled back · archived ${item.rollback?.removed ?? 0} · restored ${item.rollback?.restored ?? 0}`}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </aside>
                    </section>
                </div>
            </main>
        </AppShell>
    );
}
