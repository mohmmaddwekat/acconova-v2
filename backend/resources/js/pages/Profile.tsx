import { activeProfileTab, ProfileCenter, ProfileTabs } from '@/features/profile/ProfileCenter';
import {
    fetchProfile,
    requestProfileEmailChange,
    updateProfile,
    uploadProfileAvatar,
} from '@/features/profile/api';
import type {
    ProfileResponse,
    ProfileSession,
} from '@/features/profile/types';
import {
    AppShell,
} from '@/layouts/AppShell';
import {
    ApiError,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    BadgeCheck,
    BriefcaseBusiness,
    Building2,
    CalendarDays,
    Camera,
    CheckCircle2,
    Clock3,
    Contact,
    Edit3,
    Globe2,
    KeyRound,
    Laptop,
    Mail,
    MapPin,
    MonitorSmartphone,
    Phone,
    Save,
    ShieldCheck,
    Sparkles,
    UserRound,
    UsersRound,
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

const cardClass =
    'rounded-[22px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-soft)]';

const inputClass =
    'w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--ac-accent-soft)]';

const primaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-strong)] px-4 text-sm font-semibold text-white transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-45';

const secondaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-white px-4 text-sm font-semibold transition hover:bg-[var(--ac-surface-soft)] disabled:opacity-45';

/**
 * Convert API failures into readable inline copy.
 */
function profileErrorText(
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
        : 'Something went wrong.';
}

/**
 * Build two-letter initials from a user name.
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
 * Resolve the active Profile view from the page query string.
 */
function resolveView(
    url: string,
): 'overview' | 'edit' {
    const query =
        url.includes(
            '?',
        )
            ? url.split(
                  '?',
              )[
                  1
              ]
            : '';

    return new URLSearchParams(
        query,
    ).get(
        'view',
    ) ===
        'edit'
        ? 'edit'
        : 'overview';
}

/**
 * Format an ISO date for the active locale.
 */
function formatDate(
    value: string | null,
    ar: boolean,
): string {
    if (
        ! value
    ) {
        return '—';
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
            year:
                'numeric',

            month:
                'long',

            day:
                'numeric',
        },
    ).format(
        date,
    );
}

/**
 * Format Laravel's session last_activity Unix timestamp.
 */
function formatSessionTime(
    value: number,
    ar: boolean,
): string {
    const date =
        new Date(
            value
            * 1000,
        );

    return new Intl.DateTimeFormat(
        ar
            ? 'ar'
            : 'en',
        {
            dateStyle:
                'medium',

            timeStyle:
                'short',
        },
    ).format(
        date,
    );
}

/**
 * Extract a friendly browser/device name from a session user agent.
 */
function sessionLabel(
    agent: string | null,
): string {
    if (
        ! agent
    ) {
        return 'Unknown device';
    }

    const browser =
        agent.includes(
            'Edg/',
        )
            ? 'Microsoft Edge'
            : agent.includes(
                    'Chrome/',
                )
              ? 'Google Chrome'
              : agent.includes(
                      'Firefox/',
                  )
                ? 'Firefox'
                : agent.includes(
                        'Safari/',
                    )
                  ? 'Safari'
                  : 'Browser';

    const device =
        agent.includes(
            'Windows',
        )
            ? 'Windows'
            : agent.includes(
                    'Macintosh',
                )
              ? 'macOS'
              : agent.includes(
                      'Android',
                  )
                ? 'Android'
                : agent.includes(
                        'iPhone',
                    )
                  ? 'iPhone'
                  : '';

    return [
        browser,
        device,
    ]
        .filter(
            Boolean,
        )
        .join(
            ' · ',
        );
}

/**
 * Render the authenticated user's premium Profile Center.
 */
