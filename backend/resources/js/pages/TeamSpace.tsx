import { ConversationDetails, type ConversationSettings } from '@/features/team-space/ConversationDetails';
import { MemberActions, MessagingDialog } from '@/features/team-space/MemberActions';
import { deviceEnabled, deviceKey, deviceSupported } from '@/lib/deviceNotifications';
import {
    createConversation,
    deleteConversationMessage,
    fetchConversations,
    fetchConversationThread,
    fetchTeamPeople,
    reactToConversationMessage,
    sendConversationMessage,
    setConversationArchived,
    updateConversationMembers,
    updateConversationMessage,
} from '@/features/team-space/api';
import type {
    Conversation,
    ConversationFilter,
    ConversationKind,
    MessageAttachment,
    TeamMessage,
    TeamPerson,
    ThreadResponse,
} from '@/features/team-space/types';
import {
    AppShell,
} from '@/layouts/AppShell';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Crown,
    ExternalLink,
    Link2,
    Mic,
    MoreHorizontal,
    Pencil,
    Pin,
    Plus,
    Copy,
    Reply,
    Search,
    SmilePlus,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
} from 'react';

const inputClass =
    'w-full rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:bg-[var(--ac-surface)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]';

const secondaryButton =
    'inline-flex items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3.5 py-2.5 text-xs font-semibold transition hover:-translate-y-px hover:bg-[var(--ac-accent-soft)] disabled:cursor-not-allowed disabled:opacity-40';

const primaryButton =
    'inline-flex items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-strong)] px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-40';

const reactions = [
    '👍',
    '❤️',
    '😂',
    '🎉',
    '😮',
    '😢',
] as const;

/**
 * Read a conversation ID passed by the global messages popover.
 */
function initialConversationId(): number | null {
    const value =
        new URLSearchParams(
            window.location.search,
        ).get(
            'conversation',
        );

    const parsed =
        Number(
            value,
        );

    return Number.isInteger(
        parsed,
    )
        && parsed >
            0
        ? parsed
        : null;
}

/**
 * Convert API failures into one readable message.
 */
function errorText(
    error: unknown,
): string {
    if (
        error instanceof
        ApiError
    ) {
        return [
            error.message,
            ...Object.values(
                error.errors,
            ).flat(),
        ]
            .filter(
                Boolean,
            )
            .join(
                ' ',
            );
    }

    return error instanceof
        Error
        ? error.message
        : 'Failed';
}

/**
 * Build compact initials.
 */
function avatarTone(seed: number | string): string {
    let sum = 0;

    for (const char of String(seed)) {
        sum += char.charCodeAt(0);
    }

    return ['', 'a2', 'a3', 'a4', 'a5'][sum % 5];
}

function initials(
    value: string,
): string {
    return value
        .trim()
        .split(
            /\s+/,
        )
        .slice(
            0,
            2,
        )
        .map(
            (
                part,
            ) =>
                part.charAt(
                    0,
                ),
        )
        .join(
            '',
        )
        .toUpperCase();
}

/**
 * Format compact conversation/message time.
 */
function formatTime(
    value: string | null,
    ar: boolean,
): string {
    if (
        ! value
    ) {
        return '';
    }

    const date =
        new Date(
            value,
        );

    if (
        Number.isNaN(
            date.getTime(),
        )
    ) {
        return value;
    }

    return new Intl.DateTimeFormat(
        ar
            ? 'ar'
            : 'en',
        {
            hour:
                'numeric',
            minute:
                '2-digit',
        },
    ).format(
        date,
    );
}

/**
 * Return the first HTTP(S) URL found inside a message.
 */
function firstMessageUrl(
    body: string,
): URL | null {
    const match =
        body.match(
            /https?:\/\/[^\s]+/i,
        );

    if (
        ! match
    ) {
        return null;
    }

    try {
        const url =
            new URL(
                match[
                    0
                ],
            );

        return [
            'http:',
            'https:',
        ].includes(
            url.protocol,
        )
            ? url
            : null;
    } catch {
        return null;
    }
}

/**
 * Tell the global message bell to refresh.
 */
function notifyMessagingChanged(): void {
    window.dispatchEvent(
        new Event(
            'team-space-changed',
        ),
    );
}

/**
 * Render the current Organization's messaging workspace.
 */
export default function TeamSpacePage() {
    const locale =
        useLocale();

    const {
        auth,
        workspace,
    } =
        usePage<AppPageProps>().props;

    return (
        <MessagingWorkspace
            key={
                workspace
                    .activeOrganization
                    ?.id
            }
            ar={
                locale ===
                'ar'
            }
            userId={
                auth.user?.id
                ?? 0
            }
        />
    );
}

/**
 * Render direct messages and private team groups.
 */
