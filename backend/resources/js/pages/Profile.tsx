import '../../css/profile-page.css';

import { activeProfileTab, ProfileCenter } from '@/features/profile/ProfileCenter';
import {
    fetchProfile,
    requestProfileEmailChange,
    updateProfile,
    updateProfilePrivacy,
    uploadProfileAvatar,
} from '@/features/profile/api';
import { roleLabel as formatRole } from '@/features/profile/roles';
import type {
    ProfileResponse,
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
    Check,
    CheckCircle2,
    Edit3,
    FileText,
    Laptop,
    Mail,
    Phone,
    Save,
    UserRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type ReactNode,
} from 'react';

const cardClass =
    'rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]';

const inputClass =
    'w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 py-3 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:bg-[var(--ac-surface)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]';

const primaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-solid)] px-4 text-sm font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45';

const secondaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 text-sm font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] disabled:opacity-45';

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
                    onProfileChange={setProfile}
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
        profile: ProfileResponse,
    ) => void;
}) {
    const [savingPrivacy, setSavingPrivacy] = useState<'show_email' | 'show_phone' | null>(null);

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

    const organizationName = activeOrganization?.name ?? '—';
    const verified = Boolean(user.email_verified_at);

    const checklist: [string, boolean][] = [
        [ar ? 'الاسم' : 'Name', Boolean(user.name)],
        [ar ? 'البريد الإلكتروني' : 'Email', Boolean(user.email)],
        [ar ? 'رقم الهاتف' : 'Phone', Boolean(user.phone)],
        [ar ? 'المسمى الوظيفي' : 'Job title', Boolean(user.job_title)],
        [ar ? 'نبذة شخصية' : 'Bio', Boolean(user.bio)],
        [ar ? 'صورة الملف' : 'Photo', Boolean(profile.avatar_url)],
    ];

    const securityItems: [string, boolean][] = [
        [ar ? 'توثيق البريد الإلكتروني' : 'Email verified', verified],
        [ar ? 'ثلاث جلسات نشطة أو أقل' : 'Three active sessions or fewer', profile.sessions.length <= 3],
        [ar ? 'لا يوجد طلب تغيير بريد معلّق' : 'No pending email change', ! user.pending_email],
    ];

    const securityScore = securityItems.filter(([, ok]) => ok).length;

    const tabs: [string, string, string][] = [
        ['overview', 'نظرة عامة', 'Overview'],
        ['activity', 'النشاط', 'Activity'],
        ['settings', 'الإعدادات', 'Settings'],
        ['security', 'الأمان', 'Security'],
        ['files', 'الملفات والمستندات', 'Files & documents'],
    ];

    async function setVisibility(field: 'show_email' | 'show_phone', value: boolean): Promise<void> {
        setSavingPrivacy(field);

        try {
            onProfileChange(await updateProfilePrivacy({ [field]: value }));
        } catch (failure) {
            onError(profileErrorText(failure));
        } finally {
            setSavingPrivacy(null);
        }
    }

    const visibilityRow = (
        field: 'show_email' | 'show_phone',
        icon: ReactNode,
        label: string,
        value: string | null,
    ): ReactNode => (
        <div className="r">
            <span className="ri">{icon}</span>

            <div>
                <small>{label}</small>

                {value ? <b><bdi dir="ltr">{value}</bdi></b> : <Link href="/app/profile?view=edit" className="link">{ar ? 'أضف الآن' : 'Add now'}</Link>}
            </div>

            <div className="vis">
                <span>{user[field] ? (ar ? 'ظاهر للزملاء' : 'Visible to colleagues') : (ar ? 'مخفي عن الزملاء' : 'Hidden from colleagues')}</span>

                <button
                    type="button"
                    role="switch"
                    className="sw"
                    aria-checked={user[field]}
                    aria-label={ar ? `إظهار ${label} للزملاء` : `Show ${label} to colleagues`}
                    disabled={! value || savingPrivacy === field}
                    onClick={() => void setVisibility(field, ! user[field])}
                />
            </div>
        </div>
    );

    return (
        <main className="pf">
            {error && (
                <InlineError
                    message={error}
                    onClose={() => onError('')}
                />
            )}

            <section className="idbar">
                <span className="av" style={{ width: 60, height: 60, fontSize: 22 }}>
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(user.name)}
                </span>

                <div>
                    <h1>{user.name}</h1>

                    <p>{[user.job_title, organizationName].filter(Boolean).join(' · ')}</p>
                </div>

                <span className="badge ok"><i className="dot" />{copy.online}</span>

                <span className="sp" />

                <Link href="/app/profile?view=edit" className="btn">
                    <Edit3 size={16} />

                    {ar ? 'تعديل' : 'Edit'}
                </Link>
            </section>

            <nav className="seg2" aria-label={ar ? 'أقسام الملف الشخصي' : 'Profile sections'}>
                {tabs.map(([key, arabic, english]) => (
                    <Link
                        key={key}
                        preserveScroll
                        href={key === 'overview' ? '/app/profile' : `/app/profile?view=${key}`}
                        aria-current={key === activeTab ? 'page' : undefined}
                    >
                        {ar ? arabic : english}
                    </Link>
                ))}
            </nav>

            {activeTab !== 'overview' ? <ProfileCenter tab={activeTab} profile={profile} ar={ar} /> : (
                <>
                    <div className="widgets">
                        <section className="w">
                            <h3>{ar ? 'اكتمال الملف' : 'Profile completeness'}</h3>

                            <p>{ar ? 'كل حقل يضيف نحو 17%' : 'Each field adds about 17%'}</p>

                            <div className="big">
                                <CompletionRing percent={profileCompletion} />

                                <div>
                                    <b>{completedFields}/6</b>

                                    <small>{ar ? 'حقول مكتملة' : 'fields complete'}</small>
                                </div>
                            </div>

                            <div>
                                {checklist.map(([label, done]) => (
                                    <div key={label} className={['todo', done ? 'done' : ''].join(' ')}>
                                        <span className="tk"><Check size={14} /></span>

                                        <span className="l">{label}</span>

                                        {! done && <Link href="/app/profile?view=edit" className="link">{ar ? 'أضف' : 'Add'}</Link>}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="w">
                            <h3>{ar ? 'مستوى الأمان' : 'Security level'}</h3>

                            <p>{ar ? `${securityScore} من ${securityItems.length} إجراءات مكتملة` : `${securityScore} of ${securityItems.length} checks passed`}</p>

                            <div className="score">
                                {securityItems.map(([label, ok]) => <i key={label} className={ok ? 'on' : ''} />)}
                            </div>

                            <div>
                                {securityItems.map(([label, ok]) => (
                                    <div key={label} className={['todo', ok ? 'done ok' : ''].join(' ')}>
                                        <span className="tk"><Check size={14} /></span>

                                        <span className="l">{label}</span>

                                        {! ok && <Link href="/app/profile?view=security" className="link">{ar ? 'عالج' : 'Fix'}</Link>}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="w">
                            <div className="w-h">
                                <h3>{ar ? 'الجلسات النشطة' : 'Active sessions'}</h3>

                                <Link href="/app/profile?view=security" className="link">{ar ? 'إدارة' : 'Manage'}</Link>
                            </div>

                            <div>
                                {profile.sessions.length > 0 ? profile.sessions.slice(0, 4).map((session) => (
                                    <div key={session.id} className="r">
                                        <span className="ri"><Laptop size={18} /></span>

                                        <div>
                                            <b>{sessionLabel(session.agent)} {session.current && <span className="badge ok">{copy.currentSession}</span>}</b>

                                            <small><bdi>{session.ip ?? '—'}</bdi> · <bdi>{formatSessionTime(session.last_activity, ar)}</bdi></small>
                                        </div>
                                    </div>
                                )) : <p className="empty">{copy.noSessions}</p>}
                            </div>
                        </section>
                    </div>

                    <div className="lower">
                        <section className="w">
                            <div className="w-h">
                                <div>
                                    <h3>{ar ? 'المعلومات الشخصية' : 'Personal information'}</h3>

                                    <p className="sub" style={{ marginBottom: 0 }}>{ar ? 'زملاؤك يشوفون اسمك ومسماك ونبذتك. البريد والهاتف مخفيان إلا إذا فعّلت ظهورهما.' : 'Colleagues see your name, title and bio. Email and phone stay hidden unless you show them.'}</p>
                                </div>

                                <Link href="/app/profile?view=edit" className="ghost"><Edit3 size={14} />{ar ? 'تعديل' : 'Edit'}</Link>
                            </div>

                            <div>
                                <div className="r"><span className="ri"><UserRound size={18} /></span><div><small>{copy.fullName}</small><b>{user.name}</b></div></div>

                                <div className="r"><span className="ri"><BriefcaseBusiness size={18} /></span><div><small>{copy.jobTitle}</small><b>{user.job_title ?? copy.noValue}</b></div></div>

                                {visibilityRow('show_email', <Mail size={18} />, copy.email, user.email)}

                                {visibilityRow('show_phone', <Phone size={18} />, copy.phone, user.phone)}

                                <div className="r"><span className="ri"><FileText size={18} /></span><div><small>{copy.bio}</small><p className="bio">{user.bio || copy.noValue}</p></div></div>
                            </div>
                        </section>

                        <section className="w">
                            <h3>{ar ? 'المؤسسة والدور' : 'Organization and role'}</h3>

                            <p>{copy.workspaceRoleHint}</p>

                            <div>
                                <div className="r"><span className="ri"><Building2 size={18} /></span><div><small>{copy.company}</small><b>{organizationName}</b></div></div>

                                <div className="r"><span className="ri"><BriefcaseBusiness size={18} /></span><div><small>{copy.role}</small><b>{formatRole(activeOrganization?.role, ar)}</b></div></div>

                                <div className="r"><span className="ri"><CalendarDays size={18} /></span><div><small>{copy.accountCreated}</small><b>{formatDate(user.created_at, ar)}</b></div></div>
                            </div>
                        </section>
                    </div>
                </>
            )}
        </main>
    );
}

/**
 * Completion ring used by the overview.
 */
function CompletionRing({ percent }: { percent: number }) {
    const size = 84;
    const radius = (size - 9) / 2;
    const circumference = 2 * Math.PI * radius;

    return (
        <span className="pf-ring" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <circle className="t" cx={size / 2} cy={size / 2} r={radius} />

                <circle className="p" cx={size / 2} cy={size / 2} r={radius} style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - percent / 100) }} />
            </svg>

            <b>{percent}%</b>
        </span>
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
