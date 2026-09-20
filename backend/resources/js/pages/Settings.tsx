import {
    CurrencyPicker,
} from '@/components/CurrencyPicker';
import {
    AppShell,
} from '@/layouts/AppShell';
import {
    deviceEnabled,
    deviceKey,
    deviceSupported,
    showDeviceNotification,
} from '@/lib/deviceNotifications';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import {
    applyProfilePreferences,
    defaultProfilePreferences,
    type ProfilePreferences,
} from '@/lib/profilePreferences';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Head,
    Link,
    router,
    usePage,
} from '@inertiajs/react';
import {
    Bell,
    Building2,
    CalendarDays,
    Check,
    Cloud,
    Database,
    Eye,
    Globe2,
    Grid2X2,
    KeyRound,
    Laptop,
    Link2,
    LockKeyhole,
    MessageSquare,
    Monitor,
    Moon,
    Palette,
    Save,
    Settings2,
    ShieldCheck,
    Sun,
    UserRound,
    UsersRound,
    Video,
    Wallet,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
    type ReactNode,
} from 'react';

type WorkspacePreferences = {
    name: string;
    currency: string;
    reminder_days: number;
    can_manage: boolean;
};

type SettingsSection =
    | 'workspace'
    | 'language'
    | 'datetime'
    | 'appearance'
    | 'layout'
    | 'notifications'
    | 'security'
    | 'accessibility'
    | 'team'
    | 'integrations';

type SectionDefinition = {
    key: SettingsSection;
    ar: string;
    en: string;
    icon: typeof Settings2;
};

const panel =
    'rounded-[22px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-soft)]';

const button =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-white px-4 text-xs font-semibold transition hover:bg-[var(--ac-surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ac-accent)] disabled:cursor-not-allowed disabled:opacity-45';

const primary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-strong)] px-4 text-xs font-semibold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45';

const input =
    'w-full rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:bg-white';

function errorText(
    failure: unknown,
    fallback: string,
): string {
    if (
        failure instanceof
        ApiError
    ) {
        return [
            failure.message,
            ...Object.values(
                failure.errors,
            ).flat(),
        ]
            .filter(
                Boolean,
            )
            .join(
                ' ',
            );
    }

    return failure instanceof
        Error
        ? failure.message
        : fallback;
}

function SettingCard({
    title,
    icon: Icon,
    children,
    description,
}: {
    title: string;
    icon: typeof Settings2;
    children: ReactNode;
    description?: string;
}) {
    return (
        <section className={panel + ' p-5 sm:p-6'}>
            <div className="mb-5 flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                    <Icon size={18} />
                </span>

                <div>
                    <h2 className="text-sm font-bold">
                        {title}
                    </h2>

                    {description && (
                        <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {description}
                        </p>
                    )}
                </div>
            </div>

            {children}
        </section>
    );
}

export default function Settings() {
    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    return (
        <SettingsWorkspace
            key={
                workspace.activeOrganization?.id
                ?? 'none'
            }
        />
    );
}

