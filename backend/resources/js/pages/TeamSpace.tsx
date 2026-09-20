import { ConversationDetails, chatThemes, type ConversationSettings } from '@/features/team-space/ConversationDetails';
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
    Archive,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Crown,
    ExternalLink,
    FileAudio,
    Image as ImageIcon,
    Info,
    Link2,
    Lock,
    MessageCircle,
    Mic,
    MoreHorizontal,
    Paperclip,
    Pencil,
    Pin,
    Plus,
    RotateCcw,
    Search,
    Send,
    SmilePlus,
    Square,
    Trash2,
    UserPlus,
    UserRound,
    Users,
    Video,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type CSSProperties,
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
 * Format attachment size.
 */
function formatFileSize(
    size: number,
): string {
    if (
        size <
        1024
    ) {
        return `${size} B`;
    }

    if (
        size <
        1024 * 1024
    ) {
        return `${(
            size / 1024
        ).toFixed(1)} KB`;
    }

    return `${(
        size
        / 1024
        / 1024
    ).toFixed(1)} MB`;
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
    const membersSectionRef = useRef<HTMLDivElement>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);

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
        moreOpen,
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
                    () =>
                        setRevision(
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
                    () =>
                        setPeopleRevision(
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
                    () =>
                        setThreadRevision(
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

    const unreadConversations =
        useMemo(
            () =>
                filter ===
                'all'
                    ? filteredConversations.filter(
                          (
                              conversation,
                          ) =>
                              conversation.unread_count >
                              0,
                      )
                    : [],
            [
                filter,
                filteredConversations,
            ],
        );

    const normalConversations =
        useMemo(
            () =>
                filter ===
                'all'
                    ? filteredConversations.filter(
                          (
                              conversation,
                          ) =>
                              conversation.unread_count ===
                              0,
                      )
                    : filteredConversations,
            [
                filter,
                filteredConversations,
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

    const groupAdmin =
        useMemo(
            () => {
                if (
                    ! selected
                    || ! thread
                    || selected.kind !==
                        'group'
                ) {
                    return null;
                }

                return thread.members.find(
                    (
                        member,
                    ) =>
                        member.id ===
                        selected.created_by,
                )
                    ?? null;
            },
            [
                selected,
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
            );

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

    const [loadedSettings, setLoadedSettings] = useState<{ id: number; data: ConversationSettings } | null>(null);
    const conversationSettings = loadedSettings?.id === selectedId ? loadedSettings.data : null;
    const selectedChatThemeKey = conversationSettings?.theme ?? 'green';
    const selectedChatTheme = chatThemes[selectedChatThemeKey] ?? chatThemes.green;
    const appDark =
        typeof document !== 'undefined'
        && document.documentElement.dataset.acResolvedTheme === 'dark';
    const chatTheme = appDark
        ? chatThemes.dark
        : selectedChatTheme;
    const conversationThemeStyle = {
        colorScheme: appDark || selectedChatThemeKey === 'dark' ? 'dark' : 'light',
        color: chatTheme.text,
        '--ac-bg': chatTheme.background,
        '--ac-bg-soft': chatTheme.soft,
        '--ac-surface': chatTheme.surface,
        '--ac-surface-soft': chatTheme.soft,
        '--ac-surface-strong': chatTheme.other,
        '--ac-text': chatTheme.text,
        '--ac-text-soft': chatTheme.muted,
        '--ac-text-muted': chatTheme.muted,
        '--ac-text-faint': chatTheme.muted,
        '--ac-line': chatTheme.line,
        '--ac-line-strong': chatTheme.line,
        '--ac-accent': chatTheme.accentText,
        '--ac-accent-strong': chatTheme.accent,
        '--ac-accent-soft': chatTheme.soft,
        '--chat-accent-text': chatTheme.accentText,
        '--message-own-bg': chatTheme.bubble,
        '--message-other-bg': chatTheme.other,
    } as CSSProperties;
    useEffect(() => {
        if (!selectedId) { return; }
        const controller = new AbortController();
        apiRequest<ConversationSettings>(`/api/team-space/${selectedId}/settings`, { signal: controller.signal })
            .then((data) => { if (!controller.signal.aborted) { setLoadedSettings({ id: selectedId, data }); } })
            .catch((failure) => { if (!controller.signal.aborted) { setError(errorText(failure)); } });
        return () => controller.abort();
    }, [selectedId, threadRevision]);
    async function pinMessage(message: TeamMessage): Promise<void> {
        try {
            await apiRequest(`/api/team-space/${message.conversation_id}/settings`, { method: 'POST', body: JSON.stringify({ action: 'pin', message_id: message.id, pinned: !message.pinned_at }) });
            setThreadRevision((current) => current + 1);
        } catch (failure) { setError(errorText(failure)); }
    }
    async function sendQuickMessage(): Promise<void> {
        if (!selectedId || busy || thread?.restriction) { return; }
        setBusy(true);
        try {
            await sendConversationMessage(selectedId, conversationSettings?.quick_reaction ?? reactions[0], []);
            setThreadRevision((current) => current + 1); setRevision((current) => current + 1); notifyMessagingChanged();
        } catch (failure) { setError(errorText(failure)); }
        finally { setBusy(false); }
    }

    const filters:
        {
            id:
                ConversationFilter;
            label:
                string;
        }[] = [
        {
            id:
                'all',
            label:
                copy.all,
        },
        {
            id:
                'direct',
            label:
                copy.direct,
        },
        {
            id:
                'group',
            label:
                copy.groups,
        },
        {
            id:
                'unread',
            label:
                copy.unread,
        },
        {
            id:
                'archived',
            label:
                copy.archived,
        },
    ];

    return (
        <AppShell>
            <Head
                title={
                    copy.title
                }
            />

            <main className="mx-auto w-full max-w-[1840px] px-3 py-4 sm:px-5 lg:px-6">
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

                <div className="overflow-hidden rounded-[30px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[0_22px_80px_rgba(20,42,35,.10)]">
                    <div
                        className={[
                            'grid h-[calc(100dvh-5.75rem)] min-h-0 grid-rows-[minmax(0,1fr)] sm:h-[calc(100dvh-6.25rem)]',
                            detailsOpen
                                ? 'lg:grid-cols-[310px_minmax(0,1fr)] xl:grid-cols-[310px_minmax(0,1fr)_290px]'
                                : 'lg:grid-cols-[310px_minmax(0,1fr)]',
                        ].join(
                            ' ',
                        )}
                    >
                        <aside
                            className={[
                                'min-h-0 min-w-0 overflow-y-auto border-[var(--ac-line)] bg-[var(--ac-surface)] lg:border-e',
                                selectedId
                                    ? 'hidden lg:block'
                                    : 'block',
                            ].join(
                                ' ',
                            )}
                        >
                            <div className="border-b border-[var(--ac-line)] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h1 className="text-[22px] font-semibold tracking-[-0.05em]">
                                            {
                                                copy.title
                                            }
                                        </h1>

                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {
                                                copy.subtitle
                                            }
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            openCreate(
                                                'direct',
                                            )
                                        }
                                        className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-text)] text-white shadow-[0_8px_22px_rgba(15,35,30,.18)]"
                                    >
                                        <Plus
                                            size={
                                                18
                                            }
                                        />
                                    </button>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            openCreate(
                                                'direct',
                                            )
                                        }
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-accent-strong)] px-3 text-xs font-semibold text-white"
                                    >
                                        <MessageCircle
                                            size={
                                                14
                                            }
                                        />

                                        {
                                            copy.newMessage
                                        }
                                    </button>

                                    <button
                                        type="button"
                                        disabled={
                                            ! canCreateGroup
                                        }
                                        onClick={() =>
                                            openCreate(
                                                'group',
                                            )
                                        }
                                        className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold disabled:opacity-35"
                                    >
                                        <Users
                                            size={
                                                14
                                            }
                                        />

                                        {
                                            copy.newGroup
                                        }
                                    </button>
                                </div>

                                <div className="relative mt-4">
                                    <Search
                                        size={
                                            15
                                        }
                                        className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                    />

                                    <input
                                        value={
                                            search
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setSearch(
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        placeholder={
                                            copy.search
                                        }
                                        className={`${inputClass} ps-10`}
                                    />
                                </div>

                                {activePeople.length >
                                    0 && (
                                    <div className="mt-4 rounded-[16px] bg-[var(--ac-surface)] p-3 shadow-[var(--ac-shadow-soft)]">
                                        <div className="flex items-center justify-between">
                                            <strong className="text-[10px]">
                                                {
                                                    copy.active
                                                }
                                            </strong>

                                            <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-1 text-[8px] font-bold text-[var(--chat-accent-text,var(--ac-accent-strong))]">
                                                {
                                                    activePeople.length
                                                }
                                            </span>
                                        </div>

                                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                                            {activePeople
                                                .slice(
                                                    0,
                                                    10,
                                                )
                                                .map(
                                                    (
                                                        person,
                                                    ) => (
                                                        <button
                                                            type="button"
                                                            key={
                                                                person.id
                                                            }
                                                            title={
                                                                person.name
                                                            }
                                                            onClick={() =>
                                                                void startDirect(
                                                                    person.id,
                                                                )
                                                            }
                                                            className="relative flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ac-surface)] bg-[var(--ac-accent-soft)] text-[9px] font-bold text-[var(--chat-accent-text,var(--ac-accent-strong))] shadow-sm"
                                                        >
                                                            {initials(
                                                                person.name,
                                                            )}

                                                            <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-[var(--ac-surface)] bg-[var(--ac-accent-soft)]0" />
                                                        </button>
                                                    ),
                                                )}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4 flex gap-1 overflow-x-auto rounded-[13px] bg-[var(--ac-surface)]/70 p-1">
                                    {filters.map(
                                        (
                                            item,
                                        ) => (
                                            <button
                                                type="button"
                                                key={
                                                    item.id
                                                }
                                                onClick={() => {
                                                    setFilter(
                                                        item.id,
                                                    );

                                                    setSelectedId(
                                                        null,
                                                    );

                                                    setThread(
                                                        null,
                                                    );
                                                }}
                                                className={[
                                                    'min-w-max rounded-[10px] px-2.5 py-2 text-[9px] font-semibold',
                                                    filter ===
                                                    item.id
                                                        ? 'bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]'
                                                        : 'text-[var(--ac-text-muted)]',
                                                ].join(
                                                    ' ',
                                                )}
                                            >
                                                {
                                                    item.label
                                                }
                                            </button>
                                        ),
                                    )}
                                </div>
                            </div>

                            <div className="px-4 py-2">
                                <button type="button" disabled={notificationsEnabled} onClick={() => void enableNotifications()} className="text-xs text-[var(--chat-accent-text,var(--ac-accent-strong))] disabled:text-[var(--ac-text-muted)]">{notificationsEnabled ? (ar ? 'إشعارات الجهاز مفعّلة' : 'Device notifications enabled') : (ar ? 'تفعيل إشعارات الرسائل' : 'Enable message notifications')}</button>
                                {notificationHint && <p role="status" className="mt-1 text-xs">{notificationHint}</p>}
                            </div>
                            <div className="overflow-y-auto p-2">
                                {unreadConversations.length >
                                    0 && (
                                    <ConversationSection
                                        title={
                                            copy.important
                                        }
                                        conversations={
                                            unreadConversations
                                        }
                                        selectedId={
                                            selectedId
                                        }
                                        ar={
                                            ar
                                        }
                                        onSelect={
                                            setSelectedId
                                        }
                                    />
                                )}

                                {normalConversations.length >
                                    0 && (
                                    <ConversationSection
                                        title={
                                            filter ===
                                            'all'
                                                ? copy.conversations
                                                : ''
                                        }
                                        conversations={
                                            normalConversations
                                        }
                                        selectedId={
                                            selectedId
                                        }
                                        ar={
                                            ar
                                        }
                                        onSelect={
                                            setSelectedId
                                        }
                                    />
                                )}

                                {! filteredConversations.length && (
                                    <div className="p-10 text-center">
                                        <div className="mx-auto flex size-14 items-center justify-center rounded-[19px] bg-[var(--ac-accent-soft)]">
                                            {filter ===
                                            'archived' ? (
                                                <Archive
                                                    size={
                                                        21
                                                    }
                                                />
                                            ) : (
                                                <MessageCircle
                                                    size={
                                                        21
                                                    }
                                                />
                                            )}
                                        </div>

                                        <p className="mt-3 text-xs text-[var(--ac-text-muted)]">
                                            {
                                                copy.noResults
                                            }
                                        </p>
                                    </div>
                                )}
                            </div>
                        </aside>

                        <section
                            style={conversationThemeStyle}
                            className={[
                                'min-h-0 min-w-0 bg-[var(--ac-surface)]',
                                selectedId
                                    ? 'flex flex-col'
                                    : 'hidden lg:flex lg:flex-col',
                            ].join(
                                ' ',
                            )}
                        >
                            {selected
                                && thread ? (
                                <>
                                    <div className="shrink-0 border-b border-[var(--ac-line)] bg-[var(--ac-surface)]">
                                        <div className="flex items-center justify-between gap-3 px-3 py-3.5 sm:px-5">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedId(
                                                            null,
                                                        )
                                                    }
                                                    className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)] lg:hidden"
                                                >
                                                    {ar ? (
                                                        <ChevronRight
                                                            size={
                                                                16
                                                            }
                                                        />
                                                    ) : (
                                                        <ChevronLeft
                                                            size={
                                                                16
                                                            }
                                                        />
                                                    )}
                                                </button>

                                                <ConversationAvatar
                                                    conversation={
                                                        selected
                                                    }
                                                    size="large"
                                                />

                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h2 className="truncate text-sm font-semibold">
                                                            {
                                                                selected.display_name
                                                            }
                                                        </h2>

                                                        {selected.kind ===
                                                            'group' && (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--ac-accent-soft)] px-2 py-1 text-[8px] font-bold text-[var(--chat-accent-text,var(--ac-accent-strong))]">
                                                                <Lock
                                                                    size={
                                                                        8
                                                                    }
                                                                />

                                                                {
                                                                    copy.private
                                                                }
                                                            </span>
                                                        )}
                                                    </div>

                                                    {selected.kind ===
                                                    'group' ? (
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                                            <AvatarStack
                                                                members={
                                                                    thread.members
                                                                }
                                                            />

                                                            <span className="text-[9px] text-[var(--ac-text-muted)]">
                                                                {
                                                                    thread.members.length
                                                                }
                                                                {' '}
                                                                {
                                                                    copy.members
                                                                }
                                                                {' · '}
                                                                {
                                                                    onlineMemberCount
                                                                }
                                                                {' '}
                                                                {
                                                                    copy.onlineCount
                                                                }
                                                            </span>

                                                            {groupAdmin && (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[8px] font-bold text-amber-700">
                                                                    <Crown
                                                                        size={
                                                                            9
                                                                        }
                                                                    />

                                                                    {
                                                                        groupAdmin.name
                                                                    }

                                                                    {' · '}

                                                                    {
                                                                        copy.admin
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-1 flex items-center gap-1.5 text-[9px] text-[var(--ac-text-muted)]">
                                                            <span
                                                                className={[
                                                                    'size-2 rounded-full',
                                                                    selected.is_online
                                                                        ? 'bg-[var(--ac-accent-soft)]0'
                                                                        : 'bg-slate-300',
                                                                ].join(
                                                                    ' ',
                                                                )}
                                                            />

                                                            {selected.is_online
                                                                ? copy.online
                                                                : copy.directConversation}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSearchInsideConversation(
                                                            (
                                                                current,
                                                            ) =>
                                                                ! current,
                                                        );

                                                        setThreadSearch(
                                                            '',
                                                        );
                                                    }}
                                                    className="flex size-10 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                                                >
                                                    <Search
                                                        size={
                                                            16
                                                        }
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDetailsOpen(
                                                            (
                                                                current,
                                                            ) =>
                                                                ! current,
                                                        )
                                                    }
                                                    className="flex size-10 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                                                >
                                                    <Info
                                                        size={
                                                            16
                                                        }
                                                    />
                                                </button>

                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setMoreOpen(
                                                                (
                                                                    current,
                                                                ) =>
                                                                    ! current,
                                                            )
                                                        }
                                                        className="flex size-10 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                                                    >
                                                        <MoreHorizontal
                                                            size={
                                                                17
                                                            }
                                                        />
                                                    </button>

                                                    {moreOpen && (
                                                        <div className="absolute end-0 top-[calc(100%+8px)] z-50 w-[245px] rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-1.5 shadow-xl">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSearchInsideConversation(
                                                                        true,
                                                                    );

                                                                    setMoreOpen(
                                                                        false,
                                                                    );
                                                                }}
                                                                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start text-xs font-semibold hover:bg-[var(--ac-surface-soft)]"
                                                            >
                                                                <Search
                                                                    size={
                                                                        14
                                                                    }
                                                                />

                                                                {
                                                                    copy.searchInside
                                                                }
                                                            </button>

                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setDetailsOpen(
                                                                        true,
                                                                    );

                                                                    setMoreOpen(
                                                                        false,
                                                                    );
                                                                }}
                                                                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start text-xs font-semibold hover:bg-[var(--ac-surface-soft)]"
                                                            >
                                                                <Info
                                                                    size={
                                                                        14
                                                                    }
                                                                />

                                                                {
                                                                    copy.info
                                                                }
                                                            </button>

                                                            <div className="my-1 h-px bg-[var(--ac-line)]" />

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    void changeArchiveState(
                                                                        ! selected.is_archived,
                                                                    )
                                                                }
                                                                className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start text-xs font-semibold hover:bg-[var(--ac-surface-soft)]"
                                                            >
                                                                {selected.is_archived ? (
                                                                    <RotateCcw
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <Archive
                                                                        size={
                                                                            14
                                                                        }
                                                                    />
                                                                )}

                                                                {selected.is_archived
                                                                    ? copy.restore
                                                                    : copy.archive}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

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

                                    <div className="bg-[var(--ac-bg)] min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-6 sm:px-6">
                                        <div className="mx-auto max-w-[820px]">
                                            <div className="mb-7 flex items-center gap-3">
                                                <div className="h-px flex-1 bg-[var(--ac-line)]" />

                                                <span className="rounded-full bg-[var(--ac-surface)] px-3 py-1.5 text-[9px] text-[var(--ac-text-muted)] shadow-sm">
                                                    {
                                                        copy.today
                                                    }
                                                </span>

                                                <div className="h-px flex-1 bg-[var(--ac-line)]" />
                                            </div>

                                            <div className="space-y-5">
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
                                        </div>
                                    </div>

                                    <form
                                        onSubmit={(
                                            event,
                                        ) =>
                                            void submitMessage(
                                                event,
                                            )
                                        }
                                        className="shrink-0 border-t border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 sm:p-4"
                                    >
                                        {thread.restriction && <p role="status" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{ar ? (thread.restriction.scope === 'group' ? 'تم كتمك في المجموعة بواسطة ' : 'تم منع الرسائل الخاصة بواسطة ') : 'Messaging restricted by '}{thread.restriction.by}{thread.restriction.expires_at ? ` — ${ar ? 'حتى' : 'until'} ${new Date(thread.restriction.expires_at).toLocaleString(ar ? 'ar' : 'en')}` : (ar ? ' — حتى إلغاء المنع' : ' — until removed')}</p>}
                                        <fieldset disabled={Boolean(thread.restriction)} className="min-w-0 disabled:opacity-50">
                                        {pendingFiles.length >
                                            0 && (
                                            <div className="mx-auto mb-3 flex max-w-[820px] gap-2 overflow-x-auto">
                                                {pendingFiles.map(
                                                    (
                                                        file,
                                                        index,
                                                    ) => (
                                                        <div
                                                            key={`${file.name}-${index}`}
                                                            className="flex min-w-[175px] items-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-2.5"
                                                        >
                                                            {file.type.startsWith(
                                                                'image/',
                                                            ) ? (
                                                                <ImageIcon
                                                                    size={
                                                                        15
                                                                    }
                                                                />
                                                            ) : file.type.startsWith(
                                                                  'video/',
                                                              ) ? (
                                                                <Video
                                                                    size={
                                                                        15
                                                                    }
                                                                />
                                                            ) : (
                                                                <FileAudio
                                                                    size={
                                                                        15
                                                                    }
                                                                />
                                                            )}

                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-[10px] font-semibold">
                                                                    {
                                                                        file.name
                                                                    }
                                                                </p>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    removePendingFile(
                                                                        index,
                                                                    )
                                                                }
                                                            >
                                                                <X
                                                                    size={
                                                                        12
                                                                    }
                                                                />
                                                            </button>
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        )}

                                        {recording && (
                                            <div className="mx-auto mb-3 flex max-w-[820px] items-center gap-3 rounded-[15px] bg-red-50 px-4 py-3 text-red-700">
                                                <strong className="text-xs">
                                                    {
                                                        copy.recording
                                                    }
                                                </strong>

                                                <bdi className="text-xs">
                                                    {Math.floor(
                                                        recordingSeconds
                                                        / 60,
                                                    )
                                                        .toString()
                                                        .padStart(
                                                            2,
                                                            '0',
                                                        )}
                                                    :
                                                    {(
                                                        recordingSeconds
                                                        % 60
                                                    )
                                                        .toString()
                                                        .padStart(
                                                            2,
                                                            '0',
                                                        )}
                                                </bdi>

                                                <button
                                                    type="button"
                                                    onClick={
                                                        stopRecording
                                                    }
                                                    className="ms-auto flex items-center gap-2 rounded-xl bg-red-700 px-3 py-2 text-xs text-white"
                                                >
                                                    <Square
                                                        size={
                                                            10
                                                        }
                                                    />

                                                    {
                                                        copy.stop
                                                    }
                                                </button>
                                            </div>
                                        )}

                                        <input
                                            ref={
                                                fileInputRef
                                            }
                                            type="file"
                                            multiple
                                            accept="image/*,video/*,audio/*"
                                            className="hidden"
                                            onChange={
                                                selectFiles
                                            }
                                        />

                                        <div className="relative mx-auto max-w-[820px] rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-sm focus-within:border-[var(--ac-accent)]">
                                            <textarea
                                                ref={composerRef}
                                                value={
                                                    messageBody
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    setMessageBody(
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                                }
                                                rows={
                                                    2
                                                }
                                                maxLength={
                                                    10000
                                                }
                                                placeholder={
                                                    copy.messagePlaceholder
                                                }
                                                className="max-h-36 min-h-[66px] w-full resize-none bg-transparent px-4 py-3 text-sm outline-none"
                                            />

                                            <div className="flex items-center gap-1 border-t border-[var(--ac-line)] px-2 py-2">
                                                <button type="button" disabled={busy || Boolean(thread.restriction)} onClick={() => void sendQuickMessage()} aria-label={ar ? 'إرسال الرمز التعبيري' : 'Send quick emoji'} className="flex size-9 items-center justify-center rounded-xl text-xl hover:bg-[var(--ac-surface-soft)]">{conversationSettings?.quick_reaction ?? reactions[0]}</button>
                                                <div className="relative">
                                                    <button type="button" aria-label={ar ? 'إضافة إيموجي' : 'Insert emoji'} aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)} className="flex size-9 items-center justify-center rounded-xl text-[var(--chat-accent-text,var(--ac-accent-strong))] hover:bg-[var(--ac-accent-soft)]">
                                                        <SmilePlus size={20} />
                                                    </button>
                                                    {emojiOpen && (
                                                        <div className="absolute bottom-full start-0 z-40 mb-2 grid w-60 grid-cols-6 gap-1 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 shadow-xl" onKeyDown={(event) => { if (event.key === 'Escape') { setEmojiOpen(false); composerRef.current?.focus(); } }}>
                                                            {[...reactions, '😊', '👋', '👏', '🔥', '✅', '💪', '🙏', '💯', '😍', '🤔', '🚀', '💚'].map((emoji) => (
                                                                <button key={emoji} type="button" aria-label={emoji} className="flex size-8 items-center justify-center rounded-lg text-xl hover:bg-[var(--ac-accent-soft)]" onClick={() => {
                                                                    const input = composerRef.current;
                                                                    const start = input?.selectionStart ?? messageBody.length;
                                                                    const end = input?.selectionEnd ?? start;
                                                                    setMessageBody((body) => body.slice(0, start) + emoji + body.slice(end));
                                                                    setEmojiOpen(false);
                                                                    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + emoji.length, start + emoji.length); });
                                                                }}>{emoji}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        fileInputRef.current?.click()
                                                    }
                                                    className="flex size-9 items-center justify-center rounded-[11px] hover:bg-[var(--ac-surface)]"
                                                >
                                                    <Plus
                                                        size={
                                                            17
                                                        }
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        fileInputRef.current?.click()
                                                    }
                                                    className="flex size-9 items-center justify-center rounded-[11px] hover:bg-[var(--ac-surface)]"
                                                >
                                                    <Paperclip
                                                        size={
                                                            16
                                                        }
                                                    />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void startRecording()
                                                    }
                                                    className="flex size-9 items-center justify-center rounded-[11px] hover:bg-[var(--ac-surface)]"
                                                >
                                                    <Mic
                                                        size={
                                                            16
                                                        }
                                                    />
                                                </button>

                                                <button
                                                    disabled={
                                                        busy
                                                        || recording
                                                        || (
                                                            ! messageBody.trim()
                                                            && pendingFiles.length ===
                                                                0
                                                        )
                                                    }
                                                    className="ms-auto flex h-10 items-center gap-2 rounded-[13px] bg-[var(--ac-accent-strong)] px-5 text-xs font-semibold text-white disabled:opacity-35"
                                                >
                                                    {
                                                        copy.send
                                                    }

                                                    <Send
                                                        size={
                                                            14
                                                        }
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                        </fieldset>
                                    </form>
                                </>
                            ) : (
                                <div className="flex h-full flex-1 flex-col items-center justify-center p-10 text-center">
                                    <div className="flex size-20 items-center justify-center rounded-[26px] bg-[var(--ac-surface)] shadow-lg">
                                        <MessageCircle
                                            size={
                                                30
                                            }
                                        />
                                    </div>

                                    <h2 className="mt-5 font-semibold">
                                        {
                                            copy.noConversation
                                        }
                                    </h2>

                                    <p className="mt-2 max-w-sm text-xs text-[var(--ac-text-muted)]">
                                        {
                                            copy.noConversationHelp
                                        }
                                    </p>
                                </div>
                            )}
                        </section>

                        {detailsOpen
                            && selected
                            && thread && (
                            <aside style={conversationThemeStyle} className="fixed inset-x-3 bottom-3 top-20 z-50 min-h-0 min-w-0 overflow-hidden rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-xl xl:static xl:z-auto xl:rounded-none xl:border-0 xl:border-s xl:shadow-none">
                                <ConversationDetails key={selected.id} conversation={thread.conversation} thread={thread} settings={conversationSettings} ar={ar} userId={userId}
                                    onClose={() => setDetailsOpen(false)} onSearch={() => { setSearchInsideConversation(true); if (window.innerWidth < 1280) { setDetailsOpen(false); } }}
                                    onDirect={openDirectConversation}
                                    onMessage={(personId) => void startDirect(personId)}
                                    onChanged={() => { setThreadRevision((current) => current + 1); setRevision((current) => current + 1); notifyMessagingChanged(); }}
                                    onLeave={() => { setSelectedId(null); setThread(null); setRevision((current) => current + 1); notifyMessagingChanged(); }}
                                    onArchive={() => void changeArchiveState(!selected.is_archived)}
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
                            </aside>
                        )}
                    </div>
                </div>
            </main>

            {createOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[3px]">
                    <form
                        onSubmit={(
                            event,
                        ) =>
                            void submitCreate(
                                event,
                            )
                        }
                        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-[var(--ac-surface)] p-6 shadow-2xl"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold">
                                {createKind ===
                                'group'
                                    ? copy.newGroup
                                    : copy.newMessage}
                            </h2>

                            <button
                                type="button"
                                onClick={() =>
                                    setCreateOpen(
                                        false,
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

                        <div className="mt-5 grid grid-cols-2 gap-2 rounded-[15px] bg-[var(--ac-surface-soft)] p-1">
                            <button
                                type="button"
                                onClick={() =>
                                    setCreateKind(
                                        'direct',
                                    )
                                }
                                className="rounded-[12px] bg-[var(--ac-surface)] px-3 py-2.5 text-xs font-semibold"
                            >
                                <UserRound
                                    size={
                                        14
                                    }
                                    className="me-1 inline"
                                />

                                {
                                    copy.direct
                                }
                            </button>

                            <button
                                type="button"
                                disabled={
                                    ! canCreateGroup
                                }
                                onClick={() =>
                                    setCreateKind(
                                        'group',
                                    )
                                }
                                className="rounded-[12px] px-3 py-2.5 text-xs font-semibold disabled:opacity-35"
                            >
                                <Users
                                    size={
                                        14
                                    }
                                    className="me-1 inline"
                                />

                                {
                                    copy.groups
                                }
                            </button>
                        </div>

                        {createKind ===
                            'group' && (
                            <div className="mt-5 space-y-4">
                                <input
                                    required
                                    name="name"
                                    placeholder={
                                        copy.groupName
                                    }
                                    className={
                                        inputClass
                                    }
                                />

                                <textarea
                                    name="description"
                                    placeholder={
                                        copy.description
                                    }
                                    rows={
                                        3
                                    }
                                    className={
                                        inputClass
                                    }
                                />
                            </div>
                        )}

                        <div className="mt-5 grid max-h-[340px] gap-2 overflow-y-auto sm:grid-cols-2">
                            {people.map(
                                (
                                    person,
                                ) => (
                                    <label
                                        key={
                                            person.id
                                        }
                                        className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-[var(--ac-line)] p-3"
                                    >
                                        <input
                                            required={
                                                createKind ===
                                                'direct'
                                            }
                                            type={createKind ===
                                            'direct'
                                                ? 'radio'
                                                : 'checkbox'}
                                            name="members"
                                            value={
                                                person.id
                                            }
                                        />

                                        <div className="relative flex size-9 items-center justify-center rounded-full bg-[var(--ac-accent-soft)] text-[9px] font-bold">
                                            {initials(
                                                person.name,
                                            )}

                                            {person.is_online && (
                                                <span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full border-2 border-[var(--ac-surface)] bg-[var(--ac-accent-soft)]0" />
                                            )}
                                        </div>

                                        <span className="truncate text-xs font-semibold">
                                            {
                                                person.name
                                            }
                                        </span>
                                    </label>
                                ),
                            )}
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                type="button"
                                className={
                                    secondaryButton
                                }
                                onClick={() =>
                                    setCreateOpen(
                                        false,
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
                                    copy.createConversation
                                }
                            </button>
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
    onSelect: (
        id: number,
    ) => void;
}) {
    return (
        <section className="mb-4">
            {title && (
                <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-[9px] font-bold text-[var(--ac-text-muted)]">
                        {
                            title
                        }
                    </span>

                    <div className="h-px flex-1 bg-[var(--ac-line)]" />
                </div>
            )}

            <div className="space-y-1">
                {conversations.map(
                    (
                        conversation,
                    ) => (
                        <button
                            type="button"
                            key={
                                conversation.id
                            }
                            onClick={() =>
                                onSelect(
                                    conversation.id,
                                )
                            }
                            className={[
                                'flex w-full gap-3 rounded-[18px] p-3 text-start transition',
                                conversation.id ===
                                selectedId
                                    ? 'bg-[var(--ac-accent-soft)]'
                                    : 'hover:bg-[var(--ac-surface)]',
                            ].join(
                                ' ',
                            )}
                        >
                            <ConversationAvatar
                                conversation={
                                    conversation
                                }
                                size="normal"
                            />

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <strong className="truncate text-xs">
                                        {
                                            conversation.display_name
                                        }
                                    </strong>

                                    <span className="text-[8px] text-[var(--ac-text-muted)]">
                                        {formatTime(
                                            conversation.latest_at,
                                            ar,
                                        )}
                                    </span>
                                </div>

                                <div className="mt-1 flex items-center gap-2">
                                    <p className="min-w-0 flex-1 truncate text-[10px] text-[var(--ac-text-muted)]">
                                        {conversation.latest_sender_name
                                            ? `${conversation.latest_sender_name}: `
                                            : ''}

                                        {conversation.latest_preview
                                            || (
                                                conversation.latest_has_attachments
                                                    ? ar
                                                        ? 'مرفق'
                                                        : 'Attachment'
                                                    : ''
                                            )}
                                    </p>

                                    {conversation.unread_count >
                                        0 && (
                                        <span className="min-w-5 rounded-full bg-[var(--ac-accent-strong)] px-1.5 text-center text-[8px] font-bold leading-5 text-white">
                                            {
                                                conversation.unread_count
                                            }
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    ),
                )}
            </div>
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
    const sizes = {
        normal:
            'size-12 text-xs',

        large:
            'size-11 text-xs',

        profile:
            'mx-auto size-20 text-xl',
    };

    return (
        <div
            className={[
                'relative flex shrink-0 items-center justify-center rounded-full bg-[var(--ac-accent-soft)] font-bold text-[var(--chat-accent-text,var(--ac-accent-strong))]',
                sizes[
                    size
                ],
            ].join(
                ' ',
            )}
        >
            {conversation.avatar_url ? <img src={conversation.avatar_url} alt={conversation.display_name} className="size-full rounded-full object-cover" /> : conversation.kind ===
            'group' ? (
                <Users
                    size={size ===
                    'profile'
                        ? 28
                        : 18}
                />
            ) : (
                initials(
                    conversation.display_name,
                )
            )}

            {conversation.kind ===
                'direct'
                && conversation.is_online && (
                <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-[var(--ac-surface)] bg-[var(--ac-accent-soft)]0" />
            )}
        </div>
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
    onEdit,
    onDeleteForMe,
    onUnsend,
    onReact,
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
    onEdit: () => void;
    onDeleteForMe: () => void;
    onUnsend: () => void;
    onReact: (
        reaction: string,
    ) => void;
}) {
    const [reactionsDialog, setReactionsDialog] = useState(false);
    const [reactionFilter, setReactionFilter] = useState('all');
    const [
        reactionOpen,
        setReactionOpen,
    ] =
        useState(
            false,
        );

    const [
        menuOpen,
        setMenuOpen,
    ] =
        useState(
            false,
        );

    const url =
        firstMessageUrl(
            message.body,
        );

    return (
        <article
            className={[
                'group flex gap-2.5',
                own
                    ? 'flex-row-reverse'
                    : '',
            ].join(
                ' ',
            )}
        >
            <MemberActions conversationId={message.conversation_id} memberId={message.user_id} userId={viewerId} name={message.name} ar={ar} onDirect={onDirect} onChanged={onMemberChanged}>{initials(message.name)}</MemberActions>

            <div className="min-w-0 max-w-[88%] sm:max-w-[74%] [@media(hover:hover)]:max-w-[calc(100%-8rem)]">
                <div
                    className={[
                        'mb-1.5 flex items-center gap-2',
                        own
                            ? 'justify-end'
                            : 'justify-start',
                    ].join(
                        ' ',
                    )}
                >
                    <strong className="text-[10px]">
                        {own
                            ? ar
                                ? 'أنت'
                                : 'You'
                            : nickname || message.name}
                    </strong>

                    <span className="text-[8px] text-[var(--ac-text-muted)]">
                        {formatTime(
                            message.created_at,
                            ar,
                        )}
                    </span>
                </div>

                {message.pinned_at && <span className="mb-1 flex items-center gap-1 text-[10px]"><Pin size={11} />{ar ? 'مثبتة' : 'Pinned'}</span>}
                <div className="relative">
                    <div
                        className={[
                            'overflow-hidden rounded-[18px] border',
                            own
                                ? 'rounded-ee-[6px] border-[var(--ac-line)] bg-[var(--message-own-bg,#dcf5eb)]'
                                : 'rounded-es-[6px] border-transparent bg-[var(--message-other-bg,#f2f4f7)]',
                        ].join(
                            ' ',
                        )}
                    >
                        {message.deleted_at ? (
                            <p className="px-4 py-3 text-xs italic text-[var(--ac-text-muted)]">
                                {
                                    deletedLabel
                                }
                            </p>
                        ) : (
                            <>
                                {message.attachments.map(
                                    (
                                        attachment,
                                    ) => (
                                        <div
                                            key={
                                                attachment.id
                                            }
                                            className="p-2"
                                        >
                                            <AttachmentPreview
                                                attachment={
                                                    attachment
                                                }
                                            />
                                        </div>
                                    ),
                                )}

                                {message.body && (
                                    <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6">
                                        {
                                            message.body
                                        }
                                    </p>
                                )}

                                {url && (
                                    <a
                                        href={
                                            url.toString()
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        className="m-2 mt-0 flex items-center gap-3 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3"
                                    >
                                        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)]">
                                            <Link2
                                                size={
                                                    16
                                                }
                                            />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="text-[9px] text-[var(--ac-text-muted)]">
                                                {
                                                    sharedLinkLabel
                                                }
                                            </p>

                                            <strong className="block truncate text-[10px]">
                                                {
                                                    url.hostname
                                                }
                                            </strong>

                                            <p className="truncate text-[9px] text-[var(--ac-text-muted)]">
                                                {
                                                    url.toString()
                                                }
                                            </p>
                                        </div>

                                        <ExternalLink
                                            size={
                                                13
                                            }
                                        />
                                    </a>
                                )}
                            </>
                        )}
                    </div>

                    {! message.deleted_at && (
                        <div
                            className={[
                                'relative z-20 mt-1 flex w-fit items-center gap-1 rounded-full bg-[var(--ac-surface)] p-1 text-[var(--ac-text-muted)] transition-opacity [@media(hover:hover)]:absolute [@media(hover:hover)]:top-1/2 [@media(hover:hover)]:mt-0 [@media(hover:hover)]:-translate-y-1/2 [@media(hover:hover)]:bg-transparent',
                                reactionOpen || menuOpen
                                    ? 'opacity-100'
                                    : '[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100',
                                own
                                    ? 'ms-auto [@media(hover:hover)]:end-full [@media(hover:hover)]:pe-2'
                                    : 'me-auto [@media(hover:hover)]:start-full [@media(hover:hover)]:ps-2',
                            ].join(
                                ' ',
                            )}
                        >
                            <div className="relative">
                                <button
                                    type="button"
                                    title={
                                        reactionLabel
                                    }
                                    aria-label={reactionLabel}
                                    aria-expanded={reactionOpen}
                                    onClick={() =>
                                        setReactionOpen(
                                            (
                                                current,
                                            ) =>
                                                ! current,
                                        )
                                    }
                                    className="flex size-8 items-center justify-center rounded-full hover:bg-[var(--ac-surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ac-accent)]"
                                >
                                    <SmilePlus
                                        size={
                                            14
                                        }
                                    />
                                </button>

                                {reactionOpen && (
                                    <div className="absolute bottom-full start-0 z-30 grid w-[132px] grid-cols-3 gap-1 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] p-2 shadow-xl">
                                        {reactions.map(
                                            (
                                                reaction,
                                            ) => (
                                                <button
                                                    type="button"
                                                    key={
                                                        reaction
                                                    }
                                                    onClick={() => {
                                                        onReact(
                                                            reaction,
                                                        );

                                                        setReactionOpen(
                                                            false,
                                                        );
                                                    }}
                                                    className="flex size-8 items-center justify-center rounded-full text-lg"
                                                >
                                                    {
                                                        reaction
                                                    }
                                                </button>
                                            ),
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setMenuOpen(
                                            (
                                                current,
                                            ) =>
                                                ! current,
                                        )
                                    }
                                    className="flex size-8 items-center justify-center rounded-[9px]"
                                >
                                    <MoreHorizontal
                                        size={
                                            14
                                        }
                                    />
                                </button>

                                {menuOpen && (
                                    <div className="absolute top-[calc(100%+6px)] z-30 min-w-[190px] rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-1.5 shadow-xl ltr:right-0 rtl:left-0">
                                        <button type="button" onClick={() => { onPin(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-start text-[10px] font-semibold"><Pin size={12} />{message.pinned_at ? (ar ? 'إلغاء التثبيت' : 'Unpin') : (ar ? 'تثبيت الرسالة' : 'Pin message')}</button>
                                        {own
                                            && message.body && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onEdit();

                                                    setMenuOpen(
                                                        false,
                                                    );
                                                }}
                                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-start text-[10px] font-semibold"
                                            >
                                                <Pencil
                                                    size={
                                                        12
                                                    }
                                                />

                                                {
                                                    editLabel
                                                }
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                onDeleteForMe();

                                                setMenuOpen(
                                                    false,
                                                );
                                            }}
                                            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-start text-[10px] font-semibold"
                                        >
                                            <Trash2
                                                size={
                                                    12
                                                }
                                            />

                                            {
                                                removeForMeLabel
                                            }
                                        </button>

                                        {own && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onUnsend();

                                                    setMenuOpen(
                                                        false,
                                                    );
                                                }}
                                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-start text-[10px] font-semibold text-red-600"
                                            >
                                                <Trash2
                                                    size={
                                                        12
                                                    }
                                                />

                                                {
                                                    unsendLabel
                                                }
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {message.reactions.length >
                    0 && (
                    <div
                        className={[
                            'mt-1.5 flex flex-wrap gap-1',
                            own
                                ? 'justify-end'
                                : 'justify-start',
                        ].join(
                            ' ',
                        )}
                    >
                        {message.reactions.map(
                            (
                                item,
                            ) => (
                                <button
                                    type="button"
                                    key={
                                        item.reaction
                                    }
                                    title={
                                        item.people.join(
                                            ', ',
                                        )
                                    }
                                    onClick={() => { setReactionFilter('all'); setReactionsDialog(true); }}
                                    aria-haspopup="dialog"
                                    className={[
                                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] shadow-sm',
                                        item.reacted_by_me
                                            ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                            : 'border-[var(--ac-line)] bg-[var(--ac-surface)]',
                                    ].join(
                                        ' ',
                                    )}
                                >
                                    {
                                        item.reaction
                                    }

                                    <span className="text-[8px] font-bold">
                                        {
                                            item.count
                                        }
                                    </span>
                                </button>
                            ),
                        )}
                    </div>
                )}
                {own && message.read_by.length > 0 && <span title={message.read_by.join(', ')} className="mt-1 block text-end text-[10px] text-[var(--chat-accent-text,var(--ac-accent-strong))]">{ar ? 'تمت القراءة' : 'Seen'}</span>}
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
 * Render one private image, video, or voice attachment.
 */
function AttachmentPreview({
    attachment,
}: {
    attachment:
        MessageAttachment;
}) {
    if (
        attachment.kind ===
        'image'
    ) {
        return (
            <a
                href={
                    attachment.url
                }
                target="_blank"
                rel="noreferrer"
            >
                <img
                    src={
                        attachment.url
                    }
                    alt={
                        attachment.name
                    }
                    className="max-h-[430px] w-full rounded-[15px] object-cover"
                />
            </a>
        );
    }

    if (
        attachment.kind ===
        'video'
    ) {
        return (
            <video
                controls
                preload="metadata"
                src={
                    attachment.url
                }
                className="max-h-[440px] w-full rounded-[15px] bg-black"
            />
        );
    }

    return (
        <div className="min-w-[245px] rounded-[15px] bg-[var(--ac-surface)]/70 p-3">
            <div className="mb-2 flex items-center gap-2">
                <FileAudio
                    size={
                        13
                    }
                />

                <span className="truncate text-[10px] font-semibold">
                    {
                        attachment.name
                    }
                </span>

                <span className="ms-auto text-[8px] text-[var(--ac-text-muted)]">
                    {formatFileSize(
                        attachment.size,
                    )}
                </span>
            </div>

            <audio
                controls
                preload="metadata"
                src={
                    attachment.url
                }
                className="h-9 w-full"
            />
        </div>
    );
}
