import { AppShell } from '@/layouts/AppShell';
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
    Bot,
    CircleAlert,
    ImagePlus,
    LoaderCircle,
    MessageSquare,
    Plus,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
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

type Conversation = {
    id: number;
    title: string | null;
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
            setMessages([]);
            return;
        }

        const controller = new AbortController();
        setError('');

        apiRequest<{
            data: {
                conversation: Conversation;
                messages: Message[];
            };
        }>(`/api/ai/conversations/${activeId}`, {
            signal: controller.signal,
        })
            .then(response => setMessages(response.data.messages))
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

    function newConversation(): void {
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
            };
        }>(`/api/ai/conversations/${conversationId}`);

        setMessages(response.data.messages);
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

    async function send(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        const message = draft.trim();
        const effectiveMessage = message || (
            ar
                ? 'حلل هذه الصورة وساعدني بناءً على ما يظهر فيها.'
                : 'Analyze this image and help me based on what is visible.'
        );

        if (
            (! message && ! image)
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
                    }),
                },
            );

            setDraft('');
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

                        <button
                            type="button"
                            onClick={newConversation}
                            className={outlineButton}
                        >
                            <Plus size={15} />
                            {ar ? 'محادثة جديدة' : 'New chat'}
                        </button>
                    </header>

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

                    <section className="grid min-h-[660px] overflow-hidden rounded-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)] lg:grid-cols-[300px_minmax(0,1fr)]">
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
                                            || (! draft.trim() && ! image)
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
                    </section>
                </div>
            </main>
        </AppShell>
    );
}
