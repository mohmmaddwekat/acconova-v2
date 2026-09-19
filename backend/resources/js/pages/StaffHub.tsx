import {
    StaffModuleNav,
} from '@/components/staff/StaffModuleNav';
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
    Link,
    usePage,
} from '@inertiajs/react';
import {
    ArrowUpRight,
    BadgeCheck,
    BarChart3,
    BriefcaseBusiness,
    CalendarCheck2,
    CalendarDays,
    CircleDollarSign,
    Clock3,
    ContactRound,
    Landmark,
    Link2,
    ShieldCheck,
    UserCheck,
    UserMinus,
    UserRoundPlus,
    UsersRound,
    WalletCards,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type StaffView =
    | 'overview'
    | 'attendance'
    | 'payroll'
    | 'insights';

type DepartmentSummary = {
    id: number | null;
    name: string;
    total: number;
    active: number;
};

type BasisSummary = {
    basis:
        | 'hour'
        | 'day'
        | 'month'
        | 'piece';
    total: number;
};

type RecentHire = {
    id: number;
    name: string;
    job_title: string | null;
    department: string | null;
    started_on: string;
    active: boolean;
    linked_account: boolean;
};

type AttendanceRow = {
    id: number;
    name: string;
    job_title: string | null;
    department: string | null;
    status:
        | 'present'
        | 'absent'
        | null;
    quantity: string | null;
    overtime_hours: string;
};

type PayrollSummary = {
    currency: string;
    monthly_base: number;
    monthly_allowances: number;
    monthly_commitment: number;
    balance: number;
    positive_balance: number;
    negative_balance: number;
};

type StaffOverview = {
    permissions: {
        can_view: boolean;
        can_manage: boolean;
        can_attendance: boolean;
        can_pay: boolean;
    };
    totals: {
        employees: number;
        active: number;
        inactive: number;
        linked_accounts: number;
        without_department: number;
        departments: number;
        average_tenure_months: number;
    };
    departments: DepartmentSummary[];
    pay_basis: BasisSummary[];
    recent_hires: RecentHire[];
    attendance: {
        date: string;
        present_today: number;
        absent_today: number;
        missing_today: number;
        month_present_records: number;
        month_absent_records: number;
        month_overtime_hours: number;
        rows: AttendanceRow[];
    };
    payroll: PayrollSummary[];
};

const panel =
    'rounded-[22px] border border-[var(--ac-line)] bg-white p-5 shadow-[var(--ac-shadow-soft)]';

const button =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-white px-4 text-xs font-semibold transition hover:bg-[var(--ac-accent-soft)]';

const primary =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-text)] px-4 text-xs font-semibold text-white transition hover:-translate-y-px';

function errorText(
    error: unknown,
    fallback: string,
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
        : fallback;
}

function money(
    amount: number,
    currency: string,
): string {
    return new Intl.NumberFormat(
        undefined,
        {
            maximumFractionDigits:
                4,
        },
    ).format(
        amount,
    )
        + ' '
        + currency;
}

function basisLabel(
    basis: BasisSummary['basis'],
    ar: boolean,
): string {
    const labels: Record<
        BasisSummary['basis'],
        [string, string]
    > = {
        hour: [
            'بالساعة',
            'Hourly',
        ],
        day: [
            'باليوم',
            'Daily',
        ],
        month: [
            'شهري',
            'Monthly',
        ],
        piece: [
            'بالقطعة',
            'Piece rate',
        ],
    };

    return labels[basis][
        ar
            ? 0
            : 1
    ];
}

function tenureLabel(
    months: number,
    ar: boolean,
): string {
    if (
        months <
        12
    ) {
        return ar
            ? `${months} شهر`
            : `${months} mo`;
    }

    const years =
        Math.floor(
            months
            / 12,
        );

    const remainder =
        months
        % 12;

    return ar
        ? `${years} سنة${remainder ? ` و${remainder} شهر` : ''}`
        : `${years}y${remainder ? ` ${remainder}mo` : ''}`;
}