export default function ProfilePage() {
    const locale =
        useLocale();

    const ar =
        locale ===
        'ar';

    const page =
        usePage<AppPageProps>();

    const view =
        resolveView(
            page.url,
        );

    const [
        profile,
        setProfile,
    ] =
        useState<ProfileResponse | null>(
            null,
        );

    const [
        loading,
        setLoading,
    ] =
        useState(
            true,
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
                      'الملف الشخصي',

                  loading:
                      'جارٍ تحميل الملف الشخصي…',

                  loadError:
                      'تعذر تحميل الملف الشخصي.',

                  dismiss:
                      'إغلاق',

                  overview:
                      'نظرة عامة',

                  edit:
                      'تعديل الملف الشخصي',

                  manageAccount:
                      'إدارة الحساب',

                  online:
                      'الحساب نشط',

                  workspace:
                      'مساحة العمل الحالية',

                  personalInfo:
                      'المعلومات الشخصية',

                  contactInfo:
                      'معلومات التواصل',

                  organization:
                      'الانتماء للمؤسسة',

                  security:
                      'الأمان والحساب',

                  sessions:
                      'الجلسات النشطة',

                  quickActions:
                      'إجراءات سريعة',

                  accountAge:
                      'عضو منذ',

                  verified:
                      'البريد موثق',

                  unverified:
                      'البريد غير موثق',

                  profileComplete:
                      'اكتمال الملف',

                  fieldsComplete:
                      'حقول مكتملة',

                  activeSessions:
                      'الجلسات النشطة',

                  workspaces:
                      'مساحات العمل',

                  currentRole:
                      'الدور الحالي',

                  fullName:
                      'الاسم الكامل',

                  email:
                      'البريد الإلكتروني',

                  phone:
                      'رقم الهاتف',

                  jobTitle:
                      'المسمى الوظيفي',

                  bio:
                      'نبذة عني',

                  noValue:
                      'غير محدد',

                  company:
                      'الشركة',

                  role:
                      'الدور',

                  accountCreated:
                      'تاريخ إنشاء الحساب',

                  verification:
                      'توثيق البريد',

                  pendingEmail:
                      'بريد بانتظار التأكيد',

                  currentSession:
                      'الجلسة الحالية',

                  ip:
                      'عنوان IP',

                  lastActivity:
                      'آخر نشاط',

                  editTitle:
                      'تعديل الملف الشخصي',

                  editSubtitle:
                      'حدّث معلوماتك الأساسية وصورتك المهنية.',

                  back:
                      'العودة إلى الملف الشخصي',

                  avatar:
                      'الصورة الشخصية',

                  changeAvatar:
                      'تغيير الصورة',

                  avatarHint:
                      'JPG أو PNG أو WEBP، بحد أقصى 2MB.',

                  save:
                      'حفظ التغييرات',

                  cancel:
                      'إلغاء',

                  saved:
                      'تم حفظ معلومات الملف الشخصي.',

                  avatarSaved:
                      'تم تحديث الصورة الشخصية.',

                  changeEmail:
                      'تغيير البريد الإلكتروني',

                  newEmail:
                      'البريد الإلكتروني الجديد',

                  password:
                      'كلمة المرور الحالية',

                  emailHint:
                      'سنرسل رابط تأكيد إلى البريد الجديد قبل اعتماده.',

                  sendConfirmation:
                      'إرسال رابط التأكيد',

                  emailRequested:
                      'تم إرسال رابط التأكيد إلى البريد الجديد.',

                  profileDetails:
                      'المعلومات الأساسية',

                  profileDetailsHint:
                      'هذه المعلومات تظهر في حسابك داخل AccoNova.',

                  workspaceRoleHint:
                      'الدور والصلاحيات تأتي من مساحة العمل الحالية ولا يمكن تعديلها من الملف الشخصي.',

                  heroLine:
                      'ملفك المهني داخل مساحة العمل، معلوماتك وحسابك في مكان واحد.',

                  complete:
                      'مكتمل',

                  securityHealthy:
                      'الحساب محمي',

                  securityDescription:
                      'البريد موثق وجلسات الحساب ظاهرة لك.',

                  noSessions:
                      'لا توجد بيانات جلسات متاحة.',
              }
            : {
                  title:
                      'Profile',

                  loading:
                      'Loading profile…',

                  loadError:
                      'Could not load your profile.',

                  dismiss:
                      'Dismiss',

                  overview:
                      'Overview',

                  edit:
                      'Edit profile',

                  manageAccount:
                      'Manage account',

                  online:
                      'Account active',

                  workspace:
                      'Current workspace',

                  personalInfo:
                      'Personal information',

                  contactInfo:
                      'Contact information',

                  organization:
                      'Organization',

                  security:
                      'Security & account',

                  sessions:
                      'Active sessions',

                  quickActions:
                      'Quick actions',

                  accountAge:
                      'Member since',

                  verified:
                      'Email verified',

                  unverified:
                      'Email not verified',

                  profileComplete:
                      'Profile completion',

                  fieldsComplete:
                      'Fields complete',

                  activeSessions:
                      'Active sessions',

                  workspaces:
                      'Workspaces',

                  currentRole:
                      'Current role',

                  fullName:
                      'Full name',

                  email:
                      'Email',

                  phone:
                      'Phone',

                  jobTitle:
                      'Job title',

                  bio:
                      'About me',

                  noValue:
                      'Not provided',

                  company:
                      'Company',

                  role:
                      'Role',

                  accountCreated:
                      'Account created',

                  verification:
                      'Email verification',

                  pendingEmail:
                      'Pending email',

                  currentSession:
                      'Current session',

                  ip:
                      'IP address',

                  lastActivity:
                      'Last activity',

                  editTitle:
                      'Edit profile',

                  editSubtitle:
                      'Update your basic information and professional identity.',

                  back:
                      'Back to profile',

                  avatar:
                      'Profile photo',

                  changeAvatar:
                      'Change photo',

                  avatarHint:
                      'JPG, PNG or WEBP, up to 2MB.',

                  save:
                      'Save changes',

                  cancel:
                      'Cancel',

                  saved:
                      'Profile information saved.',

                  avatarSaved:
                      'Profile photo updated.',

                  changeEmail:
                      'Change email',

                  newEmail:
                      'New email address',

                  password:
                      'Current password',

                  emailHint:
                      'We will verify the new address before replacing your current email.',

                  sendConfirmation:
                      'Send confirmation',

                  emailRequested:
                      'A verification link was sent to the new address.',

                  profileDetails:
                      'Basic information',

                  profileDetailsHint:
                      'This information identifies you inside AccoNova.',

                  workspaceRoleHint:
                      'Your workspace role and permissions are managed by the organization and cannot be edited here.',

                  heroLine:
                      'Your professional identity, workspace information and account in one place.',

                  complete:
                      'Complete',

                  securityHealthy:
                      'Account protected',

                  securityDescription:
                      'Your email is verified and account sessions are visible.',

                  noSessions:
                      'No session information is available.',
              };

    /**
     * Load the latest Profile API state.
     */
    useEffect(
        () => {
            let active =
                true;

            setLoading(
                true,
            );

            fetchProfile()
                .then(
                    (
                        response,
                    ) => {
                        if (
                            active
                        ) {
                            setProfile(
                                response,
                            );

                            setError(
                                '',
                            );
                        }
                    },
                )
                .catch(
                    (
                        failure,
                    ) => {
                        if (
                            active
                        ) {
                            setError(
                                profileErrorText(
                                    failure,
                                ),
                            );
                        }
                    },
                )
                .finally(
                    () => {
                        if (
                            active
                        ) {
                            setLoading(
                                false,
                            );
                        }
                    },
                );

            return () => {
                active =
                    false;
            };
        },
        [],
    );

    if (
        loading
    ) {
        return (
            <AppShell>
                <Head
                    title={
                        copy.title
                    }
                />

                <div className="flex min-h-[70vh] items-center justify-center px-4">
                    <div className="text-center">
                        <div className="mx-auto size-10 animate-spin rounded-full border-4 border-[var(--ac-accent-soft)] border-t-[var(--ac-accent-strong)]" />

                        <p className="mt-4 text-sm text-[var(--ac-text-muted)]">
                            {
                                copy.loading
                            }
                        </p>
                    </div>
                </div>
            </AppShell>
        );
    }

    if (
        ! profile
    ) {
        return (
            <AppShell>
                <Head
                    title={
                        copy.title
                    }
                />

                <div className="mx-auto max-w-3xl px-4 py-12">
                    <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-red-700">
                        <strong>
                            {
                                copy.loadError
                            }
                        </strong>

                        <p className="mt-2 text-sm">
                            {
                                error
                            }
                        </p>
                    </div>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <Head
                title={
                    copy.title
                }
            />

            {view ===
            'edit' ? (
                <ProfileEditor
                    profile={
                        profile
                    }
                    ar={
                        ar
                    }
                    copy={
                        copy
                    }
                    error={
                        error
                    }
                    onError={
                        setError
                    }
                    onProfileChange={
                        setProfile
                    }
                />
            ) : (
                <ProfileOverview
                    profile={
                        profile
                    }
                    ar={
                        ar
                    }
                    copy={
                        copy
                    }
                    error={
                        error
                    }
                    onError={
                        setError
                    }
                />
            )}
        </AppShell>
    );
}

/**
 * Render the visual profile overview based only on real account data.
 */
function ProfileOverview({
    profile,
    ar,
    copy,
    error,
    onError,
}: {
    profile: ProfileResponse;
    ar: boolean;
    copy: Record<string, string>;
    error: string;
    onError: (
        value: string,
    ) => void;
}) {
    const page =
        usePage<AppPageProps>();

    const activeOrganization =
        page.props.workspace
            .activeOrganization;

    const activeTab = activeProfileTab(page.url);

    const user =
        profile.user;

    const completedFields =
        [
            user.name,
            user.email,
            user.phone,
            user.job_title,
            user.bio,
            profile.avatar_url,
        ].filter(
            Boolean,
        ).length;

    const profileCompletion =
        Math.round(
            (
                completedFields
                / 6
            )
            * 100,
        );

    const roleLabel =
        activeOrganization
            ?.role
            ?? '—';

    return (
        <main className="mx-auto w-full max-w-[1760px] px-3 py-5 sm:px-5 lg:px-8">
            {error && (
                <InlineError
                    message={
                        error
                    }
                    onClose={() =>
                        onError(
                            '',
                        )
                    }
                />
            )}

            <ProfileHero
                profile={
                    profile
                }
                ar={
                    ar
                }
                statusLabel={
                    copy.online
                }
                subtitle={
                    copy.heroLine
                }
                organization={
                    activeOrganization
                        ?.name
                    ?? '—'
                }
                role={
                    roleLabel
                }
            />

            {activeTab === 'overview' && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                    icon={
                        BadgeCheck
                    }
                    label={
                        copy.profileComplete
                    }
                    value={`${profileCompletion}%`}
                    hint={`${completedFields}/6 ${copy.fieldsComplete}`}
                    progress={
                        profileCompletion
                    }
                />

                <MetricCard
                    icon={
                        ShieldCheck
                    }
                    label={
                        copy.verification
                    }
                    value={
                        user.email_verified_at
                            ? copy.verified
                            : copy.unverified
                    }
                    positive={
                        Boolean(
                            user.email_verified_at,
                        )
                    }
                />

                <MetricCard
                    icon={
                        MonitorSmartphone
                    }
                    label={
                        copy.activeSessions
                    }
                    value={String(
                        profile.sessions.length,
                    )}
                />

                <MetricCard
                    icon={
                        UsersRound
                    }
                    label={
                        copy.workspaces
                    }
                    value={String(
                        page.props.workspace
                            .organizations
                            .length,
                    )}
                />

                <MetricCard
                    icon={
                        BriefcaseBusiness
                    }
                    label={
                        copy.currentRole
                    }
                    value={
                        roleLabel
                    }
                />
            </div>

            }
            <ProfileTabs ar={ar} active={activeTab} />

            {activeTab !== 'overview' ? <ProfileCenter tab={activeTab} profile={profile} ar={ar} /> : <>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
                <div className="grid gap-4 lg:grid-cols-2">
                    <ProfileCard
                        title={
                            copy.personalInfo
                        }
                        icon={
                            UserRound
                        }
                        action={
                            <Link
                                href="/app/profile?view=edit"
                                className={
                                    secondaryButton
                                }
                            >
                                <Edit3
                                    size={
                                        14
                                    }
                                />

                                {
                                    copy.edit
                                }
                            </Link>
                        }
                    >
                        <InfoRow
                            label={
                                copy.fullName
                            }
                            value={
                                user.name
                            }
                        />

                        <InfoRow
                            label={
                                copy.jobTitle
                            }
                            value={
                                user.job_title
                                ?? copy.noValue
                            }
                        />

                        <InfoRow
                            label={
                                copy.accountCreated
                            }
                            value={formatDate(
                                user.created_at,
                                ar,
                            )}
                        />

                        <div className="mt-4 rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                {
                                    copy.bio
                                }
                            </p>

                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                                {user.bio
                                    || copy.noValue}
                            </p>
                        </div>
                    </ProfileCard>

                    <ProfileCard
                        title={
                            copy.contactInfo
                        }
                        icon={
                            Contact
                        }
                    >
                        <InfoRow
                            icon={
                                Mail
                            }
                            label={
                                copy.email
                            }
                            value={
                                user.email
                            }
                        />

                        <InfoRow
                            icon={
                                Phone
                            }
                            label={
                                copy.phone
                            }
                            value={
                                user.phone
                                ?? copy.noValue
                            }
                        />

                        {user.pending_email && (
                            <div className="mt-3 rounded-[15px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                <strong>
                                    {
                                        copy.pendingEmail
                                    }
                                </strong>

                                <p className="mt-1">
                                    {
                                        user.pending_email
                                    }
                                </p>
                            </div>
                        )}
                    </ProfileCard>

                    <ProfileCard
                        title={
                            copy.organization
                        }
                        icon={
                            Building2
                        }
                    >
                        <InfoRow
                            icon={
                                Building2
                            }
                            label={
                                copy.company
                            }
                            value={
                                activeOrganization
                                    ?.name
                                ?? copy.noValue
                            }
                        />

                        <InfoRow
                            icon={
                                BriefcaseBusiness
                            }
                            label={
                                copy.role
                            }
                            value={
                                roleLabel
                            }
                        />

                        <div className="mt-4 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] p-4 text-xs leading-5 text-[var(--ac-text-muted)]">
                            {
                                copy.workspaceRoleHint
                            }
                        </div>
                    </ProfileCard>

                    <ProfileCard
                        title={
                            copy.security
                        }
                        icon={
                            ShieldCheck
                        }
                    >
                        <div className="flex items-center gap-4 rounded-[18px] bg-[var(--ac-accent-soft)] p-4">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-[15px] bg-white text-[var(--ac-accent-strong)] shadow-sm">
                                <ShieldCheck
                                    size={
                                        21
                                    }
                                />
                            </div>

                            <div>
                                <strong className="text-sm">
                                    {
                                        copy.securityHealthy
                                    }
                                </strong>

                                <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                    {
                                        copy.securityDescription
                                    }
                                </p>
                            </div>
                        </div>

                        <InfoRow
                            label={
                                copy.verification
                            }
                            value={
                                user.email_verified_at
                                    ? copy.verified
                                    : copy.unverified
                            }
                        />

                        <InfoRow
                            label={
                                copy.activeSessions
                            }
                            value={String(
                                profile.sessions.length,
                            )}
                        />
                    </ProfileCard>
                </div>

                <div className="space-y-4">
                    <ProfileCard
                        title={
                            copy.quickActions
                        }
                        icon={
                            Sparkles
                        }
                    >
                        <div className="space-y-2">
                            <Link
                                href="/app/profile?view=edit"
                                className="flex w-full items-center gap-3 rounded-[15px] border border-[var(--ac-line)] bg-white p-3 text-start transition hover:bg-[var(--ac-accent-soft)]"
                            >
                                <span className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                    <Edit3
                                        size={
                                            16
                                        }
                                    />
                                </span>

                                <span className="text-sm font-semibold">
                                    {
                                        copy.edit
                                    }
                                </span>
                            </Link>

                            <div className="flex w-full items-center gap-3 rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
                                <span className="flex size-10 items-center justify-center rounded-[13px] bg-white">
                                    <KeyRound
                                        size={
                                            16
                                        }
                                    />
                                </span>

                                <div>
                                    <p className="text-sm font-semibold">
                                        {
                                            copy.security
                                        }
                                    </p>

                                    <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                        {profile.sessions.length}
                                        {' '}
                                        {
                                            copy.activeSessions
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    </ProfileCard>

                    <ProfileCard
                        title={
                            copy.sessions
                        }
                        icon={
                            Laptop
                        }
                    >
                        <div className="space-y-2">
                            {profile.sessions.length >
                            0 ? (
                                profile.sessions
                                    .slice(
                                        0,
                                        4,
                                    )
                                    .map(
                                        (
                                            session,
                                        ) => (
                                            <SessionRow
                                                key={
                                                    session.id
                                                }
                                                session={
                                                    session
                                                }
                                                ar={
                                                    ar
                                                }
                                                currentLabel={
                                                    copy.currentSession
                                                }
                                            />
                                        ),
                                    )
                            ) : (
                                <EmptyState
                                    icon={
                                        Laptop
                                    }
                                    text={
                                        copy.noSessions
                                    }
                                />
                            )}
                        </div>
                    </ProfileCard>
                </div>
            </div>
            </>}
        </main>
    );
}

/**
 * Render the full profile editing surface.
 */
function ProfileEditor({
    profile,
    ar,
    copy,
    error,
    onError,
    onProfileChange,
}: {
    profile: ProfileResponse;
    ar: boolean;
    copy: Record<string, string>;
    error: string;
    onError: (
        value: string,
    ) => void;
    onProfileChange: (
        profile:
            ProfileResponse,
    ) => void;
}) {
    const avatarInputRef =
        useRef<HTMLInputElement>(
            null,
        );

    const [
        name,
        setName,
    ] =
        useState(
            profile.user.name,
        );

    const [
        phone,
        setPhone,
    ] =
        useState(
            profile.user.phone
            ?? '',
        );

    const [
        jobTitle,
        setJobTitle,
    ] =
        useState(
            profile.user.job_title
            ?? '',
        );

    const [
        bio,
        setBio,
    ] =
        useState(
            profile.user.bio
            ?? '',
        );

    const [
        newEmail,
        setNewEmail,
    ] =
        useState(
            '',
        );

    const [
        currentPassword,
        setCurrentPassword,
    ] =
        useState(
            '',
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        avatarBusy,
        setAvatarBusy,
    ] =
        useState(
            false,
        );

    const [
        emailBusy,
        setEmailBusy,
    ] =
        useState(
            false,
        );

    const [
        success,
        setSuccess,
    ] =
        useState(
            '',
        );

    /**
     * Persist basic editable profile fields.
     */
    async function submitProfile(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setSuccess(
            '',
        );

        onError(
            '',
        );

        try {
            const response =
                await updateProfile({
                    name:
                        name.trim(),

                    phone:
                        phone.trim()
                        || null,

                    job_title:
                        jobTitle.trim()
                        || null,

                    bio:
                        bio.trim()
                        || null,
                });

            onProfileChange(
                response,
            );

            setSuccess(
                copy.saved,
            );
        } catch (
            failure
        ) {
            onError(
                profileErrorText(
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
     * Validate and upload one profile image.
     */
    async function handleAvatar(
        event:
            ChangeEvent<HTMLInputElement>,
    ): Promise<void> {
        const file =
            event.target.files?.[
                0
            ];

        event.target.value =
            '';

        if (
            ! file
        ) {
            return;
        }

        setAvatarBusy(
            true,
        );

        setSuccess(
            '',
        );

        onError(
            '',
        );

        try {
            const response =
                await uploadProfileAvatar(
                    file,
                );

            onProfileChange(
                response,
            );

            setSuccess(
                copy.avatarSaved,
            );
        } catch (
            failure
        ) {
            onError(
                profileErrorText(
                    failure,
                ),
            );
        } finally {
            setAvatarBusy(
                false,
            );
        }
    }

    /**
     * Start Laravel's verified email-change flow.
     */
    async function submitEmailChange(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            emailBusy
        ) {
            return;
        }

        setEmailBusy(
            true,
        );

        setSuccess(
            '',
        );

        onError(
            '',
        );

        try {
            await requestProfileEmailChange({
                email:
                    newEmail.trim(),

                current_password:
                    currentPassword,
            });

            setNewEmail(
                '',
            );

            setCurrentPassword(
                '',
            );

            setSuccess(
                copy.emailRequested,
            );

            const refreshed =
                await fetchProfile();

            onProfileChange(
                refreshed,
            );
        } catch (
            failure
        ) {
            onError(
                profileErrorText(
                    failure,
                ),
            );
        } finally {
            setEmailBusy(
                false,
            );
        }
    }

    return (
        <main className="mx-auto w-full max-w-[1760px] px-3 py-5 sm:px-5 lg:px-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <Link
                        href="/app/profile"
                        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ac-text-muted)] hover:text-[var(--ac-text)]"
                    >
                        <X
                            size={
                                13
                            }
                        />

                        {
                            copy.back
                        }
                    </Link>

                    <h1 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                        {
                            copy.editTitle
                        }
                    </h1>

                    <p className="mt-1 text-sm text-[var(--ac-text-muted)]">
                        {
                            copy.editSubtitle
                        }
                    </p>
                </div>
            </div>

            {error && (
                <InlineError
                    message={
                        error
                    }
                    onClose={() =>
                        onError(
                            '',
                        )
                    }
                />
            )}

            {success && (
                <div className="mb-4 flex items-center gap-3 rounded-[17px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <CheckCircle2
                        size={
                            17
                        }
                    />

                    {
                        success
                    }
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className={`${cardClass} self-start p-5`}>
                    <div className="text-center">
                        <p className="text-sm font-semibold">
                            {
                                copy.avatar
                            }
                        </p>

                        <div className="relative mx-auto mt-5 size-36">
                            <ProfileAvatar
                                profile={
                                    profile
                                }
                                size="editor"
                            />

                            <button
                                type="button"
                                onClick={() =>
                                    avatarInputRef.current?.click()
                                }
                                className="absolute bottom-1 end-1 flex size-10 items-center justify-center rounded-full border-4 border-white bg-[var(--ac-text)] text-white shadow-lg"
                            >
                                <Camera
                                    size={
                                        15
                                    }
                                />
                            </button>
                        </div>

                        <input
                            ref={
                                avatarInputRef
                            }
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(
                                event,
                            ) =>
                                void handleAvatar(
                                    event,
                                )
                            }
                        />

                        <button
                            type="button"
                            disabled={
                                avatarBusy
                            }
                            onClick={() =>
                                avatarInputRef.current?.click()
                            }
                            className={`${secondaryButton} mt-5 w-full`}
                        >
                            <Camera
                                size={
                                    14
                                }
                            />

                            {
                                copy.changeAvatar
                            }
                        </button>

                        <p className="mt-3 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {
                                copy.avatarHint
                            }
                        </p>
                    </div>

                    <div className="mt-6 border-t border-[var(--ac-line)] pt-5">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)]">
                                <BadgeCheck
                                    size={
                                        16
                                    }
                                />
                            </div>

                            <div>
                                <p className="text-xs font-semibold">
                                    {profile.user
                                        .email_verified_at
                                        ? copy.verified
                                        : copy.unverified}
                                </p>

                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                    {
                                        profile.user.email
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="space-y-4">
                    <form
                        onSubmit={(
                            event,
                        ) =>
                            void submitProfile(
                                event,
                            )
                        }
                        className={`${cardClass} p-5 sm:p-6`}
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <UserRound
                                    size={
                                        18
                                    }
                                />
                            </div>

                            <div>
                                <h2 className="text-base font-semibold">
                                    {
                                        copy.profileDetails
                                    }
                                </h2>

                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {
                                        copy.profileDetailsHint
                                    }
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <label className="text-xs font-semibold">
                                {
                                    copy.fullName
                                }

                                <input
                                    required
                                    maxLength={
                                        255
                                    }
                                    value={
                                        name
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setName(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className={`${inputClass} mt-2`}
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    copy.phone
                                }

                                <input
                                    maxLength={
                                        50
                                    }
                                    value={
                                        phone
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setPhone(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className={`${inputClass} mt-2`}
                                />
                            </label>

                            <label className="text-xs font-semibold md:col-span-2">
                                {
                                    copy.jobTitle
                                }

                                <input
                                    maxLength={
                                        255
                                    }
                                    value={
                                        jobTitle
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setJobTitle(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className={`${inputClass} mt-2`}
                                />
                            </label>

                            <label className="text-xs font-semibold md:col-span-2">
                                {
                                    copy.bio
                                }

                                <textarea
                                    maxLength={
                                        1000
                                    }
                                    rows={
                                        6
                                    }
                                    value={
                                        bio
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setBio(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className={`${inputClass} mt-2 resize-none`}
                                />

                                <div className="mt-1 text-end text-[9px] text-[var(--ac-text-muted)]">
                                    {
                                        bio.length
                                    }
                                    /1000
                                </div>
                            </label>
                        </div>

                        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-[var(--ac-line)] pt-5">
                            <Link
                                href="/app/profile"
                                className={
                                    secondaryButton
                                }
                            >
                                {
                                    copy.cancel
                                }
                            </Link>

                            <button
                                type="submit"
                                disabled={
                                    busy
                                }
                                className={
                                    primaryButton
                                }
                            >
                                <Save
                                    size={
                                        14
                                    }
                                />

                                {
                                    copy.save
                                }
                            </button>
                        </div>
                    </form>

                    <form
                        onSubmit={(
                            event,
                        ) =>
                            void submitEmailChange(
                                event,
                            )
                        }
                        className={`${cardClass} p-5 sm:p-6`}
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 items-center justify-center rounded-[14px] bg-blue-50 text-blue-700">
                                <Mail
                                    size={
                                        18
                                    }
                                />
                            </div>

                            <div>
                                <h2 className="text-base font-semibold">
                                    {
                                        copy.changeEmail
                                    }
                                </h2>

                                <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                                    {
                                        copy.emailHint
                                    }
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            <label className="text-xs font-semibold">
                                {
                                    copy.newEmail
                                }

                                <input
                                    required
                                    type="email"
                                    value={
                                        newEmail
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setNewEmail(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className={`${inputClass} mt-2`}
                                />
                            </label>

                            <label className="text-xs font-semibold">
                                {
                                    copy.password
                                }

                                <input
                                    required
                                    type="password"
                                    autoComplete="current-password"
                                    value={
                                        currentPassword
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setCurrentPassword(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className={`${inputClass} mt-2`}
                                />
                            </label>
                        </div>

                        {profile.user
                            .pending_email && (
                            <div className="mt-4 rounded-[15px] border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                                <strong>
                                    {
                                        copy.pendingEmail
                                    }
                                </strong>

                                <p className="mt-1">
                                    {
                                        profile.user
                                            .pending_email
                                    }
                                </p>
                            </div>
                        )}

                        <div className="mt-5 flex justify-end">
                            <button
                                type="submit"
                                disabled={
                                    emailBusy
                                }
                                className={
                                    primaryButton
                                }
                            >
                                <Mail
                                    size={
                                        14
                                    }
                                />

                                {
                                    copy.sendConfirmation
                                }
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </main>
    );
}

/**
 * Render the shared large profile identity surface.
 */
function ProfileHero({
    profile,
    ar,
    statusLabel,
    subtitle,
    organization,
    role,
}: {
    profile: ProfileResponse;
    ar: boolean;
    statusLabel: string;
    subtitle: string;
    organization: string;
    role: string;
}) {
    return (
        <section className="relative overflow-hidden rounded-[28px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-soft)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(77,190,157,.17),transparent_28%),radial-gradient(circle_at_85%_0%,rgba(56,133,116,.10),transparent_30%)]" />

            <div className="absolute -start-16 top-8 size-48 rounded-full border border-[var(--ac-accent)]/10" />

            <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col items-center gap-4 text-center sm:flex-row sm:text-start">
                    <ProfileAvatar
                        profile={
                            profile
                        }
                        size="hero"
                    />

                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <h1 className="truncate text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
                                {
                                    profile.user.name
                                }
                            </h1>

                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700">
                                <span className="size-2 rounded-full bg-emerald-500" />

                                {
                                    statusLabel
                                }
                            </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-[var(--ac-text-soft)]">
                            {profile.user
                                .job_title
                                || (
                                    ar
                                        ? 'لم يتم تحديد المسمى الوظيفي'
                                        : 'No job title provided'
                                )}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] text-[var(--ac-text-muted)] sm:justify-start">
                            <span className="inline-flex items-center gap-1.5">
                                <Building2
                                    size={
                                        13
                                    }
                                />

                                {
                                    organization
                                }
                            </span>

                            <span>
                                ·
                            </span>

                            <span className="capitalize">
                                {
                                    role
                                }
                            </span>
                        </div>

                        <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--ac-text-muted)]">
                            {
                                subtitle
                            }
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2 lg:justify-end">
                    <Link
                        href="/app/profile?view=edit"
                        className={
                            primaryButton
                        }
                    >
                        <Edit3
                            size={
                                14
                            }
                        />

                        {ar
                            ? 'تعديل الملف الشخصي'
                            : 'Edit profile'}
                    </Link>

                    <Link href="/app/profile?view=settings" className="inline-flex min-h-10 items-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-white/80 px-4 text-sm font-semibold backdrop-blur hover:bg-teal-50">
                        <ShieldCheck
                            size={
                                14
                            }
                        />

                        <span>{ar ? 'إدارة الحساب' : 'Manage account'}</span>
                    </Link>
                </div>
            </div>
        </section>
    );
}

/**
 * Render one real profile summary metric.
 */
function MetricCard({
    icon:
        Icon,
    label,
    value,
    hint,
    progress,
    positive,
}: {
    icon:
        typeof UserRound;
    label: string;
    value: string;
    hint?: string;
    progress?: number;
    positive?: boolean;
}) {
    return (
        <div className={`${cardClass} p-4`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                        {
                            label
                        }
                    </p>

                    <p className="mt-2 text-xl font-semibold tracking-[-0.04em]">
                        {
                            value
                        }
                    </p>
                </div>

                <div className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                    <Icon
                        size={
                            17
                        }
                    />
                </div>
            </div>

            {hint && (
                <p className="mt-2 text-[9px] text-[var(--ac-text-muted)]">
                    {
                        hint
                    }
                </p>
            )}

            {typeof progress ===
                'number' && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--ac-bg-soft)]">
                    <div
                        className="h-full rounded-full bg-[var(--ac-accent-strong)] transition-all"
                        style={{
                            width:
                                `${Math.min(
                                    100,
                                    Math.max(
                                        0,
                                        progress,
                                    ),
                                )}%`,
                        }}
                    />
                </div>
            )}

            {typeof positive ===
                'boolean' && (
                <div className="mt-3 flex items-center gap-1.5 text-[9px] font-semibold text-emerald-700">
                    <CheckCircle2
                        size={
                            11
                        }
                    />

                    {positive
                        ? 'OK'
                        : 'Needs attention'}
                </div>
            )}
        </div>
    );
}

/**
 * Render one profile content card.
 */
function ProfileCard({
    title,
    icon:
        Icon,
    action,
    children,
}: {
    title: string;
    icon:
        typeof UserRound;
    action?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className={`${cardClass} p-5`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                        <Icon
                            size={
                                16
                            }
                        />
                    </div>

                    <h2 className="text-sm font-semibold">
                        {
                            title
                        }
                    </h2>
                </div>

                {
                    action
                }
            </div>

            <div className="mt-5">
                {
                    children
                }
            </div>
        </section>
    );
}

/**
 * Render one labeled data row.
 */
function InfoRow({
    icon:
        Icon,
    label,
    value,
}: {
    icon?:
        typeof Mail;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center gap-3 border-b border-[var(--ac-line)] py-3 last:border-b-0">
            {Icon && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]">
                    <Icon
                        size={
                            13
                        }
                    />
                </div>
            )}

            <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                    {
                        label
                    }
                </p>

                <p className="mt-1 truncate text-xs font-semibold">
                    {
                        value
                    }
                </p>
            </div>
        </div>
    );
}

/**
 * Render the authenticated user's avatar.
 */
function ProfileAvatar({
    profile,
    size,
}: {
    profile: ProfileResponse;
    size:
        | 'hero'
        | 'editor';
}) {
    const sizeClass =
        size ===
        'hero'
            ? 'size-24 sm:size-28'
            : 'size-36';

    if (
        profile.avatar_url
    ) {
        return (
            <img
                src={
                    profile.avatar_url
                }
                alt={
                    profile.user.name
                }
                className={`${sizeClass} shrink-0 rounded-full border-4 border-white object-cover shadow-[0_14px_40px_rgba(20,42,35,.16)]`}
            />
        );
    }

    return (
        <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border-4 border-white bg-[var(--ac-accent-soft)] text-2xl font-bold text-[var(--ac-accent-strong)] shadow-[0_14px_40px_rgba(20,42,35,.16)]`}>
            {initials(
                profile.user.name,
            )}
        </div>
    );
}

/**
 * Render one authenticated browser session.
 */
function SessionRow({
    session,
    ar,
    currentLabel,
}: {
    session:
        ProfileSession;
    ar: boolean;
    currentLabel: string;
}) {
    return (
        <div className="rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
            <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-white">
                    <Laptop
                        size={
                            14
                        }
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[10px] font-semibold">
                            {sessionLabel(
                                session.agent,
                            )}
                        </p>

                        {session.current && (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700">
                                {
                                    currentLabel
                                }
                            </span>
                        )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-[var(--ac-text-muted)]">
                        <span>
                            {
                                session.ip
                                ?? '—'
                            }
                        </span>

                        <span>
                            <Clock3
                                size={
                                    9
                                }
                                className="me-1 inline"
                            />

                            {formatSessionTime(
                                session.last_activity,
                                ar,
                            )}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Render one compact empty state.
 */
function EmptyState({
    icon:
        Icon,
    text,
}: {
    icon:
        typeof Laptop;
    text: string;
}) {
    return (
        <div className="rounded-[16px] border border-dashed border-[var(--ac-line)] p-6 text-center">
            <Icon
                size={
                    20
                }
                className="mx-auto text-[var(--ac-text-muted)]"
            />

            <p className="mt-2 text-[10px] text-[var(--ac-text-muted)]">
                {
                    text
                }
            </p>
        </div>
    );
}

/**
 * Render an API failure banner.
 */
function InlineError({
    message,
    onClose,
}: {
    message: string;
    onClose: () => void;
}) {
    return (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-[17px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>
                {
                    message
                }
            </span>

            <button
                type="button"
                onClick={
                    onClose
                }
            >
                <X
                    size={
                        15
                    }
                />
            </button>
        </div>
    );
}
