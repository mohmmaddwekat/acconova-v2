import { AppShell } from '@/layouts/AppShell';
import {
    deviceEnabled,
    deviceKey,
    deviceSupported,
    showDeviceNotification,
} from '@/lib/deviceNotifications';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    applyProfilePreferences,
    defaultProfilePreferences,
    type ProfilePreferences,
} from '@/lib/profilePreferences';
import type { AppPageProps } from '@/types/app';
import { Head, Link, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    AppWindow,
    ArchiveRestore,
    BadgeDollarSign,
    Banknote,
    Bell,
    BookOpenCheck,
    Building2,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    CircleDollarSign,
    Cloud,
    CreditCard,
    Database,
    Download,
    Eye,
    FileCheck2,
    FileSpreadsheet,
    FileText,
    Gauge,
    Globe2,
    Grid2X2,
    HardDrive,
    Image,
    KeyRound,
    Languages,
    LayoutDashboard,
    Link2,
    ListChecks,
    LockKeyhole,
    Mail,
    Monitor,
    Moon,
    MoreHorizontal,
    Palette,
    PanelRight,
    Percent,
    Printer,
    ReceiptText,
    RefreshCw,
    Save,
    Search,
    Settings2,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Sun,
    Upload,
    UserPlus,
    UserRound,
    UsersRound,
    WalletCards,
    Webhook,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

type WorkspacePreferences = {
    name: string;
    currency: string;
    reminder_days: number;
    can_manage: boolean;
};

type SettingsSection =
    | 'general'
    | 'organization'
    | 'finance'
    | 'invoices'
    | 'users'
    | 'notifications'
    | 'integrations'
    | 'security'
    | 'billing'
    | 'appearance';

type NavItem = {
    key: SettingsSection;
    label: string;
    icon: LucideIcon;
};

const panel =
    'rounded-[18px] border border-[#dfe8f4] bg-white shadow-[0_10px_28px_rgba(30,75,140,.045)]';

const input =
    'mt-2 min-h-11 w-full rounded-[11px] border border-[#d9e5f2] bg-white px-3.5 text-sm text-[#19345f] outline-none transition placeholder:text-[#9badc5] focus:border-[#2f7df4] focus:ring-2 focus:ring-[#2f7df4]/10';

const secondaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#cfe0f4] bg-white px-4 text-xs font-semibold text-[#2563c7] transition hover:bg-[#f5f9ff]';

const primaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[#1468ea] px-5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(20,104,234,.2)] transition hover:bg-[#0f5fd8]';

const helper =
    'mt-1 text-[10px] leading-5 text-[#8ba0bc]';

function SettingsCard({
    title,
    description,
    icon: Icon,
    children,
    className = '',
}: {
    title: string;
    description?: string;
    icon: LucideIcon;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={panel + ' ' + className}>
            <div className="flex items-start justify-between gap-3 border-b border-[#edf2f8] px-5 py-4">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold text-[#17386d]">
                        <Icon size={17} className="text-[#1265d8]" />
                        {title}
                    </h2>
                    {description && (
                        <p className="mt-1 text-[10px] leading-5 text-[#899db7]">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            <div className="p-4 sm:p-5">{children}</div>
        </section>
    );
}

function Toggle({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={onChange}
            className={[
                'relative h-6 w-11 shrink-0 rounded-full transition',
                checked ? 'bg-[#1d73ec]' : 'bg-[#cbd5e1]',
            ].join(' ')}
        >
            <span
                className={[
                    'absolute top-1 size-4 rounded-full bg-white shadow-sm transition',
                    checked ? 'start-6' : 'start-1',
                ].join(' ')}
            />
        </button>
    );
}

function SettingRow({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: () => void;
}) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-[#edf2f8] py-3 last:border-b-0">
            <div>
                <p className="text-xs font-semibold text-[#19345f]">{label}</p>
                {description && (
                    <p className="mt-1 text-[10px] leading-5 text-[#8ba0bc]">
                        {description}
                    </p>
                )}
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

function MiniSelect({
    label,
    children,
    defaultValue,
}: {
    label: string;
    children: ReactNode;
    defaultValue?: string;
}) {
    return (
        <label className="block text-[11px] font-semibold text-[#5e789e]">
            {label}
            <select defaultValue={defaultValue} className={input}>
                {children}
            </select>
        </label>
    );
}

function ThemePreview({
    label,
    active,
    mode,
    onClick,
}: {
    label: string;
    active: boolean;
    mode: 'light' | 'dark' | 'system';
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'rounded-[14px] border p-2.5 text-start transition',
                active
                    ? 'border-[#2f7df4] bg-[#f5f9ff]'
                    : 'border-[#dfe8f4] bg-white hover:border-[#b8cce7]',
            ].join(' ')}
        >
            <div
                className={[
                    'h-24 overflow-hidden rounded-[9px] border',
                    mode === 'dark'
                        ? 'border-slate-700 bg-[#172033]'
                        : mode === 'system'
                            ? 'border-[#dbe5f2] bg-gradient-to-r from-white from-50% to-[#172033] to-50%'
                            : 'border-[#dbe5f2] bg-white',
                ].join(' ')}
            >
                <div className="mx-2 mt-3 h-3 rounded bg-[#dfe9f6]/70" />
                <div className="mx-2 mt-2 grid grid-cols-3 gap-1.5">
                    <span className="h-12 rounded bg-[#edf3fa]/80" />
                    <span className="h-12 rounded bg-[#edf3fa]/70" />
                    <span className="h-12 rounded bg-[#edf3fa]/60" />
                </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
                <span
                    className={[
                        'size-3 rounded-full border',
                        active
                            ? 'border-[#1265d8] bg-[#1265d8] shadow-[inset_0_0_0_2px_white]'
                            : 'border-[#bdcbe0]',
                    ].join(' ')}
                />
                <span className="text-[11px] font-semibold text-[#19345f]">
                    {label}
                </span>
            </div>
        </button>
    );
}

function IntegrationCard({
    title,
    description,
    icon,
    connected = false,
}: {
    title: string;
    description: string;
    icon: ReactNode;
    connected?: boolean;
}) {
    return (
        <div className="rounded-[15px] border border-[#dfe8f4] bg-white p-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-[14px] bg-[#f3f7fd]">
                {icon}
            </div>
            <h3 className="mt-3 text-sm font-bold text-[#17386d]">{title}</h3>
            <p className="mt-1 min-h-10 text-[10px] leading-5 text-[#8ba0bc]">
                {description}
            </p>
            <button
                type="button"
                className={[
                    'mt-3 w-full rounded-[9px] border px-3 py-2 text-[11px] font-semibold',
                    connected
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-[#cfe0f4] bg-white text-[#1265d8]',
                ].join(' ')}
            >
                {connected ? 'متصل ✓' : 'ربط +'}
            </button>
        </div>
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

    const navItems: NavItem[] = useMemo(
        () => [
            { key: 'general', label: text('عام', 'General'), icon: Settings2 },
            { key: 'organization', label: text('المؤسسة', 'Organization'), icon: Building2 },
            { key: 'finance', label: text('المالية', 'Finance'), icon: CreditCard },
            { key: 'invoices', label: text('الفواتير والطباعة', 'Invoices & printing'), icon: FileText },
            { key: 'users', label: text('المستخدمون والصلاحيات', 'Users & permissions'), icon: UsersRound },
            { key: 'notifications', label: text('الإشعارات', 'Notifications'), icon: Bell },
            { key: 'integrations', label: text('التكاملات', 'Integrations'), icon: Link2 },
            { key: 'security', label: text('الأمان', 'Security'), icon: ShieldCheck },
            { key: 'billing', label: text('الفوترة والاشتراك', 'Billing & subscription'), icon: WalletCards },
            { key: 'appearance', label: text('المظهر', 'Appearance'), icon: Palette },
        ],
        [ar],
    );

    const [section, setSection] = useState<SettingsSection>('general');
    const [workspacePreferences, setWorkspacePreferences] =
        useState<WorkspacePreferences | null>(null);
    const [profilePreferences, setProfilePreferences] =
        useState<ProfilePreferences>(defaultProfilePreferences());
    const [currencyDraft, setCurrencyDraft] = useState('ILS');
    const [reminderDraft, setReminderDraft] = useState(3);
    const [savedMessage, setSavedMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const [flags, setFlags] = useState<Record<string, boolean>>({
        inAppNotifications: true,
        emailNotifications: true,
        auditLog: true,
        maintenance: false,
        invoiceLogo: true,
        invoiceContact: true,
        invoiceTax: true,
        invoiceNotes: true,
        invoiceQr: false,
        cashEnabled: true,
        checkEnabled: true,
        validateCheckDate: true,
        postDatedChecks: false,
        extraCosts: true,
        shippingCost: true,
        emailChannel: true,
        appChannel: true,
        smsChannel: false,
        pushChannel: true,
        dueInvoice: true,
        overdueInvoice: true,
        invoicePaid: true,
        invoiceCancelled: false,
        paymentReceived: true,
        paymentFailed: true,
        paymentRefund: true,
        subscriptionAlerts: false,
        newCustomer: true,
        salesOpportunity: true,
        salesStatus: true,
        securityLogin: true,
        securityPassword: true,
        suspiciousLogin: true,
        securityUpdates: true,
        productUpdates: true,
        hints: false,
        offers: false,
        maintenanceAlerts: true,
        weeklySummary: true,
        autoSync: true,
        twoFactor: true,
        loginEmail: true,
        loginApp: true,
        ipRestriction: false,
        animations: true,
        hoverMotion: true,
        pageMotion: true,
    });

    const deviceStorageKey = deviceKey(
        auth.user?.id ?? 0,
        activeOrganization?.id ?? 0,
    );

    const [deviceNotifications, setDeviceNotifications] = useState(
        () => deviceEnabled(deviceStorageKey),
    );

    useEffect(() => {
        const controller = new AbortController();

        Promise.all([
            apiRequest<WorkspacePreferences>(
                '/api/workspace-settings',
                { signal: controller.signal },
            ),
            apiRequest<{ settings: Partial<ProfilePreferences> | null }>(
                '/api/profile/preferences',
                { signal: controller.signal },
            ),
        ])
            .then(([workspaceData, profileData]) => {
                if (controller.signal.aborted) return;

                setWorkspacePreferences(workspaceData);
                setCurrencyDraft(workspaceData.currency);
                setReminderDraft(workspaceData.reminder_days);

                const prefs = {
                    ...defaultProfilePreferences(),
                    ...profileData.settings,
                };

                setProfilePreferences(prefs);
                applyProfilePreferences(prefs);
            })
            .catch(() => undefined);

        return () => controller.abort();
    }, [activeOrganization?.id]);

    function flip(key: string): void {
        setFlags(current => ({
            ...current,
            [key]: !current[key],
        }));
    }

    async function saveChanges(): Promise<void> {
        setSaving(true);
        setSavedMessage('');

        try {
            await apiRequest('/api/profile/preferences', {
                method: 'PUT',
                body: JSON.stringify(profilePreferences),
            });

            if (workspacePreferences?.can_manage) {
                const response = await apiRequest<WorkspacePreferences>(
                    '/api/workspace-settings',
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            currency: currencyDraft,
                            reminder_days: reminderDraft,
                        }),
                    },
                );

                setWorkspacePreferences(response);
            }

            applyProfilePreferences(profilePreferences);
            localStorage.setItem(
                'acconova.settings-ui',
                JSON.stringify({ flags }),
            );
            setSavedMessage(
                text(
                    'تم حفظ التغييرات.',
                    'Changes saved.',
                ),
            );
        } finally {
            setSaving(false);
        }
    }

    async function toggleDeviceNotifications(): Promise<void> {
        if (!deviceSupported()) {
            return;
        }

        if (deviceNotifications) {
            localStorage.removeItem(deviceStorageKey);
            setDeviceNotifications(false);
            return;
        }

        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            localStorage.setItem(deviceStorageKey, 'on');
            setDeviceNotifications(true);
            showDeviceNotification(1);
        }
    }

    const workspaceName =
        workspacePreferences?.name
        ?? activeOrganization?.name
        ?? 'AccoNova';

    return (
        <AppShell>
            <Head title={text('الإعدادات', 'Settings')} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="min-h-[calc(100dvh-72px)] bg-[#f8fbff] px-3 py-4 sm:px-5 lg:px-6"
            >
                <div className="mx-auto max-w-[1540px]">
                    <div className="mb-4 flex items-end justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-[#122b55] sm:text-3xl">
                                {text('الإعدادات', 'Settings')}
                            </h1>
                            <p className="mt-1 text-xs leading-6 text-[#7f93af]">
                                {text(
                                    'قم بإدارة إعدادات حسابك والمؤسسة وتخصيص تجربة استخدام AccoNova.',
                                    'Manage account, workspace, and AccoNova experience settings.',
                                )}
                            </p>
                        </div>

                        {savedMessage && (
                            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700 sm:inline-flex">
                                <CheckCircle2 size={13} />
                                {savedMessage}
                            </span>
                        )}
                    </div>

                    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
                        <section className="min-w-0 lg:col-start-1 lg:row-start-1">
                            {section === 'general' && (
                                <div className="space-y-4">
                                    <section className="overflow-hidden rounded-[18px] border border-[#d6e4f6] bg-gradient-to-l from-[#edf5ff] to-white p-5">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h2 className="text-xl font-extrabold text-[#17386d]">
                                                    {text('مرحباً محمد 👋', 'Welcome')}
                                                </h2>
                                                <p className="mt-1 text-xs leading-6 text-[#6f86a8]">
                                                    {text(
                                                        'يمكنك من هنا تخصيص إعدادات النظام بما يناسب احتياجاتك.',
                                                        'Customize AccoNova settings for your workflow.',
                                                    )}
                                                </p>
                                            </div>
                                            <span className="hidden size-20 items-center justify-center rounded-[22px] bg-white/75 text-[#1265d8] sm:flex">
                                                <Settings2 size={36} />
                                            </span>
                                        </div>
                                    </section>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard
                                            title={text('الإعدادات العامة', 'General settings')}
                                            description={text('إعدادات أساسية لعمل النظام.', 'Core workspace defaults.')}
                                            icon={Settings2}
                                        >
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('اسم النظام', 'System name')}
                                                    <input className={input} defaultValue="AccoNova" />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الوصف', 'Description')}
                                                    <input className={input} defaultValue={text('نظام متكامل لإدارة الأعمال والمحاسبة والمخزون', 'Business, accounting and inventory platform')} />
                                                </label>
                                                <MiniSelect label={text('اللغة الافتراضية', 'Default language')} defaultValue="ar">
                                                    <option value="ar">العربية</option>
                                                    <option value="en">English</option>
                                                </MiniSelect>
                                                <MiniSelect label={text('المنطقة الزمنية', 'Timezone')} defaultValue="Asia/Hebron">
                                                    <option value="Asia/Hebron">القدس (GMT+03:00)</option>
                                                    <option value="Asia/Riyadh">الرياض (GMT+03:00)</option>
                                                    <option value="Asia/Dubai">دبي (GMT+04:00)</option>
                                                </MiniSelect>
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard
                                            title={text('خيارات النظام', 'System options')}
                                            description={text('فعّل أو عطّل بعض المزايا العامة.', 'Enable or disable common capabilities.')}
                                            icon={Gauge}
                                        >
                                            <SettingRow
                                                label={text('تفعيل الإشعارات داخل النظام', 'In-app notifications')}
                                                description={text('عرض التنبيهات داخل AccoNova.', 'Show alerts inside AccoNova.')}
                                                checked={flags.inAppNotifications}
                                                onChange={() => flip('inAppNotifications')}
                                            />
                                            <SettingRow
                                                label={text('تفعيل إشعارات البريد الإلكتروني', 'Email notifications')}
                                                checked={flags.emailNotifications}
                                                onChange={() => flip('emailNotifications')}
                                            />
                                            <SettingRow
                                                label={text('تفعيل السجلات والتدقيق', 'Audit log')}
                                                checked={flags.auditLog}
                                                onChange={() => flip('auditLog')}
                                            />
                                            <SettingRow
                                                label={text('وضع الصيانة', 'Maintenance mode')}
                                                description={text('منع المستخدمين من الوصول مؤقتاً.', 'Temporarily restrict user access.')}
                                                checked={flags.maintenance}
                                                onChange={() => flip('maintenance')}
                                            />
                                        </SettingsCard>
                                    </div>

                                    <SettingsCard
                                        title={text('الشعار والهوية', 'Logo & identity')}
                                        description={text('ارفع شعار المؤسسة واختر اللون الأساسي.', 'Upload your workspace logo and choose the primary color.')}
                                        icon={Image}
                                    >
                                        <div className="grid gap-5 md:grid-cols-[260px_1fr]">
                                            <div className="flex min-h-40 flex-col items-center justify-center rounded-[14px] border border-dashed border-[#c8daf0] bg-[#fbfdff]">
                                                <div className="flex size-16 items-center justify-center rounded-[18px] bg-[#edf5ff] text-2xl font-black text-[#1265d8]">
                                                    A
                                                </div>
                                                <strong className="mt-2 text-lg text-[#102e61]">AccoNova</strong>
                                                <button type="button" className={secondaryButton + ' mt-3'}>
                                                    <Upload size={14} />
                                                    {text('تغيير الشعار', 'Change logo')}
                                                </button>
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('لون النظام الأساسي', 'Primary color')}
                                                </p>
                                                <div className="mt-3 flex flex-wrap gap-3">
                                                    {['#2563EB','#8B5CF6','#EC4899','#EF4444','#10B981','#14B8A6','#334155'].map(color => (
                                                        <button
                                                            type="button"
                                                            key={color}
                                                            className="size-9 rounded-full border-4 border-white shadow-[0_0_0_1px_#dbe5f2]"
                                                            style={{ backgroundColor: color }}
                                                            aria-label={color}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'organization' && (
                                <div className="space-y-4">
                                    <SettingsCard
                                        title={text('معلومات المؤسسة', 'Organization information')}
                                        description={text('قم بتحديث معلومات مؤسستك الأساسية التي ستظهر في الفواتير والتقارير والمستندات الرسمية.', 'Update legal and public workspace information.')}
                                        icon={Building2}
                                    >
                                        <div className="grid gap-5 xl:grid-cols-[240px_1fr]">
                                            <div className="flex min-h-64 flex-col items-center justify-center rounded-[15px] border border-dashed border-[#c7d9ee] bg-[#fbfdff]">
                                                <div className="flex size-24 items-center justify-center rounded-[24px] bg-[#edf5ff] text-4xl font-black text-[#1265d8]">A</div>
                                                <strong className="mt-3 text-xl text-[#102e61]">AccoNova</strong>
                                                <button type="button" className={secondaryButton + ' mt-4'}>
                                                    <Upload size={14} />
                                                    {text('تغيير الشعار', 'Change logo')}
                                                </button>
                                                <p className={helper}>PNG — 512×512</p>
                                            </div>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الاسم القانوني للمؤسسة *', 'Legal organization name *')}
                                                    <input className={input} defaultValue={workspaceName} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الاسم التجاري (المختصر) *', 'Trade name *')}
                                                    <input className={input} defaultValue="AccoNova" />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('البريد الإلكتروني للدعم *', 'Support email *')}
                                                    <input className={input} defaultValue="info@acconova.com" />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('رقم الجوال *', 'Phone *')}
                                                    <input className={input} dir="ltr" defaultValue="+970 59 123 4567" />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('رقم السجل التجاري', 'Commercial registration')}
                                                    <input className={input} defaultValue="1010923456" />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الرقم الضريبي (VAT)', 'VAT number')}
                                                    <input className={input} defaultValue="310123456700003" />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e] sm:col-span-2">
                                                    {text('الموقع الإلكتروني', 'Website')}
                                                    <input className={input} dir="ltr" defaultValue="https://www.acconova.com" />
                                                </label>
                                            </div>
                                        </div>
                                    </SettingsCard>

                                    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                                        <div className="space-y-4">
                                            <SettingsCard
                                                title={text('عنوان المؤسسة', 'Organization address')}
                                                description={text('سيتم استخدام هذا العنوان في الفواتير والمستندات الرسمية.', 'Used on invoices and official documents.')}
                                                icon={Globe2}
                                            >
                                                <div className="grid gap-4 sm:grid-cols-3">
                                                    <MiniSelect label={text('الدولة *', 'Country *')} defaultValue="ps">
                                                        <option value="ps">فلسطين</option>
                                                        <option value="sa">السعودية</option>
                                                        <option value="ae">الإمارات</option>
                                                    </MiniSelect>
                                                    <label className="text-[11px] font-semibold text-[#5e789e]">
                                                        {text('المدينة *', 'City *')}
                                                        <input className={input} defaultValue="نابلس" />
                                                    </label>
                                                    <label className="text-[11px] font-semibold text-[#5e789e]">
                                                        {text('العنوان التفصيلي *', 'Detailed address *')}
                                                        <input className={input} defaultValue="شارع فيصل، نابلس" />
                                                    </label>
                                                </div>
                                            </SettingsCard>

                                            <SettingsCard
                                                title={text('معلومات العلامة في الفواتير', 'Invoice brand information')}
                                                description={text('هذه المعلومات ستظهر في رأس وتذييل الفواتير والمستندات.', 'Controls invoice branding details.')}
                                                icon={FileText}
                                            >
                                                <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                                                    <div className="rounded-[14px] border border-dashed border-[#c9d9ed] bg-white p-4 text-center">
                                                        <div className="mx-auto flex size-12 items-center justify-center rounded-[13px] bg-[#edf5ff] text-xl font-black text-[#1265d8]">A</div>
                                                        <strong className="mt-2 block text-xs text-[#17386d]">AccoNova</strong>
                                                        <p className="mt-2 text-[9px] leading-5 text-[#657f9f]">
                                                            {workspaceName}<br />
                                                            نابلس، فلسطين<br />
                                                            1010923456<br />
                                                            310123456700003
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <label className="text-[11px] font-semibold text-[#5e789e]">
                                                            {text('نص تذييل الفاتورة', 'Invoice footer text')}
                                                            <textarea className={input + ' min-h-24 py-3'} defaultValue={text('شكراً لثقتكم بنا\nمعاً نحو إدارة مالية أسهل.', 'Thank you for your business.')} />
                                                        </label>
                                                        <div className="mt-3">
                                                            <SettingRow label={text('إظهار الشعار في الفواتير', 'Show logo on invoices')} checked={flags.invoiceLogo} onChange={() => flip('invoiceLogo')} />
                                                            <SettingRow label={text('إظهار معلومات الاتصال', 'Show contact information')} checked={flags.invoiceContact} onChange={() => flip('invoiceContact')} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </SettingsCard>
                                        </div>

                                        <SettingsCard
                                            title={text('معلومات الفروع', 'Branches')}
                                            description={text('إدارة فروع المؤسسة (اختياري).', 'Manage optional branches.')}
                                            icon={Grid2X2}
                                        >
                                            <div className="flex min-h-64 flex-col items-center justify-center rounded-[14px] bg-[#f8fbff] p-5 text-center">
                                                <span className="flex size-14 items-center justify-center rounded-full bg-[#eaf3ff] text-[#1265d8]">
                                                    <Building2 size={24} />
                                                </span>
                                                <strong className="mt-3 text-sm text-[#17386d]">
                                                    {text('لديك فرع واحد', 'You have one branch')}
                                                </strong>
                                                <p className="mt-2 text-[10px] leading-5 text-[#8ba0bc]">
                                                    {text('يمكنك إدارة الفروع وإضافة فروع جديدة لتنظيم أعمالك بشكل أفضل.', 'Manage and add branches here.')}
                                                </p>
                                                <button type="button" className={secondaryButton + ' mt-4 w-full'}>
                                                    {text('إدارة الفروع', 'Manage branches')}
                                                </button>
                                            </div>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            {section === 'finance' && (
                                <div className="grid gap-4 xl:grid-cols-3">
                                    <SettingsCard title={text('السنة المالية', 'Fiscal year')} description={text('حدد بداية ونهاية السنة المالية لمؤسستك.', 'Set the fiscal-year boundaries.')} icon={CalendarDays}>
                                        <MiniSelect label={text('تبدأ السنة المالية في', 'Fiscal year starts')} defaultValue="1">
                                            <option value="1">يناير</option><option value="7">يوليو</option>
                                        </MiniSelect>
                                        <div className="mt-4 rounded-[12px] bg-[#f7fbff] p-3 text-[11px] text-[#657f9f]">
                                            <strong className="block text-[#17386d]">{text('السنة المالية الحالية', 'Current fiscal year')}</strong>
                                            <span className="mt-1 block">1 يناير 2026 — 31 ديسمبر 2026</span>
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('الدقة والتقريب', 'Precision & rounding')} description={text('حدد عدد المنازل العشرية وطريقة التقريب للمبالغ.', 'Configure financial precision.')} icon={Gauge}>
                                        <MiniSelect label={text('عدد المنازل العشرية', 'Decimal places')} defaultValue="2">
                                            <option value="2">2</option><option value="3">3</option><option value="4">4</option>
                                        </MiniSelect>
                                        <MiniSelect label={text('طريقة التقريب', 'Rounding method')} defaultValue="normal">
                                            <option value="normal">{text('تقريب عادي', 'Standard')}</option>
                                            <option value="up">{text('للأعلى', 'Round up')}</option>
                                        </MiniSelect>
                                        <div className="mt-4 rounded-[12px] bg-[#f7fbff] p-3 text-[11px] text-[#657f9f]">
                                            1.234 → 1.23<br />1.235 → 1.24
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('العملة الافتراضية', 'Default currency')} description={text('اختر العملة الافتراضية لجميع المعاملات المالية.', 'Default currency for finance.')} icon={CircleDollarSign}>
                                        <label className="text-[11px] font-semibold text-[#5e789e]">
                                            {text('العملة', 'Currency')}
                                            <select
                                                value={currencyDraft}
                                                onChange={event => setCurrencyDraft(event.target.value)}
                                                className={input}
                                            >
                                                <option value="ILS">ILS — شيقل</option>
                                                <option value="USD">USD — دولار</option>
                                                <option value="EUR">EUR — يورو</option>
                                                <option value="SAR">SAR — ريال سعودي</option>
                                            </select>
                                        </label>
                                        <div className="mt-4 grid grid-cols-3 gap-2">
                                            <div><p className={helper}>{text('رمز العملة', 'Code')}</p><div className={input + ' mt-1 flex items-center'}>{currencyDraft}</div></div>
                                            <div><p className={helper}>{text('رمز العرض', 'Symbol')}</p><div className={input + ' mt-1 flex items-center'}>{currencyDraft === 'ILS' ? '₪' : currencyDraft}</div></div>
                                            <div><p className={helper}>{text('موقع الرمز', 'Position')}</p><div className={input + ' mt-1 flex items-center'}>{text('بعد المبلغ', 'After')}</div></div>
                                        </div>
                                        <div className="mt-4 rounded-[12px] bg-[#f7fbff] p-3 text-lg font-bold text-[#17386d]">
                                            1,234.56 {currencyDraft}
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('الحسابات البنكية', 'Bank accounts')} description={text('إدارة الحسابات البنكية للمؤسسة.', 'Manage organization bank accounts.')} icon={Banknote}>
                                        {[
                                            ['البنك العربي', 'PS12 1000 0000 1234 5678 9012'],
                                            ['بنك فلسطين', 'PS98 8000 0000 9876 5432 1098'],
                                        ].map(([name, iban], index) => (
                                            <div key={iban} className="mb-2 flex items-center justify-between rounded-[11px] border border-[#e1eaf5] p-3">
                                                <div>
                                                    <div className="flex items-center gap-2"><strong className="text-xs text-[#17386d]">{name}</strong>{index === 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">{text('الأساسي', 'Primary')}</span>}</div>
                                                    <p className="mt-1 text-[10px] text-[#8ba0bc]">{iban}</p>
                                                </div>
                                                <MoreHorizontal size={16} className="text-[#7990ae]" />
                                            </div>
                                        ))}
                                        <button type="button" className={secondaryButton + ' mt-1 w-full'}>
                                            + {text('إضافة حساب بنكي جديد', 'Add bank account')}
                                        </button>
                                    </SettingsCard>

                                    <SettingsCard title={text('طرق الدفع', 'Payment methods')} description={text('إدارة طرق الدفع المقبولة في فواتيرك.', 'Configure accepted payment methods.')} icon={CreditCard}>
                                        {[
                                            ['تحويل بنكي', true],
                                            ['بطاقة ائتمان', true],
                                            ['نقدي', true],
                                            ['شيك', true],
                                            ['دفع إلكتروني', false],
                                        ].map(([label, enabled]) => (
                                            <div key={String(label)} className="flex items-center justify-between py-2.5">
                                                <span className="text-xs font-semibold text-[#19345f]">{String(label)}</span>
                                                <span className={['size-4 rounded-[4px] border', enabled ? 'border-[#1265d8] bg-[#1265d8]' : 'border-[#cbd7e7]'].join(' ')} />
                                            </div>
                                        ))}
                                    </SettingsCard>

                                    <SettingsCard title={text('إعدادات الضريبة', 'Tax settings')} description={text('تهيئة إعدادات الضرائب الافتراضية للفواتير والمعاملات.', 'Default tax behavior.')} icon={Percent}>
                                        <label className="text-[11px] font-semibold text-[#5e789e]">
                                            {text('نسبة الضريبة الافتراضية', 'Default tax rate')}
                                            <div className="relative">
                                                <input className={input + ' pe-10'} defaultValue="16" />
                                                <span className="absolute end-3 top-[22px] text-xs text-[#6e85a5]">%</span>
                                            </div>
                                        </label>
                                        <MiniSelect label={text('نوع الضريبة', 'Tax type')} defaultValue="vat">
                                            <option value="vat">{text('ضريبة القيمة المضافة', 'VAT')}</option>
                                        </MiniSelect>
                                        <SettingRow label={text('تضمين الضريبة في الأسعار', 'Tax-inclusive prices')} checked={flags.invoiceTax} onChange={() => flip('invoiceTax')} />
                                    </SettingsCard>

                                    <SettingsCard title={text('إعدادات النقد والشيكات', 'Cash & check settings')} description={text('تحديد إعدادات التعامل مع المدفوعات النقدية والشيكات.', 'Cash and check handling rules.')} icon={Banknote}>
                                        <SettingRow label={text('تفعيل مدفوعات نقدية', 'Enable cash')} checked={flags.cashEnabled} onChange={() => flip('cashEnabled')} />
                                        <SettingRow label={text('تفعيل الشيكات', 'Enable checks')} checked={flags.checkEnabled} onChange={() => flip('checkEnabled')} />
                                        <SettingRow label={text('التحقق من تاريخ الشيك', 'Validate check date')} checked={flags.validateCheckDate} onChange={() => flip('validateCheckDate')} />
                                        <SettingRow label={text('تسجيل الشيكات كمعلّقة', 'Post-dated checks pending')} checked={flags.postDatedChecks} onChange={() => flip('postDatedChecks')} />
                                    </SettingsCard>

                                    <SettingsCard title={text('تفاصيل التكلفة', 'Costing details')} description={text('حدد طريقة احتساب التكاليف في الشراء والقوائم المالية.', 'Choose costing behavior.')} icon={Database}>
                                        <MiniSelect label={text('طريقة احتساب التكلفة', 'Cost method')} defaultValue="moving">
                                            <option value="moving">{text('المتوسط المتحرك', 'Moving average')}</option>
                                            <option value="fifo">FIFO</option>
                                        </MiniSelect>
                                        <SettingRow label={text('تضمين تكاليف إضافية', 'Include extra costs')} checked={flags.extraCosts} onChange={() => flip('extraCosts')} />
                                        <SettingRow label={text('احتساب تكلفة الشحن', 'Include shipping')} checked={flags.shippingCost} onChange={() => flip('shippingCost')} />
                                    </SettingsCard>

                                    <SettingsCard title={text('ترقيم الفواتير', 'Invoice numbering')} description={text('إعداد نمط ترقيم الفواتير والمستندات المالية.', 'Configure numbering patterns.')} icon={FileText}>
                                        <div className="grid grid-cols-2 gap-3">
                                            <label className="text-[11px] font-semibold text-[#5e789e]">
                                                {text('بادئة الفاتورة', 'Prefix')}<input className={input} defaultValue="INV" />
                                            </label>
                                            <label className="text-[11px] font-semibold text-[#5e789e]">
                                                {text('رقم البداية', 'Starting number')}<input className={input} defaultValue="1001" />
                                            </label>
                                        </div>
                                        <div className="mt-4 rounded-[12px] bg-[#f7fbff] p-3">
                                            <p className="text-[10px] text-[#8ba0bc]">{text('معاينة الرقم القادم', 'Next number preview')}</p>
                                            <strong className="mt-1 block text-lg text-[#17386d]">INV-2026-1001</strong>
                                        </div>
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'invoices' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                                        <SettingsCard title={text('قالب الفاتورة الحالي', 'Current invoice template')} description={text('معاينة شكل الفاتورة الحالية.', 'Preview the current invoice design.')} icon={ReceiptText}>
                                            <div className="rounded-[12px] border border-[#dfe8f4] bg-[#fbfdff] p-4">
                                                <div className="mx-auto max-w-[290px] bg-white p-4 shadow-sm">
                                                    <div className="flex items-start justify-between"><strong className="text-[#1265d8]">AccoNova</strong><div className="text-end"><strong className="text-xs">{text('فاتورة ضريبية', 'Tax Invoice')}</strong><p className="text-[9px] text-slate-400">INV-2026-0001</p></div></div>
                                                    <div className="my-4 h-px bg-[#e7edf5]" />
                                                    <div className="grid grid-cols-4 gap-1 text-[8px] text-[#6d82a0]"><span>#</span><span>{text('الوصف','Description')}</span><span>{text('الكمية','Qty')}</span><span>{text('المجموع','Total')}</span></div>
                                                    {[1,2].map(row => <div key={row} className="mt-2 grid grid-cols-4 gap-1 border-b border-[#edf2f8] pb-2 text-[8px]"><span>{row}</span><span>{text('خدمة محاسبية','Service')}</span><span>1</span><span>200.00</span></div>)}
                                                    <div className="mt-4 text-end text-[9px]"><p>{text('المجموع الفرعي','Subtotal')}: 300.00</p><p>{text('الضريبة','Tax')}: 48.00</p><strong>{text('الإجمالي','Total')}: 348.00</strong></div>
                                                </div>
                                            </div>
                                            <button type="button" className={secondaryButton + ' mt-3 w-full'}>
                                                <Eye size={14} />
                                                {text('معاينة بحجم أكبر', 'Open full preview')}
                                            </button>
                                        </SettingsCard>

                                        <div className="space-y-4">
                                            <SettingsCard title={text('اختر قالب الفاتورة', 'Choose invoice template')} description={text('اختر التصميم الذي يناسب هوية مؤسستك.', 'Choose your invoice layout.')} icon={FileCheck2}>
                                                <div className="grid gap-3 sm:grid-cols-4">
                                                    {['احترافي','كلاسيكي','مودرن','بسيط'].map((label,index) => (
                                                        <button type="button" key={label} className={['rounded-[12px] border p-2', index === 0 ? 'border-[#2f7df4] bg-[#f4f8ff]' : 'border-[#dfe8f4]'].join(' ')}>
                                                            <div className="h-20 rounded-[8px] border border-[#e4ebf4] bg-white p-2"><div className="h-2 w-10 rounded bg-[#1265d8]/70" /><div className="mt-3 h-1.5 rounded bg-slate-100" /><div className="mt-2 h-1.5 rounded bg-slate-100" /><div className="mt-2 h-5 rounded bg-blue-50" /></div>
                                                            <span className="mt-2 block text-[10px] font-semibold text-[#17386d]">{label}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </SettingsCard>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <SettingsCard title={text('قالب أمر الشراء', 'Purchase template')} description={text('قالب مستندات الشراء.', 'Purchase document template.')} icon={FileText}>
                                                    <MiniSelect label={text('القالب', 'Template')} defaultValue="default"><option value="default">{text('افتراضي','Default')}</option></MiniSelect>
                                                </SettingsCard>
                                                <SettingsCard title={text('قالب الإيصال', 'Receipt template')} description={text('قالب إيصالات الدفع والقبض.', 'Payment/receipt layout.')} icon={ReceiptText}>
                                                    <MiniSelect label={text('القالب', 'Template')} defaultValue="default"><option value="default">{text('افتراضي','Default')}</option></MiniSelect>
                                                </SettingsCard>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <SettingsCard title={text('المحتوى والمظهر', 'Content & appearance')} description={text('تخصيص المعلومات الظاهرة في الفواتير والمستندات.', 'Choose visible invoice content.')} icon={Palette}>
                                            <SettingRow label={text('إظهار شعار المؤسسة', 'Show logo')} checked={flags.invoiceLogo} onChange={() => flip('invoiceLogo')} />
                                            <SettingRow label={text('إظهار معلومات التواصل', 'Show contact')} checked={flags.invoiceContact} onChange={() => flip('invoiceContact')} />
                                            <SettingRow label={text('إظهار رقم السجل الضريبي', 'Show VAT number')} checked={flags.invoiceTax} onChange={() => flip('invoiceTax')} />
                                            <SettingRow label={text('إظهار خانة ملاحظات', 'Show notes')} checked={flags.invoiceNotes} onChange={() => flip('invoiceNotes')} />
                                            <SettingRow label={text('إظهار رمز QR للدفع', 'Show payment QR')} checked={flags.invoiceQr} onChange={() => flip('invoiceQr')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('إعدادات الطباعة', 'Print settings')} description={text('تخصيص حجم الورق ومظهر الطباعة والمستندات.', 'Paper and print layout settings.')} icon={Printer}>
                                            <MiniSelect label={text('حجم الورق', 'Paper size')} defaultValue="a4"><option value="a4">A4 (210 × 297 mm)</option><option value="letter">Letter</option></MiniSelect>
                                            <MiniSelect label={text('هوامش الطباعة', 'Margins')} defaultValue="normal"><option value="normal">{text('عادية','Normal')}</option><option value="compact">{text('ضيقة','Compact')}</option></MiniSelect>
                                            <p className="mt-4 text-[11px] font-semibold text-[#5e789e]">{text('موقع الشعار', 'Logo position')}</p>
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                                {['يمين','وسط','يسار'].map((item,index) => <button key={item} type="button" className={['rounded-[10px] border p-3 text-[10px] font-semibold',index===1?'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]':'border-[#dfe8f4] text-[#6e85a5]'].join(' ')}>{item}</button>)}
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard title={text('ترقيم الفواتير والمستندات', 'Document numbering')} description={text('تخصيص طريقة ترقيم الفواتير والإيصالات وأوامر الشراء.', 'Document prefixes and starting numbers.')} icon={FileSpreadsheet}>
                                            <label className="text-[11px] font-semibold text-[#5e789e]">{text('بادئة الفواتير','Invoice prefix')}<input className={input} defaultValue="INV-" /></label>
                                            <label className="text-[11px] font-semibold text-[#5e789e]">{text('بادئة الإيصالات','Receipt prefix')}<input className={input} defaultValue="RCPT-" /></label>
                                            <label className="text-[11px] font-semibold text-[#5e789e]">{text('بادئة أوامر الشراء','Purchase prefix')}<input className={input} defaultValue="PO-" /></label>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('الملاحظات والتذييل', 'Notes & footer')} description={text('نص الملاحظات الذي يظهر في أسفل الفواتير والمستندات.', 'Default invoice footer copy.')} icon={FileText}>
                                            <textarea className={input + ' min-h-24 py-3'} defaultValue={text('شكراً لتعاملكم معنا، للاستفسار يرجى التواصل معنا في أي وقت.', 'Thank you for your business.')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('الأعمدة الظاهرة في الفاتورة', 'Visible invoice columns')} description={text('اختر الأعمدة التي تريد إظهارها في جدول الأصناف.', 'Choose columns in invoice line tables.')} icon={Eye}>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {['رقم الصنف','الوصف','الكمية','سعر الوحدة','الخصم','الضريبة','المجموع'].map((item,index) => (
                                                    <button key={item} type="button" className={['rounded-[10px] border px-3 py-2 text-[10px] font-semibold',index === 0 ? 'border-[#dfe8f4] text-[#8ba0bc]' : 'border-[#bcd5f6] bg-[#f5f9ff] text-[#1265d8]'].join(' ')}>{item}</button>
                                                ))}
                                            </div>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            {section === 'users' && (
                                <div className="space-y-4">
                                    <div className="flex flex-col gap-3 rounded-[16px] border border-[#dfe8f4] bg-white p-3 sm:flex-row sm:items-center">
                                        <button type="button" className={primaryButton}><UserPlus size={14} />{text('دعوة مستخدم','Invite user')}</button>
                                        <button type="button" className={secondaryButton}>{text('إدارة الأدوار','Manage roles')}<Settings2 size={14} /></button>
                                        <div className="relative flex-1"><Search size={14} className="absolute end-3 top-3.5 text-[#8ba0bc]" /><input className={input + ' !mt-0 pe-9'} placeholder={text('ابحث عن مستخدم...','Search users...')} /></div>
                                        <select className={input + ' !mt-0 sm:w-40'}><option>{text('جميع الأدوار','All roles')}</option></select>
                                        <select className={input + ' !mt-0 sm:w-40'}><option>{text('جميع الحالات','All statuses')}</option></select>
                                    </div>

                                    <SettingsCard title={text('المستخدمون (6)', 'Users (6)')} description={text('إدارة جميع المستخدمين في مؤسستك.', 'Manage workspace users.')} icon={UsersRound}>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-[760px] w-full text-xs">
                                                <thead className="bg-[#f8fbff] text-[#7186a5]">
                                                    <tr><th className="px-3 py-3 text-start">{text('المستخدم','User')}</th><th className="px-3 py-3 text-start">{text('البريد الإلكتروني','Email')}</th><th className="px-3 py-3 text-start">{text('الدور','Role')}</th><th className="px-3 py-3 text-start">{text('آخر نشاط','Last activity')}</th><th className="px-3 py-3 text-start">{text('الحالة','Status')}</th><th className="px-3 py-3"></th></tr>
                                                </thead>
                                                <tbody>
                                                    {[
                                                        ['أحمد محمد','ahmed@acconova.com','مدير النظام','متصل الآن','نشط'],
                                                        ['سارة عبدالله','sarah@acconova.com','محاسب','منذ ساعتين','نشط'],
                                                        ['محمد علي','mohammed@acconova.com','مبيعات','منذ يوم','نشط'],
                                                        ['نورة خالد','noura@acconova.com','مخزون','منذ 3 ساعات','نشط'],
                                                        ['خالد سالم','khalid@acconova.com','مبيعات','منذ 5 أيام','غير نشط'],
                                                        ['ليلى حسن','layla@acconova.com','محاسب','منذ يوم','معلق'],
                                                    ].map((user,index) => (
                                                        <tr key={user[1]} className="border-t border-[#edf2f8]">
                                                            <td className="px-3 py-3"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full bg-[#edf5ff] font-bold text-[#1265d8]">{user[0].charAt(0)}</span><div><strong className="block text-[#17386d]">{user[0]}</strong><span className="text-[9px] text-[#8ba0bc]">{index===0?'مدير الحساب':'عضو فريق'}</span></div></div></td>
                                                            <td className="px-3 py-3 text-[#5f789c]">{user[1]}</td>
                                                            <td className="px-3 py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-semibold text-[#1265d8]">{user[2]}</span></td>
                                                            <td className="px-3 py-3 text-[#6f86a8]">{user[3]}</td>
                                                            <td className="px-3 py-3"><span className={['rounded-full px-2.5 py-1 text-[9px] font-semibold',user[4]==='نشط'?'bg-emerald-50 text-emerald-700':user[4]==='معلق'?'bg-amber-50 text-amber-700':'bg-red-50 text-red-600'].join(' ')}>{user[4]}</span></td>
                                                            <td className="px-3 py-3"><MoreHorizontal size={16} className="text-[#7990ae]" /></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('الأدوار', 'Roles')} description={text('إدارة الأدوار الخاصة بالنظام وتخصيص الصلاحيات لكل دور.', 'Manage workspace roles.')} icon={ShieldCheck}>
                                        <div className="grid gap-3 md:grid-cols-4">
                                            {[
                                                ['مدير النظام','صلاحية كاملة على جميع أجزاء النظام.','1 مستخدم','blue'],
                                                ['محاسب','الوصول إلى البيانات المالية والتقارير المحاسبية.','2 مستخدمين','green'],
                                                ['مبيعات','إدارة المبيعات والعملاء والعروض.','2 مستخدمين','purple'],
                                                ['مخزون','إدارة الأصناف والمستودعات وحركات المخزون.','1 مستخدم','orange'],
                                            ].map(([role,desc,count,tone]) => (
                                                <div key={role} className="rounded-[14px] border border-[#dfe8f4] p-4">
                                                    <span className={['flex size-10 items-center justify-center rounded-[12px]',tone==='blue'?'bg-blue-50 text-blue-700':tone==='green'?'bg-emerald-50 text-emerald-700':tone==='purple'?'bg-violet-50 text-violet-700':'bg-orange-50 text-orange-700'].join(' ')}><ShieldCheck size={17} /></span>
                                                    <strong className="mt-3 block text-sm text-[#17386d]">{role}</strong>
                                                    <p className="mt-1 min-h-12 text-[10px] leading-5 text-[#8ba0bc]">{desc}</p>
                                                    <div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[#6e85a5]">{count}</span><MoreHorizontal size={15} /></div>
                                                </div>
                                            ))}
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('مصفوفة الصلاحيات', 'Permission matrix')} description={text('نظرة سريعة على أهم الصلاحيات لكل دور.', 'Quick permission overview by role.')} icon={ListChecks}>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-[650px] w-full text-[10px]">
                                                <thead><tr><th className="px-3 py-2 text-start">{text('الوظيفة','Capability')}</th>{['مدير النظام','محاسب','مبيعات','مخزون'].map(role=><th key={role} className="px-3 py-2 text-center">{role}</th>)}</tr></thead>
                                                <tbody>
                                                    {[
                                                        ['إدارة المستخدمين',[1,0,0,0]],
                                                        ['إعدادات النظام',[1,0,0,0]],
                                                        ['البيانات المالية والتقارير',[1,1,0,0]],
                                                        ['المبيعات والعملاء',[1,0,1,0]],
                                                        ['المخزون والأصناف',[1,0,0,1]],
                                                    ].map(([cap,vals]) => (
                                                        <tr key={String(cap)} className="border-t border-[#edf2f8]"><td className="px-3 py-2 font-semibold text-[#5e789e]">{String(cap)}</td>{(vals as number[]).map((val,index)=><td key={index} className="px-3 py-2 text-center">{val?<CheckCircle2 size={14} className="mx-auto text-emerald-500" />:<span className="text-red-400">×</span>}</td>)}</tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'notifications' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                                        <SettingsCard title={text('قنوات الإشعارات', 'Notification channels')} description={text('اختر القنوات التي تفضل تلقي الإشعارات من خلالها.', 'Choose notification delivery channels.')} icon={Bell}>
                                            <div className="grid gap-3 sm:grid-cols-4">
                                                {[
                                                    ['البريد الإلكتروني', Mail, 'emailChannel'],
                                                    ['الإشعارات داخل التطبيق', AppWindow, 'appChannel'],
                                                    ['الرسائل النصية (SMS)', Smartphone, 'smsChannel'],
                                                    ['الإشعارات الفورية', Bell, 'devicePush'],
                                                ].map(([label,Icon,key]) => (
                                                    <div key={String(key)} className="rounded-[14px] border border-[#dfe8f4] p-4 text-center">
                                                        <span className="mx-auto flex size-11 items-center justify-center rounded-[14px] bg-[#edf5ff] text-[#1265d8]"><Icon size={19} /></span>
                                                        <strong className="mt-3 block text-xs text-[#17386d]">{String(label)}</strong>
                                                        <div className="mt-3 flex justify-center">
                                                            <Toggle
                                                                checked={
                                                                    String(key) === 'devicePush'
                                                                        ? deviceNotifications
                                                                        : flags[String(key)]
                                                                }
                                                                onChange={() => {
                                                                    if (String(key) === 'devicePush') {
                                                                        void toggleDeviceNotifications();
                                                                        return;
                                                                    }
                                                                    flip(String(key));
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard title={text('إعدادات عامة', 'General settings')} description={text('تحكم في كيفية ووقت تلقي الإشعارات.', 'Control timing and localization.')} icon={Settings2}>
                                            <MiniSelect label={text('اللغة المفضلة للإشعارات','Notification language')} defaultValue="ar"><option value="ar">العربية</option><option value="en">English</option></MiniSelect>
                                            <MiniSelect label={text('المنطقة الزمنية','Timezone')} defaultValue="Asia/Hebron"><option value="Asia/Hebron">القدس (GMT+3)</option></MiniSelect>
                                            <SettingRow label={text('ساعات الهدوء','Quiet hours')} checked={true} onChange={() => undefined} />
                                            <div className="grid grid-cols-2 gap-2"><input className={input} defaultValue="10:00 م" /><input className={input} defaultValue="7:00 ص" /></div>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <SettingsCard title={text('إشعارات المدفوعات','Payment notifications')} description={text('تابع أنشطة المدفوعات والمعاملات المالية.','Payment and finance activity alerts.')} icon={CreditCard}>
                                            <SettingRow label={text('تم استلام دفعة','Payment received')} checked={flags.paymentReceived} onChange={() => flip('paymentReceived')} />
                                            <SettingRow label={text('فشل عملية الدفع','Payment failed')} checked={flags.paymentFailed} onChange={() => flip('paymentFailed')} />
                                            <SettingRow label={text('استرداد مبلغ','Refund')} checked={flags.paymentRefund} onChange={() => flip('paymentRefund')} />
                                            <SettingRow label={text('إشعارات الاشتراك','Subscription alerts')} checked={flags.subscriptionAlerts} onChange={() => flip('subscriptionAlerts')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('إشعارات الفواتير','Invoice notifications')} description={text('إشعارات متعلقة بالفواتير والدفع.','Invoice status alerts.')} icon={FileText}>
                                            <SettingRow label={text('فاتورة مستحقة','Invoice due')} checked={flags.dueInvoice} onChange={() => flip('dueInvoice')} />
                                            <SettingRow label={text('فاتورة متأخرة','Invoice overdue')} checked={flags.overdueInvoice} onChange={() => flip('overdueInvoice')} />
                                            <SettingRow label={text('تم دفع الفاتورة','Invoice paid')} checked={flags.invoicePaid} onChange={() => flip('invoicePaid')} />
                                            <SettingRow label={text('إلغاء الفاتورة','Invoice cancelled')} checked={flags.invoiceCancelled} onChange={() => flip('invoiceCancelled')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('إشعارات المبيعات','Sales notifications')} description={text('تنبيهات حول الأنشطة المتعلقة بالمبيعات والعملاء.','Sales and customer alerts.')} icon={BadgeDollarSign}>
                                            <SettingRow label={text('عميل جديد','New customer')} checked={flags.newCustomer} onChange={() => flip('newCustomer')} />
                                            <SettingRow label={text('فرصة بيع جديدة','New opportunity')} checked={flags.salesOpportunity} onChange={() => flip('salesOpportunity')} />
                                            <SettingRow label={text('تحديث حالة فرصة البيع','Opportunity status')} checked={flags.salesStatus} onChange={() => flip('salesStatus')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('أنواع الإشعارات الأخرى','Other notification types')} description={text('تفضيلات إضافية لإشعارات النظام.','Other platform notifications.')} icon={Bell}>
                                            <SettingRow label={text('تحديثات المنتج','Product updates')} checked={flags.productUpdates} onChange={() => flip('productUpdates')} />
                                            <SettingRow label={text('النصائح والإرشادات','Tips & guidance')} checked={flags.hints} onChange={() => flip('hints')} />
                                            <SettingRow label={text('العروض الخاصة','Offers')} checked={flags.offers} onChange={() => flip('offers')} />
                                            <SettingRow label={text('إشعارات الصيانة','Maintenance')} checked={flags.maintenanceAlerts} onChange={() => flip('maintenanceAlerts')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('الملخص الأسبوعي','Weekly summary')} description={text('احصل على ملخص بأهم أنشطة حسابك.','Weekly account summary.')} icon={Mail}>
                                            <SettingRow label={text('إرسال الملخص الأسبوعي','Send weekly summary')} checked={flags.weeklySummary} onChange={() => flip('weeklySummary')} />
                                            <MiniSelect label={text('اليوم','Day')} defaultValue="monday"><option value="monday">{text('كل يوم اثنين','Every Monday')}</option></MiniSelect>
                                            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[#5e789e]"><span>☑ {text('ملخص المبيعات','Sales')}</span><span>☑ {text('ملخص الفواتير','Invoices')}</span><span>☑ {text('ملخص المدفوعات','Payments')}</span><span>☐ {text('نشاط المستخدمين','Users')}</span></div>
                                        </SettingsCard>

                                        <SettingsCard title={text('الإشعارات الأمنية','Security notifications')} description={text('تنبيهات مهمة لحماية حسابك وبياناتك.','Important account security alerts.')} icon={ShieldCheck}>
                                            <SettingRow label={text('تسجيل دخول جديد','New login')} checked={flags.securityLogin} onChange={() => flip('securityLogin')} />
                                            <SettingRow label={text('تغيير كلمة المرور','Password changed')} checked={flags.securityPassword} onChange={() => flip('securityPassword')} />
                                            <SettingRow label={text('محاولات تسجيل دخول مشبوهة','Suspicious sign-in')} checked={flags.suspiciousLogin} onChange={() => flip('suspiciousLogin')} />
                                            <SettingRow label={text('تحديثات الأمان','Security updates')} checked={flags.securityUpdates} onChange={() => flip('securityUpdates')} />
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            {section === 'integrations' && (
                                <div className="space-y-4">
                                    <SettingsCard title={text('التكاملات المتاحة','Available integrations')} description={text('قم بربط حسابك مع التطبيقات والخدمات الخارجية لتوسيع قدرات AccoNova وتحسين سير العمل.','Connect external tools and services.')} icon={Link2}>
                                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            <IntegrationCard title="Google Drive" description={text('حفظ الفواتير والمستندات في Google Drive.','Store documents in Drive.')} icon={<div className="text-2xl">▲</div>} />
                                            <IntegrationCard title="WhatsApp" description={text('إرسال الإشعارات والفواتير عبر واتساب.','Send invoices via WhatsApp.')} icon={<div className="text-2xl">🟢</div>} />
                                            <IntegrationCard title={text('البريد الإلكتروني / SMTP','Email / SMTP')} description={text('إرسال الفواتير والإشعارات عبر بريدك الإلكتروني.','Use your SMTP account.')} icon={<Mail size={24} className="text-[#1265d8]" />} connected />
                                            <IntegrationCard title="Stripe" description={text('قبول المدفوعات عبر الإنترنت بشكل آمن وسهل.','Accept online payments.')} icon={<CreditCard size={24} className="text-[#6b4ee6]" />} />
                                            <IntegrationCard title="Zapier" description={text('أتمتة المهام والربط مع آلاف التطبيقات.','Automation platform.')} icon={<Zap size={24} className="text-orange-500" />} />
                                            <IntegrationCard title={text('مفاتيح API','API keys')} description={text('الوصول إلى واجهة برمجة التطبيقات لربط أنظمتك.','API access for custom integrations.')} icon={<KeyRound size={24} className="text-[#1265d8]" />} connected />
                                            <IntegrationCard title="Webhooks" description={text('استقبال وإرسال البيانات بشكل فوري.','Real-time event delivery.')} icon={<Webhook size={24} className="text-pink-600" />} />
                                            <IntegrationCard title="Google Calendar" description={text('مزامنة المواعيد والمهام مع تقويم جوجل.','Sync calendar events.')} icon={<CalendarDays size={24} className="text-[#1265d8]" />} />
                                        </div>
                                    </SettingsCard>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('التطبيقات المتصلة','Connected apps')} description={text('التطبيقات والخدمات التي قمت بربطها مع حسابك حالياً.','Currently connected services.')} icon={Grid2X2}>
                                            {[
                                                ['البريد الإلكتروني / SMTP','info@acconova.com'],
                                                ['Google Drive','acconova@company.com'],
                                                ['API','تم إنشاء 2 مفتاح API'],
                                            ].map(([name,meta]) => <div key={name} className="flex items-center justify-between border-b border-[#edf2f8] py-3 last:border-0"><div><strong className="text-xs text-[#17386d]">{name}</strong><p className="mt-1 text-[10px] text-[#8ba0bc]">{meta}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">{text('متصل','Connected')}</span></div>)}
                                        </SettingsCard>

                                        <SettingsCard title={text('المزامنة والربط','Sync & linking')} description={text('إدارة إعدادات المزامنة التلقائية بين AccoNova والتطبيقات المتصلة.','Manage automatic synchronization.')} icon={RefreshCw}>
                                            <SettingRow label={text('المزامنة التلقائية للبيانات','Automatic data sync')} checked={flags.autoSync} onChange={() => flip('autoSync')} />
                                            <MiniSelect label={text('تكرار المزامنة','Sync frequency')} defaultValue="hourly"><option value="hourly">{text('كل ساعة','Hourly')}</option><option value="daily">{text('يومياً','Daily')}</option></MiniSelect>
                                            <button type="button" className={secondaryButton + ' mt-4'}>{text('عرض سجل المزامنة','View sync log')}</button>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            {section === 'security' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('سياسة كلمة المرور','Password policy')} description={text('قم بإعداد متطلبات كلمة المرور لحسابك.','Configure password requirements.')} icon={LockKeyhole}>
                                            <ul className="space-y-2 text-[11px] text-[#5e789e]">
                                                {['الحد الأدنى للطول 8 أحرف','يجب أن تحتوي على أحرف كبيرة وصغيرة','يجب أن تحتوي على أرقام ورموز خاصة','عدم استخدام كلمات المرور الشائعة'].map(item => <li key={item} className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" />{item}</li>)}
                                            </ul>
                                            <Link href="/app/profile" className={secondaryButton + ' mt-4 w-full'}>{text('تغيير كلمة المرور','Change password')}</Link>
                                        </SettingsCard>

                                        <SettingsCard title={text('المصادقة الثنائية','Two-factor authentication')} description={text('أضف طبقة إضافية من الحماية لحسابك باستخدام المصادقة الثنائية.','Add a second authentication factor.')} icon={Smartphone}>
                                            <div className="rounded-[12px] bg-emerald-50 p-4"><div className="flex items-center justify-between"><strong className="text-xs text-emerald-800">{text('المصادقة الثنائية مفعلة','2FA enabled')}</strong><span className="rounded-full bg-white px-2 py-1 text-[9px] font-semibold text-emerald-700">{text('مفعلة','Enabled')}</span></div><p className="mt-2 text-[10px] leading-5 text-emerald-700">{text('حسابك محمي باستخدام تطبيق المصادقة.','Your account is protected with an authenticator app.')}</p></div>
                                            <button type="button" className={secondaryButton + ' mt-4 w-full'}>{text('إدارة المصادقة الثنائية','Manage 2FA')}</button>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <SettingsCard title={text('الجلسات النشطة','Active sessions')} description={text('قائمة الأجهزة النشطة حالياً على حسابك.','Currently active sessions.')} icon={Monitor}>
                                            {['MacBook Pro','iPhone 15','Chrome - Windows'].map((device,index) => <div key={device} className="border-b border-[#edf2f8] py-3 last:border-0"><div className="flex items-center justify-between"><strong className="text-xs text-[#17386d]">{device}</strong>{index===0&&<span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">{text('الجلسة الحالية','Current')}</span>}</div><p className="mt-1 text-[10px] text-[#8ba0bc]">فلسطين · Windows 11</p></div>)}
                                            <button type="button" className="mt-4 w-full rounded-[10px] border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">{text('إنهاء كل الجلسات','End all sessions')}</button>
                                        </SettingsCard>

                                        <SettingsCard title={text('الأجهزة الموثوقة','Trusted devices')} description={text('قم بإدارة الأجهزة الموثوقة التي لا تتطلب رمز تحقق متكرر.','Manage trusted devices.')} icon={Smartphone}>
                                            {['MacBook Pro','iPhone 15','Windows PC'].map(device => <div key={device} className="flex items-center justify-between border-b border-[#edf2f8] py-3 last:border-0"><div><strong className="text-xs text-[#17386d]">{device}</strong><p className="mt-1 text-[10px] text-[#8ba0bc]">آخر استخدام حديث</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">{text('موثوق','Trusted')}</span></div>)}
                                            <button type="button" className={secondaryButton + ' mt-4 w-full'}>{text('إدارة الأجهزة الموثوقة','Manage trusted devices')}</button>
                                        </SettingsCard>

                                        <SettingsCard title={text('تنبيهات تسجيل الدخول','Login alerts')} description={text('احصل على إشعارات عند تسجيل الدخول إلى حسابك من أجهزة أو مواقع جديدة.','Login notification channels.')} icon={Bell}>
                                            <SettingRow label={text('إشعارات البريد الإلكتروني','Email alerts')} checked={flags.loginEmail} onChange={() => flip('loginEmail')} />
                                            <SettingRow label={text('إشعارات التطبيق','App alerts')} checked={flags.loginApp} onChange={() => flip('loginApp')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('رموز النسخ الاحتياطي','Recovery codes')} description={text('استخدم رموز النسخ الاحتياطي للوصول إلى حسابك في حال فقدان جهاز المصادقة.','Backup recovery codes.')} icon={FileText}>
                                            <div className="rounded-[12px] bg-[#f7fbff] p-4 text-center"><strong className="text-lg text-[#17386d]">8</strong><p className="mt-1 text-[10px] text-[#8ba0bc]">{text('رموز متاحة','codes available')}</p></div>
                                            <button type="button" className={secondaryButton + ' mt-3 w-full'}>{text('عرض رموز النسخ الاحتياطي','View recovery codes')}</button>
                                        </SettingsCard>

                                        <SettingsCard title={text('تقييد عناوين IP','IP restriction')} description={text('يمكنك تقييد الوصول إلى حسابك من عناوين IP محددة.','Restrict sign-in by IP.')} icon={Globe2}>
                                            <SettingRow label={text('تفعيل تقييد عناوين IP','Enable IP restriction')} checked={flags.ipRestriction} onChange={() => flip('ipRestriction')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('انتهاء الجلسة التلقائي','Automatic session timeout')} description={text('قم بتحديد مدة الخمول قبل تسجيل الخروج التلقائي.','Set inactivity timeout.')} icon={CalendarDays}>
                                            <MiniSelect label={text('المدة','Timeout')} defaultValue="30"><option value="30">{text('30 دقيقة','30 minutes')}</option><option value="60">{text('ساعة','1 hour')}</option></MiniSelect>
                                        </SettingsCard>
                                    </div>

                                    <section className="rounded-[16px] border border-red-200 bg-red-50/70 p-4">
                                        <div className="flex items-center gap-2 text-red-700"><AlertTriangle size={17} /><strong className="text-sm">{text('منطقة الخطر','Danger zone')}</strong></div>
                                        <p className="mt-1 text-[10px] leading-5 text-red-600">{text('هذه الإجراءات قد تؤدي إلى فقدان الوصول إلى حسابك بشكل دائم.','These actions may permanently affect your account.')}</p>
                                        <button type="button" className="mt-3 rounded-[10px] border border-red-300 bg-white px-4 py-2.5 text-xs font-semibold text-red-600">{text('حذف الحساب نهائياً','Delete account permanently')}</button>
                                    </section>
                                </div>
                            )}

                            {section === 'billing' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <SettingsCard title={text('خطة الاشتراك الحالية','Current plan')} description={text('باقة الاشتراك الحالية وتفاصيلها.','Current subscription plan.')} icon={Sparkles}>
                                            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-semibold text-emerald-700">{text('نشط','Active')}</span>
                                            <h3 className="mt-3 text-xl font-extrabold text-[#17386d]">{text('خطة الأعمال','Business plan')}</h3>
                                            <p className="mt-1 text-sm font-bold text-[#102e61]">$49 <span className="text-[10px] font-normal text-[#8ba0bc]">/ {text('شهرياً','month')}</span></p>
                                            <ul className="mt-4 space-y-2 text-[10px] text-[#5e789e]">{['إدارة غير محدودة للعملاء','الفواتير والعروض التقديرية','التقارير المالية المتقدمة','دعم فني عبر البريد الإلكتروني'].map(item=><li key={item} className="flex items-center gap-2"><Check size={13} className="text-[#1265d8]" />{item}</li>)}</ul>
                                            <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" className={secondaryButton}>{text('عرض تفاصيل الخطة','Plan details')}</button><button type="button" className={primaryButton}>{text('ترقية الخطة','Upgrade')}</button></div>
                                        </SettingsCard>

                                        <SettingsCard title={text('معلومات الاشتراك','Subscription information')} description={text('تفاصيل دورة الاشتراك الحالية.','Current billing cycle details.')} icon={CalendarDays}>
                                            {[['تاريخ بداية الاشتراك','14 مايو 2026'],['تاريخ التجديد القادم','14 أكتوبر 2026'],['قيمة الاشتراك الشهري','$49.00'],['حالة الاشتراك','نشط'],['طريقة الدفع','**** 4242']].map(([label,value])=><div key={label} className="flex items-center justify-between border-b border-[#edf2f8] py-3 last:border-0"><span className="text-[10px] text-[#8ba0bc]">{label}</span><strong className="text-xs text-[#17386d]">{value}</strong></div>)}
                                        </SettingsCard>

                                        <div className="space-y-4">
                                            <SettingsCard title={text('وسيلة الدفع','Payment method')} description={text('بطاقة الدفع المستخدمة للاشتراك.','Subscription payment card.')} icon={CreditCard}>
                                                <div className="rounded-[12px] border border-[#dfe8f4] p-4"><strong className="text-xs text-[#17386d]">VISA **** 4242</strong><p className="mt-1 text-[10px] text-[#8ba0bc]">12/2027 · محمد أحمد</p></div>
                                                <button type="button" className={secondaryButton + ' mt-3 w-full'}>{text('إدارة وسيلة الدفع','Manage payment method')}</button>
                                            </SettingsCard>
                                            <SettingsCard title={text('جهة الاتصال للفوترة','Billing contact')} description={text('بيانات المستلم لفواتير الاشتراك.','Billing recipient details.')} icon={UsersRound}>
                                                <strong className="text-xs text-[#17386d]">أحمد محمد</strong><p className="mt-1 text-[10px] text-[#8ba0bc]">info@acconova.com<br />+970 50 123 4567</p>
                                                <button type="button" className={secondaryButton + ' mt-3 w-full'}>{text('تعديل بيانات الفوترة','Edit billing contact')}</button>
                                            </SettingsCard>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('استخدام الاشتراك الحالي','Current usage')} description={text('متابعة استخدام حدود الخطة الحالية.','Monitor current plan limits.')} icon={Gauge}>
                                            {[
                                                ['العملاء','142 / غير محدود',72],
                                                ['الفواتير الشهرية','320 / غير محدود',88],
                                                ['المستخدمون','5 / غير محدود',46],
                                                ['سعة التخزين','1.2 GB / 10 GB',12],
                                            ].map(([label,value,percent]) => <div key={String(label)} className="mb-4"><div className="flex items-center justify-between text-[10px]"><strong className="text-[#17386d]">{String(label)}</strong><span className="text-[#8ba0bc]">{String(value)}</span></div><div className="mt-2 h-2 rounded-full bg-[#edf2f8]"><div className="h-2 rounded-full bg-[#1265d8]" style={{width: percent+'%'}} /></div></div>)}
                                        </SettingsCard>

                                        <SettingsCard title={text('الإضافات المتاحة','Available add-ons')} description={text('عزز تجربتك مع AccoNova من خلال الإضافات التالية.','Optional subscription add-ons.')} icon={Grid2X2}>
                                            {[['وحدة المبيعات المتقدمة','$15 / الشهر'],['نسخ احتياطي تلقائي','$10 / الشهر']].map(([name,price]) => <div key={name} className="mb-3 flex items-center justify-between rounded-[12px] border border-[#dfe8f4] p-3"><div><strong className="text-xs text-[#17386d]">{name}</strong><p className="mt-1 text-[10px] text-[#8ba0bc]">{price}</p></div><button type="button" className={secondaryButton}>{text('إضافة','Add')} +</button></div>)}
                                        </SettingsCard>
                                    </div>

                                    <SettingsCard title={text('سجل الفواتير','Billing history')} description={text('جميع الفواتير الصادرة لاشتراكك في AccoNova.','Subscription invoice history.')} icon={FileSpreadsheet}>
                                        <div className="overflow-x-auto"><table className="min-w-[650px] w-full text-[10px]"><thead className="bg-[#f8fbff]"><tr><th className="px-3 py-2 text-start">{text('رقم الفاتورة','Invoice')}</th><th className="px-3 py-2 text-start">{text('التاريخ','Date')}</th><th className="px-3 py-2 text-start">{text('الفترة','Period')}</th><th className="px-3 py-2 text-start">{text('المبلغ','Amount')}</th><th className="px-3 py-2 text-start">{text('الحالة','Status')}</th><th></th></tr></thead><tbody>{['INV-2026-0074','INV-2026-0061','INV-2026-0048'].map((id,index)=><tr key={id} className="border-t border-[#edf2f8]"><td className="px-3 py-3 font-semibold text-[#17386d]">{id}</td><td className="px-3 py-3">14 {index===0?'سبتمبر':index===1?'أغسطس':'يوليو'} 2026</td><td className="px-3 py-3">{text('شهري','Monthly')}</td><td className="px-3 py-3">$49.00</td><td className="px-3 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{text('مدفوع','Paid')}</span></td><td className="px-3 py-3"><button type="button" className={secondaryButton}><Download size={13} />{text('تحميل','Download')}</button></td></tr>)}</tbody></table></div>
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'appearance' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('وضع المظهر','Theme mode')} description={text('اختر نمط المظهر العام لواجهة AccoNova.','Choose the interface theme.')} icon={Palette}>
                                            <div className="grid grid-cols-3 gap-3">
                                                <ThemePreview label={text('فاتح','Light')} mode="light" active={profilePreferences.theme === 'light'} onClick={() => setProfilePreferences(p => ({...p,theme:'light'}))} />
                                                <ThemePreview label={text('داكن','Dark')} mode="dark" active={profilePreferences.theme === 'dark'} onClick={() => setProfilePreferences(p => ({...p,theme:'dark'}))} />
                                                <ThemePreview label={text('تلقائي','System')} mode="system" active={profilePreferences.theme === 'system'} onClick={() => setProfilePreferences(p => ({...p,theme:'system'}))} />
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard title={text('اللون الرئيسي','Primary color')} description={text('اختر اللون الرئيسي الذي سيظهر في الأزرار والروابط والعناصر النشطة.','Choose the primary accent color.')} icon={Palette}>
                                            <div className="flex flex-wrap items-center gap-3 pt-6">
                                                {['#8B5CF6','#EC4899','#EF4444','#10B981','#14B8A6','#2563EB','#334155'].map((color,index)=><button type="button" key={color} className={['size-10 rounded-full border-4 border-white shadow-[0_0_0_1px_#dbe5f2]',index===5?'ring-2 ring-[#2563EB] ring-offset-2':''].join(' ')} style={{backgroundColor:color}} />)}
                                                <input className={input + ' !mt-0 w-28'} defaultValue="#2563EB" />
                                            </div>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <SettingsCard title={text('كثافة العرض','Display density')} description={text('تحكم في المسافة بين العناصر في الواجهة.','Control spacing density.')} icon={Grid2X2}>
                                            <div className="grid grid-cols-3 gap-2">{['مريح','عادي','مضغوط'].map((label,index)=><button type="button" key={label} className={['rounded-[12px] border p-4 text-[10px] font-semibold',index===1?'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]':'border-[#dfe8f4] text-[#6e85a5]'].join(' ')}>{label}</button>)}</div>
                                        </SettingsCard>

                                        <SettingsCard title={text('نصف قطر الحواف','Corner radius')} description={text('حدد درجة استدارة الزوايا للعناصر والبطاقات.','Control interface corner radius.')} icon={Grid2X2}>
                                            <div className="grid grid-cols-3 gap-2">{['دائرية','متوسطة','مدببة'].map((label,index)=><button type="button" key={label} className={['border p-4 text-[10px] font-semibold',index===1?'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]':'border-[#dfe8f4] text-[#6e85a5]',index===0?'rounded-[20px]':index===1?'rounded-[10px]':'rounded-[4px]'].join(' ')}>{label}</button>)}</div>
                                        </SettingsCard>

                                        <SettingsCard title={text('حجم الخط','Font size')} description={text('تحكم في حجم الخط في جميع أجزاء النظام.','Adjust typography size.')} icon={Languages}>
                                            <div className="grid grid-cols-3 gap-2">{['صغير','متوسط','كبير'].map((label,index)=><button type="button" key={label} className={['rounded-[12px] border p-4 font-semibold',index===1?'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]':'border-[#dfe8f4] text-[#6e85a5]',index===0?'text-[10px]':index===1?'text-xs':'text-base'].join(' ')}>Aa<br /><span className="text-[9px]">{label}</span></button>)}</div>
                                        </SettingsCard>

                                        <SettingsCard title={text('تخطيط الشريط الجانبي','Sidebar layout')} description={text('حدد طريقة عرض الشريط الجانبي للنظام.','Choose sidebar layout.')} icon={PanelRight}>
                                            <div className="grid grid-cols-3 gap-2">{['موسع','مصغر','تلقائي'].map((label,index)=><button type="button" key={label} className={['rounded-[12px] border p-3 text-[10px] font-semibold',index===0?'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]':'border-[#dfe8f4] text-[#6e85a5]'].join(' ')}><div className="mx-auto mb-2 h-14 rounded bg-[#edf3fa] p-1"><div className={['h-full rounded bg-[#cfe0f4]',index===0?'w-2/5':index===1?'w-1/4':'w-1/3'].join(' ')} /></div>{label}</button>)}</div>
                                        </SettingsCard>

                                        <SettingsCard title={text('نمط الجداول','Table style')} description={text('اختر نمط عرض الجداول في جميع صفحات النظام.','Choose table presentation style.')} icon={FileSpreadsheet}>
                                            <div className="grid grid-cols-3 gap-2">{['عادي','مخطط','مضغوط'].map((label,index)=><button type="button" key={label} className={['rounded-[12px] border p-3 text-[10px] font-semibold',index===0?'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]':'border-[#dfe8f4] text-[#6e85a5]'].join(' ')}><div className="space-y-1">{[1,2,3].map(x=><div key={x} className="h-2 rounded bg-[#dfe9f6]" />)}</div><span className="mt-2 block">{label}</span></button>)}</div>
                                        </SettingsCard>

                                        <SettingsCard title={text('نمط بطاقات لوحة التحكم','Dashboard card style')} description={text('اختر النمط المفضل لعرض بطاقات الإحصائيات.','Choose dashboard card presentation.')} icon={LayoutDashboard}>
                                            <div className="grid grid-cols-3 gap-2">{['كلاسيكي','حدودية','مظلل'].map((label,index)=><button type="button" key={label} className={['rounded-[12px] border p-3 text-[10px] font-semibold',index===0?'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]':'border-[#dfe8f4] text-[#6e85a5]'].join(' ')}><div className="h-12 rounded-[8px] bg-[#eef4fb]" /><span className="mt-2 block">{label}</span></button>)}</div>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('الرسوم المتحركة','Animations')} description={text('تحكم في استخدام الحركات والانتقالات في الواجهة.','Control motion and transitions.')} icon={Zap}>
                                            <SettingRow label={text('تفعيل الرسوم المتحركة','Enable animations')} checked={flags.animations} onChange={() => flip('animations')} />
                                            <SettingRow label={text('حركات التفاعل','Interaction motion')} checked={flags.hoverMotion} onChange={() => flip('hoverMotion')} />
                                            <SettingRow label={text('حركات المظهر','Page transitions')} checked={flags.pageMotion} onChange={() => flip('pageMotion')} />
                                        </SettingsCard>

                                        <SettingsCard title={text('شعار النظام','System logo')} description={text('قم برفع شعار مؤسستك وسيظهر في الشريط العلوي والقوائم.','Upload the system logo.')} icon={Image}>
                                            <div className="grid gap-4 sm:grid-cols-[190px_1fr]">
                                                <div className="flex min-h-40 flex-col items-center justify-center rounded-[14px] border border-dashed border-[#c9d9ed] bg-[#fbfdff]"><div className="flex size-16 items-center justify-center rounded-[18px] bg-[#edf5ff] text-2xl font-black text-[#1265d8]">A</div><strong className="mt-2 text-lg text-[#102e61]">AccoNova</strong></div>
                                                <div className="flex flex-col justify-center"><button type="button" className={secondaryButton}><Upload size={14} />{text('تغيير الشعار','Change logo')}</button><p className={helper}>PNG — 512×512</p></div>
                                            </div>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            <div className="sticky bottom-0 z-20 mt-5 flex items-center justify-between border-t border-[#dfe8f4] bg-[#f8fbff]/95 py-3 backdrop-blur">
                                <div className="flex items-center gap-2 text-[10px] text-[#8ba0bc]">
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                    {savedMessage || text('آخر حفظ للتغييرات: منذ 5 دقائق', 'Last saved 5 minutes ago')}
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" className={secondaryButton}>
                                        {text('إلغاء', 'Cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void saveChanges()}
                                        className={primaryButton}
                                    >
                                        <Save size={14} />
                                        {saving ? text('جارٍ الحفظ...', 'Saving...') : text('حفظ التغييرات', 'Save changes')}
                                    </button>
                                </div>
                            </div>
                        </section>

                        <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">
                            <div className={panel + ' overflow-hidden p-2.5'}>
                                <div className="px-3 pb-3 pt-2">
                                    <p className="text-sm font-bold text-[#17386d]">
                                        {text('إعدادات الحساب', 'Account settings')}
                                    </p>
                                </div>

                                <nav className="space-y-1">
                                    {navItems.map(item => {
                                        const Icon = item.icon;
                                        const active = section === item.key;

                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => {
                                                    setSection(item.key);
                                                    setSavedMessage('');
                                                }}
                                                className={[
                                                    'flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-start text-xs font-semibold transition',
                                                    active
                                                        ? 'bg-[#eaf3ff] text-[#1265d8]'
                                                        : 'text-[#28466f] hover:bg-[#f6f9fd]',
                                                ].join(' ')}
                                            >
                                                <Icon size={16} />
                                                <span className="flex-1">{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </nav>

                                <div className="mt-6 rounded-[14px] bg-gradient-to-b from-[#f5f9ff] to-white p-4 text-center">
                                    <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-[#e9f3ff] text-[#1265d8]">
                                        <Bell size={18} />
                                    </span>
                                    <strong className="mt-2 block text-xs text-[#17386d]">
                                        {text('تحتاج إلى مساعدة؟', 'Need help?')}
                                    </strong>
                                    <p className="mt-1 text-[9px] leading-5 text-[#8ba0bc]">
                                        {text('تواصل مع فريق الدعم للحصول على المساعدة.', 'Contact our support team.')}
                                    </p>
                                    <button type="button" className={secondaryButton + ' mt-3 w-full'}>
                                        {text('مركز المساعدة', 'Help center')}
                                    </button>
                                </div>
                            </div>
                        </aside>
                    </div>
                </div>
            </main>
        </AppShell>
    );
}