function MetricCard({
    icon: Icon,
    title,
    value,
    hint,
}: {
    icon: typeof UsersRound;
    title: string;
    value: string | number;
    hint?: string;
}) {
    return (
        <section className={panel}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                        {title}
                    </p>
                    <strong className="mt-2 block text-2xl tracking-[-0.04em]">
                        {value}
                    </strong>
                    {hint && (
                        <p className="mt-2 text-[10px] text-[var(--ac-text-muted)]">
                            {hint}
                        </p>
                    )}
                </div>
                <span className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                    <Icon size={18} />
                </span>
            </div>
        </section>
    );
}

function AccessNotice({
    ar,
    kind,
}: {
    ar: boolean;
    kind:
        | 'attendance'
        | 'payroll';
}) {
    return (
        <section className={panel}>
            <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-amber-50 text-amber-600">
                    <ShieldCheck size={20} />
                </span>
                <div>
                    <h2 className="text-sm font-bold">
                        {kind ===
                        'attendance'
                            ? (
                                ar
                                    ? 'صلاحية الحضور مطلوبة'
                                    : 'Attendance permission required'
                            )
                            : (
                                ar
                                    ? 'صلاحية المستحقات مطلوبة'
                                    : 'Payroll permission required'
                            )}
                    </h2>
                    <p className="mt-2 max-w-2xl text-xs leading-6 text-[var(--ac-text-muted)]">
                        {kind ===
                        'attendance'
                            ? (
                                ar
                                    ? 'هذه الصفحة تظهر فقط لمن يملك صلاحية حضور القسم أو حضور كل الشركة. يمكنك تعديل ذلك من صفحة الأدوار والصلاحيات.'
                                    : 'This page requires department or company attendance authority. Adjust it from Roles & Permissions.'
                            )
                            : (
                                ar
                                    ? 'الأرقام المالية مخفية لمن لا يملك صلاحية مستحقات القسم أو كل الشركة.'
                                    : 'Financial employee totals are hidden without department or company payroll authority.'
                            )}
                    </p>
                    <Link
                        href="/app/roles"
                        className={button + ' mt-4'}
                    >
                        <ShieldCheck size={14} />
                        {ar
                            ? 'الأدوار والصلاحيات'
                            : 'Roles & permissions'}
                    </Link>
                </div>
            </div>
        </section>
    );
}

/**
 * Comprehensive employee/HR overview surfaces.
 */