function SettingsWorkspace() {
    const locale =
        useLocale();

    const ar =
        locale ===
        'ar';

    const {
        auth,
        workspace,
    } =
        usePage<AppPageProps>().props;

    const deviceStorageKey =
        deviceKey(
            auth.user?.id
            ?? 0,
            workspace.activeOrganization?.id
            ?? 0,
        );

    const sections: SectionDefinition[] =
        useMemo(
            () => [
                {
                    key:
                        'workspace',
                    ar:
                        'مساحة العمل والمالية',
                    en:
                        'Workspace & finance',
                    icon:
                        Wallet,
                },
                {
                    key:
                        'language',
                    ar:
                        'اللغة والمنطقة',
                    en:
                        'Language & region',
                    icon:
                        Globe2,
                },
                {
                    key:
                        'datetime',
                    ar:
                        'التاريخ والوقت',
                    en:
                        'Date & time',
                    icon:
                        CalendarDays,
                },
                {
                    key:
                        'appearance',
                    ar:
                        'المظهر',
                    en:
                        'Appearance',
                    icon:
                        Palette,
                },
                {
                    key:
                        'layout',
                    ar:
                        'التخطيط والعرض',
                    en:
                        'Layout & display',
                    icon:
                        Grid2X2,
                },
                {
                    key:
                        'notifications',
                    ar:
                        'الإشعارات',
                    en:
                        'Notifications',
                    icon:
                        Bell,
                },
                {
                    key:
                        'security',
                    ar:
                        'تسجيل الدخول الآمن',
                    en:
                        'Login & security',
                    icon:
                        ShieldCheck,
                },
                {
                    key:
                        'accessibility',
                    ar:
                        'إمكانية الوصول',
                    en:
                        'Accessibility',
                    icon:
                        Eye,
                },
                {
                    key:
                        'team',
                    ar:
                        'الفريق والصلاحيات',
                    en:
                        'Team & permissions',
                    icon:
                        UsersRound,
                },
                {
                    key:
                        'integrations',
                    ar:
                        'الأدوات المتصلة',
                    en:
                        'Connected tools',
                    icon:
                        Link2,
                },
            ],
            [],
        );

    const [
        section,
        setSection,
    ] =
        useState<SettingsSection>(
            'appearance',
        );

    const [
        workspacePreferences,
        setWorkspacePreferences,
    ] =
        useState<WorkspacePreferences | null>(
            null,
        );

    const [
        profilePreferences,
        setProfilePreferences,
    ] =
        useState<ProfilePreferences>(
            defaultProfilePreferences(),
        );

    const [
        loading,
        setLoading,
    ] =
        useState(
            true,
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

    const [
        message,
        setMessage,
    ] =
        useState(
            '',
        );

    const [
        enabled,
        setEnabled,
    ] =
        useState(
            () =>
                deviceEnabled(
                    deviceStorageKey,
                ),
        );

    const [
        integrationNotice,
        setIntegrationNotice,
    ] =
        useState(
            '',
        );

    const text =
        (
            arabic: string,
            english: string,
        ): string =>
            ar
                ? arabic
                : english;

    useEffect(
        () => {
            const controller =
                new AbortController();

            setLoading(
                true,
            );

            setError(
                '',
            );

            Promise.all([
                apiRequest<WorkspacePreferences>(
                    '/api/workspace-settings',
                    {
                        signal:
                            controller.signal,
                    },
                ),

                apiRequest<{
                    settings:
                        Partial<ProfilePreferences>
                        | null;
                }>(
                    '/api/profile/preferences',
                    {
                        signal:
                            controller.signal,
                    },
                ),
            ])
                .then(
                    ([
                        workspaceData,
                        profileData,
                    ]) => {
                        if (
                            controller.signal.aborted
                        ) {
                            return;
                        }

                        setWorkspacePreferences(
                            workspaceData,
                        );

                        const next = {
                            ...defaultProfilePreferences(),
                            ...profileData.settings,
                        };

                        setProfilePreferences(
                            next,
                        );

                        applyProfilePreferences(
                            next,
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
                                    text(
                                        'تعذر تحميل الإعدادات.',
                                        'Could not load settings.',
                                    ),
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
        },
        [
            workspace.activeOrganization?.id,
        ],
    );

    async function updateProfilePreference<
        K extends keyof ProfilePreferences,
    >(
        key: K,
        value: ProfilePreferences[K],
    ): Promise<void> {
        if (
            busy
        ) {
            return;
        }

        const previous =
            profilePreferences;

        const next = {
            ...previous,
            [key]: value,
        };

        setProfilePreferences(
            next,
        );

        applyProfilePreferences(
            next,
        );

        setBusy(
            true,
        );

        setError(
            '',
        );

        setMessage(
            '',
        );

        try {
            const response =
                await apiRequest<{
                    settings:
                        ProfilePreferences;
                }>(
                    '/api/profile/preferences',
                    {
                        method:
                            'PUT',

                        body:
                            JSON.stringify(
                                next,
                            ),
                    },
                );

            setProfilePreferences(
                response.settings,
            );

            applyProfilePreferences(
                response.settings,
            );

            setMessage(
                text(
                    'تم حفظ التفضيل وتطبيقه على الموقع.',
                    'Preference saved and applied across the app.',
                ),
            );
        } catch (
            failure
        ) {
            setProfilePreferences(
                previous,
            );

            applyProfilePreferences(
                previous,
            );

            setError(
                errorText(
                    failure,
                    text(
                        'تعذر حفظ التفضيل.',
                        'Could not save this preference.',
                    ),
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    async function saveWorkspace(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
            || ! workspacePreferences
        ) {
            return;
        }

        const data =
            Object.fromEntries(
                new FormData(
                    event.currentTarget,
                ),
            );

        setBusy(
            true,
        );

        setError(
            '',
        );

        setMessage(
            '',
        );

        try {
            const saved =
                await apiRequest<WorkspacePreferences>(
                    '/api/workspace-settings',
                    {
                        method:
                            'PATCH',

                        body:
                            JSON.stringify({
                                ...data,

                                reminder_days:
                                    Number(
                                        data.reminder_days,
                                    ),
                            }),
                    },
                );

            setWorkspacePreferences(
                saved,
            );

            setMessage(
                text(
                    'تم حفظ إعدادات مساحة العمل.',
                    'Workspace settings saved.',
                ),
            );

            router.reload({
                only: [
                    'workspace',
                ],
            });
        } catch (
            failure
        ) {
            setError(
                errorText(
                    failure,
                    text(
                        'تعذر حفظ إعدادات مساحة العمل.',
                        'Could not save workspace settings.',
                    ),
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    async function toggleDevice(): Promise<void> {
        setError(
            '',
        );

        setMessage(
            '',
        );

        if (! deviceSupported()) {
            setError(
                text(
                    'تنبيهات الجهاز غير متاحة هنا. استخدم HTTPS أو localhost ومتصفحًا يدعم الإشعارات.',
                    'Device notifications are unavailable here. Use HTTPS or localhost in a supported browser.',
                ),
            );

            return;
        }

        setBusy(
            true,
        );

        try {
            if (
                enabled
            ) {
                localStorage.removeItem(
                    deviceStorageKey,
                );

                setEnabled(
                    false,
                );

                setMessage(
                    text(
                        'تم إيقاف تنبيهات الجهاز.',
                        'Device notifications disabled.',
                    ),
                );

                return;
            }

            const permission =
                await Notification.requestPermission();

            if (
                permission !==
                'granted'
            ) {
                setError(
                    text(
                        'المتصفح حظر الإشعارات. اسمح بها من إعدادات الموقع ثم أعد المحاولة.',
                        'Notifications are blocked. Allow them in site settings and try again.',
                    ),
                );

                return;
            }

            showDeviceNotification(
                1,
            );

            localStorage.setItem(
                deviceStorageKey,
                'on',
            );

            setEnabled(
                true,
            );

            setMessage(
                text(
                    'تم تفعيل تنبيهات الجهاز.',
                    'Device notifications enabled.',
                ),
            );
        } catch {
            setError(
                text(
                    'تعذر تفعيل تنبيهات الجهاز على هذا المتصفح.',
                    'Could not enable device notifications in this browser.',
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    const currentSection =
        sections.find(
            (
                item,
            ) =>
                item.key ===
                section,
        )
        ?? sections[0];

    const timezoneOptions =
        Array.from(
            new Set([
                profilePreferences.timezone,
                Intl.DateTimeFormat()
                    .resolvedOptions()
                    .timeZone,
                'Asia/Hebron',
                'Asia/Jerusalem',
                'Asia/Riyadh',
                'Asia/Dubai',
                'Africa/Cairo',
                'Europe/London',
                'America/New_York',
                'UTC',
            ]),
        );

    const integrations = [
        {
            name:
                'Slack',
            icon:
                MessageSquare,
        },
        {
            name:
                'Microsoft Teams',
            icon:
                Video,
        },
        {
            name:
                'Google Drive',
            icon:
                Cloud,
        },
    ];

    return (
        <AppShell>
            <Head
                title={
                    text(
                        'الإعدادات',
                        'Settings',
                    )
                }
            />

            <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
                <header className="rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-br from-white via-white to-[var(--ac-accent-soft)] p-5 sm:p-7">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-[var(--ac-text)] text-white">
                                <Settings2
                                    size={
                                        22
                                    }
                                />
                            </span>

                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-accent-strong)]">
                                    {text(
                                        'إعدادات الحساب ومساحة العمل',
                                        'Account & workspace settings',
                                    )}
                                </p>

                                <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
                                    {text(
                                        'خصص AccoNova بالطريقة التي تناسبك',
                                        'Customize AccoNova for the way you work',
                                    )}
                                </h1>

                                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                    {text(
                                        'اللغة، الوقت، المظهر، كثافة العرض، الإشعارات، إمكانية الوصول، الأمان وإعدادات مساحة العمل في مكان واحد.',
                                        'Language, time, appearance, density, notifications, accessibility, security and workspace defaults in one place.',
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="rounded-[18px] border border-[var(--ac-line)] bg-white/80 px-4 py-3 text-end">
                            <p className="text-[10px] text-[var(--ac-text-muted)]">
                                {text(
                                    'مساحة العمل الحالية',
                                    'Current workspace',
                                )}
                            </p>

                            <strong className="mt-1 block text-sm">
                                {workspace.activeOrganization?.name
                                    ?? '—'}
                            </strong>
                        </div>
                    </div>
                </header>

                {error && (
                    <div
                        role="alert"
                        className="mt-4 rounded-[17px] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                    >
                        {error}
                    </div>
                )}

                {message && (
                    <div
                        role="status"
                        className="mt-4 flex items-center gap-2 rounded-[17px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
                    >
                        <Check
                            size={
                                16
                            }
                        />

                        {message}
                    </div>
                )}

                <div className="mt-5 grid items-start gap-5 lg:grid-cols-[255px_minmax(0,1fr)]">
                    <aside className={panel + ' sticky top-24 p-3'}>
                        <div className="mb-3 px-3 py-2">
                            <h2 className="text-sm font-bold">
                                {text(
                                    'الإعدادات',
                                    'Settings',
                                )}
                            </h2>

                            <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                {text(
                                    'اختر القسم الذي تريد تعديله.',
                                    'Choose the area you want to manage.',
                                )}
                            </p>
                        </div>

                        <nav className="space-y-1">
                            {sections.map(
                                (
                                    item,
                                ) => {
                                    const Icon =
                                        item.icon;

                                    const active =
                                        item.key ===
                                        section;

                                    return (
                                        <button
                                            type="button"
                                            key={
                                                item.key
                                            }
                                            aria-pressed={
                                                active
                                            }
                                            onClick={() => {
                                                setSection(
                                                    item.key,
                                                );

                                                setError(
                                                    '',
                                                );

                                                setMessage(
                                                    '',
                                                );

                                                setIntegrationNotice(
                                                    '',
                                                );
                                            }}
                                            className={[
                                                'flex w-full items-center gap-3 rounded-[12px] px-3.5 py-3 text-start text-xs transition',
                                                active
                                                    ? 'bg-[var(--ac-accent-soft)] font-semibold text-[var(--ac-accent-strong)]'
                                                    : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            <Icon
                                                size={
                                                    16
                                                }
                                            />

                                            {ar
                                                ? item.ar
                                                : item.en}
                                        </button>
                                    );
                                },
                            )}
                        </nav>

                        <div className="mt-4 border-t border-[var(--ac-line)] px-3 pt-4 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            <Building2
                                size={
                                    14
                                }
                            />

                            <p className="mt-2">
                                {workspace.activeOrganization?.name
                                    ?? '—'}
                            </p>

                            <p>
                                {auth.user?.email
                                    ?? '—'}
                            </p>
                        </div>
                    </aside>

                    <section className="min-w-0">
                        <div className="mb-4">
                            <h2 className="text-lg font-bold">
                                {ar
                                    ? currentSection.ar
                                    : currentSection.en}
                            </h2>
                        </div>

                        {loading ? (
                            <div
                                role="status"
                                className={panel + ' p-12 text-center text-sm text-[var(--ac-text-muted)]'}
                            >
                                {text(
                                    'جارٍ تحميل الإعدادات…',
                                    'Loading settings…',
                                )}
                            </div>
                        ) : (
                            <>
                                {section ===
                                    'workspace'
                                    && workspacePreferences && (
                                    <SettingCard
                                        title={text(
                                            'العملة والتذكيرات',
                                            'Currency & reminders',
                                        )}
                                        icon={
                                            Wallet
                                        }
                                        description={text(
                                            'هذه الإعدادات تخص مساحة العمل الحالية، وليس حسابك الشخصي فقط.',
                                            'These defaults belong to the current workspace, not only your personal account.',
                                        )}
                                    >
                                        <form
                                            onSubmit={(
                                                event,
                                            ) =>
                                                void saveWorkspace(
                                                    event,
                                                )
                                            }
                                        >
                                            <fieldset
                                                disabled={
                                                    busy
                                                    || ! workspacePreferences.can_manage
                                                }
                                                className="space-y-5"
                                            >
                                                <fieldset>
                                                    <legend className="text-xs font-semibold">
                                                        {text(
                                                            'عملة مساحة العمل',
                                                            'Workspace currency',
                                                        )}
                                                    </legend>

                                                    <CurrencyPicker
                                                        initial={
                                                            workspacePreferences.currency
                                                        }
                                                    />
                                                </fieldset>

                                                <label className="block max-w-xs text-xs font-semibold">
                                                    {text(
                                                        'التذكير قبل الاستحقاق بالأيام',
                                                        'Reminder days before due date',
                                                    )}

                                                    <input
                                                        required
                                                        name="reminder_days"
                                                        type="number"
                                                        min="0"
                                                        max="30"
                                                        defaultValue={
                                                            workspacePreferences.reminder_days
                                                        }
                                                        className={
                                                            input
                                                            +' mt-2'
                                                        }
                                                    />
                                                </label>

                                                <p className="text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'تغيير العملة الافتراضية لا يحول المبالغ القديمة تلقائيًا.',
                                                        'Changing the default currency never converts historical amounts automatically.',
                                                    )}
                                                </p>

                                                {workspacePreferences.can_manage && (
                                                    <button
                                                        disabled={
                                                            busy
                                                        }
                                                        className={
                                                            primary
                                                        }
                                                    >
                                                        <Save
                                                            size={
                                                                14
                                                            }
                                                        />

                                                        {text(
                                                            'حفظ إعدادات مساحة العمل',
                                                            'Save workspace settings',
                                                        )}
                                                    </button>
                                                )}
                                            </fieldset>

                                            {! workspacePreferences.can_manage && (
                                                <p className="mt-4 rounded-[14px] bg-amber-50 p-3 text-[10px] leading-5 text-amber-700">
                                                    {text(
                                                        'هذه القيم للعرض فقط؛ تعديلها متاح للمالك أو المسؤول.',
                                                        'These values are read-only for your role; owners and administrators can change them.',
                                                    )}
                                                </p>
                                            )}
                                        </form>
                                    </SettingCard>
                                )}

                                {section ===
                                    'language' && (
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingCard
                                            title={text(
                                                'لغة واجهة النظام',
                                                'Interface language',
                                            )}
                                            icon={
                                                Globe2
                                            }
                                            description={text(
                                                'التغيير يطبّق مباشرة ويحفظ في حسابك.',
                                                'The change applies immediately and is saved to your account.',
                                            )}
                                        >
                                            <div className="grid grid-cols-2 gap-3">
                                                {([
                                                    [
                                                        'ar',
                                                        'العربية',
                                                    ],
                                                    [
                                                        'en',
                                                        'English',
                                                    ],
                                                ] as const).map(
                                                    ([
                                                        value,
                                                        label,
                                                    ]) => (
                                                        <button
                                                            type="button"
                                                            key={
                                                                value
                                                            }
                                                            disabled={
                                                                busy
                                                            }
                                                            aria-pressed={
                                                                profilePreferences.locale ===
                                                                value
                                                            }
                                                            onClick={() =>
                                                                void updateProfilePreference(
                                                                    'locale',
                                                                    value,
                                                                )
                                                            }
                                                            className={[
                                                                'rounded-[15px] border p-4 text-sm font-semibold transition',
                                                                profilePreferences.locale ===
                                                                value
                                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                                    : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]',
                                                            ].join(
                                                                ' ',
                                                            )}
                                                        >
                                                            {
                                                                label
                                                            }
                                                        </button>
                                                    ),
                                                )}
                                            </div>
                                        </SettingCard>

                                        <SettingCard
                                            title={text(
                                                'المنطقة الزمنية',
                                                'Time zone',
                                            )}
                                            icon={
                                                Globe2
                                            }
                                        >
                                            <select
                                                value={
                                                    profilePreferences.timezone
                                                }
                                                disabled={
                                                    busy
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    void updateProfilePreference(
                                                        'timezone',
                                                        event
                                                            .target
                                                            .value,
                                                    )
                                                }
                                                className={
                                                    input
                                                }
                                            >
                                                {timezoneOptions.map(
                                                    (
                                                        zone,
                                                    ) => (
                                                        <option
                                                            key={
                                                                zone
                                                            }
                                                            value={
                                                                zone
                                                            }
                                                        >
                                                            {
                                                                zone
                                                            }
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </SettingCard>
                                    </div>
                                )}

                                {section ===
                                    'datetime' && (
                                    <SettingCard
                                        title={text(
                                            'تنسيق التاريخ والوقت',
                                            'Date & time format',
                                        )}
                                        icon={
                                            CalendarDays
                                        }
                                        description={text(
                                            'هذه الخيارات تؤثر على عرض التواريخ والأوقات في الحساب.',
                                            'These choices control how dates and times are displayed in your account.',
                                        )}
                                    >
                                        <div className="grid gap-4 md:grid-cols-3">
                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'تنسيق التاريخ',
                                                    'Date format',
                                                )}

                                                <select
                                                    value={
                                                        profilePreferences.date_format
                                                    }
                                                    disabled={
                                                        busy
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        void updateProfilePreference(
                                                            'date_format',
                                                            event
                                                                .target
                                                                .value as ProfilePreferences['date_format'],
                                                        )
                                                    }
                                                    className={
                                                        input
                                                        +' mt-2'
                                                    }
                                                >
                                                    <option value="numeric">
                                                        {text(
                                                            'أرقام',
                                                            'Numeric',
                                                        )}
                                                    </option>

                                                    <option value="long">
                                                        {text(
                                                            'تاريخ كامل',
                                                            'Long date',
                                                        )}
                                                    </option>
                                                </select>
                                            </label>

                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'تنسيق الوقت',
                                                    'Time format',
                                                )}

                                                <select
                                                    value={
                                                        profilePreferences.hour_cycle
                                                    }
                                                    disabled={
                                                        busy
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        void updateProfilePreference(
                                                            'hour_cycle',
                                                            event
                                                                .target
                                                                .value as ProfilePreferences['hour_cycle'],
                                                        )
                                                    }
                                                    className={
                                                        input
                                                        +' mt-2'
                                                    }
                                                >
                                                    <option value="h12">
                                                        {text(
                                                            '12 ساعة',
                                                            '12 hour',
                                                        )}
                                                    </option>

                                                    <option value="h23">
                                                        {text(
                                                            '24 ساعة',
                                                            '24 hour',
                                                        )}
                                                    </option>
                                                </select>
                                            </label>

                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'بداية الأسبوع',
                                                    'Week starts on',
                                                )}

                                                <select
                                                    value={
                                                        profilePreferences.week_start
                                                    }
                                                    disabled={
                                                        busy
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        void updateProfilePreference(
                                                            'week_start',
                                                            event
                                                                .target
                                                                .value as ProfilePreferences['week_start'],
                                                        )
                                                    }
                                                    className={
                                                        input
                                                        +' mt-2'
                                                    }
                                                >
                                                    <option value="sunday">
                                                        {text(
                                                            'الأحد',
                                                            'Sunday',
                                                        )}
                                                    </option>

                                                    <option value="monday">
                                                        {text(
                                                            'الاثنين',
                                                            'Monday',
                                                        )}
                                                    </option>

                                                    <option value="saturday">
                                                        {text(
                                                            'السبت',
                                                            'Saturday',
                                                        )}
                                                    </option>
                                                </select>
                                            </label>
                                        </div>
                                    </SettingCard>
                                )}

                                {section ===
                                    'appearance' && (
                                    <SettingCard
                                        title={text(
                                            'مظهر الموقع',
                                            'Site appearance',
                                        )}
                                        icon={
                                            Palette
                                        }
                                        description={text(
                                            'الزر يغيّر الموقع كاملًا فورًا ويُحفظ في حسابك.',
                                            'Each choice updates the entire app immediately and saves to your account.',
                                        )}
                                    >
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            {([
                                                [
                                                    'light',
                                                    text(
                                                        'فاتح',
                                                        'Light',
                                                    ),
                                                    Sun,
                                                ],
                                                [
                                                    'system',
                                                    text(
                                                        'تلقائي',
                                                        'System',
                                                    ),
                                                    Monitor,
                                                ],
                                                [
                                                    'dark',
                                                    text(
                                                        'داكن',
                                                        'Dark',
                                                    ),
                                                    Moon,
                                                ],
                                            ] as const).map(
                                                ([
                                                    value,
                                                    label,
                                                    Icon,
                                                ]) => {
                                                    const active =
                                                        profilePreferences.theme ===
                                                        value;

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={
                                                                value
                                                            }
                                                            disabled={
                                                                busy
                                                            }
                                                            aria-pressed={
                                                                active
                                                            }
                                                            onClick={() =>
                                                                void updateProfilePreference(
                                                                    'theme',
                                                                    value,
                                                                )
                                                            }
                                                            className={[
                                                                'flex min-h-36 flex-col items-center justify-center gap-3 rounded-[18px] border p-5 transition',
                                                                active
                                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                                    : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]',
                                                            ].join(
                                                                ' ',
                                                            )}
                                                        >
                                                            <Icon
                                                                size={
                                                                    26
                                                                }
                                                            />

                                                            <strong className="text-xs">
                                                                {
                                                                    label
                                                                }
                                                            </strong>

                                                            <span
                                                                className={[
                                                                    'size-3 rounded-full border',
                                                                    active
                                                                        ? 'border-[var(--ac-accent-strong)] bg-[var(--ac-accent-strong)]'
                                                                        : 'border-[var(--ac-line-strong)]',
                                                                ].join(
                                                                    ' ',
                                                                )}
                                                            />
                                                        </button>
                                                    );
                                                },
                                            )}
                                        </div>
                                    </SettingCard>
                                )}

                                {section ===
                                    'layout' && (
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingCard
                                            title={text(
                                                'كثافة العرض',
                                                'Display density',
                                            )}
                                            icon={
                                                Grid2X2
                                            }
                                            description={text(
                                                'مريح للمساحات الواسعة أو مضغوط لعرض معلومات أكثر.',
                                                'Use comfortable spacing or a compact layout for denser information.',
                                            )}
                                        >
                                            <div className="grid grid-cols-2 gap-3">
                                                {([
                                                    [
                                                        'comfortable',
                                                        text(
                                                            'مريح',
                                                            'Comfortable',
                                                        ),
                                                    ],
                                                    [
                                                        'compact',
                                                        text(
                                                            'مضغوط',
                                                            'Compact',
                                                        ),
                                                    ],
                                                ] as const).map(
                                                    ([
                                                        value,
                                                        label,
                                                    ]) => {
                                                        const active =
                                                            profilePreferences.density ===
                                                            value;

                                                        return (
                                                            <button
                                                                type="button"
                                                                key={
                                                                    value
                                                                }
                                                                disabled={
                                                                    busy
                                                                }
                                                                aria-pressed={
                                                                    active
                                                                }
                                                                onClick={() =>
                                                                    void updateProfilePreference(
                                                                        'density',
                                                                        value,
                                                                    )
                                                                }
                                                                className={[
                                                                    'rounded-[17px] border p-5 transition',
                                                                    active
                                                                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                                        : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]',
                                                                ].join(
                                                                    ' ',
                                                                )}
                                                            >
                                                                <div
                                                                    className={[
                                                                        'mx-auto mb-4 grid w-20',
                                                                        value ===
                                                                        'comfortable'
                                                                            ? 'gap-2'
                                                                            : 'gap-1',
                                                                    ].join(
                                                                        ' ',
                                                                    )}
                                                                >
                                                                    {[1, 2, 3].map(
                                                                        (
                                                                            line,
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    line
                                                                                }
                                                                                className={[
                                                                                    'rounded bg-current opacity-25',
                                                                                    value ===
                                                                                    'comfortable'
                                                                                        ? 'h-2'
                                                                                        : 'h-1',
                                                                                ].join(
                                                                                    ' ',
                                                                                )}
                                                                            />
                                                                        ),
                                                                    )}
                                                                </div>

                                                                <span className="text-xs font-semibold">
                                                                    {
                                                                        label
                                                                    }
                                                                </span>
                                                            </button>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </SettingCard>

                                        <SettingCard
                                            title={text(
                                                'عدد العناصر في الصفحة',
                                                'Items per page',
                                            )}
                                            icon={
                                                Database
                                            }
                                        >
                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'الحجم الافتراضي للقوائم والملفات',
                                                    'Default list/file page size',
                                                )}

                                                <select
                                                    value={
                                                        profilePreferences.page_size
                                                    }
                                                    disabled={
                                                        busy
                                                    }
                                                    onChange={(
                                                        event,
                                                    ) =>
                                                        void updateProfilePreference(
                                                            'page_size',
                                                            Number(
                                                                event
                                                                    .target
                                                                    .value,
                                                            ),
                                                        )
                                                    }
                                                    className={
                                                        input
                                                        +' mt-2'
                                                    }
                                                >
                                                    {[10, 25, 50].map(
                                                        (
                                                            value,
                                                        ) => (
                                                            <option
                                                                key={
                                                                    value
                                                                }
                                                                value={
                                                                    value
                                                                }
                                                            >
                                                                {
                                                                    value
                                                                }
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>
                                        </SettingCard>
                                    </div>
                                )}

                                {section ===
                                    'notifications' && (
                                    <SettingCard
                                        title={text(
                                            'إشعارات هذا الجهاز',
                                            'Device notifications',
                                        )}
                                        icon={
                                            Bell
                                        }
                                        description={text(
                                            'الزر يطلب إذن المتصفح ويختبر الإشعار مباشرة.',
                                            'The button requests browser permission and sends a test notification immediately.',
                                        )}
                                    >
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <span
                                                    className={[
                                                        'inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold',
                                                        enabled
                                                            ? 'bg-emerald-50 text-emerald-700'
                                                            : 'bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]',
                                                    ].join(
                                                        ' ',
                                                    )}
                                                >
                                                    {enabled
                                                        ? text(
                                                            'مفعلة',
                                                            'Enabled',
                                                        )
                                                        : text(
                                                            'متوقفة',
                                                            'Disabled',
                                                        )}
                                                </span>

                                                <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'تعمل أثناء فتح AccoNova في المتصفح. الإشعارات بعد إغلاق الموقع بالكامل تحتاج خدمة Push مستقلة.',
                                                        'They work while AccoNova is open in the browser. Notifications after the site is fully closed require a separate push service.',
                                                    )}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    disabled={
                                                        busy
                                                    }
                                                    className={
                                                        primary
                                                    }
                                                    onClick={() =>
                                                        void toggleDevice()
                                                    }
                                                >
                                                    <Bell
                                                        size={
                                                            14
                                                        }
                                                    />

                                                    {enabled
                                                        ? text(
                                                            'إيقاف',
                                                            'Disable',
                                                        )
                                                        : text(
                                                            'تفعيل',
                                                            'Enable',
                                                        )}
                                                </button>

                                                {enabled && (
                                                    <button
                                                        type="button"
                                                        className={
                                                            button
                                                        }
                                                        onClick={() => {
                                                            try {
                                                                showDeviceNotification(
                                                                    1,
                                                                );

                                                                setMessage(
                                                                    text(
                                                                        'تم إرسال إشعار تجريبي.',
                                                                        'Test notification sent.',
                                                                    ),
                                                                );
                                                            } catch {
                                                                setError(
                                                                    text(
                                                                        'تعذر إرسال الإشعار التجريبي.',
                                                                        'Could not send the test notification.',
                                                                    ),
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        {text(
                                                            'اختبار',
                                                            'Test',
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </SettingCard>
                                )}

                                {section ===
                                    'security' && (
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingCard
                                            title={text(
                                                'أمان الحساب',
                                                'Account security',
                                            )}
                                            icon={
                                                ShieldCheck
                                            }
                                            description={text(
                                                'تغيير كلمة المرور، مراجعة الجلسات والأجهزة وإدارة الوصول.',
                                                'Change password, review sessions and devices, and manage account access.',
                                            )}
                                        >
                                            <div className="grid gap-2">
                                                <Link
                                                    href="/app/profile?view=security"
                                                    className={
                                                        primary
                                                    }
                                                >
                                                    <ShieldCheck
                                                        size={
                                                            14
                                                        }
                                                    />

                                                    {text(
                                                        'فتح مركز الأمان',
                                                        'Open security center',
                                                    )}
                                                </Link>

                                                <Link
                                                    href="/app/profile?view=edit"
                                                    className={
                                                        button
                                                    }
                                                >
                                                    <KeyRound
                                                        size={
                                                            14
                                                        }
                                                    />

                                                    {text(
                                                        'إدارة البريد وكلمة المرور',
                                                        'Manage email & account',
                                                    )}
                                                </Link>
                                            </div>
                                        </SettingCard>

                                        <SettingCard
                                            title={text(
                                                'الحساب الحالي',
                                                'Current account',
                                            )}
                                            icon={
                                                UserRound
                                            }
                                        >
                                            <dl className="space-y-4 text-xs">
                                                <div>
                                                    <dt className="text-[10px] text-[var(--ac-text-muted)]">
                                                        {text(
                                                            'البريد الإلكتروني',
                                                            'Email',
                                                        )}
                                                    </dt>

                                                    <dd className="mt-1 break-all font-semibold">
                                                        {auth.user?.email
                                                            ?? '—'}
                                                    </dd>
                                                </div>

                                                <div>
                                                    <dt className="text-[10px] text-[var(--ac-text-muted)]">
                                                        {text(
                                                            'مساحة العمل',
                                                            'Workspace',
                                                        )}
                                                    </dt>

                                                    <dd className="mt-1 font-semibold">
                                                        {workspace.activeOrganization?.name
                                                            ?? '—'}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </SettingCard>
                                    </div>
                                )}

                                {section ===
                                    'accessibility' && (
                                    <SettingCard
                                        title={text(
                                            'إمكانية الوصول',
                                            'Accessibility',
                                        )}
                                        icon={
                                            Eye
                                        }
                                        description={text(
                                            'الخيارات هنا تُطبق على الموقع كاملًا.',
                                            'These options apply across the entire app.',
                                        )}
                                    >
                                        <label className="flex cursor-pointer items-start justify-between gap-5 rounded-[16px] border border-[var(--ac-line)] p-4">
                                            <span>
                                                <strong className="text-xs">
                                                    {text(
                                                        'تقليل الحركة',
                                                        'Reduce motion',
                                                    )}
                                                </strong>

                                                <span className="mt-2 block max-w-xl text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'يعطّل معظم الحركات والانتقالات لمساعدة المستخدمين الحساسين للحركة.',
                                                        'Disables most animation and transitions for motion-sensitive users.',
                                                    )}
                                                </span>
                                            </span>

                                            <input
                                                type="checkbox"
                                                checked={
                                                    profilePreferences.reduced_motion
                                                }
                                                disabled={
                                                    busy
                                                }
                                                onChange={(
                                                    event,
                                                ) =>
                                                    void updateProfilePreference(
                                                        'reduced_motion',
                                                        event
                                                            .target
                                                            .checked,
                                                    )
                                                }
                                                className="mt-1 size-5 accent-[var(--ac-accent-strong)]"
                                            />
                                        </label>

                                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-[15px] bg-[var(--ac-surface-soft)] p-4">
                                                <Laptop
                                                    size={
                                                        18
                                                    }
                                                    className="text-[var(--ac-accent-strong)]"
                                                />

                                                <strong className="mt-3 block text-xs">
                                                    {text(
                                                        'التنقل بلوحة المفاتيح',
                                                        'Keyboard navigation',
                                                    )}
                                                </strong>

                                                <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'الأزرار والحقول الرئيسية تدعم التنقل والتركيز من لوحة المفاتيح.',
                                                        'Primary buttons and fields support keyboard focus and navigation.',
                                                    )}
                                                </p>
                                            </div>

                                            <div className="rounded-[15px] bg-[var(--ac-surface-soft)] p-4">
                                                <Eye
                                                    size={
                                                        18
                                                    }
                                                    className="text-[var(--ac-accent-strong)]"
                                                />

                                                <strong className="mt-3 block text-xs">
                                                    {text(
                                                        'واجهة متجاوبة',
                                                        'Responsive interface',
                                                    )}
                                                </strong>

                                                <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'تتكيف الواجهة مع الهاتف والتابلت والشاشات الكبيرة.',
                                                        'The interface adapts to phones, tablets and large screens.',
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </SettingCard>
                                )}

                                {section ===
                                    'team' && (
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <Link
                                            href="/app/staff"
                                            className={panel + ' p-5 transition hover:-translate-y-px'}
                                        >
                                            <UsersRound
                                                size={
                                                    20
                                                }
                                                className="text-[var(--ac-accent-strong)]"
                                            />

                                            <strong className="mt-4 block text-sm">
                                                {text(
                                                    'الموظفون',
                                                    'Employees',
                                                )}
                                            </strong>

                                            <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                                {text(
                                                    'إدارة دليل الموظفين، الحضور، المستحقات والتحليلات.',
                                                    'Manage employee directory, attendance, payroll and insights.',
                                                )}
                                            </p>
                                        </Link>

                                        <Link
                                            href="/app/roles"
                                            className={panel + ' p-5 transition hover:-translate-y-px'}
                                        >
                                            <LockKeyhole
                                                size={
                                                    20
                                                }
                                                className="text-[var(--ac-accent-strong)]"
                                            />

                                            <strong className="mt-4 block text-sm">
                                                {text(
                                                    'الأدوار والصلاحيات',
                                                    'Roles & permissions',
                                                )}
                                            </strong>

                                            <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                                {text(
                                                    'حدد من يستطيع عرض أو تعديل أو إدارة كل جزء من النظام.',
                                                    'Control who can view, edit and manage each part of the system.',
                                                )}
                                            </p>
                                        </Link>
                                    </div>
                                )}

                                {section ===
                                    'integrations' && (
                                    <SettingCard
                                        title={text(
                                            'ربط الحسابات والأدوات',
                                            'Connected accounts & tools',
                                        )}
                                        icon={
                                            Link2
                                        }
                                        description={text(
                                            'الأزرار الآن تستجيب وتوضح حالة الربط. الربط الحقيقي يحتاج إعداد OAuth لكل مزود.',
                                            'The buttons now respond and show connection status. Real connection requires OAuth configuration for each provider.',
                                        )}
                                    >
                                        <div className="grid gap-3 md:grid-cols-3">
                                            {integrations.map(
                                                (
                                                    integration,
                                                ) => {
                                                    const Icon =
                                                        integration.icon;

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={
                                                                integration.name
                                                            }
                                                            onClick={() =>
                                                                setIntegrationNotice(
                                                                    text(
                                                                        `تم فتح إعداد ${integration.name}. الربط الخارجي لم يُفعّل بعد لأن التطبيق يحتاج Client ID وClient Secret وRedirect URL من مزود الخدمة قبل إجراء OAuth حقيقي.`,
                                                                        `${integration.name} setup opened. External connection is not enabled yet because the app needs a provider Client ID, Client Secret and Redirect URL before real OAuth can run.`,
                                                                    ),
                                                                )
                                                            }
                                                            className="flex items-center gap-3 rounded-[16px] border border-[var(--ac-line)] p-4 text-start transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)]"
                                                        >
                                                            <span className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-surface-soft)] text-[var(--ac-accent-strong)]">
                                                                <Icon
                                                                    size={
                                                                        18
                                                                    }
                                                                />
                                                            </span>

                                                            <div className="min-w-0">
                                                                <strong className="block truncate text-xs">
                                                                    {
                                                                        integration.name
                                                                    }
                                                                </strong>

                                                                <span className="mt-1 block text-[10px] text-[var(--ac-text-muted)]">
                                                                    {text(
                                                                        'إعداد الربط',
                                                                        'Configure',
                                                                    )}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                },
                                            )}
                                        </div>

                                        {integrationNotice && (
                                            <div
                                                role="status"
                                                className="mt-4 rounded-[15px] border border-amber-200 bg-amber-50 p-4 text-[11px] leading-6 text-amber-800"
                                            >
                                                {
                                                    integrationNotice
                                                }
                                            </div>
                                        )}
                                    </SettingCard>
                                )}
                            </>
                        )}
                    </section>
                </div>
            </main>
        </AppShell>
    );
}
