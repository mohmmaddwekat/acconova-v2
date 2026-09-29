import { router, usePage } from '@inertiajs/react';
import {
    Bot,
    ExternalLink,
    LoaderCircle,
    MessageCircle,
    Plus,
    Send,
    Sparkles,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from 'react';

import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';

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
};

type PageContext = {
    url: string;
    title: string;
    section: string | null;
    entity_type: string | null;
    entity_id: string | null;
    headings: string[];
    visible_text: string;
};

const conversationStorageKey = 'acconova.ai.sidekick.conversation';
const openStorageKey = 'acconova.ai.sidekick.open';

function inferPageContext(): PageContext {
    const pathname = window.location.pathname;
    const path = `${pathname}${window.location.search}`;
    const parts = pathname.split('/').filter(Boolean);
    const appParts = parts[0] === 'app' ? parts.slice(1) : parts;
    const section = appParts[0] ?? null;

    let entityType: string | null = null;
    let entityId: string | null = null;

    const routePatterns: Array<[
        RegExp,
        string,
    ]> = [
        [/^\/app\/invoices\/sales\/(\d+)/, 'sales_invoice'],
        [/^\/app\/invoices\/purchases\/(\d+)/, 'purchase_invoice'],
        [/^\/app\/payments\/(\d+)/, 'payment'],
        [/^\/app\/receipts\/(\d+)/, 'receipt'],
        [/^\/app\/parties\/(\d+)/, 'party'],
        [/^\/app\/products\/(\d+)/, 'product'],
        [/^\/app\/tasks\/(\d+)/, 'task'],
    ];

    for (const [pattern, type] of routePatterns) {
        const match = pathname.match(pattern);

        if (match) {
            entityType = type;
            entityId = match[1] ?? null;
            break;
        }
    }

    const headings = Array.from(
        document.querySelectorAll<HTMLElement>('main h1, main h2'),
    )
        .map(element => element.innerText.trim())
        .filter(Boolean)
        .slice(0, 8);

    const main = document.querySelector<HTMLElement>('main');
    const visibleText = (main?.innerText ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000);

    return {
        url: path.slice(0, 500),
        title: document.title.slice(0, 200),
        section,
        entity_type: entityType,
        entity_id: entityId,
        headings,
        visible_text: visibleText,
    };
}