export default function StaffHubPage() {
    const ar =
        useLocale() ===
        'ar';

    const {
        staffView,
    } =
        usePage<
            AppPageProps & {
                staffView: StaffView;
            }
        >().props;

    const [
        data,
        setData,
    ] =
        useState<StaffOverview | null>(
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

            apiRequest<StaffOverview>(
                '/api/staff-overview',
                {
                    signal:
                        controller.signal,
                },
            )
                .then(
                    setData,
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
                                    ar
                                        ? 'تعذر تحميل بيانات الموظفين.'
                                        : 'Failed to load employee data.',
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
            ar,
        ],
    );

    const titles: Record<
        StaffView,
        [string, string]
    > = {
        overview: [
            'مركز الموظفين',
            'People overview',
        ],
        attendance: [
            'الحضور والدوام',
            'Attendance & time',
        ],
        payroll: [
            'الرواتب والمستحقات',
            'Payroll & balances',
        ],
        insights: [
            'تحليلات الموظفين',
            'People insights',
        ],
    };

    const descriptions: Record<
        StaffView,
        [string, string]
    > = {
        overview: [
            'صورة شاملة عن عدد الموظفين، الأقسام، حالة الحسابات، الحضور والمستحقات حسب صلاحياتك.',
            'A complete view of headcount, departments, account linkage, attendance and payroll within your permissions.',
        ],
        attendance: [
            'متابعة حضور اليوم، الغياب، السجلات الناقصة، وساعات العمل الإضافي.',
            'Track today’s attendance, absences, missing records and overtime.',
        ],
        payroll: [
            'ملخص الرواتب الشهرية والبدلات والأرصدة المستحقة حسب العملة.',
            'Monthly salary commitments, allowances and employee balances by currency.',
        ],
        insights: [
            'توزيع الموظفين، مدة الخدمة، نماذج الأجر، وربط الحسابات لاكتشاف الفجوات بسرعة.',
            'Headcount mix, tenure, pay basis and account linkage to spot workforce gaps quickly.',
        ],
    };

    const linkedRate =
        data?.totals.employees
            ? Math.round(
                data.totals.linked_accounts
                / data.totals.employees
                * 100,
            )
            : 0;

    const activeRate =
        data?.totals.employees
            ? Math.round(
                data.totals.active
                / data.totals.employees
                * 100,
            )
            : 0;

    const maxDepartment =
        useMemo(
            () =>
                Math.max(
                    1,
                    ...(
                        data?.departments.map(
                            (
                                department,
                            ) =>
                                department.total,
                        )
                        ?? []
                    ),
                ),
            [
                data,
            ],
        );

    const title =
        titles[staffView][
            ar
                ? 0
                : 1
        ];

    return (
        <AppShell>
            <Head title={title} />

            <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
                <header className="rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-br from-white via-white to-[var(--ac-accent-soft)] p-5 sm:p-7">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <span className="flex size-12 shrink-0 items-center justify-center rounded-[17px] bg-[var(--ac-text)] text-white">
                                <UsersRound size={22} />
                            </span>
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-accent-strong)]">
                                    {ar
                                        ? 'الموظفون والموارد البشرية'
                                        : 'Employees & HR'}
                                </p>
                                <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
                                    {title}
                                </h1>
                                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                    {descriptions[staffView][
                                        ar
                                            ? 0
                                            : 1
                                    ]}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Link
                                href="/app/staff/directory"
                                className={primary}
                            >
                                <UsersRound size={14} />
                                {ar
                                    ? 'دليل الموظفين'
                                    : 'Employee directory'}
                            </Link>
                            <Link
                                href="/app/departments"
                                className={button}
                            >
                                <BriefcaseBusiness size={14} />
                                {ar
                                    ? 'الأقسام'
                                    : 'Departments'}
                            </Link>
                            <Link
                                href="/app/roles"
                                className={button}
                            >
                                <ShieldCheck size={14} />
                                {ar
                                    ? 'الصلاحيات'
                                    : 'Permissions'}
                            </Link>
                        </div>
                    </div>
                </header>

                <div className="mt-4">
                    <StaffModuleNav />
                </div>

                {error && (
                    <div className="mt-4 rounded-[18px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {[0, 1, 2, 3].map((item) => (
                            <div
                                key={item}
                                className="h-32 animate-pulse rounded-[22px] border border-[var(--ac-line)] bg-white"
                            />
                        ))}
                    </div>
                )}

                {! loading && data && staffView === 'overview' && (
                    <div className="mt-6 space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard
                                icon={UsersRound}
                                title={ar ? 'إجمالي الموظفين' : 'Total employees'}
                                value={data.totals.employees}
                                hint={ar ? `${data.totals.active} على رأس العمل` : `${data.totals.active} active`}
                            />
                            <MetricCard
                                icon={UserCheck}
                                title={ar ? 'نسبة الموظفين النشطين' : 'Active workforce'}
                                value={activeRate + '%'}
                                hint={ar ? `${data.totals.inactive} متوقف` : `${data.totals.inactive} inactive`}
                            />
                            <MetricCard
                                icon={Link2}
                                title={ar ? 'ربط حسابات النظام' : 'Linked accounts'}
                                value={linkedRate + '%'}
                                hint={ar ? `${data.totals.linked_accounts} حساب مربوط` : `${data.totals.linked_accounts} linked`}
                            />
                            <MetricCard
                                icon={Clock3}
                                title={ar ? 'متوسط مدة الخدمة' : 'Average tenure'}
                                value={tenureLabel(data.totals.average_tenure_months, ar)}
                                hint={ar ? `${data.totals.departments} أقسام ظاهرة` : `${data.totals.departments} visible departments`}
                            />
                        </div>

                        <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
                            <section className={panel}>
                                <div className="mb-5 flex items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-sm font-bold">
                                            {ar ? 'توزيع الموظفين على الأقسام' : 'Employees by department'}
                                        </h2>
                                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                            {ar ? 'يعرض الموظفين ضمن نطاق صلاحياتك فقط.' : 'Shows employees inside your permission scope only.'}
                                        </p>
                                    </div>
                                    <Link
                                        href="/app/departments"
                                        className={button}
                                    >
                                        {ar ? 'إدارة الأقسام' : 'Manage departments'}
                                    </Link>
                                </div>

                                <div className="space-y-4">
                                    {data.departments.map((department) => (
                                        <div key={department.id ?? 'none'}>
                                            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                                                <span className="font-semibold">
                                                    {department.id === null
                                                        ? (ar ? 'بدون قسم' : 'No department')
                                                        : department.name}
                                                </span>
                                                <span className="text-[var(--ac-text-muted)]">
                                                    {department.active} / {department.total}
                                                </span>
                                            </div>
                                            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--ac-surface-soft)]">
                                                <div
                                                    className="h-full rounded-full bg-[var(--ac-accent-strong)]"
                                                    style={{
                                                        width: Math.max(
                                                            5,
                                                            department.total
                                                            / maxDepartment
                                                            * 100,
                                                        ) + '%',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className={panel}>
                                <h2 className="text-sm font-bold">
                                    {ar ? 'سلامة بيانات الموظفين' : 'People data health'}
                                </h2>
                                <div className="mt-5 space-y-3">
                                    <div className="flex items-center justify-between rounded-[15px] bg-[var(--ac-surface-soft)] p-4">
                                        <span className="flex items-center gap-2 text-xs">
                                            <Link2 size={15} />
                                            {ar ? 'بدون حساب نظام' : 'Without account'}
                                        </span>
                                        <strong>
                                            {Math.max(
                                                0,
                                                data.totals.employees - data.totals.linked_accounts,
                                            )}
                                        </strong>
                                    </div>
                                    <div className="flex items-center justify-between rounded-[15px] bg-[var(--ac-surface-soft)] p-4">
                                        <span className="flex items-center gap-2 text-xs">
                                            <BriefcaseBusiness size={15} />
                                            {ar ? 'بدون قسم' : 'Without department'}
                                        </span>
                                        <strong>{data.totals.without_department}</strong>
                                    </div>
                                    <div className="flex items-center justify-between rounded-[15px] bg-[var(--ac-surface-soft)] p-4">
                                        <span className="flex items-center gap-2 text-xs">
                                            <UserMinus size={15} />
                                            {ar ? 'غير نشطين' : 'Inactive'}
                                        </span>
                                        <strong>{data.totals.inactive}</strong>
                                    </div>
                                </div>
                            </section>
                        </div>

                        <div className="grid gap-5 xl:grid-cols-2">
                            <section className={panel}>
                                <div className="mb-4 flex items-center justify-between">
                                    <h2 className="text-sm font-bold">
                                        {ar ? 'أحدث المنضمين' : 'Recent hires'}
                                    </h2>
                                    <Link
                                        href="/app/staff/directory"
                                        className="text-xs font-semibold text-[var(--ac-accent-strong)]"
                                    >
                                        {ar ? 'عرض الكل' : 'View all'}
                                    </Link>
                                </div>
                                <div className="space-y-2">
                                    {data.recent_hires.map((employee) => (
                                        <div
                                            key={employee.id}
                                            className="flex items-center gap-3 rounded-[15px] border border-[var(--ac-line)] p-3"
                                        >
                                            <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-sm font-bold text-[var(--ac-accent-strong)]">
                                                {employee.name.trim().charAt(0).toUpperCase()}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <strong className="block truncate text-xs">
                                                    {employee.name}
                                                </strong>
                                                <p className="mt-1 truncate text-[10px] text-[var(--ac-text-muted)]">
                                                    {employee.job_title ?? '—'} · {employee.department ?? (ar ? 'بدون قسم' : 'No department')}
                                                </p>
                                            </div>
                                            <div className="text-end text-[10px] text-[var(--ac-text-muted)]">
                                                <span className="block">{employee.started_on}</span>
                                                <span className={employee.linked_account ? 'text-emerald-600' : 'text-amber-600'}>
                                                    {employee.linked_account
                                                        ? (ar ? 'حساب مربوط' : 'Linked')
                                                        : (ar ? 'بدون حساب' : 'No account')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className={panel}>
                                <h2 className="text-sm font-bold">
                                    {ar ? 'الوصول السريع' : 'Quick access'}
                                </h2>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <Link
                                        href="/app/staff/directory"
                                        className="rounded-[16px] border border-[var(--ac-line)] p-4 transition hover:bg-[var(--ac-surface-soft)]"
                                    >
                                        <ContactRound size={20} className="text-[var(--ac-accent-strong)]" />
                                        <strong className="mt-3 block text-xs">
                                            {ar ? 'ملفات الموظفين' : 'Employee files'}
                                        </strong>
                                        <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                            {ar ? 'البيانات، الوظيفة، الحساب، الحضور والمستحقات لكل موظف.' : 'Profile, role, account, attendance and compensation per employee.'}
                                        </p>
                                    </Link>
                                    <Link
                                        href="/app/staff/attendance"
                                        className="rounded-[16px] border border-[var(--ac-line)] p-4 transition hover:bg-[var(--ac-surface-soft)]"
                                    >
                                        <CalendarDays size={20} className="text-[var(--ac-accent-strong)]" />
                                        <strong className="mt-3 block text-xs">
                                            {ar ? 'الحضور والدوام' : 'Attendance'}
                                        </strong>
                                        <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                            {ar ? 'من حضر اليوم ومن لم يسجل وحجم الإضافي.' : 'Today’s present, absent, missing and overtime records.'}
                                        </p>
                                    </Link>
                                    <Link
                                        href="/app/staff/payroll"
                                        className="rounded-[16px] border border-[var(--ac-line)] p-4 transition hover:bg-[var(--ac-surface-soft)]"
                                    >
                                        <WalletCards size={20} className="text-[var(--ac-accent-strong)]" />
                                        <strong className="mt-3 block text-xs">
                                            {ar ? 'الرواتب والمستحقات' : 'Payroll'}
                                        </strong>
                                        <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                            {ar ? 'الالتزام الشهري، العلاوات والأرصدة المفتوحة.' : 'Monthly commitment, allowances and open balances.'}
                                        </p>
                                    </Link>
                                    <Link
                                        href="/app/staff/insights"
                                        className="rounded-[16px] border border-[var(--ac-line)] p-4 transition hover:bg-[var(--ac-surface-soft)]"
                                    >
                                        <BarChart3 size={20} className="text-[var(--ac-accent-strong)]" />
                                        <strong className="mt-3 block text-xs">
                                            {ar ? 'تحليلات الموارد البشرية' : 'People insights'}
                                        </strong>
                                        <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                            {ar ? 'توزيع القوى العاملة ونماذج الأجر وجودة البيانات.' : 'Workforce distribution, pay models and data quality.'}
                                        </p>
                                    </Link>
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {! loading && data && staffView === 'attendance' && (
                    <div className="mt-6 space-y-5">
                        {! data.permissions.can_attendance ? (
                            <AccessNotice
                                ar={ar}
                                kind="attendance"
                            />
                        ) : (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <MetricCard
                                        icon={CalendarCheck2}
                                        title={ar ? 'حاضرون اليوم' : 'Present today'}
                                        value={data.attendance.present_today}
                                        hint={data.attendance.date}
                                    />
                                    <MetricCard
                                        icon={UserMinus}
                                        title={ar ? 'غائبون اليوم' : 'Absent today'}
                                        value={data.attendance.absent_today}
                                    />
                                    <MetricCard
                                        icon={Clock3}
                                        title={ar ? 'لم يسجل بعد' : 'Not recorded'}
                                        value={data.attendance.missing_today}
                                    />
                                    <MetricCard
                                        icon={CalendarDays}
                                        title={ar ? 'إضافي هذا الشهر' : 'Monthly overtime'}
                                        value={data.attendance.month_overtime_hours}
                                        hint={ar ? 'ساعات' : 'hours'}
                                    />
                                </div>

                                <section className="overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-white">
                                    <div className="flex flex-col gap-3 border-b border-[var(--ac-line)] p-5 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="text-sm font-bold">
                                                {ar ? 'حالة دوام اليوم' : 'Today’s attendance'}
                                            </h2>
                                            <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                {ar ? 'كل موظف نشط ضمن نطاق صلاحياتك.' : 'Every active employee inside your permission scope.'}
                                            </p>
                                        </div>
                                        <Link
                                            href="/app/staff/directory"
                                            className={button}
                                        >
                                            {ar ? 'فتح ملفات الموظفين' : 'Open employee files'}
                                            <ArrowUpRight size={13} />
                                        </Link>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[760px] text-start text-xs">
                                            <thead className="bg-[var(--ac-surface-soft)] text-[10px] text-[var(--ac-text-muted)]">
                                                <tr>
                                                    <th className="px-5 py-3 text-start">{ar ? 'الموظف' : 'Employee'}</th>
                                                    <th className="px-5 py-3 text-start">{ar ? 'القسم' : 'Department'}</th>
                                                    <th className="px-5 py-3 text-start">{ar ? 'الحالة' : 'Status'}</th>
                                                    <th className="px-5 py-3 text-start">{ar ? 'الكمية/الساعات' : 'Quantity / hours'}</th>
                                                    <th className="px-5 py-3 text-start">{ar ? 'الإضافي' : 'Overtime'}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[var(--ac-line)]">
                                                {data.attendance.rows.map((row) => (
                                                    <tr key={row.id}>
                                                        <td className="px-5 py-4">
                                                            <strong className="block">{row.name}</strong>
                                                            <span className="mt-1 block text-[10px] text-[var(--ac-text-muted)]">
                                                                {row.job_title ?? '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4">{row.department ?? '—'}</td>
                                                        <td className="px-5 py-4">
                                                            <span
                                                                className={[
                                                                    'inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold',
                                                                    row.status === 'present'
                                                                        ? 'bg-emerald-50 text-emerald-700'
                                                                        : row.status === 'absent'
                                                                            ? 'bg-red-50 text-red-700'
                                                                            : 'bg-amber-50 text-amber-700',
                                                                ].join(' ')}
                                                            >
                                                                {row.status === 'present'
                                                                    ? (ar ? 'حاضر' : 'Present')
                                                                    : row.status === 'absent'
                                                                        ? (ar ? 'غائب' : 'Absent')
                                                                        : (ar ? 'لم يسجل' : 'Not recorded')}
                                                            </span>
                                                        </td>
                                                        <td className="px-5 py-4">{row.quantity ?? '—'}</td>
                                                        <td className="px-5 py-4">{row.overtime_hours}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <MetricCard
                                        icon={BadgeCheck}
                                        title={ar ? 'سجلات حضور هذا الشهر' : 'Present records this month'}
                                        value={data.attendance.month_present_records}
                                    />
                                    <MetricCard
                                        icon={UserMinus}
                                        title={ar ? 'سجلات غياب هذا الشهر' : 'Absent records this month'}
                                        value={data.attendance.month_absent_records}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                )}

                {! loading && data && staffView === 'payroll' && (
                    <div className="mt-6 space-y-5">
                        {! data.permissions.can_pay ? (
                            <AccessNotice
                                ar={ar}
                                kind="payroll"
                            />
                        ) : (
                            <>
                                <div className="grid gap-4 xl:grid-cols-2">
                                    {data.payroll.map((currency) => (
                                        <section
                                            key={currency.currency}
                                            className={panel}
                                        >
                                            <div className="mb-5 flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-[10px] text-[var(--ac-text-muted)]">
                                                        {ar ? 'العملة' : 'Currency'}
                                                    </p>
                                                    <h2 className="mt-1 text-lg font-bold">
                                                        {currency.currency}
                                                    </h2>
                                                </div>
                                                <span className="flex size-11 items-center justify-center rounded-[15px] bg-emerald-50 text-emerald-600">
                                                    <CircleDollarSign size={21} />
                                                </span>
                                            </div>

                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
                                                    <p className="text-[10px] text-[var(--ac-text-muted)]">
                                                        {ar ? 'الالتزام الشهري' : 'Monthly commitment'}
                                                    </p>
                                                    <strong className="mt-2 block text-lg">
                                                        {money(currency.monthly_commitment, currency.currency)}
                                                    </strong>
                                                </div>
                                                <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
                                                    <p className="text-[10px] text-[var(--ac-text-muted)]">
                                                        {ar ? 'الرصيد الحالي' : 'Current balance'}
                                                    </p>
                                                    <strong className="mt-2 block text-lg">
                                                        {money(currency.balance, currency.currency)}
                                                    </strong>
                                                </div>
                                                <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
                                                    <p className="text-[10px] text-[var(--ac-text-muted)]">
                                                        {ar ? 'الرواتب الشهرية الأساسية' : 'Monthly base salaries'}
                                                    </p>
                                                    <strong className="mt-2 block text-sm">
                                                        {money(currency.monthly_base, currency.currency)}
                                                    </strong>
                                                </div>
                                                <div className="rounded-[16px] bg-[var(--ac-surface-soft)] p-4">
                                                    <p className="text-[10px] text-[var(--ac-text-muted)]">
                                                        {ar ? 'العلاوات الشهرية' : 'Monthly allowances'}
                                                    </p>
                                                    <strong className="mt-2 block text-sm">
                                                        {money(currency.monthly_allowances, currency.currency)}
                                                    </strong>
                                                </div>
                                            </div>

                                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                                <div className="rounded-[14px] border border-emerald-100 bg-emerald-50 p-3">
                                                    <span className="text-[10px] text-emerald-700">
                                                        {ar ? 'مبالغ مستحقة للموظفين' : 'Owed to employees'}
                                                    </span>
                                                    <strong className="mt-1 block text-sm text-emerald-800">
                                                        {money(currency.positive_balance, currency.currency)}
                                                    </strong>
                                                </div>
                                                <div className="rounded-[14px] border border-amber-100 bg-amber-50 p-3">
                                                    <span className="text-[10px] text-amber-700">
                                                        {ar ? 'سلف/رصيد سالب' : 'Advances / negative'}
                                                    </span>
                                                    <strong className="mt-1 block text-sm text-amber-800">
                                                        {money(currency.negative_balance, currency.currency)}
                                                    </strong>
                                                </div>
                                            </div>
                                        </section>
                                    ))}
                                </div>

                                {! data.payroll.length && (
                                    <section className={panel}>
                                        <p className="text-center text-sm text-[var(--ac-text-muted)]">
                                            {ar ? 'لا توجد بيانات مستحقات ضمن نطاقك.' : 'No payroll data exists in your scope.'}
                                        </p>
                                    </section>
                                )}

                                <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                                    <section className={panel}>
                                        <h2 className="text-sm font-bold">
                                            {ar ? 'نماذج الأجر' : 'Pay basis mix'}
                                        </h2>
                                        <div className="mt-4 space-y-3">
                                            {data.pay_basis.map((basis) => (
                                                <div
                                                    key={basis.basis}
                                                    className="flex items-center justify-between rounded-[14px] bg-[var(--ac-surface-soft)] p-3"
                                                >
                                                    <span className="text-xs">
                                                        {basisLabel(basis.basis, ar)}
                                                    </span>
                                                    <strong>{basis.total}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className={panel}>
                                        <div className="flex items-start gap-3">
                                            <span className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                                <Landmark size={20} />
                                            </span>
                                            <div>
                                                <h2 className="text-sm font-bold">
                                                    {ar ? 'إدارة مستحقات موظف محدد' : 'Manage an employee’s payroll'}
                                                </h2>
                                                <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                                    {ar ? 'العمليات المالية، السلف، الخصومات، العلاوات، اعتماد الراتب الشهري وكشف الحساب تبقى داخل ملف الموظف حتى يكون السجل واضحًا ومدققًا.' : 'Payments, advances, deductions, allowances, salary accrual and the ledger remain inside each employee file for a clear audit trail.'}
                                                </p>
                                                <Link
                                                    href="/app/staff/directory"
                                                    className={primary + ' mt-4'}
                                                >
                                                    <WalletCards size={14} />
                                                    {ar ? 'فتح دليل الموظفين' : 'Open employee directory'}
                                                </Link>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {! loading && data && staffView === 'insights' && (
                    <div className="mt-6 space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard
                                icon={UsersRound}
                                title={ar ? 'حجم القوى العاملة' : 'Workforce size'}
                                value={data.totals.employees}
                            />
                            <MetricCard
                                icon={BriefcaseBusiness}
                                title={ar ? 'الأقسام النشطة' : 'Staffed departments'}
                                value={data.totals.departments}
                            />
                            <MetricCard
                                icon={Clock3}
                                title={ar ? 'متوسط مدة الخدمة' : 'Average tenure'}
                                value={tenureLabel(data.totals.average_tenure_months, ar)}
                            />
                            <MetricCard
                                icon={Link2}
                                title={ar ? 'اكتمال ربط الحسابات' : 'Account linkage'}
                                value={linkedRate + '%'}
                            />
                        </div>

                        <div className="grid gap-5 xl:grid-cols-2">
                            <section className={panel}>
                                <h2 className="text-sm font-bold">
                                    {ar ? 'توزيع القوى العاملة' : 'Workforce distribution'}
                                </h2>
                                <div className="mt-5 space-y-4">
                                    {data.departments.map((department) => {
                                        const share =
                                            data.totals.employees
                                                ? Math.round(
                                                    department.total
                                                    / data.totals.employees
                                                    * 100,
                                                )
                                                : 0;

                                        return (
                                            <div key={department.id ?? 'none'}>
                                                <div className="mb-2 flex justify-between text-xs">
                                                    <span>{department.id === null ? (ar ? 'بدون قسم' : 'No department') : department.name}</span>
                                                    <strong>{share}%</strong>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-[var(--ac-surface-soft)]">
                                                    <div
                                                        className="h-full rounded-full bg-[var(--ac-accent-strong)]"
                                                        style={{
                                                            width: share + '%',
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            <section className={panel}>
                                <h2 className="text-sm font-bold">
                                    {ar ? 'تركيبة نماذج الأجر' : 'Compensation model mix'}
                                </h2>
                                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                    {data.pay_basis.map((basis) => (
                                        <div
                                            key={basis.basis}
                                            className="rounded-[16px] border border-[var(--ac-line)] p-4"
                                        >
                                            <p className="text-[10px] text-[var(--ac-text-muted)]">
                                                {basisLabel(basis.basis, ar)}
                                            </p>
                                            <strong className="mt-2 block text-2xl">
                                                {basis.total}
                                            </strong>
                                            <p className="mt-2 text-[10px] text-[var(--ac-text-muted)]">
                                                {data.totals.employees
                                                    ? Math.round(
                                                        basis.total
                                                        / data.totals.employees
                                                        * 100,
                                                    )
                                                    : 0}
                                                %
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>

                        <section className={panel}>
                            <div className="grid gap-4 lg:grid-cols-3">
                                <div className="rounded-[16px] bg-emerald-50 p-4">
                                    <UserCheck size={20} className="text-emerald-600" />
                                    <p className="mt-3 text-[10px] text-emerald-700">
                                        {ar ? 'على رأس العمل' : 'Active employees'}
                                    </p>
                                    <strong className="mt-1 block text-xl text-emerald-800">
                                        {data.totals.active}
                                    </strong>
                                </div>
                                <div className="rounded-[16px] bg-amber-50 p-4">
                                    <Link2 size={20} className="text-amber-600" />
                                    <p className="mt-3 text-[10px] text-amber-700">
                                        {ar ? 'يحتاجون ربط حساب' : 'Need account linkage'}
                                    </p>
                                    <strong className="mt-1 block text-xl text-amber-800">
                                        {Math.max(0, data.totals.employees - data.totals.linked_accounts)}
                                    </strong>
                                </div>
                                <div className="rounded-[16px] bg-red-50 p-4">
                                    <BriefcaseBusiness size={20} className="text-red-500" />
                                    <p className="mt-3 text-[10px] text-red-700">
                                        {ar ? 'بدون قسم' : 'Missing department'}
                                    </p>
                                    <strong className="mt-1 block text-xl text-red-800">
                                        {data.totals.without_department}
                                    </strong>
                                </div>
                            </div>
                        </section>

                        <section className={panel}>
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h2 className="text-sm font-bold">
                                        {ar ? 'خطوة العمل التالية' : 'Next workforce action'}
                                    </h2>
                                    <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                        {ar ? 'راجع الموظفين بدون قسم أو بدون حساب نظام أولًا، ثم راجع الحضور والمستحقات من الصفحات المخصصة بدل تكديس كل شيء في شاشة واحدة.' : 'Start with employees missing departments or system accounts, then use the dedicated attendance and payroll pages instead of crowding one screen.'}
                                    </p>
                                </div>
                                <Link
                                    href="/app/staff/directory"
                                    className={primary}
                                >
                                    <UserRoundPlus size={14} />
                                    {ar ? 'مراجعة الموظفين' : 'Review employees'}
                                </Link>
                            </div>
                        </section>
                    </div>
                )}
            </main>
        </AppShell>
    );
}
