import { CurrencyPicker } from '@/components/CurrencyPicker';
import { AppShell } from '@/layouts/AppShell';
import {
    deviceEnabled,
    deviceKey,
    deviceSupported,
    showDeviceNotification,
} from '@/lib/deviceNotifications';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    applyProfilePreferences,
    defaultProfilePreferences,
    type ProfilePreferences,
} from '@/lib/profilePreferences';
import type { AppPageProps } from '@/types/app';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Bell,
    Building2,
    CalendarDays,
    Check,
    ChevronRight,
    CircleDollarSign,
    Database,
    Eye,
    FileSpreadsheet,
    Globe2,
    Grid2X2,
    KeyRound,
    Languages,
    LockKeyhole,
    Moon,
    Palette,
    ReceiptText,
    Save,
    Settings2,
    ShieldCheck,
    Sun,
    UploadCloud,
    UserRound,
    UsersRound,
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
    country_code: string | null;
    tax_number: string | null;
    currency: string;
    reminder_days: number;
    default_payment_terms_days: number;
    fiscal_year_start_month: number;
    can_manage: boolean;
};

type SettingsSection =
    | 'organization'
    | 'finance'
    | 'localization'
    | 'appearance'
    | 'notifications'
    | 'access'
    | 'data';

type SectionDefinition = {
    key: SettingsSection;
    title: string;
    description: string;
    icon: typeof Settings2;
};

const panel =
    'rounded-[22px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-soft)]';

const input =
    'mt-2 w-full rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60';

const button =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-white px-4 text-xs font-semibold transition hover:bg-[var(--ac-surface-soft)] disabled:cursor-not-allowed disabled:opacity-45';

const primary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-strong)] px-4 text-xs font-semibold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45';

function errorText(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        return [
            error.message,
            ...Object.values(error.errors).flat(),
        ].filter(Boolean).join(' ');
    }

    return error instanceof Error ? error.message : fallback;
}

function Card({
    title,
    description,
    icon: Icon,
    children,
}: {
    title: string;
    description?: string;
    icon: typeof Settings2;
    children: ReactNode;
}) {
    return (
        <section className={panel}>
            <div className="flex items-start gap-3 border-b border-[var(--ac-line)] px-5 py-4 sm:px-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                    <Icon size={18} />
                </span>

                <div className="min-w-0">
                    <h2 className="text-sm font-bold text-[var(--ac-text)]">
                        {title}
                    </h2>

                    {description && (
                        <p className="mt-1 text-[11px] leading-5 text-[var(--ac-text-muted)]">
                            {description}
                        </p>
                    )}
                </div>
            </div>

            <div className="p-5 sm:p-6">
                {children}
            </div>
        </section>
    );
}

function StatusPill({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
            <Check size={12} />
            {children}
        </span>
    );
}

export default function Settings() {
    const { workspace } = usePage<AppPageProps>().props;

    return (
        <SettingsWorkspace
            key={workspace.activeOrganization?.id ?? 'none'}
        />
    );
}