export function AiSidekick() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const page = usePage();
    const pathname = page.url.split('?')[0];
    const hiddenOnFullAssistant = pathname === '/app/ai';

    const [authorized, setAuthorized] = useState(false);
    const [status, setStatus] = useState<AiStatus | null>(null);
    const [open, setOpen] = useState(() => {
        try {
            return sessionStorage.getItem(openStorageKey) === '1';
        } catch {
            return false;
        }
    });
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [activeId, setActiveId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const context = useMemo(
        () => inferPageContext(),
        [page.url, open],
    );

    useEffect(() => {
        const controller = new AbortController();

        apiRequest<{ data: AiStatus }>('/api/ai/status', {
            signal: controller.signal,
        })
            .then(response => {
                setStatus(response.data);
                setAuthorized(true);
            })
            .catch(() => {
                if (! controller.signal.aborted) {
                    setAuthorized(false);
                }
            });

        return () => controller.abort();
    }, []);

    useEffect(() => {
        try {
            sessionStorage.setItem(openStorageKey, open ? '1' : '0');
        } catch {
            // Session persistence is optional.
        }
    }, [open]);

    useEffect(() => {
        if (! open || loaded || ! authorized) {
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setError('');

        apiRequest<{ data: Conversation[] }>('/api/ai/conversations', {
            signal: controller.signal,
        })
            .then(async response => {
                let preferredId: number | null = null;

                try {
                    const stored = localStorage.getItem(conversationStorageKey);
                    preferredId = stored ? Number(stored) : null;
                } catch {
                    preferredId = null;
                }

                const preferred = response.data.find(
                    conversation => conversation.id === preferredId,
                );
                const conversation = preferred ?? response.data[0] ?? null;

                if (! conversation) {
                    setLoaded(true);
                    return;
                }

                setActiveId(conversation.id);
                await loadConversation(conversation.id, controller.signal);
                setLoaded(true);
            })
            .catch((failure: unknown) => {
                if (! controller.signal.aborted) {
                    setError(
                        failure instanceof ApiError
                            ? failure.message
                            : ar
                                ? 'تعذر تحميل المساعد.'
                                : 'Could not load the assistant.',
                    );
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [open, loaded, authorized, ar]);

    useEffect(() => {
        if (open) {
            window.setTimeout(() => textareaRef.current?.focus(), 120);
        }
    }, [open]);

    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages, sending, open]);

    async function loadConversation(
        conversationId: number,
        signal?: AbortSignal,
    ): Promise<void> {
        const response = await apiRequest<{
            data: {
                conversation: Conversation;
                messages: Message[];
            };
        }>(`/api/ai/conversations/${conversationId}`, { signal });

        setMessages(
            response.data.messages.filter(message => message.role !== 'system'),
        );

        try {
            localStorage.setItem(
                conversationStorageKey,
                String(conversationId),
            );
        } catch {
            // Conversation persistence is optional.
        }
    }

    async function createConversation(
        firstMessage: string,
    ): Promise<number> {
        const response = await apiRequest<{ data: Conversation }>(
            '/api/ai/conversations',
            {
                method: 'POST',
                body: JSON.stringify({
                    title: firstMessage.slice(0, 80),
                }),
            },
        );

        setActiveId(response.data.id);

        try {
            localStorage.setItem(
                conversationStorageKey,
                String(response.data.id),
            );
        } catch {
            // Conversation persistence is optional.
        }

        return response.data.id;
    }

    async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const message = draft.trim();

        if (! message || sending || ! status?.configured) {
            return;
        }

        setSending(true);
        setError('');
        setDraft('');

        let conversationId = activeId;

        try {
            if (! conversationId) {
                conversationId = await createConversation(message);
            }

            setMessages(current => [
                ...current,
                {
                    id: -Date.now(),
                    role: 'user',
                    content: message,
                    created_at: new Date().toISOString(),
                },
            ]);

            await apiRequest(
                `/api/ai/conversations/${conversationId}/messages`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        message,
                        page_context: inferPageContext(),
                    }),
                },
            );

            await loadConversation(conversationId);
        } catch (failure) {
            if (conversationId) {
                await loadConversation(conversationId).catch(() => undefined);
            }

            setError(
                failure instanceof ApiError
                    ? failure.message
                    : ar
                        ? 'تعذر إرسال الرسالة.'
                        : 'Could not send the message.',
            );
        } finally {
            setSending(false);
        }
    }

    function newConversation(): void {
        setActiveId(null);
        setMessages([]);
        setDraft('');
        setError('');

        try {
            localStorage.removeItem(conversationStorageKey);
        } catch {
            // Conversation persistence is optional.
        }

        window.setTimeout(() => textareaRef.current?.focus(), 50);
    }

    if (! authorized || hiddenOnFullAssistant) {
        return null;
    }

    return (
        <div data-ai-sidekick>
            {open && (
                <section
                    aria-label={ar ? 'مساعد AccoNova' : 'AccoNova assistant'}
                    className="fixed bottom-[5.35rem] right-3 z-[90] flex h-[min(680px,72dvh)] w-[calc(100vw-1.5rem)] max-w-[400px] flex-col overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-2xl sm:right-6 sm:w-[400px]"
                >
                    <header className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                <Sparkles size={17} />
                            </span>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold">
                                    AccoNova AI
                                </p>
                                <p className="truncate text-[10px] text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'يفهم الصفحة التي تعمل عليها الآن'
                                        : 'Understands the page you are working on'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={newConversation}
                                title={ar ? 'محادثة جديدة' : 'New chat'}
                                className="flex size-8 items-center justify-center rounded-lg text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
                            >
                                <Plus size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => router.visit('/app/ai')}
                                title={ar ? 'فتح المساعد الكامل' : 'Open full assistant'}
                                className="flex size-8 items-center justify-center rounded-lg text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
                            >
                                <ExternalLink size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label={ar ? 'إغلاق المساعد' : 'Close assistant'}
                                className="flex size-8 items-center justify-center rounded-lg text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </header>

                    <div className="border-b border-[var(--ac-line)] bg-[var(--ac-bg-soft)] px-4 py-2.5">
                        <div className="flex items-center gap-2 text-[10px] text-[var(--ac-text-muted)]">
                            <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                            <span className="truncate">
                                {ar ? 'السياق الحالي:' : 'Current context:'}{' '}
                                <strong className="font-semibold text-[var(--ac-text)]">
                                    {context.headings[0]
                                        || context.section
                                        || (ar ? 'الصفحة الحالية' : 'Current page')}
                                </strong>
                            </span>
                        </div>
                    </div>

                    <div
                        ref={scrollRef}
                        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
                    >
                        {loading ? (
                            <div className="flex h-full min-h-44 items-center justify-center text-[var(--ac-text-muted)]">
                                <LoaderCircle size={20} className="animate-spin" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
                                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                    <Bot size={22} />
                                </span>
                                <p className="text-sm font-bold">
                                    {ar ? 'كيف أساعدك في هذه الصفحة؟' : 'How can I help on this page?'}
                                </p>
                                <p className="mt-2 max-w-[280px] text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'اسأل عن البيانات الظاهرة، الأخطاء، الخطوة التالية، أو اطلب تحليل السجل الذي تعمل عليه.'
                                        : 'Ask about visible data, errors, the next step, or request analysis of the record you are viewing.'}
                                </p>
                            </div>
                        ) : (
                            messages.map(message => (
                                <div
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
                                            'max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-xs leading-5',
                                            message.role === 'user'
                                                ? 'bg-[var(--ac-accent)] text-white'
                                                : 'border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] text-[var(--ac-text)]',
                                        ].join(' ')}
                                    >
                                        {message.content}
                                    </div>
                                </div>
                            ))
                        )}

                        {sending && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-2 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] px-3.5 py-2.5 text-xs text-[var(--ac-text-muted)]">
                                    <LoaderCircle size={13} className="animate-spin" />
                                    {ar ? 'يحلل الصفحة…' : 'Analyzing the page…'}
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="mx-4 mb-2 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] leading-4 text-red-400">
                            {error}
                        </div>
                    )}

                    {! status?.configured && (
                        <div className="mx-4 mb-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[10px] leading-4 text-amber-500">
                            {ar
                                ? 'AccoNova AI غير متاح حاليًا.'
                                : 'AccoNova AI is currently unavailable.'}
                        </div>
                    )}

                    <form
                        onSubmit={event => void send(event)}
                        className="border-t border-[var(--ac-line)] bg-[var(--ac-surface)] p-3"
                    >
                        <div className="flex items-end gap-2 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] p-2 focus-within:border-[var(--ac-accent)]">
                            <textarea
                                ref={textareaRef}
                                value={draft}
                                onChange={event => setDraft(event.target.value)}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' && ! event.shiftKey) {
                                        event.preventDefault();
                                        event.currentTarget.form?.requestSubmit();
                                    }
                                }}
                                rows={1}
                                maxLength={12000}
                                placeholder={ar ? 'اسأل عن هذه الصفحة…' : 'Ask about this page…'}
                                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-xs text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-text-muted)]"
                            />
                            <button
                                type="submit"
                                disabled={! draft.trim() || sending || ! status?.configured}
                                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ac-accent)] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={ar ? 'إرسال' : 'Send'}
                            >
                                {sending
                                    ? <LoaderCircle size={15} className="animate-spin" />
                                    : <Send size={15} />}
                            </button>
                        </div>
                    </form>
                </section>
            )}

            <button
                type="button"
                onClick={() => setOpen(current => ! current)}
                aria-label={open
                    ? (ar ? 'إغلاق مساعد AccoNova' : 'Close AccoNova assistant')
                    : (ar ? 'فتح مساعد AccoNova' : 'Open AccoNova assistant')}
                title={ar ? 'اسأل AccoNova AI' : 'Ask AccoNova AI'}
                className="fixed bottom-5 right-4 z-[91] flex size-14 items-center justify-center rounded-full border border-[var(--ac-line)] bg-[var(--ac-accent)] text-white shadow-xl transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-[var(--ac-accent)]/20 sm:bottom-6 sm:right-6"
            >
                {open
                    ? <X size={22} />
                    : <MessageCircle size={22} />}
                {! open && (
                    <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-[var(--ac-surface)] bg-emerald-500" />
                )}
            </button>
        </div>
    );
}