function MessagingWorkspace({
    ar,
    userId,
}: {
    ar: boolean;
    userId: number;
}) {
    const { workspace } = usePage<AppPageProps>().props;
    const notificationKey = deviceKey(userId, workspace.activeOrganization?.id ?? 0);
    const [notificationsEnabled, setNotificationsEnabled] = useState(() => deviceEnabled(notificationKey));
    const [notificationHint, setNotificationHint] = useState('');
    async function enableNotifications(): Promise<void> {
        if (!deviceSupported()) { setNotificationHint(ar ? 'إشعارات المتصفح غير مدعومة هنا.' : 'Device notifications are unavailable.'); return; }
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') { localStorage.setItem(notificationKey, 'on'); setNotificationsEnabled(true); }
            else { setNotificationHint(ar ? 'اسمح بالإشعارات من إعدادات المتصفح. إشعارات الجرس تبقى فعالة.' : 'Allow notifications in browser settings. In-app alerts remain active.'); }
        } catch { setNotificationHint(ar ? 'تعذر تفعيل إشعارات الجهاز.' : 'Unable to enable device notifications.'); }
    }
    const composerRef = useRef<HTMLTextAreaElement>(null);
    const threadScrollRef = useRef<HTMLDivElement>(null);
    const membersSectionRef = useRef<HTMLDivElement>(null);

    const fileInputRef =
        useRef<HTMLInputElement>(
            null,
        );

    const mediaRecorderRef =
        useRef<MediaRecorder | null>(
            null,
        );

    const audioStreamRef =
        useRef<MediaStream | null>(
            null,
        );

    const recordedChunksRef =
        useRef<Blob[]>(
            [],
        );

    const [
        conversations,
        setConversations,
    ] =
        useState<Conversation[]>(
            [],
        );

    const [
        selectedId,
        setSelectedId,
    ] =
        useState<number | null>(
            initialConversationId,
        );

    const [
        thread,
        setThread,
    ] =
        useState<ThreadResponse | null>(
            null,
        );

    const [
        people,
        setPeople,
    ] =
        useState<TeamPerson[]>(
            [],
        );

    const [
        search,
        setSearch,
    ] =
        useState(
            '',
        );

    const [
        threadSearch,
        setThreadSearch,
    ] =
        useState(
            '',
        );

    const [
        searchInsideConversation,
        setSearchInsideConversation,
    ] =
        useState(
            false,
        );

    const [
        filter,
        setFilter,
    ] =
        useState<ConversationFilter>(
            'all',
        );

    const [
        canCreateGroup,
        setCanCreateGroup,
    ] =
        useState(
            false,
        );

    const [
        revision,
        setRevision,
    ] =
        useState(
            0,
        );

    const [
        threadRevision,
        setThreadRevision,
    ] =
        useState(
            0,
        );

    const [
        peopleRevision,
        setPeopleRevision,
    ] =
        useState(
            0,
        );

    const [
        createOpen,
        setCreateOpen,
    ] =
        useState(
            false,
        );

    const [
        createKind,
        setCreateKind,
    ] =
        useState<ConversationKind>(
            'direct',
        );

    const [
        memberIds,
        setMemberIds,
    ] =
        useState<number[]>(
            [],
        );

    const [
        messageBody,
        setMessageBody,
    ] =
        useState(
            '',
        );

    const [
        pendingFiles,
        setPendingFiles,
    ] =
        useState<File[]>(
            [],
        );

    const [replyingTo, setReplyingTo] = useState<TeamMessage | null>(null);

    const [
        recording,
        setRecording,
    ] =
        useState(
            false,
        );

    const [
        recordingSeconds,
        setRecordingSeconds,
    ] =
        useState(
            0,
        );

    const [
        editingMessage,
        setEditingMessage,
    ] =
        useState<TeamMessage | null>(
            null,
        );

    const [
        detailsOpen,
        setDetailsOpen,
    ] =
        useState(
            () => window.matchMedia('(min-width: 1280px)').matches,
        );

    const [
        membersOpen,
        setMembersOpen,
    ] =
        useState(
            true,
        );

    const [
        ,
        setMoreOpen,
    ] =
        useState(
            false,
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        error,
        setError,
    ] =
        useState(
            '',
        );

    const copy =
        ar
            ? {
                  title:
                      'الرسائل',

                  subtitle:
                      'محادثات الفريق والرسائل المباشرة في مكان واحد.',

                  active:
                      'نشطون الآن',

                  newMessage:
                      'رسالة جديدة',

                  newGroup:
                      'مجموعة جديدة',

                  all:
                      'الكل',

                  direct:
                      'المباشرة',

                  groups:
                      'المجموعات',

                  unread:
                      'غير المقروءة',

                  archived:
                      'الأرشيف',

                  search:
                      'البحث في المحادثات…',

                  searchInside:
                      'البحث داخل المحادثة…',

                  important:
                      'غير مقروءة',

                  conversations:
                      'جميع المحادثات',

                  noConversation:
                      'اختر محادثة أو ابدأ محادثة جديدة.',

                  noConversationHelp:
                      'تقدر تراسل موظف مباشرة أو تنشئ مجموعة خاصة إذا عندك الصلاحية.',

                  messagePlaceholder:
                      'اكتب رسالة…',

                  send:
                      'إرسال',

                  members:
                      'الأعضاء',

                  online:
                      'متصل الآن',

                  onlineCount:
                      'متصل',

                  sharedMedia:
                      'الوسائط المشتركة',

                  sharedAudio:
                      'الرسائل الصوتية',

                  groupPrivacy:
                      'المحادثة خاصة ولا يمكن رؤيتها إلا من أعضاء المجموعة.',

                  directPrivacy:
                      'محادثة خاصة بين المشاركين فقط.',

                  createConversation:
                      'بدء المحادثة',

                  person:
                      'اختر الموظف',

                  groupName:
                      'اسم المجموعة',

                  description:
                      'وصف المجموعة',

                  chooseMembers:
                      'اختر أعضاء المجموعة',

                  cancel:
                      'إلغاء',

                  saveMembers:
                      'حفظ الأعضاء',

                  edit:
                      'تعديل',

                  removeForMe:
                      'حذف عندي',

                  unsend:
                      'إلغاء الإرسال للجميع',

                  deleted:
                      'تم إلغاء إرسال هذه الرسالة',

                  recording:
                      'جارٍ تسجيل رسالة صوتية',

                  stop:
                      'إيقاف',

                  invalidAttachment:
                      'يمكن إرسال الصور والفيديو والصوت فقط، وبحد أقصى 50MB لكل ملف.',

                  tooManyAttachments:
                      'يمكن إرسال 5 مرفقات كحد أقصى في الرسالة الواحدة.',

                  microphoneError:
                      'تعذر الوصول إلى المايكروفون. تأكد من السماح للمتصفح باستخدامه.',

                  groupPermission:
                      'إنشاء المجموعات متاح لمن لديه صلاحية الإدارة فقط.',

                  directConversation:
                      'محادثة مباشرة',

                  group:
                      'مجموعة خاصة',

                  today:
                      'اليوم',

                  noResults:
                      'لا توجد نتائج مطابقة.',

                  private:
                      'خاص',

                  admin:
                      'Admin',

                  about:
                      'حول المجموعة',

                  searchAction:
                      'بحث',

                  add:
                      'إضافة',

                  info:
                      'معلومات المحادثة',

                  hideInfo:
                      'إغلاق المعلومات',

                  archive:
                      'حذف المحادثة من قائمتي',

                  restore:
                      'إرجاع المحادثة من الأرشيف',

                  archiveConfirm:
                      'ستختفي المحادثة من قائمتك فقط وستبقى محفوظة في الأرشيف. متابعة؟',

                  reactions:
                      'تفاعل',

                  more:
                      'المزيد',

                  link:
                      'رابط مشترك',
              }
            : {
                  title:
                      'Messages',

                  subtitle:
                      'Team conversations and direct messages in one place.',

                  active:
                      'Active now',

                  newMessage:
                      'New message',

                  newGroup:
                      'New group',

                  all:
                      'All',

                  direct:
                      'Direct',

                  groups:
                      'Groups',

                  unread:
                      'Unread',

                  archived:
                      'Archived',

                  search:
                      'Search conversations…',

                  searchInside:
                      'Search this conversation…',

                  important:
                      'Unread',

                  conversations:
                      'All conversations',

                  noConversation:
                      'Choose a conversation or start a new one.',

                  noConversationHelp:
                      'Message an employee directly or create a private group when permitted.',

                  messagePlaceholder:
                      'Write a message…',

                  send:
                      'Send',

                  members:
                      'Members',

                  online:
                      'Online now',

                  onlineCount:
                      'online',

                  sharedMedia:
                      'Shared media',

                  sharedAudio:
                      'Voice messages',

                  groupPrivacy:
                      'Only group members can see this private conversation.',

                  directPrivacy:
                      'A private conversation visible only to its participants.',

                  createConversation:
                      'Start conversation',

                  person:
                      'Choose employee',

                  groupName:
                      'Group name',

                  description:
                      'Group description',

                  chooseMembers:
                      'Choose group members',

                  cancel:
                      'Cancel',

                  saveMembers:
                      'Save members',

                  edit:
                      'Edit',

                  removeForMe:
                      'Remove for me',

                  unsend:
                      'Unsend for everyone',

                  deleted:
                      'This message was unsent',

                  recording:
                      'Recording voice message',

                  stop:
                      'Stop',

                  invalidAttachment:
                      'Only images, video and audio up to 50MB per file are supported.',

                  tooManyAttachments:
                      'Up to 5 attachments are supported per message.',

                  microphoneError:
                      'Microphone access failed. Allow microphone access in the browser.',

                  groupPermission:
                      'Creating groups requires management permission.',

                  directConversation:
                      'Direct conversation',

                  group:
                      'Private group',

                  today:
                      'Today',

                  noResults:
                      'No matching results.',

                  private:
                      'Private',

                  admin:
                      'Admin',

                  about:
                      'About group',

                  searchAction:
                      'Search',

                  add:
                      'Add',

                  info:
                      'Conversation info',

                  hideInfo:
                      'Close info',

                  archive:
                      'Remove conversation from my list',

                  restore:
                      'Restore from archive',

                  archiveConfirm:
                      'This removes the conversation only from your list and keeps it in your archive. Continue?',

                  reactions:
                      'React',

                  more:
                      'More',

                  link:
                      'Shared link',
              };

    /**
     * Load normal or archived conversations.
     */
    useEffect(
        () => {
            const controller =
                new AbortController();

            const timer =
                window.setTimeout(
                    () => {
                        fetchConversations(
                            search,
                            50,
                            filter ===
                                'archived',
                        )
                            .then(
                                (
                                    response,
                                ) => {
                                    if (
                                        controller
                                            .signal
                                            .aborted
                                    ) {
                                        return;
                                    }

                                    setConversations(
                                        response
                                            .data
                                            .data,
                                    );

                                    setCanCreateGroup(
                                        response
                                            .can_create_group,
                                    );

                                    setSelectedId(
                                        (
                                            current,
                                        ) =>
                                            current
                                            ?? response
                                                .data
                                                .data[
                                                0
                                            ]
                                                ?.id
                                            ?? null,
                                    );
                                },
                            )
                            .catch(
                                (
                                    failure,
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
                            );
                    },
                    180,
                );

            return () => {
                controller.abort();

                window.clearTimeout(
                    timer,
                );
            };
        },
        [
            search,
            filter,
            revision,
        ],
    );

    /**
     * Poll lightweight inbox/presence state.
     */
    useEffect(
        () => {
            const timer =
                window.setInterval(
                () => document.hidden || setRevision(
                            (
                                current,
                            ) =>
                                current
                                + 1,
                        ),
                    10000,
                );

            return () =>
                window.clearInterval(
                    timer,
                );
        },
        [],
    );

    /**
     * Load Organization people and online status.
     */
    useEffect(
        () => {
            fetchTeamPeople()
                .then(
                    (
                        response,
                    ) =>
                        setPeople(
                            response.data,
                        ),
                )
                .catch(
                    (
                        failure,
                    ) =>
                        setError(
                            errorText(
                                failure,
                            ),
                        ),
                );
        },
        [
            peopleRevision,
        ],
    );

    /**
     * Refresh active people.
     */
    useEffect(
        () => {
            const timer =
                window.setInterval(
                () => document.hidden || setPeopleRevision(
                            (
                                current,
                            ) =>
                                current
                                + 1,
                        ),
                    15000,
                );

            return () =>
                window.clearInterval(
                    timer,
                );
        },
        [],
    );

    /**
     * Load the active conversation.
     */
    useEffect(
        () => {
            if (
                selectedId ===
                null
            ) {
                setThread(
                    null,
                );

                return;
            }

            const controller =
                new AbortController();

            fetchConversationThread(
                selectedId,
            )
                .then(
                    (
                        response,
                    ) => {
                        if (
                            controller
                                .signal
                                .aborted
                        ) {
                            return;
                        }

                        setThread(
                            response,
                        );

                        setMemberIds(
                            response.members.map(
                                (
                                    member,
                                ) =>
                                    member.id,
                            ),
                        );

                        setConversations(
                            (
                                current,
                            ) =>
                                current.map(
                                    (
                                        conversation,
                                    ) =>
                                        conversation.id ===
                                        selectedId
                                            ? {
                                                  ...conversation,

                                                  unread_count:
                                                      0,
                                              }
                                            : conversation,
                                ),
                        );

                        notifyMessagingChanged();
                    },
                )
                .catch(
                    (
                        failure,
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
                );

            return () =>
                controller.abort();
        },
        [
            selectedId,
            threadRevision,
        ],
    );

    /**
     * Poll the open conversation.
     */
    useEffect(
        () => {
            if (
                selectedId ===
                null
            ) {
                return;
            }

            const timer =
                window.setInterval(
                () => document.hidden || setThreadRevision(
                            (
                                current,
                            ) =>
                                current
                                + 1,
                        ),
                    5000,
                );

            return () =>
                window.clearInterval(
                    timer,
                );
        },
        [
            selectedId,
        ],
    );

    /**
     * Track voice recording duration.
     */
    useEffect(
        () => {
            if (
                ! recording
            ) {
                setRecordingSeconds(
                    0,
                );

                return;
            }

            const timer =
                window.setInterval(
                    () =>
                        setRecordingSeconds(
                            (
                                current,
                            ) =>
                                current
                                + 1,
                        ),
                    1000,
                );

            return () =>
                window.clearInterval(
                    timer,
                );
        },
        [
            recording,
        ],
    );

    /**
     * Release microphone resources on unmount.
     */
    useEffect(
        () => {
            return () => {
                audioStreamRef.current
                    ?.getTracks()
                    .forEach(
                        (
                            track,
                        ) =>
                            track.stop(),
                    );
            };
        },
        [],
    );

    const filteredConversations =
        useMemo(
            () =>
                conversations.filter(
                    (
                        conversation,
                    ) => {
                        if (
                            filter ===
                            'direct'
                        ) {
                            return conversation.kind ===
                                'direct';
                        }

                        if (
                            filter ===
                            'group'
                        ) {
                            return conversation.kind ===
                                'group';
                        }

                        if (
                            filter ===
                            'unread'
                        ) {
                            return conversation.unread_count >
                                0;
                        }

                        return true;
                    },
                ),
            [
                conversations,
                filter,
            ],
        );

    const activePeople =
        useMemo(
            () =>
                people.filter(
                    (
                        person,
                    ) =>
                        person.is_online,
                ),
            [
                people,
            ],
        );

    const selected =
        useMemo(
            () =>
                conversations.find(
                    (
                        conversation,
                    ) =>
                        conversation.id ===
                        selectedId,
                )
                ?? thread
                    ?.conversation
                ?? null,
            [
                conversations,
                selectedId,
                thread,
            ],
        );

    const onlineMemberCount =
        useMemo(
            () =>
                thread?.members.filter(
                    (
                        member,
                    ) =>
                        member.is_online,
                ).length
                ?? 0,
            [
                thread,
            ],
        );

    const allMemberChoices =
        useMemo(
            () => {
                const members =
                    new Map<number, TeamPerson>();

                people.forEach(
                    (
                        person,
                    ) =>
                        members.set(
                            person.id,
                            person,
                        ),
                );

                thread?.members.forEach(
                    (
                        person,
                    ) =>
                        members.set(
                            person.id,
                            person,
                        ),
                );

                return [
                    ...members.values(),
                ].sort(
                    (
                        first,
                        second,
                    ) =>
                        first.name.localeCompare(
                            second.name,
                        ),
                );
            },
            [
                people,
                thread,
            ],
        );

    const visibleMessages =
        useMemo(
            () => {
                const messages =
                    thread?.messages
                    ?? [];

                const query =
                    threadSearch
                        .trim()
                        .toLocaleLowerCase();

                if (
                    ! query
                ) {
                    return messages;
                }

                return messages.filter(
                    (
                        message,
                    ) =>
                        message.body
                            .toLocaleLowerCase()
                            .includes(
                                query,
                            )
                        || message.name
                            .toLocaleLowerCase()
                            .includes(
                                query,
                            )
                        || message.attachments.some(
                            (
                                attachment,
                            ) =>
                                attachment.name
                                    .toLocaleLowerCase()
                                    .includes(
                                        query,
                                    ),
                        ),
                );
            },
            [
                thread,
                threadSearch,
            ],
        );

    /**
     * Open the new-conversation modal.
     */
    function openCreate(
        kind:
            ConversationKind,
    ): void {
        setCreateKind(
            kind,
        );

        setCreateOpen(
            true,
        );

        setMoreOpen(
            false,
        );
    }

    /**
     * Start/reopen a direct conversation.
     */
    function openDirectConversation(id: number): void {
        setThread(null); setSelectedId(id); setFilter('all');
        setRevision((current) => current + 1); setThreadRevision((current) => current + 1);
    }

    async function startDirect(
        personId: number,
    ): Promise<void> {
        if (
            busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        try {
            const response =
                await createConversation({
                    kind:
                        'direct',

                    members: [
                        personId,
                    ],
                });

            setFilter(
                'all',
            );

            setThread(null);
            setSelectedId(
                response.id,
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            setThreadRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Create a direct conversation or managed group.
     */
    async function submitCreate(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
        ) {
            return;
        }

        const form =
            event.currentTarget;

        const data =
            new FormData(
                form,
            );

        const members =
            data
                .getAll(
                    'members',
                )
                .map(
                    Number,
                );

        setBusy(
            true,
        );

        setError(
            '',
        );

        try {
            const response =
                await createConversation({
                    kind:
                        createKind,

                    name:
                        createKind ===
                        'group'
                            ? String(
                                  data.get(
                                      'name',
                                  )
                                  ?? '',
                              )
                            : null,

                    description:
                        createKind ===
                        'group'
                            ? String(
                                  data.get(
                                      'description',
                                  )
                                  ?? '',
                              )
                              || null
                            : null,

                    members,
                });

            setSelectedId(
                response.id,
            );

            setCreateOpen(
                false,
            );

            setFilter(
                'all',
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            setThreadRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            notifyMessagingChanged();

            form.reset();
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Archive or restore the selected conversation only for this member.
     */
    async function changeArchiveState(
        archived: boolean,
    ): Promise<void> {
        if (
            ! selectedId
            || busy
        ) {
            return;
        }

        if (
            archived
            && ! window.confirm(
                copy.archiveConfirm,
            )
        ) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await setConversationArchived(
                selectedId,
                archived,
            );

            setSelectedId(
                null,
            );

            setThread(
                null,
            );

            setMoreOpen(
                false,
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            notifyMessagingChanged();
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Stage selected media.
     */
    function selectFiles(
        event:
            ChangeEvent<HTMLInputElement>,
    ): void {
        const files =
            Array.from(
                event.target.files
                ?? [],
            );

        event.target.value =
            '';

        const valid =
            files.filter(
                (
                    file,
                ) =>
                    (
                        file.type.startsWith(
                            'image/',
                        )
                        || file.type.startsWith(
                            'video/',
                        )
                        || file.type.startsWith(
                            'audio/',
                        )
                    )
                    && file.size <=
                        50
                        * 1024
                        * 1024,
            );

        if (
            valid.length !==
            files.length
        ) {
            setError(
                copy.invalidAttachment,
            );
        }

        setPendingFiles(
            (
                current,
            ) => {
                const combined = [
                    ...current,
                    ...valid,
                ];

                if (
                    combined.length >
                    5
                ) {
                    setError(
                        copy.tooManyAttachments,
                    );
                }

                return combined.slice(
                    0,
                    5,
                );
            },
        );
    }

    /**
     * Remove one staged attachment.
     */
    function removePendingFile(
        index: number,
    ): void {
        setPendingFiles(
            (
                current,
            ) =>
                current.filter(
                    (
                        _,
                        fileIndex,
                    ) =>
                        fileIndex !==
                        index,
                ),
        );
    }

    /**
     * Start recording one voice note.
     */
    async function startRecording(): Promise<void> {
        if (
            recording
        ) {
            return;
        }

        try {
            const stream =
                await navigator
                    .mediaDevices
                    .getUserMedia({
                        audio:
                            true,
                    });

            audioStreamRef.current =
                stream;

            recordedChunksRef.current =
                [];

            const mime =
                MediaRecorder.isTypeSupported(
                    'audio/webm;codecs=opus',
                )
                    ? 'audio/webm;codecs=opus'
                    : '';

            const recorder =
                mime
                    ? new MediaRecorder(
                          stream,
                          {
                              mimeType:
                                  mime,
                          },
                      )
                    : new MediaRecorder(
                          stream,
                      );

            mediaRecorderRef.current =
                recorder;

            /**
             * Collect microphone chunks.
             */
            recorder.ondataavailable =
                (
                    event,
                ): void => {
                    if (
                        event.data.size >
                        0
                    ) {
                        recordedChunksRef.current.push(
                            event.data,
                        );
                    }
                };

            /**
             * Convert the finished recording into a normal pending file.
             */
            recorder.onstop =
                (): void => {
                    const blob =
                        new Blob(
                            recordedChunksRef.current,
                            {
                                type:
                                    recorder
                                        .mimeType
                                    || 'audio/webm',
                            },
                        );

                    audioStreamRef.current
                        ?.getTracks()
                        .forEach(
                            (
                                track,
                            ) =>
                                track.stop(),
                        );

                    audioStreamRef.current =
                        null;

                    mediaRecorderRef.current =
                        null;

                    setRecording(
                        false,
                    );

                    if (
                        blob.size ===
                        0
                    ) {
                        return;
                    }

                    const file =
                        new File(
                            [
                                blob,
                            ],
                            `voice-${Date.now()}.webm`,
                            {
                                type:
                                    blob.type
                                    || 'audio/webm',
                            },
                        );

                    setPendingFiles(
                        (
                            current,
                        ) =>
                            current.length >=
                            5
                                ? current
                                : [
                                      ...current,
                                      file,
                                  ],
                    );
                };

            recorder.start(
                250,
            );

            setRecording(
                true,
            );
        } catch {
            setError(
                copy.microphoneError,
            );
        }
    }

    /**
     * Stop recording.
     */
    function stopRecording(): void {
        if (
            mediaRecorderRef.current
            && mediaRecorderRef.current.state !==
                'inactive'
        ) {
            mediaRecorderRef.current.stop();
        }
    }

    /**
     * Send one message.
     */
    async function submitMessage(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();
        if (thread?.restriction) { return; }

        if (
            ! selectedId
            || busy
            || (
                ! messageBody.trim()
                && pendingFiles.length ===
                    0
            )
        ) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await sendConversationMessage(
                selectedId,
                messageBody,
                pendingFiles,
                replyingTo?.id ?? null,
            );
            setReplyingTo(null);

            setMessageBody(
                '',
            );

            setPendingFiles(
                [],
            );

            setThreadRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            notifyMessagingChanged();
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Save an edited owned message.
     */
    async function submitEdit(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            ! selectedId
            || ! editingMessage
            || busy
        ) {
            return;
        }

        const body =
            String(
                new FormData(
                    event.currentTarget,
                ).get(
                    'body',
                )
                ?? '',
            ).trim();

        if (
            ! body
        ) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await updateConversationMessage(
                selectedId,
                editingMessage.id,
                body,
            );

            setEditingMessage(
                null,
            );

            setThreadRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Remove a message locally or unsend an owned message globally.
     */
    async function removeMessage(
        message:
            TeamMessage,
        mode:
            | 'for_me'
            | 'everyone',
    ): Promise<void> {
        if (
            ! selectedId
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await deleteConversationMessage(
                selectedId,
                message.id,
                mode,
            );

            setThreadRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            setRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );

            notifyMessagingChanged();
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    /**
     * Toggle one reaction.
     */
    async function reactToMessage(
        messageId: number,
        reaction: string,
    ): Promise<void> {
        if (
            ! selectedId
        ) {
            return;
        }

        try {
            await reactToConversationMessage(
                selectedId,
                messageId,
                reaction,
            );

            setThreadRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        }
    }

    /**
     * Toggle one group member.
     */
    function toggleMember(
        id: number,
    ): void {
        setMemberIds(
            (
                current,
            ) =>
                current.includes(
                    id,
                )
                    ? current.filter(
                          (
                              memberId,
                          ) =>
                              memberId !==
                              id,
                      )
                    : [
                          ...current,
                          id,
                      ],
        );
    }

    /**
     * Save managed-group members.
     */
    async function saveMembers(): Promise<void> {
        if (
            ! selectedId
            || ! thread
                ?.can_manage
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await updateConversationMembers(
                selectedId,
                memberIds,
            );

            setThreadRevision(
                (
                    current,
                ) =>
                    current
                    + 1,
            );
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    const [settingsRevision, setSettingsRevision] = useState(0);
    const [loadedSettings, setLoadedSettings] = useState<{ id: number; data: ConversationSettings } | null>(null);
    const conversationSettings = loadedSettings?.id === selectedId ? loadedSettings.data : null;
    const selectedChatThemeKey = conversationSettings?.theme ?? 'green';
    useEffect(() => {
        if (!selectedId) { return; }
        const controller = new AbortController();
        apiRequest<ConversationSettings>(`/api/team-space/${selectedId}/settings`, { signal: controller.signal })
            .then((data) => { if (!controller.signal.aborted) { setLoadedSettings({ id: selectedId, data }); } })
            .catch((failure) => { if (!controller.signal.aborted) { setError(errorText(failure)); } });
        return () => controller.abort();
    }, [selectedId, settingsRevision]);
    useEffect(() => { setReplyingTo(null); }, [selectedId]);
    async function pinMessage(message: TeamMessage): Promise<void> {
        try {
            await apiRequest(`/api/team-space/${message.conversation_id}/settings`, { method: 'POST', body: JSON.stringify({ action: 'pin', message_id: message.id, pinned: !message.pinned_at }) });
            setThreadRevision((current) => current + 1);
            setSettingsRevision((current) => current + 1);
        } catch (failure) { setError(errorText(failure)); }
    }

    const peopleMatches = search.trim() === ''
        ? []
        : people.filter((person) => person.id !== userId
            && person.name.toLowerCase().includes(search.trim().toLowerCase())
            && ! conversations.some((item) => item.kind === 'direct' && item.participant_user_id === person.id));

    const railPeople = [
        ...conversations
            .filter((item) => item.kind === 'direct' && !item.is_archived)
            .slice(0, 8)
            .map((item) => ({
                key: `c${item.id}`,
                label: item.display_name,
                online: item.is_online,
                unread: item.unread_count,
                active: item.id === selectedId,
                avatar: item.avatar_url,
                open: () => openDirectConversation(item.id),
            })),
        ...activePeople
            .filter((person) => !conversations.some((item) => item.kind === 'direct' && item.participant_user_id === person.id))
            .slice(0, 4)
            .map((person) => ({
                key: `p${person.id}`,
                label: person.name,
                online: true,
                unread: 0,
                active: false,
                avatar: null as string | null,
                open: () => { void startDirect(person.id); },
            })),
    ];

    return (
        <AppShell>
            <Head
                title={
                    copy.title
                }
            />

            <main className="ts" data-chat={['blue', 'purple', 'rose'].includes(selectedChatThemeKey) ? selectedChatThemeKey : 'default'}>
                {error && (
                    <div className="mb-4 flex items-start justify-between gap-4 rounded-[17px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <span>
                            {
                                error
                            }
                        </span>

                        <button
                            type="button"
                            onClick={() =>
                                setError(
                                    '',
                                )
                            }
                        >
                            <X
                                size={
                                    15
                                }
                            />
                        </button>
                    </div>
                )}

                <div className="contents">
                    <div className="box">
                        <nav aria-label={copy.active} className="rail">
                            

                            {railPeople.map((item) => (
                                <button
                                    type="button"
                                    key={item.key}
                                    className={[item.online ? 'on' : '', item.active ? 'sel' : ''].join(' ')}
                                    title={item.label}
                                    aria-label={item.label}
                                    aria-pressed={item.active}
                                    onClick={item.open}
                                >
                                    <span className={`av ${avatarTone(item.key)}`}>{item.avatar ? <img src={item.avatar} alt="" /> : initials(item.label)}</span>

                                    {item.unread > 0 && <span className="badge">{item.unread}</span>}
                                </button>
                            ))}
                        </nav>

                        <aside className="list" data-sel={selectedId ? 'true' : 'false'}>
                            <div className="lh">
                                <h2>{copy.title}</h2>

                                <button type="button" className="btn" disabled={! canCreateGroup} onClick={() => openCreate('group')}>
                                        <Plus size={16} />

                                        {ar ? 'مجموعة' : 'Group'}
                            </button>
                            </div>

                            <input className="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'ابحث' : 'Search'} aria-label={copy.search} />

                            <ConversationSection title="" conversations={filteredConversations} selectedId={selectedId} ar={ar} onSelect={setSelectedId} />

                            {peopleMatches.map((person) => (
                                <button type="button" key={`p${person.id}`} className="cv" onClick={() => void startDirect(person.id)}>
                                    <span className={`av ${avatarTone(person.id)}`}>{initials(person.name)}</span>

                                    <div>
                                        <b>{person.name}</b>

                                        <small>{ar ? 'ابدأ محادثة' : 'Start a conversation'}</small>
                                    </div>
                                </button>
                            ))}

                            {! filteredConversations.length && <p className="empty">{copy.noResults}</p>}
                        </aside>

                        <section className="main" data-sel={selectedId ? 'true' : 'false'}>
                            {selected
                                && thread ? (
                                <>
                                    <div className="shrink-0 ts-head">
                                        <header>
                                            <button type="button" className="ts-back" aria-label={copy.title} onClick={() => setSelectedId(null)}>
                                                {ar ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                                            </button>

                                            <div className="min-w-0">
                                                <h1>{selected.display_name}</h1>

                                                <p>
                                                    {selected.kind === 'group'
                                                        ? `${thread.members.length} ${copy.members}، ${onlineMemberCount} ${copy.onlineCount}`
                                                        : (selected.is_online ? copy.online : copy.directConversation)}
                                                </p>
                                            </div>

                                            <div className="stack">
                                                {thread.members.filter((member) => member.id !== userId).slice(0, 4).map((member) => (
                                                    <span key={member.id} className={`av ${avatarTone(member.id)}`} title={member.name}>{initials(member.name)}</span>
                                                ))}
                                            </div>

                                            <button type="button" className="ghost" onClick={() => setDetailsOpen((current) => ! current)}>
                                                {ar ? 'التفاصيل' : 'Details'}
                                            </button>
                                        </header>

                                        {searchInsideConversation && (
                                            <div className="border-t border-[var(--ac-line)] px-4 py-3">
                                                <div className="relative mx-auto max-w-xl">
                                                    <Search
                                                        size={
                                                            14
                                                        }
                                                        className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                                    />

                                                    <input
                                                        autoFocus
                                                        value={
                                                            threadSearch
                                                        }
                                                        onChange={(
                                                            event,
                                                        ) =>
                                                            setThreadSearch(
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                        }
                                                        placeholder={
                                                            copy.searchInside
                                                        }
                                                        className={`${inputClass} ps-10 pe-10`}
                                                    />

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSearchInsideConversation(
                                                                false,
                                                            );

                                                            setThreadSearch(
                                                                '',
                                                            );
                                                        }}
                                                        className="absolute end-3 top-1/2 -translate-y-1/2"
                                                    >
                                                        <X
                                                            size={
                                                                14
                                                            }
                                                        />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="th" ref={threadScrollRef}>
                                        <span className="day">{copy.today}</span>

                                        {visibleMessages.map(
                                                    (
                                                        message,
                                                    ) => (
                                                        <MessageBubble
                                                            nickname={conversationSettings?.nicknames[message.user_id] ?? undefined}
                                                            onPin={() => void pinMessage(message)}
                                                            viewerId={userId}
                                                            onDirect={openDirectConversation}
                                                            onMemberChanged={() => setThreadRevision((current) => current + 1)}
                                                            key={
                                                                message.id
                                                            }
                                                            message={
                                                                message
                                                            }
                                                            own={
                                                                message.user_id ===
                                                                userId
                                                            }
                                                            ar={
                                                                ar
                                                            }
                                                            deletedLabel={
                                                                copy.deleted
                                                            }
                                                            editLabel={
                                                                copy.edit
                                                            }
                                                            removeForMeLabel={
                                                                copy.removeForMe
                                                            }
                                                            unsendLabel={
                                                                copy.unsend
                                                            }
                                                            reactionLabel={
                                                                copy.reactions
                                                            }
                                                            sharedLinkLabel={
                                                                copy.link
                                                            }
                                                            onEdit={() =>
                                                                setEditingMessage(
                                                                    message,
                                                                )
                                                            }
                                                            onDeleteForMe={() =>
                                                                void removeMessage(
                                                                    message,
                                                                    'for_me',
                                                                )
                                                            }
                                                            onUnsend={() =>
                                                                void removeMessage(
                                                                    message,
                                                                    'everyone',
                                                                )
                                                            }
                                                            quickReaction={conversationSettings?.quick_reaction ?? reactions[0]}
                                                            onReply={() => setReplyingTo(message)}
                                                            onReact={(
                                                                reaction,
                                                            ) =>
                                                                void reactToMessage(
                                                                    message.id,
                                                                    reaction,
                                                                )
                                                            }
                                                        />
                                                    ),
                                                )}
                                    </div>

                                    <form onSubmit={(event) => void submitMessage(event)} className="dock">
                                        <fieldset disabled={Boolean(thread.restriction)} className="dock-f">
                                            {thread.restriction && <p role="status" className="restrict">{ar ? (thread.restriction.scope === 'group' ? 'تم كتمك في المجموعة بواسطة ' : 'تم منع الرسائل الخاصة بواسطة ') : 'Messaging restricted by '}{thread.restriction.by}{thread.restriction.expires_at ? ` — ${ar ? 'حتى' : 'until'} ${new Date(thread.restriction.expires_at).toLocaleString(ar ? 'ar' : 'en')}` : (ar ? ' — حتى إلغاء المنع' : ' — until removed')}</p>}

                                            {replyingTo && (
                                                <div className="rb">
                                                    <span><strong>{ar ? 'الرد على ' : 'Replying to '}{replyingTo.name}:</strong> {replyingTo.body || (ar ? 'مرفق' : 'Attachment')}</span>

                                                    <button type="button" aria-label={ar ? 'إلغاء الرد' : 'Cancel reply'} onClick={() => setReplyingTo(null)}>×</button>
                                                </div>
                                            )}

                                            {pendingFiles.length > 0 && (
                                                <div className="extra">
                                                    {pendingFiles.map((file, index) => (
                                                        <span key={`${file.name}-${index}`} className="chip">
                                                            {file.name}

                                                            <button type="button" aria-label={ar ? 'إزالة' : 'Remove'} onClick={() => removePendingFile(index)}>×</button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={selectFiles} />

                                            {recording ? (
                                                <div className="rec">
                                                    <i className="dot" />

                                                    <bdi>{Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}</bdi>

                                                    <span className="wv" aria-hidden="true">
                                                        {Array.from({ length: 28 }, (_, index) => (
                                                            <s key={index} style={{ height: `${8 + ((index * 7) % 22)}px`, animationDelay: `${(index % 7) * 0.08}s` }} />
                                                        ))}
                                                    </span>

                                                    <button type="button" className="btn" onClick={stopRecording}>{copy.stop}</button>
                                                </div>
                                            ) : (
                                                <div className="row">
                                                    <button type="button" className="icon" aria-label={ar ? 'إرفاق' : 'Attach'} title={ar ? 'إرفاق' : 'Attach'} onClick={() => fileInputRef.current?.click()}>
                                                        <Plus size={22} />
                                                    </button>

                                                    <textarea
                                                        ref={composerRef}
                                                        value={messageBody}
                                                        onChange={(event) => setMessageBody(event.target.value)}
                                                        rows={1}
                                                        maxLength={10000}
                                                        placeholder={selected.kind === 'group' ? (ar ? 'اكتب رسالة للمجموعة' : copy.messagePlaceholder) : (ar ? `اكتب رسالة لـ${selected.display_name.split(' ')[0]}` : copy.messagePlaceholder)}
                                                    />

                                                    <button type="button" className="icon" aria-label={ar ? 'تسجيل صوتي' : 'Voice message'} title={ar ? 'تسجيل صوتي' : 'Voice message'} onClick={() => void startRecording()}>
                                                        <Mic size={22} />
                                                    </button>

                                                    <button className="btn" disabled={busy || recording || (! messageBody.trim() && pendingFiles.length === 0)}>
                                                        {ar ? 'أرسل' : copy.send}
                                                    </button>
                                                </div>
                                            )}
                                        </fieldset>
                                    </form>
                                    <aside className={['dr', detailsOpen ? 'open' : ''].join(' ')} aria-hidden={! detailsOpen}>
                                        {detailsOpen && (
                                            <>
                                <ConversationDetails key={selected.id} conversation={thread.conversation} thread={thread} settings={conversationSettings} ar={ar} userId={userId}
                                    onClose={() => setDetailsOpen(false)} onSearch={() => { setSearchInsideConversation(true); if (window.innerWidth < 1280) { setDetailsOpen(false); } }}
                                    onDirect={openDirectConversation}
                                    onMessage={(personId) => void startDirect(personId)}
                                    onChanged={() => { setSettingsRevision((current) => current + 1); setThreadRevision((current) => current + 1); setRevision((current) => current + 1); notifyMessagingChanged(); }}
                                    onLeave={() => { setSelectedId(null); setThread(null); setRevision((current) => current + 1); notifyMessagingChanged(); }}
                                    onArchive={() => void changeArchiveState(!selected.is_archived)}
                                                deviceNotifications={{ enabled: notificationsEnabled, hint: notificationHint, enable: () => void enableNotifications() }}
                                    memberEditor={<div id="conversation-members" ref={membersSectionRef}>
                                    <DetailsSection
                                        title={
                                            copy.members
                                        }
                                        count={
                                            thread.members.length
                                        }
                                        open={
                                            membersOpen
                                        }
                                        preview={
                                            <AvatarStack
                                                members={
                                                    thread.members
                                                }
                                            />
                                        }
                                        onToggle={() =>
                                            setMembersOpen(
                                                (
                                                    current,
                                                ) =>
                                                    ! current,
                                            )
                                        }
                                    >
                                        <div className="space-y-2">
                                            {(selected.kind ===
                                                'group'
                                                && thread.can_manage
                                                ? allMemberChoices
                                                : thread.members
                                            ).map(
                                                (
                                                    person,
                                                ) => {
                                                    const checked =
                                                        memberIds.includes(
                                                            person.id,
                                                        );

                                                    const isAdmin =
                                                        selected.kind ===
                                                            'group'
                                                        && (person.id === selected.created_by || thread.members.some((member) => member.id === person.id && member.is_admin));

                                                    return (
                                                        <label
                                                            key={
                                                                person.id
                                                            }
                                                            className="flex items-center gap-3 rounded-[14px] bg-[var(--ac-surface-soft)] p-3"
                                                        >
                                                            {selected.kind ===
                                                                'group'
                                                                && thread.can_manage && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={
                                                                        checked
                                                                    }
                                                                    disabled={
                                                                        isAdmin
                                                                    }
                                                                    onChange={() =>
                                                                        toggleMember(
                                                                            person.id,
                                                                        )
                                                                    }
                                                                />
                                                            )}

                                                            <div className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--ac-surface)] text-[9px] font-bold">
                                                                {initials(
                                                                    person.name,
                                                                )}

                                                                <span
                                                                    className={[
                                                                        'absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border-2 border-[var(--ac-surface)]',
                                                                        person.is_online
                                                                            ? 'bg-[var(--ac-accent-soft)]0'
                                                                            : 'bg-slate-300',
                                                                    ].join(
                                                                        ' ',
                                                                    )}
                                                                />
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="truncate text-xs font-semibold">
                                                                        {
                                                                            person.name
                                                                        }
                                                                    </span>

                                                                    {isAdmin && (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[8px] font-bold text-amber-700">
                                                                            <Crown
                                                                                size={
                                                                                    8
                                                                                }
                                                                            />

                                                                            {
                                                                                copy.admin
                                                                            }
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </label>
                                                    );
                                                },
                                            )}

                                            {selected.kind ===
                                                'group'
                                                && thread.can_manage && (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        busy
                                                    }
                                                    onClick={() =>
                                                        void saveMembers()
                                                    }
                                                    className={`${primaryButton} mt-3 w-full`}
                                                >
                                                    <Check
                                                        size={
                                                            14
                                                        }
                                                    />

                                                    {
                                                        copy.saveMembers
                                                    }
                                                </button>
                                            )}
                                        </div>
                                    </DetailsSection>

                                    </div>}
                                />
                                                                        </>
                                        )}
                                    </aside>
                                </>
                            ) : (
                                <div className="empty">
                                    <h2 className="font-semibold">{copy.noConversation}</h2>

                                    <p>{copy.noConversationHelp}</p>
                                </div>
                            )}
                        </section>

                        
                    </div>
                </div>
            </main>

            {createOpen && (
                <div className="ts ts-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCreateOpen(false); } }}>
                    <form onSubmit={(event) => void submitCreate(event)} className="ts-dlg" role="dialog" aria-modal="true" aria-labelledby="ts-create-title">
                        <div className="ts-dlg-h">
                            <h2 id="ts-create-title">{copy.newGroup}</h2>

                            <button type="button" className="ghost" aria-label={copy.cancel} onClick={() => setCreateOpen(false)}>×</button>
                        </div>

                        <div className="ts-dlg-b">
                            <label className="fld">
                                {copy.groupName}

                                <input required name="name" autoComplete="off" autoFocus />
                            </label>

                            <label className="fld">
                                {copy.description}

                                <textarea name="description" rows={3} />
                            </label>

                            <p className="fld-t">{copy.members}</p>

                            <div className="pick">
                                {people.map((person) => (
                                    <label key={person.id}>
                                        <span className={`av ${avatarTone(person.id)}`}>{initials(person.name)}</span>

                                        <span><b>{person.name}</b></span>

                                        <input type="checkbox" name="members" value={person.id} />
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="ts-dlg-f">
                            <button type="button" className="ghost" onClick={() => setCreateOpen(false)}>{copy.cancel}</button>

                            <button className="btn" disabled={busy}>{copy.createConversation}</button>
                        </div>
                    </form>
                </div>
            )}

            {editingMessage && (
                <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[3px]">
                    <form
                        onSubmit={(
                            event,
                        ) =>
                            void submitEdit(
                                event,
                            )
                        }
                        className="w-full max-w-lg rounded-[26px] bg-[var(--ac-surface)] p-6 shadow-2xl"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold">
                                {
                                    copy.edit
                                }
                            </h3>

                            <button
                                type="button"
                                onClick={() =>
                                    setEditingMessage(
                                        null,
                                    )
                                }
                            >
                                <X
                                    size={
                                        17
                                    }
                                />
                            </button>
                        </div>

                        <textarea
                            required
                            name="body"
                            rows={
                                5
                            }
                            defaultValue={
                                editingMessage.body
                            }
                            className={`${inputClass} mt-4 resize-none`}
                        />

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className={
                                    secondaryButton
                                }
                                onClick={() =>
                                    setEditingMessage(
                                        null,
                                    )
                                }
                            >
                                {
                                    copy.cancel
                                }
                            </button>

                            <button
                                disabled={
                                    busy
                                }
                                className={
                                    primaryButton
                                }
                            >
                                {
                                    copy.edit
                                }
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AppShell>
    );
}

/**
 * Render one collapsible details row.
 */
function DetailsSection({
    title,
    count,
    open,
    preview,
    onToggle,
    children,
}: {
    title: string;
    count: number;
    open: boolean;
    preview?: ReactNode;
    onToggle: () => void;
    children: ReactNode;
}) {
    return (
        <section className="border-b border-[var(--ac-line)]">
            <button
                type="button"
                onClick={
                    onToggle
                }
                className="flex w-full items-center gap-3 px-5 py-4 text-start hover:bg-[var(--ac-surface-soft)]"
            >
                <strong className="text-xs">
                    {
                        title
                    }
                </strong>

                <div className="ms-auto flex items-center gap-2">
                    {
                        preview
                    }

                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                        {
                            count
                        }
                    </span>

                    {open ? (
                        <ChevronUp
                            size={
                                13
                            }
                        />
                    ) : (
                        <ChevronDown
                            size={
                                13
                            }
                        />
                    )}
                </div>
            </button>

            {open && (
                <div className="px-5 pb-5">
                    {
                        children
                    }
                </div>
            )}
        </section>
    );
}

/**
 * Render one conversation-list section.
 */
function ConversationSection({
    title,
    conversations,
    selectedId,
    ar,
    onSelect,
}: {
    title: string;
    conversations: Conversation[];
    selectedId: number | null;
    ar: boolean;
    onSelect: (id: number) => void;
}) {
    return (
        <section>
            {title && <p className="notice">{title}</p>}

            {conversations.map((conversation) => (
                <button
                    type="button"
                    key={conversation.id}
                    className="cv"
                    aria-current={conversation.id === selectedId ? 'true' : undefined}
                    onClick={() => onSelect(conversation.id)}
                >
                    <ConversationAvatar conversation={conversation} size="normal" />

                    <div>
                        <b>{conversation.display_name}</b>

                        <small>
                            {conversation.latest_sender_name ? `${conversation.latest_sender_name}: ` : ''}
                            {conversation.latest_preview || (conversation.latest_has_attachments ? (ar ? 'مرفق' : 'Attachment') : '')}
                        </small>
                    </div>

                    {conversation.unread_count > 0 && <span className="n">{conversation.unread_count}</span>}
                </button>
            ))}
        </section>
    );
}

/**
 * Render a conversation avatar with online/unread status.
 */
function ConversationAvatar({
    conversation,
    size,
}: {
    conversation: Conversation;
    size:
        | 'normal'
        | 'large'
        | 'profile';
}) {
    return (
        <span className={['av', size === 'profile' ? 'big' : '', avatarTone(conversation.id)].join(' ')}>
            {conversation.avatar_url
                ? <img src={conversation.avatar_url} alt={conversation.display_name} />
                : conversation.kind === 'group'
                    ? <Users size={size === 'profile' ? 28 : 18} />
                    : initials(conversation.display_name)}
        </span>
    );
}

/**
 * Render overlapping member avatars.
 */
function AvatarStack({
    members,
}: {
    members: TeamPerson[];
}) {
    return (
        <div className="flex -space-x-2 rtl:space-x-reverse">
            {members
                .slice(
                    0,
                    4,
                )
                .map(
                    (
                        member,
                    ) => (
                        <div
                            key={
                                member.id
                            }
                            className="relative flex size-6 items-center justify-center rounded-full border-2 border-[var(--ac-surface)] bg-[var(--ac-accent-soft)] text-[7px] font-bold"
                        >
                            {initials(
                                member.name,
                            )}

                            {member.is_online && (
                                <span className="absolute -bottom-0.5 -end-0.5 size-2 rounded-full border border-[var(--ac-surface)] bg-[var(--ac-accent-soft)]0" />
                            )}
                        </div>
                    ),
                )}

            {members.length >
                4 && (
                <div className="flex size-6 items-center justify-center rounded-full border-2 border-[var(--ac-surface)] bg-[var(--ac-text)] text-[7px] text-white">
                    +
                    {members.length
                        - 4}
                </div>
            )}
        </div>
    );
}

/**
 * Render one Messenger-style message with reactions and per-user actions.
 */
function MessageBubble({
    nickname,
    onPin,
    viewerId,
    onDirect,
    onMemberChanged,
    message,
    own,
    ar,
    deletedLabel,
    editLabel,
    removeForMeLabel,
    unsendLabel,
    reactionLabel,
    sharedLinkLabel,
    quickReaction,
    onEdit,
    onDeleteForMe,
    onUnsend,
    onReact,
    onReply,
}: {
    nickname?: string;
    onPin: () => void;
    viewerId: number;
    onDirect: (id: number) => void;
    onMemberChanged: () => void;
    message: TeamMessage;
    own: boolean;
    ar: boolean;
    deletedLabel: string;
    editLabel: string;
    removeForMeLabel: string;
    unsendLabel: string;
    reactionLabel: string;
    sharedLinkLabel: string;
    quickReaction: string;
    onEdit: () => void;
    onDeleteForMe: () => void;
    onUnsend: () => void;
    onReact: (reaction: string) => void;
    onReply: () => void;
}) {
    const [reactionsDialog, setReactionsDialog] = useState(false);
    const [reactionFilter, setReactionFilter] = useState('all');
    const [popup, setPopup] = useState<{ kind: 'react' | 'menu'; top: number; left: number } | null>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const url = firstMessageUrl(message.body);

    useEffect(() => {
        if (! popup) { return; }

        const close = (event: MouseEvent | KeyboardEvent): void => {
            if (event instanceof KeyboardEvent) {
                if (event.key === 'Escape') { setPopup(null); }

                return;
            }

            if (! popupRef.current?.contains(event.target as Node)) { setPopup(null); }
        };

        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);

        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [popup]);

    function openPopup(kind: 'react' | 'menu', anchor: HTMLElement): void {
        const rect = anchor.getBoundingClientRect();
        const width = kind === 'react' ? 260 : 220;
        const height = kind === 'react' ? 64 : 230;
        const top = rect.bottom + 8 + height > window.innerHeight ? Math.max(8, rect.top - height - 8) : rect.bottom + 8;
        const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);

        setPopup({ kind, top, left });
    }

    const menuItem = 'flex items-center gap-2.5';

    return (
        <article className={['m', own ? 'me' : '', message.pinned_at ? 'pin' : ''].join(' ')}>
            <MemberActions conversationId={message.conversation_id} memberId={message.user_id} userId={viewerId} name={message.name} ar={ar} onDirect={onDirect} onChanged={onMemberChanged} triggerClassName={`av ${avatarTone(message.user_id)}`}>{initials(message.name)}</MemberActions>

            <div className="bw">
                <div className="bub">
                    {(! own || message.pinned_at) && (
                        <div className="who">
                            {! own && <span className="nm">{nickname || message.name}</span>}

                            {message.pinned_at && <span className="pt inline-flex items-center gap-1"><Pin size={11} />{ar ? 'مثبّتة' : 'Pinned'}</span>}
                        </div>
                    )}

                    {message.deleted_at ? (
                        <p className="del">{deletedLabel}</p>
                    ) : (
                        <>
                            {message.reply_to && (
                                <div className="q">
                                    <b>{message.reply_to.name}</b> {message.reply_to.deleted ? deletedLabel : message.reply_to.body || (ar ? 'مرفق' : 'Attachment')}
                                </div>
                            )}

                            {message.attachments.map((attachment) => (
                                <div key={attachment.id} className="att">
                                    <AttachmentPreview attachment={attachment} />
                                </div>
                            ))}

                            {message.body && <p className="txt">{message.body}</p>}

                            {url && (
                                <a href={url.toString()} target="_blank" rel="noreferrer" className="m-2 mt-0 flex items-center gap-3 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-[var(--ac-text)]">
                                    <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)]">
                                        <Link2 size={16} />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs text-[var(--ac-text-muted)]">{sharedLinkLabel}</p>

                                        <strong className="block truncate text-sm">{url.hostname}</strong>

                                        <p className="truncate text-xs text-[var(--ac-text-muted)]">{url.toString()}</p>
                                    </div>

                                    <ExternalLink size={14} />
                                </a>
                            )}
                        </>
                    )}

                    <time>{formatTime(message.created_at, ar)}</time>
                </div>

                {message.reactions.length > 0 && (
                    <div className="rxs">
                        {message.reactions.map((item) => (
                            <button
                                type="button"
                                key={item.reaction}
                                title={item.people.join(', ')}
                                className={['rx', item.reacted_by_me ? 'mine' : ''].join(' ')}
                                onClick={() => onReact(item.reaction)}
                            >
                                {item.reaction} {item.count}
                            </button>
                        ))}
                    </div>
                )}

                {own && message.read_by.length > 0 && <span title={message.read_by.join(', ')} className="mt-1 block text-end text-xs text-[var(--ac-accent)]">{ar ? 'تمت القراءة' : 'Seen'}</span>}

                {! message.deleted_at && (
                    <div className={['tools', popup ? 'open' : ''].join(' ')}>
                        <button type="button" title={reactionLabel} aria-label={reactionLabel} onClick={() => onReact(quickReaction)}>{quickReaction}</button>

                        <button type="button" title={ar ? 'اختيار تفاعل' : 'Choose reaction'} aria-label={ar ? 'اختيار تفاعل' : 'Choose reaction'} aria-haspopup="menu" onClick={(event) => openPopup('react', event.currentTarget)}><SmilePlus size={16} /></button>

                        <button type="button" title={ar ? 'رد' : 'Reply'} aria-label={ar ? 'رد على الرسالة' : 'Reply to message'} onClick={onReply}><Reply size={16} /></button>

                        <button type="button" title={ar ? 'المزيد' : 'More'} aria-label={ar ? 'المزيد' : 'More'} aria-haspopup="menu" onClick={(event) => openPopup('menu', event.currentTarget)}><MoreHorizontal size={16} /></button>
                    </div>
                )}

                {popup && (
                    <div ref={popupRef} className="ts-pop" style={{ top: popup.top, left: popup.left }}>
                        {popup.kind === 'react' ? (
                            <div className="ts-emo">
                                {reactions.map((reaction) => (
                                    <button type="button" key={reaction} onClick={() => { onReact(reaction); setPopup(null); }}>{reaction}</button>
                                ))}
                            </div>
                        ) : (
                            <div className="ts-menu" role="menu">
                                <button type="button" role="menuitem" className={menuItem} onClick={() => { void navigator.clipboard?.writeText(message.body).catch(() => undefined); setPopup(null); }}><Copy size={16} />{ar ? 'نسخ النص' : 'Copy text'}</button>

                                <button type="button" role="menuitem" className={menuItem} onClick={() => { onPin(); setPopup(null); }}><Pin size={16} />{message.pinned_at ? (ar ? 'إلغاء التثبيت' : 'Unpin') : (ar ? 'تثبيت الرسالة' : 'Pin message')}</button>

                                {message.reactions.length > 0 && <button type="button" role="menuitem" className={menuItem} onClick={() => { setReactionFilter('all'); setReactionsDialog(true); setPopup(null); }}><SmilePlus size={16} />{ar ? 'من تفاعل؟' : 'Who reacted'}</button>}

                                {own && message.body && <button type="button" role="menuitem" className={menuItem} onClick={() => { onEdit(); setPopup(null); }}><Pencil size={16} />{editLabel}</button>}

                                <button type="button" role="menuitem" className={menuItem} onClick={() => { onDeleteForMe(); setPopup(null); }}><Trash2 size={16} />{removeForMeLabel}</button>

                                {own && <button type="button" role="menuitem" className={`${menuItem} danger`} onClick={() => { onUnsend(); setPopup(null); }}><Trash2 size={16} />{unsendLabel}</button>}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {reactionsDialog && <MessagingDialog title={ar ? 'التفاعلات مع الرسالة' : 'Message reactions'} onClose={() => setReactionsDialog(false)}>
                <div className="mb-4 flex flex-wrap gap-2">
                    {['all', ...message.reactions.map((item) => item.reaction)].map((reaction) => <button key={reaction} type="button" aria-pressed={reactionFilter === reaction} onClick={() => setReactionFilter(reaction)} className={`rounded-full border px-3 py-2 text-sm ${reactionFilter === reaction ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]' : ''}`}>{reaction === 'all' ? (ar ? 'الكل' : 'All') : reaction}</button>)}
                </div>

                <div className="space-y-2">{message.reactions.filter((item) => reactionFilter === 'all' || item.reaction === reactionFilter).flatMap((item) => item.users.map((person) => <div key={`${item.reaction}-${person.id}`} className="flex items-center gap-3 rounded-xl bg-[var(--ac-surface-soft)] p-3"><MemberActions conversationId={message.conversation_id} memberId={person.id} userId={viewerId} name={person.name} ar={ar} onDirect={(id) => { setReactionsDialog(false); onDirect(id); }} onChanged={onMemberChanged}>{initials(person.name)}</MemberActions><span className="flex-1 text-sm">{person.name}</span><span className="text-xl">{item.reaction}</span></div>))}</div>

                {message.reactions.filter((item) => item.reacted_by_me).map((item) => <button key={item.reaction} type="button" onClick={() => { onReact(item.reaction); setReactionsDialog(false); }} className="mt-4 text-sm text-red-600">{ar ? 'إزالة تفاعلي' : 'Remove my reaction'} {item.reaction}</button>)}
            </MessagingDialog>}
        </article>
    );
}

/**
 * Voice note player: play button, waveform and a running time.
 */
function VoicePlayer({
    attachment,
}: {
    attachment: MessageAttachment;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const bars = useMemo(
        () => Array.from({ length: 28 }, (_, index) => 8 + ((index * 7 + attachment.id * 3) % 17)),
        [attachment.id],
    );
    const progress = duration > 0 ? Math.min(1, current / duration) : 0;

    function readDuration(): void {
        const audio = audioRef.current;

        if (! audio) { return; }

        if (Number.isFinite(audio.duration)) {
            setDuration(audio.duration);

            return;
        }

        const settle = (): void => {
            audio.removeEventListener('timeupdate', settle);
            setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
            audio.currentTime = 0;
        };

        audio.addEventListener('timeupdate', settle);
        audio.currentTime = 1e101;
    }

    function toggle(): void {
        const audio = audioRef.current;

        if (! audio) { return; }

        if (audio.paused) { void audio.play(); } else { audio.pause(); }
    }

    const shown = playing || current > 0 ? current : duration;
    const label = `${Math.floor(shown / 60)}:${Math.floor(shown % 60).toString().padStart(2, '0')}`;

    return (
        <div className={['vo', playing ? 'playing' : ''].join(' ')}>
            <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
                {playing ? '❚❚' : '▶'}
            </button>

            <span className="bars" aria-hidden="true">
                {bars.map((height, index) => (
                    <s key={index} style={{ height: `${height}px`, opacity: progress > index / bars.length ? 1 : 0.6, animationDelay: `${(index % 7) * 0.08}s` }} />
                ))}
            </span>

            <bdi className="tm">{label}</bdi>

            <audio
                ref={audioRef}
                src={attachment.url}
                preload="metadata"
                onLoadedMetadata={readDuration}
                onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setCurrent(0); }}
            />
        </div>
    );
}

/**
 * Render one private image, video, or voice attachment.
 */
function AttachmentPreview({
    attachment,
}: {
    attachment: MessageAttachment;
}) {
    const isVoice = attachment.kind === 'audio'
        || attachment.mime.startsWith('audio/')
        || attachment.name.startsWith('voice-');

    if (attachment.kind === 'image') {
        return (
            <a href={attachment.url} target="_blank" rel="noreferrer">
                <img src={attachment.url} alt={attachment.name} className="max-h-[430px] w-full rounded-[15px] object-cover" />
            </a>
        );
    }

    if (attachment.kind === 'video' && ! isVoice) {
        return <video controls preload="metadata" src={attachment.url} className="max-h-[440px] w-full rounded-[15px] bg-black" />;
    }

    return <VoicePlayer attachment={attachment} />;
}