function SettingsWorkspace() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const { auth, workspace } = usePage<AppPageProps>().props;
    const activeOrganization = workspace.activeOrganization;

    const sections: SectionDefinition[] = useMemo(
        () => [
            {
                key: 'organization',
                title: text('المؤسسة', 'Organization'),
                description: text(
                    'هوية مساحة العمل والبيانات الرسمية',
                    'Workspace identity and legal profile',
                ),
                icon: Building2,
            },
            {
                key: 'finance',
                title: text('المالية والفوترة', 'Finance & billing'),
                description: text(
                    'العملة والاستحقاقات والسنة المالية',
                    'Currency, due dates and fiscal year',
                ),
                icon: CircleDollarSign,
            },
            {
                key: 'localization',
                title: text('اللغة والمنطقة', 'Language & region'),
                description: text(
                    'اللغة والتوقيت وصيغ التاريخ',
                    'Language, timezone and date formats',
                ),
                icon: Globe2,
            },
            {
                key: 'appearance',
                title: text('المظهر والعرض', 'Appearance & display'),
                description: text(
                    'الثيم والكثافة وحجم القوائم',
                    'Theme, density and list size',
                ),
                icon: Palette,
            },
            {
                key: 'notifications',
                title: text('الإشعارات', 'Notifications'),
                description: text(
                    'تنبيهات الجهاز ومواعيد التذكير',
                    'Device alerts and reminders',
                ),
                icon: Bell,
            },
            {
                key: 'access',
                title: text('الأمان والوصول', 'Security & access'),
                description: text(
                    'الحساب والفريق والصلاحيات',
                    'Account, team and permissions',
                ),
                icon: ShieldCheck,
            },
            {
                key: 'data',
                title: text('البيانات والنقل', 'Data & migration'),
                description: text(
                    'استيراد البيانات القديمة وإدارة النقل',
                    'Legacy imports and migration tools',
                ),
                icon: Database,
            },
        ],
        [ar],
    );

    const [section, setSection] =
        useState<SettingsSection>('organization');

    const [workspacePreferences, setWorkspacePreferences] =
        useState<WorkspacePreferences | null>(null);

    const [profilePreferences, setProfilePreferences] =
        useState<ProfilePreferences>(defaultProfilePreferences());

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const deviceStorageKey = deviceKey(
        auth.user?.id ?? 0,
        activeOrganization?.id ?? 0,
    );

    const [deviceNotifications, setDeviceNotifications] =
        useState(() => deviceEnabled(deviceStorageKey));

    useEffect(() => {
        const controller = new AbortController();

        setLoading(true);
        setError('');

        Promise.all([
            apiRequest<WorkspacePreferences>(
                '/api/workspace-settings',
                { signal: controller.signal },
            ),
            apiRequest<{
                settings: Partial<ProfilePreferences> | null;
            }>(
                '/api/profile/preferences',
                { signal: controller.signal },
            ),
        ])
            .then(([workspaceData, profileData]) => {
                if (controller.signal.aborted) {
                    return;
                }

                setWorkspacePreferences(workspaceData);

                const next = {
                    ...defaultProfilePreferences(),
                    ...profileData.settings,
                };

                setProfilePreferences(next);
                applyProfilePreferences(next);
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted) {
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
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [activeOrganization?.id]);

    async function updateProfilePreference<
        K extends keyof ProfilePreferences,
    >(
        key: K,
        value: ProfilePreferences[K],
    ): Promise<void> {
        if (busy) {
            return;
        }

        const previous = profilePreferences;
        const next = {
            ...previous,
            [key]: value,
        };

        setProfilePreferences(next);
        applyProfilePreferences(next);
        setBusy(true);
        setError('');
        setMessage('');

        try {
            const response = await apiRequest<{
                settings: ProfilePreferences;
            }>(
                '/api/profile/preferences',
                {
                    method: 'PUT',
                    body: JSON.stringify(next),
                },
            );

            setProfilePreferences(response.settings);
            applyProfilePreferences(response.settings);

            setMessage(
                text(
                    'تم حفظ التفضيل وتطبيقه على حسابك.',
                    'Preference saved and applied to your account.',
                ),
            );
        } catch (failure) {
            setProfilePreferences(previous);
            applyProfilePreferences(previous);

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
            setBusy(false);
        }
    }

    async function saveWorkspace(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
            || !workspacePreferences
            || !workspacePreferences.can_manage
        ) {
            return;
        }

        const data = Object.fromEntries(
            new FormData(event.currentTarget),
        );

        setBusy(true);
        setError('');
        setMessage('');

        try {
            const saved = await apiRequest<WorkspacePreferences>(
                '/api/workspace-settings',
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        name: String(data.name ?? '').trim(),
                        country_code:
                            String(data.country_code ?? '')
                                .trim()
                                .toUpperCase() || null,
                        tax_number:
                            String(data.tax_number ?? '').trim() || null,
                        currency: String(data.currency ?? '')
                            .trim()
                            .toUpperCase(),
                        reminder_days: Number(data.reminder_days),
                        default_payment_terms_days: Number(
                            data.default_payment_terms_days,
                        ),
                        fiscal_year_start_month: Number(
                            data.fiscal_year_start_month,
                        ),
                    }),
                },
            );

            setWorkspacePreferences(saved);
            setMessage(
                text(
                    'تم حفظ إعدادات المؤسسة.',
                    'Organization settings saved.',
                ),
            );

            router.reload({
                only: ['workspace'],
            });
        } catch (failure) {
            setError(
                errorText(
                    failure,
                    text(
                        'تعذر حفظ إعدادات المؤسسة.',
                        'Could not save organization settings.',
                    ),
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function toggleDeviceNotifications(): Promise<void> {
        setError('');
        setMessage('');

        if (!deviceSupported()) {
            setError(
                text(
                    'تنبيهات الجهاز غير مدعومة هنا. استخدم HTTPS أو localhost ومتصفحاً يدعم الإشعارات.',
                    'Device notifications are unavailable here. Use HTTPS or localhost in a supported browser.',
                ),
            );

            return;
        }

        setBusy(true);

        try {
            if (deviceNotifications) {
                localStorage.removeItem(deviceStorageKey);
                setDeviceNotifications(false);
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

            if (permission !== 'granted') {
                setError(
                    text(
                        'المتصفح لم يمنح إذن الإشعارات. فعّل الإذن من إعدادات الموقع ثم حاول مجدداً.',
                        'Notification permission was not granted. Enable it in the browser site settings and try again.',
                    ),
                );

                return;
            }

            localStorage.setItem(deviceStorageKey, 'on');
            setDeviceNotifications(true);
            showDeviceNotification(1);

            setMessage(
                text(
                    'تم تفعيل تنبيهات الجهاز.',
                    'Device notifications enabled.',
                ),
            );
        } catch {
            setError(
                text(
                    'تعذر تغيير إعداد تنبيهات الجهاز.',
                    'Could not update device notifications.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    const currentSection =
        sections.find(item => item.key === section) ?? sections[0];

    const timezoneOptions = useMemo(() => {
        try {
            return Intl.supportedValuesOf('timeZone');
        } catch {
            return [
                'Asia/Hebron',
                'Asia/Amman',
                'Asia/Riyadh',
                'Asia/Dubai',
                'Europe/London',
                'Europe/Berlin',
                'America/New_York',
            ];
        }
    }, []);

    const fiscalMonths = [
        text('يناير', 'January'),
        text('فبراير', 'February'),
        text('مارس', 'March'),
        text('أبريل', 'April'),
        text('مايو', 'May'),
        text('يونيو', 'June'),
        text('يوليو', 'July'),
        text('أغسطس', 'August'),
        text('سبتمبر', 'September'),
        text('أكتوبر', 'October'),
        text('نوفمبر', 'November'),
        text('ديسمبر', 'December'),
    ];

    return (
        <AppShell>
            <Head title={text('الإعدادات', 'Settings')} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="min-h-[calc(100dvh-72px)] bg-[var(--ac-bg-soft)] px-3 py-5 sm:px-6 lg:px-8"
            >
                <div className="mx-auto max-w-[1380px] space-y-5">
                    <header className="overflow-hidden rounded-[26px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-soft)]">
                        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-start gap-4">
                                <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-[var(--ac-text)] text-white shadow-[var(--ac-shadow-soft)]">
                                    <Settings2 size={21} />
                                </span>

                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ac-text)] sm:text-3xl">
                                            {text(
                                                'الإعدادات',
                                                'Settings',
                                            )}
                                        </h1>

                                        <StatusPill>
                                            {text(
                                                'مساحة العمل نشطة',
                                                'Workspace active',
                                            )}
                                        </StatusPill>
                                    </div>

                                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                        {text(
                                            'اضبط المؤسسة والمالية وتجربة الاستخدام والأمان من مركز واحد. إعدادات المؤسسة تطبق على الجميع، بينما تفضيلات العرض تخص حسابك.',
                                            'Manage organization, finance, experience and security from one place. Organization settings apply to everyone; display preferences stay personal.',
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:flex">
                                <Link
                                    href="/app/profile"
                                    className={button}
                                >
                                    <UserRound size={15} />
                                    {text(
                                        'حسابي',
                                        'My account',
                                    )}
                                </Link>

                                <Link
                                    href="/app/roles"
                                    className={button}
                                >
                                    <ShieldCheck size={15} />
                                    {text(
                                        'الصلاحيات',
                                        'Permissions',
                                    )}
                                </Link>
                            </div>
                        </div>

                        <div className="grid border-t border-[var(--ac-line)] sm:grid-cols-3">
                            <div className="px-5 py-3.5">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                    {text(
                                        'المؤسسة',
                                        'Organization',
                                    )}
                                </p>
                                <p className="mt-1 truncate text-sm font-semibold">
                                    {workspacePreferences?.name
                                        ?? activeOrganization?.name
                                        ?? '—'}
                                </p>
                            </div>

                            <div className="border-t border-[var(--ac-line)] px-5 py-3.5 sm:border-s sm:border-t-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                    {text(
                                        'العملة الأساسية',
                                        'Base currency',
                                    )}
                                </p>
                                <p className="mt-1 text-sm font-semibold" dir="ltr">
                                    {workspacePreferences?.currency ?? '—'}
                                </p>
                            </div>

                            <div className="border-t border-[var(--ac-line)] px-5 py-3.5 sm:border-s sm:border-t-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                    {text(
                                        'دورك الحالي',
                                        'Your role',
                                    )}
                                </p>
                                <p className="mt-1 text-sm font-semibold capitalize">
                                    {activeOrganization?.role ?? '—'}
                                </p>
                            </div>
                        </div>
                    </header>

                    {error && (
                        <div
                            role="alert"
                            className="rounded-[15px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                        >
                            {error}
                        </div>
                    )}

                    {message && (
                        <div
                            role="status"
                            className="rounded-[15px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                        >
                            {message}
                        </div>
                    )}

                    <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="lg:sticky lg:top-5">
                            <nav className={panel + ' overflow-hidden p-2'}>
                                {sections.map(item => {
                                    const Icon = item.icon;
                                    const active = section === item.key;

                                    return (
                                        <button
                                            type="button"
                                            key={item.key}
                                            onClick={() => {
                                                setSection(item.key);
                                                setError('');
                                                setMessage('');
                                            }}
                                            className={[
                                                'flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-start transition',
                                                active
                                                    ? 'bg-[var(--ac-surface-strong)] text-[var(--ac-text)]'
                                                    : 'text-[var(--ac-text-soft)] hover:bg-[var(--ac-bg-soft)]',
                                            ].join(' ')}
                                        >
                                            <span
                                                className={[
                                                    'flex size-9 shrink-0 items-center justify-center rounded-[12px]',
                                                    active
                                                        ? 'bg-white text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-soft)]'
                                                        : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                                                ].join(' ')}
                                            >
                                                <Icon size={16} />
                                            </span>

                                            <span className="min-w-0 flex-1">
                                                <strong className="block text-xs">
                                                    {item.title}
                                                </strong>
                                                <span className="mt-0.5 block truncate text-[10px] text-[var(--ac-text-muted)]">
                                                    {item.description}
                                                </span>
                                            </span>

                                            <ChevronRight
                                                size={14}
                                                className="shrink-0 rtl:rotate-180"
                                            />
                                        </button>
                                    );
                                })}
                            </nav>

                            <div className="mt-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-text)] p-4 text-white">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                                    AccoNova
                                </p>
                                <p className="mt-2 text-xs font-semibold">
                                    {text(
                                        'إعدادات قابلة للتوسع مع نمو الشركة.',
                                        'Settings designed to scale with your company.',
                                    )}
                                </p>
                                <p className="mt-2 text-[10px] leading-5 text-white/60">
                                    {text(
                                        'غيّر الإعداد مرة واحدة بدل تكراره في كل شاشة.',
                                        'Configure once instead of repeating choices on every screen.',
                                    )}
                                </p>
                            </div>
                        </aside>

                        <section className="min-w-0 space-y-4">
                            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                                        {text(
                                            'الإعدادات',
                                            'Settings',
                                        )}
                                    </p>
                                    <h2 className="mt-1 text-xl font-bold text-[var(--ac-text)]">
                                        {currentSection.title}
                                    </h2>
                                    <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                        {currentSection.description}
                                    </p>
                                </div>

                                {loading && (
                                    <span className="text-xs text-[var(--ac-text-muted)]">
                                        {text(
                                            'جاري تحميل الإعدادات...',
                                            'Loading settings...',
                                        )}
                                    </span>
                                )}
                            </div>

                            {section === 'organization' && (
                                <form onSubmit={saveWorkspace} className="space-y-4">
                                    <Card
                                        title={text(
                                            'هوية المؤسسة',
                                            'Organization profile',
                                        )}
                                        description={text(
                                            'الاسم والبلد والرقم الضريبي تظهر كأساس للبيانات المالية والإدارية.',
                                            'Core company identity used across financial and administrative workflows.',
                                        )}
                                        icon={Building2}
                                    >
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'اسم المؤسسة *',
                                                    'Organization name *',
                                                )}
                                                <input
                                                    name="name"
                                                    required
                                                    maxLength={160}
                                                    disabled={
                                                        busy
                                                        || !workspacePreferences?.can_manage
                                                    }
                                                    defaultValue={
                                                        workspacePreferences?.name
                                                        ?? ''
                                                    }
                                                    className={input}
                                                />
                                            </label>

                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'رمز البلد ISO (اختياري)',
                                                    'Country code ISO (optional)',
                                                )}
                                                <input
                                                    name="country_code"
                                                    maxLength={2}
                                                    dir="ltr"
                                                    placeholder="PS"
                                                    disabled={
                                                        busy
                                                        || !workspacePreferences?.can_manage
                                                    }
                                                    defaultValue={
                                                        workspacePreferences?.country_code
                                                        ?? ''
                                                    }
                                                    className={input}
                                                />
                                            </label>

                                            <label className="text-xs font-semibold sm:col-span-2">
                                                {text(
                                                    'الرقم الضريبي / رقم التسجيل (اختياري)',
                                                    'Tax / registration number (optional)',
                                                )}
                                                <input
                                                    name="tax_number"
                                                    maxLength={80}
                                                    dir="ltr"
                                                    disabled={
                                                        busy
                                                        || !workspacePreferences?.can_manage
                                                    }
                                                    defaultValue={
                                                        workspacePreferences?.tax_number
                                                        ?? ''
                                                    }
                                                    className={input}
                                                />
                                            </label>
                                        </div>
                                    </Card>

                                    <Card
                                        title={text(
                                            'إدارة المؤسسة',
                                            'Organization management',
                                        )}
                                        description={text(
                                            'أدوات الإدارة اليومية منفصلة عن تفضيلات العرض الشخصية.',
                                            'Operational administration stays separate from personal display preferences.',
                                        )}
                                        icon={UsersRound}
                                    >
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <Link
                                                href="/app/staff"
                                                className="group rounded-[17px] border border-[var(--ac-line)] p-4 transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-surface-soft)]"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                                        <UsersRound size={17} />
                                                    </span>
                                                    <div>
                                                        <strong className="text-xs">
                                                            {text(
                                                                'الفريق',
                                                                'Team',
                                                            )}
                                                        </strong>
                                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                            {text(
                                                                'الموظفون والحضور والرواتب',
                                                                'Staff, attendance and payroll',
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>

                                            <Link
                                                href="/app/roles"
                                                className="group rounded-[17px] border border-[var(--ac-line)] p-4 transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-surface-soft)]"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="flex size-10 items-center justify-center rounded-[13px] bg-violet-50 text-violet-700">
                                                        <ShieldCheck size={17} />
                                                    </span>
                                                    <div>
                                                        <strong className="text-xs">
                                                            {text(
                                                                'الأدوار والصلاحيات',
                                                                'Roles & permissions',
                                                            )}
                                                        </strong>
                                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                            {text(
                                                                'تحكم بمن يستطيع رؤية أو تعديل كل قسم',
                                                                'Control who can see or change each area',
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </Link>
                                        </div>
                                    </Card>

                                    {workspacePreferences?.can_manage ? (
                                        <div className="sticky bottom-3 z-10 flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={busy || loading}
                                                className={primary + ' shadow-lg'}
                                            >
                                                <Save size={15} />
                                                {text(
                                                    'حفظ إعدادات المؤسسة',
                                                    'Save organization settings',
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="rounded-[15px] border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800">
                                            {text(
                                                'هذه الإعدادات متاحة للعرض فقط. المالك أو المسؤول يستطيع تعديل إعدادات المؤسسة.',
                                                'These settings are read-only. An owner or admin can update organization settings.',
                                            )}
                                        </div>
                                    )}
                                </form>
                            )}

                            {section === 'finance' && workspacePreferences && (
                                <form onSubmit={saveWorkspace} className="space-y-4">
                                    <input
                                        type="hidden"
                                        name="name"
                                        value={workspacePreferences.name}
                                    />
                                    <input
                                        type="hidden"
                                        name="country_code"
                                        value={workspacePreferences.country_code ?? ''}
                                    />
                                    <input
                                        type="hidden"
                                        name="tax_number"
                                        value={workspacePreferences.tax_number ?? ''}
                                    />

                                    <Card
                                        title={text(
                                            'العملة الأساسية',
                                            'Base currency',
                                        )}
                                        description={text(
                                            'هذه العملة تعتمد تلقائياً في الفواتير والدفعات والضرائب. لا يحتاج المستخدم لاختيارها كل مرة.',
                                            'This currency is automatically used across invoices, cash movements and taxes.',
                                        )}
                                        icon={Wallet}
                                    >
                                        <CurrencyPicker
                                            initial={
                                                workspacePreferences.currency
                                            }
                                        />
                                    </Card>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <Card
                                            title={text(
                                                'شروط الدفع الافتراضية',
                                                'Default payment terms',
                                            )}
                                            description={text(
                                                'تحدد تلقائياً تاريخ استحقاق الفواتير الجديدة.',
                                                'Automatically sets due dates on new invoices.',
                                            )}
                                            icon={ReceiptText}
                                        >
                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'عدد الأيام بعد تاريخ الفاتورة *',
                                                    'Days after invoice date *',
                                                )}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={365}
                                                    step={1}
                                                    name="default_payment_terms_days"
                                                    disabled={
                                                        busy
                                                        || !workspacePreferences.can_manage
                                                    }
                                                    defaultValue={
                                                        workspacePreferences.default_payment_terms_days
                                                    }
                                                    className={input}
                                                />
                                            </label>

                                            <p className="mt-3 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                {text(
                                                    'مثال: 30 يعني أن الفاتورة الجديدة تستحق بعد 30 يوماً تلقائياً، ويمكن تغييرها داخل الفاتورة عند الحاجة.',
                                                    'Example: 30 makes new invoices due in 30 days automatically; it can still be changed per invoice.',
                                                )}
                                            </p>
                                        </Card>

                                        <Card
                                            title={text(
                                                'السنة المالية',
                                                'Fiscal year',
                                            )}
                                            description={text(
                                                'حدد الشهر الذي تبدأ فيه السنة المالية للمؤسسة.',
                                                'Choose the month your organization fiscal year starts.',
                                            )}
                                            icon={CalendarDays}
                                        >
                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'شهر البداية *',
                                                    'Start month *',
                                                )}
                                                <select
                                                    name="fiscal_year_start_month"
                                                    disabled={
                                                        busy
                                                        || !workspacePreferences.can_manage
                                                    }
                                                    defaultValue={
                                                        workspacePreferences.fiscal_year_start_month
                                                    }
                                                    className={input}
                                                >
                                                    {fiscalMonths.map(
                                                        (month, index) => (
                                                            <option
                                                                key={month}
                                                                value={index + 1}
                                                            >
                                                                {month}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>
                                        </Card>
                                    </div>

                                    <Card
                                        title={text(
                                            'التذكيرات المالية',
                                            'Financial reminders',
                                        )}
                                        description={text(
                                            'عدد الأيام الافتراضي قبل موعد الاستحقاق لإظهار تنبيه.',
                                            'Default lead time before due dates are flagged.',
                                        )}
                                        icon={Bell}
                                    >
                                        <div className="max-w-sm">
                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'التذكير قبل (أيام) *',
                                                    'Remind before (days) *',
                                                )}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={30}
                                                    step={1}
                                                    name="reminder_days"
                                                    disabled={
                                                        busy
                                                        || !workspacePreferences.can_manage
                                                    }
                                                    defaultValue={
                                                        workspacePreferences.reminder_days
                                                    }
                                                    className={input}
                                                />
                                            </label>
                                        </div>
                                    </Card>

                                    {workspacePreferences.can_manage && (
                                        <div className="sticky bottom-3 z-10 flex justify-end">
                                            <button
                                                type="submit"
                                                disabled={busy || loading}
                                                className={primary + ' shadow-lg'}
                                            >
                                                <Save size={15} />
                                                {text(
                                                    'حفظ الإعدادات المالية',
                                                    'Save finance settings',
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </form>
                            )}

                            {section === 'localization' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <Card
                                            title={text(
                                                'اللغة',
                                                'Language',
                                            )}
                                            description={text(
                                                'واجهة AccoNova واتجاهها تتغير فوراً.',
                                                'The interface language and direction update immediately.',
                                            )}
                                            icon={Languages}
                                        >
                                            <div className="grid grid-cols-2 gap-3">
                                                {([
                                                    ['ar', 'العربية'],
                                                    ['en', 'English'],
                                                ] as const).map(([value, label]) => {
                                                    const active =
                                                        profilePreferences.locale === value;

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={value}
                                                            disabled={busy}
                                                            onClick={() =>
                                                                void updateProfilePreference(
                                                                    'locale',
                                                                    value,
                                                                )
                                                            }
                                                            className={[
                                                                'rounded-[16px] border p-4 text-sm font-semibold transition',
                                                                active
                                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                                    : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]',
                                                            ].join(' ')}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </Card>

                                        <Card
                                            title={text(
                                                'المنطقة الزمنية',
                                                'Timezone',
                                            )}
                                            description={text(
                                                'تؤثر على عرض مواعيد النشاط والتنبيهات.',
                                                'Controls how activity and reminder times are displayed.',
                                            )}
                                            icon={Globe2}
                                        >
                                            <select
                                                value={profilePreferences.timezone}
                                                disabled={busy}
                                                onChange={event =>
                                                    void updateProfilePreference(
                                                        'timezone',
                                                        event.target.value,
                                                    )
                                                }
                                                className={input}
                                            >
                                                {timezoneOptions.map(zone => (
                                                    <option
                                                        key={zone}
                                                        value={zone}
                                                    >
                                                        {zone}
                                                    </option>
                                                ))}
                                            </select>
                                        </Card>
                                    </div>

                                    <Card
                                        title={text(
                                            'التاريخ والوقت',
                                            'Date & time',
                                        )}
                                        description={text(
                                            'هذه الخيارات تخص طريقة العرض في حسابك ولا تغيّر البيانات المخزنة.',
                                            'These choices affect display only and do not alter stored records.',
                                        )}
                                        icon={CalendarDays}
                                    >
                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'صيغة التاريخ',
                                                    'Date format',
                                                )}
                                                <select
                                                    value={profilePreferences.date_format}
                                                    disabled={busy}
                                                    onChange={event =>
                                                        void updateProfilePreference(
                                                            'date_format',
                                                            event.target.value as ProfilePreferences['date_format'],
                                                        )
                                                    }
                                                    className={input}
                                                >
                                                    <option value="numeric">
                                                        {text(
                                                            'رقمية',
                                                            'Numeric',
                                                        )}
                                                    </option>
                                                    <option value="long">
                                                        {text(
                                                            'مطولة',
                                                            'Long',
                                                        )}
                                                    </option>
                                                </select>
                                            </label>

                                            <label className="text-xs font-semibold">
                                                {text(
                                                    'الوقت',
                                                    'Clock',
                                                )}
                                                <select
                                                    value={profilePreferences.hour_cycle}
                                                    disabled={busy}
                                                    onChange={event =>
                                                        void updateProfilePreference(
                                                            'hour_cycle',
                                                            event.target.value as ProfilePreferences['hour_cycle'],
                                                        )
                                                    }
                                                    className={input}
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
                                                    'Week starts',
                                                )}
                                                <select
                                                    value={profilePreferences.week_start}
                                                    disabled={busy}
                                                    onChange={event =>
                                                        void updateProfilePreference(
                                                            'week_start',
                                                            event.target.value as ProfilePreferences['week_start'],
                                                        )
                                                    }
                                                    className={input}
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
                                    </Card>
                                </div>
                            )}

                            {section === 'appearance' && (
                                <div className="space-y-4">
                                    <Card
                                        title={text(
                                            'الثيم',
                                            'Theme',
                                        )}
                                        description={text(
                                            'اختر المظهر المريح لك، وسيُحفظ على حسابك.',
                                            'Choose your preferred look; it is saved to your account.',
                                        )}
                                        icon={Palette}
                                    >
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            {([
                                                ['light', text('فاتح', 'Light'), Sun],
                                                ['system', text('تلقائي', 'System'), Eye],
                                                ['dark', text('داكن', 'Dark'), Moon],
                                            ] as const).map(([value, label, Icon]) => {
                                                const active =
                                                    profilePreferences.theme === value;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={value}
                                                        disabled={busy}
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
                                                        ].join(' ')}
                                                    >
                                                        <Icon size={25} />
                                                        <strong className="text-xs">
                                                            {label}
                                                        </strong>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </Card>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <Card
                                            title={text(
                                                'كثافة الواجهة',
                                                'Interface density',
                                            )}
                                            description={text(
                                                'مريح للمساحات الواسعة أو مضغوط لعرض معلومات أكثر.',
                                                'Comfortable for breathing room or compact for denser data.',
                                            )}
                                            icon={Grid2X2}
                                        >
                                            <div className="grid grid-cols-2 gap-3">
                                                {([
                                                    ['comfortable', text('مريح', 'Comfortable')],
                                                    ['compact', text('مضغوط', 'Compact')],
                                                ] as const).map(([value, label]) => {
                                                    const active =
                                                        profilePreferences.density === value;

                                                    return (
                                                        <button
                                                            type="button"
                                                            key={value}
                                                            disabled={busy}
                                                            onClick={() =>
                                                                void updateProfilePreference(
                                                                    'density',
                                                                    value,
                                                                )
                                                            }
                                                            className={[
                                                                'rounded-[16px] border p-4 text-xs font-semibold transition',
                                                                active
                                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                                    : 'border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]',
                                                            ].join(' ')}
                                                        >
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </Card>

                                        <Card
                                            title={text(
                                                'القوائم والحركة',
                                                'Lists & motion',
                                            )}
                                            description={text(
                                                'تحكم بعدد السجلات والحركة البصرية.',
                                                'Control list size and motion behavior.',
                                            )}
                                            icon={Eye}
                                        >
                                            <div className="space-y-4">
                                                <label className="text-xs font-semibold">
                                                    {text(
                                                        'عدد العناصر في الصفحة',
                                                        'Items per page',
                                                    )}
                                                    <select
                                                        value={profilePreferences.page_size}
                                                        disabled={busy}
                                                        onChange={event =>
                                                            void updateProfilePreference(
                                                                'page_size',
                                                                Number(event.target.value),
                                                            )
                                                        }
                                                        className={input}
                                                    >
                                                        {[10, 25, 50].map(value => (
                                                            <option
                                                                key={value}
                                                                value={value}
                                                            >
                                                                {value}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className="flex items-center justify-between gap-4 rounded-[14px] border border-[var(--ac-line)] p-4">
                                                    <span>
                                                        <strong className="block text-xs">
                                                            {text(
                                                                'تقليل الحركة',
                                                                'Reduce motion',
                                                            )}
                                                        </strong>
                                                        <span className="mt-1 block text-[10px] text-[var(--ac-text-muted)]">
                                                            {text(
                                                                'يخفف الانتقالات والمؤثرات.',
                                                                'Reduces transitions and animation.',
                                                            )}
                                                        </span>
                                                    </span>

                                                    <input
                                                        type="checkbox"
                                                        checked={profilePreferences.reduced_motion}
                                                        disabled={busy}
                                                        onChange={event =>
                                                            void updateProfilePreference(
                                                                'reduced_motion',
                                                                event.target.checked,
                                                            )
                                                        }
                                                        className="size-5 accent-[var(--ac-accent-strong)]"
                                                    />
                                                </label>
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            )}

                            {section === 'notifications' && (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <Card
                                        title={text(
                                            'تنبيهات هذا الجهاز',
                                            'This device notifications',
                                        )}
                                        description={text(
                                            'اسمح للمتصفح بعرض تنبيهات AccoNova على هذا الجهاز.',
                                            'Allow this browser to show AccoNova notifications on this device.',
                                        )}
                                        icon={Bell}
                                    >
                                        <div className="flex items-center justify-between gap-4 rounded-[16px] border border-[var(--ac-line)] p-4">
                                            <div>
                                                <strong className="text-xs">
                                                    {deviceNotifications
                                                        ? text(
                                                            'مفعلة',
                                                            'Enabled',
                                                        )
                                                        : text(
                                                            'متوقفة',
                                                            'Disabled',
                                                        )}
                                                </strong>
                                                <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'الإذن خاص بهذا المتصفح والجهاز.',
                                                        'Permission is specific to this browser and device.',
                                                    )}
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() =>
                                                    void toggleDeviceNotifications()
                                                }
                                                className={
                                                    deviceNotifications
                                                        ? button
                                                        : primary
                                                }
                                            >
                                                {deviceNotifications
                                                    ? text(
                                                        'إيقاف',
                                                        'Disable',
                                                    )
                                                    : text(
                                                        'تفعيل',
                                                        'Enable',
                                                    )}
                                            </button>
                                        </div>
                                    </Card>

                                    <Card
                                        title={text(
                                            'مواعيد التذكير',
                                            'Reminder timing',
                                        )}
                                        description={text(
                                            'الإعداد المالي العام يحدد متى تظهر تنبيهات الاستحقاق.',
                                            'The workspace finance setting controls when due-date reminders are flagged.',
                                        )}
                                        icon={CalendarDays}
                                    >
                                        <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
                                            <p className="text-xs font-semibold">
                                                {text(
                                                    'التذكير الحالي',
                                                    'Current reminder',
                                                )}
                                            </p>
                                            <p className="mt-2 text-2xl font-bold">
                                                {workspacePreferences?.reminder_days ?? '—'}
                                                <span className="ms-2 text-xs font-medium text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'يوم',
                                                        'days',
                                                    )}
                                                </span>
                                            </p>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSection('finance')
                                                }
                                                className={button + ' mt-4'}
                                            >
                                                {text(
                                                    'تعديل من الإعدادات المالية',
                                                    'Edit finance reminders',
                                                )}
                                            </button>
                                        </div>
                                    </Card>
                                </div>
                            )}

                            {section === 'access' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <Card
                                            title={text(
                                                'حسابي',
                                                'My account',
                                            )}
                                            description={text(
                                                'الملف الشخصي والبريد وكلمة المرور.',
                                                'Profile, email and password.',
                                            )}
                                            icon={UserRound}
                                        >
                                            <Link
                                                href="/app/profile"
                                                className={primary}
                                            >
                                                <KeyRound size={15} />
                                                {text(
                                                    'فتح الحساب',
                                                    'Open account',
                                                )}
                                            </Link>
                                        </Card>

                                        <Card
                                            title={text(
                                                'الفريق',
                                                'Team',
                                            )}
                                            description={text(
                                                'الموظفون والعضوية داخل المؤسسة.',
                                                'Staff and organization membership.',
                                            )}
                                            icon={UsersRound}
                                        >
                                            <Link
                                                href="/app/staff"
                                                className={button}
                                            >
                                                <UsersRound size={15} />
                                                {text(
                                                    'إدارة الفريق',
                                                    'Manage team',
                                                )}
                                            </Link>
                                        </Card>

                                        <Card
                                            title={text(
                                                'الأدوار والصلاحيات',
                                                'Roles & permissions',
                                            )}
                                            description={text(
                                                'صلاحيات دقيقة حسب الدور ومساحة العمل.',
                                                'Granular access by role and workspace.',
                                            )}
                                            icon={ShieldCheck}
                                        >
                                            <Link
                                                href="/app/roles"
                                                className={button}
                                            >
                                                <LockKeyhole size={15} />
                                                {text(
                                                    'إدارة الصلاحيات',
                                                    'Manage permissions',
                                                )}
                                            </Link>
                                        </Card>
                                    </div>

                                    <Card
                                        title={text(
                                            'حالة الأمان',
                                            'Security status',
                                        )}
                                        description={text(
                                            'AccoNova يفصل بيانات كل مؤسسة ويطبق الصلاحيات على مستوى الواجهة والخادم.',
                                            'AccoNova isolates organization data and enforces permissions at both UI and server levels.',
                                        )}
                                        icon={ShieldCheck}
                                    >
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            {[
                                                text(
                                                    'حساب موثق',
                                                    'Verified account',
                                                ),
                                                text(
                                                    'صلاحيات حسب الدور',
                                                    'Role-based access',
                                                ),
                                                text(
                                                    'عزل بيانات المؤسسة',
                                                    'Workspace data isolation',
                                                ),
                                            ].map(item => (
                                                <div
                                                    key={item}
                                                    className="rounded-[14px] border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800"
                                                >
                                                    <Check
                                                        size={14}
                                                        className="mb-2"
                                                    />
                                                    {item}
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            )}

                            {section === 'data' && (
                                <div className="space-y-4">
                                    <Card
                                        title={text(
                                            'نقل البيانات إلى AccoNova',
                                            'Move data into AccoNova',
                                        )}
                                        description={text(
                                            'بدل الإدخال اليدوي، استخدم ملفات Excel/CSV لنقل البيانات القديمة بأمان.',
                                            'Use Excel/CSV migration tools instead of re-entering historical data manually.',
                                        )}
                                        icon={UploadCloud}
                                    >
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <Link
                                                href="/app/finance/import"
                                                className="rounded-[18px] border border-[var(--ac-line)] p-5 transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-surface-soft)]"
                                            >
                                                <span className="flex size-11 items-center justify-center rounded-[14px] bg-blue-50 text-blue-700">
                                                    <FileSpreadsheet size={19} />
                                                </span>
                                                <strong className="mt-4 block text-sm">
                                                    {text(
                                                        'استيراد البيانات المالية',
                                                        'Import finance data',
                                                    )}
                                                </strong>
                                                <p className="mt-2 text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'فواتير بيع وشراء، دفعات، مقبوضات ومصاريف.',
                                                        'Sales, purchases, payments, receipts and expenses.',
                                                    )}
                                                </p>
                                            </Link>

                                            <Link
                                                href="/app/staff/import"
                                                className="rounded-[18px] border border-[var(--ac-line)] p-5 transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-surface-soft)]"
                                            >
                                                <span className="flex size-11 items-center justify-center rounded-[14px] bg-violet-50 text-violet-700">
                                                    <UsersRound size={19} />
                                                </span>
                                                <strong className="mt-4 block text-sm">
                                                    {text(
                                                        'استيراد الموظفين',
                                                        'Import staff data',
                                                    )}
                                                </strong>
                                                <p className="mt-2 text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'الموظفون والحضور وسجلات الرواتب القديمة.',
                                                        'Employees, attendance and legacy payroll records.',
                                                    )}
                                                </p>
                                            </Link>
                                        </div>
                                    </Card>

                                    <Card
                                        title={text(
                                            'سياسة النقل الآمن',
                                            'Safe migration policy',
                                        )}
                                        description={text(
                                            'قواعد تمنع النقل من تخريب البيانات الحالية.',
                                            'Guardrails that keep imported history from corrupting current operations.',
                                        )}
                                        icon={Database}
                                    >
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            {[
                                                text(
                                                    'معاينة قبل الاستيراد',
                                                    'Preview before import',
                                                ),
                                                text(
                                                    'حماية من التكرار',
                                                    'Duplicate protection',
                                                ),
                                                text(
                                                    'الفواتير التاريخية لا تحرك مخزون اليوم',
                                                    'Historical invoices do not alter current stock',
                                                ),
                                            ].map(item => (
                                                <div
                                                    key={item}
                                                    className="rounded-[14px] bg-[var(--ac-surface-soft)] p-4 text-xs font-semibold"
                                                >
                                                    <Check
                                                        size={14}
                                                        className="mb-2 text-emerald-600"
                                                    />
                                                    {item}
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </main>
        </AppShell>
    );
}
