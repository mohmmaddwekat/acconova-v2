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
import { Head, Link, usePage } from '@inertiajs/react';
import {
    Banknote,
    Bell,
    Building2,
    CalendarDays,
    Check,
    CheckCircle2,
    CreditCard,
    FileSpreadsheet,
    FileText,
    Globe2,
    Grid2X2,
    Image,
    Link2,
    LockKeyhole,
    Mail,
    Palette,
    Percent,
    Printer,
    Save,
    Settings2,
    ShieldCheck,
    Trash2,
    Upload,
    UserPlus,
    UsersRound,
    WalletCards,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

type BankAccount = {
    id: string;
    bank_name: string;
    account_name: string | null;
    iban: string | null;
    account_number: string | null;
    is_primary: boolean;
};

type WorkspaceSettings = {
    name: string;
    currency: string;
    reminder_days: number;
    can_manage: boolean;
    system_name: string;
    system_description: string;
    legal_name: string;
    trade_name: string;
    support_email: string;
    phone: string;
    commercial_registration: string;
    vat_number: string;
    website: string;
    country: string;
    city: string;
    address: string;
    invoice_footer: string;
    logo_url: string | null;
    fiscal_year_start_month: number;
    decimal_places: number;
    rounding_method: 'normal' | 'up' | 'down';
    default_tax_rate: string;
    tax_inclusive: boolean;
    cost_method: 'moving_average' | 'fifo';
    include_extra_costs: boolean;
    include_shipping_cost: boolean;
    payment_methods: string[];
    validate_check_date: boolean;
    post_dated_checks_pending: boolean;
    bank_accounts: BankAccount[];
    invoice_template: 'professional' | 'classic' | 'modern' | 'simple';
    purchase_template: 'default';
    receipt_template: 'default';
    print_paper_size: 'a4' | 'letter';
    print_margins: 'normal' | 'compact';
    logo_position: 'start' | 'center' | 'end';
    show_invoice_logo: boolean;
    show_invoice_contact: boolean;
    show_invoice_tax_number: boolean;
    show_invoice_notes: boolean;
    show_invoice_qr: boolean;
    invoice_columns: string[];
    invoice_prefix: string;
    purchase_prefix: string;
    receipt_prefix: string;
    payment_prefix: string;
    invoice_start_number: number;
    purchase_start_number: number;
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
    'mt-2 min-h-11 w-full rounded-[11px] border border-[#d9e5f2] bg-white px-3.5 text-sm text-[#19345f] outline-none transition placeholder:text-[#9badc5] focus:border-[#2f7df4] focus:ring-2 focus:ring-[#2f7df4]/10 disabled:bg-slate-50 disabled:text-slate-400';

const secondaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#cfe0f4] bg-white px-4 text-xs font-semibold text-[#2563c7] transition hover:bg-[#f5f9ff] disabled:cursor-not-allowed disabled:opacity-45';

const primaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[#1468ea] px-5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(20,104,234,.2)] transition hover:bg-[#0f5fd8] disabled:cursor-not-allowed disabled:opacity-45';

function errorText(error: unknown, fallback: string): string {
    if (error instanceof ApiError) {
        return [
            error.message,
            ...Object.values(error.errors).flat(),
        ].filter(Boolean).join(' ');
    }

    return error instanceof Error ? error.message : fallback;
}

function SettingsCard({
    title,
    description,
    icon: Icon,
    children,
}: {
    title: string;
    description?: string;
    icon: LucideIcon;
    children: ReactNode;
}) {
    return (
        <section className={panel}>
            <div className="border-b border-[#edf2f8] px-5 py-4">
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
            <div className="p-4 sm:p-5">{children}</div>
        </section>
    );
}

function Toggle({
    checked,
    onChange,
    disabled = false,
}: {
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={onChange}
            className={[
                'relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40',
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
    disabled = false,
}: {
    label: string;
    description?: string;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
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
            <Toggle checked={checked} onChange={onChange} disabled={disabled} />
        </div>
    );
}

function SectionLink({
    href,
    icon: Icon,
    title,
    description,
}: {
    href: string;
    icon: LucideIcon;
    title: string;
    description: string;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-4 rounded-[14px] border border-[#dfe8f4] bg-white p-4 transition hover:border-[#bfd4ef] hover:bg-[#f8fbff]"
        >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[#edf5ff] text-[#1265d8]">
                <Icon size={19} />
            </span>
            <span className="min-w-0">
                <strong className="block text-xs text-[#17386d]">{title}</strong>
                <span className="mt-1 block text-[10px] leading-5 text-[#8ba0bc]">
                    {description}
                </span>
            </span>
        </Link>
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
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
    const [profilePreferences, setProfilePreferences] =
        useState<ProfilePreferences>(defaultProfilePreferences());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [addingBank, setAddingBank] = useState(false);
    const [bankName, setBankName] = useState('');
    const [bankAccountName, setBankAccountName] = useState('');
    const [bankIban, setBankIban] = useState('');
    const [bankNumber, setBankNumber] = useState('');
    const [logoUploading, setLogoUploading] = useState(false);

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
            apiRequest<WorkspaceSettings>(
                '/api/workspace-settings',
                { signal: controller.signal },
            ),
            apiRequest<{ settings: Partial<ProfilePreferences> | null }>(
                '/api/profile/preferences',
                { signal: controller.signal },
            ),
        ])
            .then(([workspaceSettings, profileData]) => {
                if (controller.signal.aborted) return;

                setSettings(workspaceSettings);

                const nextProfile = {
                    ...defaultProfilePreferences(),
                    ...profileData.settings,
                };

                setProfilePreferences(nextProfile);
                applyProfilePreferences(nextProfile);
            })
            .catch((failure) => {
                if (!controller.signal.aborted) {
                    setError(
                        errorText(
                            failure,
                            text('تعذر تحميل الإعدادات.', 'Could not load settings.'),
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

    function updateSetting<K extends keyof WorkspaceSettings>(
        key: K,
        value: WorkspaceSettings[K],
    ): void {
        setSettings(current =>
            current
                ? { ...current, [key]: value }
                : current,
        );
        setMessage('');
    }

    function toggleArrayValue(
        key: 'payment_methods' | 'invoice_columns',
        value: string,
    ): void {
        if (!settings) return;

        const current = settings[key];
        const exists = current.includes(value);
        const next = exists
            ? current.filter(item => item !== value)
            : [...current, value];

        if (next.length === 0) {
            return;
        }

        updateSetting(key, next);
    }

    function addBankAccount(): void {
        if (!settings || !bankName.trim()) {
            return;
        }

        const nextAccount: BankAccount = {
            id:
                typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : 'bank-' + Date.now(),
            bank_name: bankName.trim(),
            account_name: bankAccountName.trim() || null,
            iban: bankIban.trim() || null,
            account_number: bankNumber.trim() || null,
            is_primary: settings.bank_accounts.length === 0,
        };

        updateSetting(
            'bank_accounts',
            [...settings.bank_accounts, nextAccount],
        );

        setBankName('');
        setBankAccountName('');
        setBankIban('');
        setBankNumber('');
        setAddingBank(false);
    }

    function removeBankAccount(id: string): void {
        if (!settings) return;

        const remaining = settings.bank_accounts.filter(item => item.id !== id);

        if (remaining.length && !remaining.some(item => item.is_primary)) {
            remaining[0] = { ...remaining[0], is_primary: true };
        }

        updateSetting('bank_accounts', remaining);
    }

    function makePrimaryBank(id: string): void {
        if (!settings) return;

        updateSetting(
            'bank_accounts',
            settings.bank_accounts.map(item => ({
                ...item,
                is_primary: item.id === id,
            })),
        );
    }

    async function uploadLogo(file: File | null): Promise<void> {
        if (!file || logoUploading) {
            return;
        }

        const form = new FormData();
        form.append('logo', file);

        setLogoUploading(true);
        setError('');

        try {
            const response = await apiRequest<{ logo_url: string }>(
                '/api/workspace-settings/logo',
                {
                    method: 'POST',
                    body: form,
                },
            );

            setSettings(current =>
                current
                    ? { ...current, logo_url: response.logo_url }
                    : current,
            );
            setMessage(
                text(
                    'تم تحديث شعار المؤسسة.',
                    'Workspace logo updated.',
                ),
            );
        } catch (failure) {
            setError(
                errorText(
                    failure,
                    text(
                        'تعذر رفع الشعار.',
                        'Could not upload the logo.',
                    ),
                ),
            );
        } finally {
            setLogoUploading(false);
        }
    }

    async function saveChanges(): Promise<void> {
        if (!settings || saving) {
            return;
        }

        if (!/^[A-Z0-9]{3}$/.test(settings.currency.trim().toUpperCase())) {
            setError(
                text(
                    'اكتب رمز العملة من 3 أحرف، مثل ILS أو USD أو JOD.',
                    'Enter a 3-character currency code such as ILS, USD or JOD.',
                ),
            );
            return;
        }

        if (
            settings.decimal_places < 1
            || settings.decimal_places > 10
        ) {
            setError(
                text(
                    'عدد الخانات العشرية يجب أن يكون من 1 إلى 10.',
                    'Decimal places must be between 1 and 10.',
                ),
            );
            return;
        }

        setSaving(true);
        setError('');
        setMessage('');

        try {
            const payload = {
                ...settings,
                currency: settings.currency.trim().toUpperCase(),
            };

            const saved = await apiRequest<WorkspaceSettings>(
                '/api/workspace-settings',
                {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                },
            );

            await apiRequest('/api/profile/preferences', {
                method: 'PUT',
                body: JSON.stringify(profilePreferences),
            });

            setSettings(saved);
            applyProfilePreferences(profilePreferences);

            document.documentElement.dataset.acFinanceDecimals =
                String(saved.decimal_places);

            setMessage(
                text(
                    'تم حفظ الإعدادات وتطبيقها على النظام.',
                    'Settings saved and applied to the system.',
                ),
            );
        } catch (failure) {
            setError(
                errorText(
                    failure,
                    text('تعذر حفظ الإعدادات.', 'Could not save settings.'),
                ),
            );
        } finally {
            setSaving(false);
        }
    }

    async function toggleDeviceNotifications(): Promise<void> {
        setError('');

        if (!deviceSupported()) {
            setError(
                text(
                    'هذا المتصفح لا يدعم تنبيهات الجهاز هنا.',
                    'This browser does not support device notifications here.',
                ),
            );
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

    if (loading || !settings) {
        return (
            <AppShell>
                <Head title={text('الإعدادات', 'Settings')} />
                <main className="min-h-[calc(100dvh-72px)] bg-[#f8fbff] p-8">
                    <div className="mx-auto max-w-[1540px] rounded-[18px] border border-[#dfe8f4] bg-white p-12 text-center text-sm text-[#8ba0bc]">
                        {error || text('جارٍ تحميل الإعدادات...', 'Loading settings...')}
                    </div>
                </main>
            </AppShell>
        );
    }

    const workspaceName = settings.name || activeOrganization?.name || 'AccoNova';
    const moneyPreview = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: settings.decimal_places,
        maximumFractionDigits: settings.decimal_places,
    }).format(1234.56);

    const paymentMethods = [
        ['bank_transfer', text('تحويل بنكي', 'Bank transfer')],
        ['card', text('بطاقة ائتمان / خصم', 'Card')],
        ['cash', text('نقدي', 'Cash')],
        ['check', text('شيك', 'Check')],
        ['electronic_wallet', text('محفظة إلكترونية', 'E-wallet')],
        ['direct_debit', text('خصم مباشر', 'Direct debit')],
        ['other', text('طريقة أخرى', 'Other')],
    ];

    const invoiceColumnOptions = [
        ['sku', text('رقم الصنف', 'SKU')],
        ['description', text('الوصف', 'Description')],
        ['quantity', text('الكمية', 'Quantity')],
        ['unit_price', text('سعر الوحدة', 'Unit price')],
        ['discount', text('الخصم', 'Discount')],
        ['tax', text('الضريبة', 'Tax')],
        ['total', text('المجموع', 'Total')],
    ];

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
                                    'إعدادات المؤسسة والمالية والطباعة متصلة فعلياً بالنظام وتحفظ على مستوى مساحة العمل.',
                                    'Organization, finance and print settings are persisted and applied across the workspace.',
                                )}
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                            {error}
                        </div>
                    )}

                    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
                        <section className="min-w-0 lg:col-start-1 lg:row-start-1">
                            {section === 'general' && (
                                <div className="space-y-4">
                                    <section className="rounded-[18px] border border-[#d6e4f6] bg-gradient-to-l from-[#edf5ff] to-white p-5">
                                        <h2 className="text-xl font-extrabold text-[#17386d]">
                                            {text(
                                                'مرحباً ' + (auth.user?.name ?? '') + ' 👋',
                                                'Welcome ' + (auth.user?.name ?? ''),
                                            )}
                                        </h2>
                                        <p className="mt-1 text-xs leading-6 text-[#6f86a8]">
                                            {text(
                                                'هذه إعدادات إدارية لمساحة العمل، ولا تظهر للمستخدمين العاديين.',
                                                'These are workspace administration settings and are hidden from regular users.',
                                            )}
                                        </p>
                                    </section>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard
                                            title={text('الإعدادات العامة', 'General settings')}
                                            description={text('اسم النظام والوصف الظاهر لإدارة مساحة العمل.', 'Workspace display identity.')}
                                            icon={Settings2}
                                        >
                                            <label className="block text-[11px] font-semibold text-[#5e789e]">
                                                {text('اسم النظام', 'System name')}
                                                <input
                                                    className={input}
                                                    value={settings.system_name}
                                                    onChange={event => updateSetting('system_name', event.target.value)}
                                                />
                                            </label>
                                            <label className="mt-4 block text-[11px] font-semibold text-[#5e789e]">
                                                {text('الوصف', 'Description')}
                                                <textarea
                                                    className={input + ' min-h-24 py-3'}
                                                    value={settings.system_description}
                                                    onChange={event => updateSetting('system_description', event.target.value)}
                                                />
                                            </label>
                                        </SettingsCard>

                                        <SettingsCard
                                            title={text('اللغة والمنطقة', 'Language & region')}
                                            description={text('تفضيلات حسابك الشخصية وتحفظ لحسابك.', 'Personal account preferences.')}
                                            icon={Globe2}
                                        >
                                            <label className="block text-[11px] font-semibold text-[#5e789e]">
                                                {text('اللغة', 'Language')}
                                                <select
                                                    className={input}
                                                    value={profilePreferences.locale}
                                                    onChange={event =>
                                                        setProfilePreferences(current => ({
                                                            ...current,
                                                            locale: event.target.value as ProfilePreferences['locale'],
                                                        }))
                                                    }
                                                >
                                                    <option value="ar">العربية</option>
                                                    <option value="en">English</option>
                                                </select>
                                            </label>
                                            <label className="mt-4 block text-[11px] font-semibold text-[#5e789e]">
                                                {text('المنطقة الزمنية', 'Timezone')}
                                                <input
                                                    className={input}
                                                    value={profilePreferences.timezone}
                                                    onChange={event =>
                                                        setProfilePreferences(current => ({
                                                            ...current,
                                                            timezone: event.target.value,
                                                        }))
                                                    }
                                                />
                                            </label>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            {section === 'organization' && (
                                <div className="space-y-4">
                                    <SettingsCard
                                        title={text('معلومات المؤسسة', 'Organization information')}
                                        description={text('هذه البيانات تحفظ فعلياً وتستخدم في الفواتير والطباعة.', 'Saved workspace information used by invoices and printing.')}
                                        icon={Building2}
                                    >
                                        <div className="grid gap-5 xl:grid-cols-[240px_1fr]">
                                            <div className="flex min-h-64 flex-col items-center justify-center rounded-[15px] border border-dashed border-[#c7d9ee] bg-[#fbfdff] p-4">
                                                {settings.logo_url ? (
                                                    <img
                                                        src={settings.logo_url}
                                                        alt={settings.trade_name || settings.name}
                                                        className="max-h-24 max-w-[180px] object-contain"
                                                    />
                                                ) : (
                                                    <div className="flex size-24 items-center justify-center rounded-[24px] bg-[#edf5ff] text-4xl font-black text-[#1265d8]">
                                                        {(settings.trade_name || settings.name).charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <strong className="mt-3 text-xl text-[#102e61]">
                                                    {settings.trade_name || settings.name}
                                                </strong>
                                                <label className={secondaryButton + ' mt-4 cursor-pointer'}>
                                                    <Upload size={14} />
                                                    {logoUploading
                                                        ? text('جارٍ الرفع...', 'Uploading...')
                                                        : text('تغيير الشعار', 'Change logo')}
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        accept="image/png,image/jpeg,image/webp"
                                                        disabled={logoUploading}
                                                        onChange={event => void uploadLogo(event.target.files?.[0] ?? null)}
                                                    />
                                                </label>
                                                <p className="mt-2 text-[9px] text-[#8ba0bc]">
                                                    PNG / JPG / WEBP · 2MB max
                                                </p>
                                            </div>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('اسم مساحة العمل *', 'Workspace name *')}
                                                    <input className={input} value={settings.name} onChange={event => updateSetting('name', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الاسم القانوني للمؤسسة *', 'Legal name *')}
                                                    <input className={input} value={settings.legal_name} onChange={event => updateSetting('legal_name', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الاسم التجاري *', 'Trade name *')}
                                                    <input className={input} value={settings.trade_name} onChange={event => updateSetting('trade_name', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('البريد الإلكتروني للدعم', 'Support email')}
                                                    <input className={input} type="email" value={settings.support_email} onChange={event => updateSetting('support_email', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('رقم الجوال', 'Phone')}
                                                    <input className={input} dir="ltr" value={settings.phone} onChange={event => updateSetting('phone', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('رقم السجل التجاري', 'Commercial registration')}
                                                    <input className={input} value={settings.commercial_registration} onChange={event => updateSetting('commercial_registration', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الرقم الضريبي (VAT)', 'VAT number')}
                                                    <input className={input} value={settings.vat_number} onChange={event => updateSetting('vat_number', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الموقع الإلكتروني', 'Website')}
                                                    <input className={input} dir="ltr" value={settings.website} onChange={event => updateSetting('website', event.target.value)} />
                                                </label>
                                            </div>
                                        </div>
                                    </SettingsCard>

                                    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                                        <SettingsCard
                                            title={text('عنوان المؤسسة', 'Organization address')}
                                            description={text('يظهر في مستندات الطباعة عند تفعيل معلومات التواصل.', 'Used on printed documents when contact details are enabled.')}
                                            icon={Globe2}
                                        >
                                            <div className="grid gap-4 sm:grid-cols-3">
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('الدولة', 'Country')}
                                                    <input className={input} value={settings.country} onChange={event => updateSetting('country', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('المدينة', 'City')}
                                                    <input className={input} value={settings.city} onChange={event => updateSetting('city', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('العنوان التفصيلي', 'Detailed address')}
                                                    <input className={input} value={settings.address} onChange={event => updateSetting('address', event.target.value)} />
                                                </label>
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard
                                            title={text('الفروع', 'Branches')}
                                            description={text('الفروع التشغيلية تدار من بيانات النظام الفعلية، وليس من بطاقة وهمية هنا.', 'Operational branches should be managed from real workspace data.')}
                                            icon={Grid2X2}
                                        >
                                            <div className="rounded-[14px] bg-[#f8fbff] p-5 text-center">
                                                <Building2 size={24} className="mx-auto text-[#1265d8]" />
                                                <p className="mt-3 text-[10px] leading-5 text-[#8ba0bc]">
                                                    {text(
                                                        'لن ننشئ فروعاً تجريبية من الإعدادات. عند إضافة موديول الفروع سيظهر هنا بشكل مباشر.',
                                                        'No fake branches are created here. Real branch management will appear when the branch module is available.',
                                                    )}
                                                </p>
                                            </div>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            {section === 'finance' && (
                                <div className="grid gap-4 xl:grid-cols-3">
                                    <SettingsCard title={text('السنة المالية', 'Fiscal year')} description={text('بداية السنة المالية للمؤسسة.', 'Workspace fiscal-year start.')} icon={CalendarDays}>
                                        <label className="text-[11px] font-semibold text-[#5e789e]">
                                            {text('تبدأ السنة المالية في', 'Fiscal year starts in')}
                                            <select
                                                className={input}
                                                value={settings.fiscal_year_start_month}
                                                onChange={event => updateSetting('fiscal_year_start_month', Number(event.target.value))}
                                            >
                                                {[
                                                    'يناير','فبراير','مارس','أبريل','مايو','يونيو',
                                                    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر',
                                                ].map((month, index) => (
                                                    <option key={month} value={index + 1}>{month}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </SettingsCard>

                                    <SettingsCard title={text('الدقة والتقريب', 'Precision & rounding')} description={text('الخانات العشرية للعرض من 1 إلى 10.', 'Display precision from 1 to 10 decimals.')} icon={Settings2}>
                                        <label className="text-[11px] font-semibold text-[#5e789e]">
                                            {text('عدد الخانات العشرية', 'Decimal places')}
                                            <input
                                                type="number"
                                                min={1}
                                                max={10}
                                                step={1}
                                                className={input}
                                                value={settings.decimal_places}
                                                onChange={event => updateSetting('decimal_places', Math.min(10, Math.max(1, Number(event.target.value) || 1)))}
                                            />
                                        </label>
                                    </SettingsCard>

                                    <SettingsCard title={text('العملة الافتراضية', 'Default currency')} description={text('اكتب رمز العملة يدوياً. لا توجد قائمة محصورة.', 'Enter the currency code manually.')} icon={CreditCard}>
                                        <label className="text-[11px] font-semibold text-[#5e789e]">
                                            {text('رمز العملة', 'Currency code')}
                                            <input
                                                className={input}
                                                maxLength={3}
                                                value={settings.currency}
                                                onChange={event => updateSetting('currency', event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))}
                                                placeholder="ILS"
                                                dir="ltr"
                                            />
                                        </label>
                                        <div className="mt-4 rounded-[12px] bg-[#f7fbff] p-4 text-center text-xl font-bold text-[#17386d]">
                                            {settings.currency} {moneyPreview}
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('الحسابات البنكية', 'Bank accounts')} description={text('لا يتم إنشاء أي حساب افتراضي. أضف حساباتك الحقيقية فقط.', 'No fake accounts are created. Add only real accounts.')} icon={Banknote}>
                                        {settings.bank_accounts.length === 0 && !addingBank && (
                                            <div className="rounded-[12px] border border-dashed border-[#cadcf1] bg-[#fbfdff] p-5 text-center">
                                                <p className="text-xs font-semibold text-[#17386d]">{text('لا توجد حسابات بنكية', 'No bank accounts')}</p>
                                                <p className="mt-1 text-[10px] text-[#8ba0bc]">{text('أضف حساباً فقط إذا كنت تستخدمه فعلياً.', 'Add an account only when you actually use one.')}</p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {settings.bank_accounts.map(account => (
                                                <div key={account.id} className="rounded-[12px] border border-[#dfe8f4] p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <strong className="text-xs text-[#17386d]">{account.bank_name}</strong>
                                                                {account.is_primary && (
                                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                                                                        {text('الأساسي', 'Primary')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {account.account_name && <p className="mt-1 text-[10px] text-[#6f86a8]">{account.account_name}</p>}
                                                            {(account.iban || account.account_number) && (
                                                                <p className="mt-1 text-[9px] text-[#8ba0bc]" dir="ltr">
                                                                    {account.iban || account.account_number}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <button type="button" onClick={() => removeBankAccount(account.id)} className="rounded-[9px] border border-red-100 bg-red-50 p-2 text-red-500">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    {!account.is_primary && (
                                                        <button type="button" onClick={() => makePrimaryBank(account.id)} className="mt-2 text-[10px] font-semibold text-[#1265d8]">
                                                            {text('تعيين كأساسي', 'Make primary')}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {addingBank ? (
                                            <div className="mt-3 rounded-[12px] border border-[#dfe8f4] bg-[#f9fbff] p-3">
                                                <input className={input + ' !mt-0'} value={bankName} onChange={event => setBankName(event.target.value)} placeholder={text('اسم البنك *', 'Bank name *')} />
                                                <input className={input} value={bankAccountName} onChange={event => setBankAccountName(event.target.value)} placeholder={text('اسم الحساب', 'Account name')} />
                                                <input className={input} dir="ltr" value={bankIban} onChange={event => setBankIban(event.target.value)} placeholder="IBAN" />
                                                <input className={input} dir="ltr" value={bankNumber} onChange={event => setBankNumber(event.target.value)} placeholder={text('رقم الحساب', 'Account number')} />
                                                <div className="mt-3 flex gap-2">
                                                    <button type="button" className={primaryButton} onClick={addBankAccount}>{text('إضافة', 'Add')}</button>
                                                    <button type="button" className={secondaryButton} onClick={() => setAddingBank(false)}>{text('إلغاء', 'Cancel')}</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button type="button" className={secondaryButton + ' mt-3 w-full'} onClick={() => setAddingBank(true)}>
                                                + {text('إضافة حساب بنكي', 'Add bank account')}
                                            </button>
                                        )}
                                    </SettingsCard>

                                    <SettingsCard title={text('طرق الدفع', 'Payment methods')} description={text('الطرق المفعلة هنا هي التي تظهر فعلياً في تسجيل الدفعات والمقبوضات.', 'Only enabled methods appear in payment and receipt entry.')} icon={CreditCard}>
                                        {paymentMethods.map(([value, label]) => (
                                            <label key={value} className="flex items-center justify-between border-b border-[#edf2f8] py-3 last:border-0">
                                                <span className="text-xs font-semibold text-[#19345f]">{label}</span>
                                                <input
                                                    type="checkbox"
                                                    className="size-4 accent-[#1265d8]"
                                                    checked={settings.payment_methods.includes(value)}
                                                    onChange={() => toggleArrayValue('payment_methods', value)}
                                                />
                                            </label>
                                        ))}
                                    </SettingsCard>

                                    <SettingsCard title={text('إعدادات الضريبة', 'Tax settings')} description={text('القواعد الضريبية الفعلية تدار من موديول الضرائب حتى تنعكس على الفواتير والحسابات.', 'Real tax rules are managed in the tax module so they affect invoices and calculations.')} icon={Percent}>
                                        <SectionLink
                                            href="/app/finance/taxes"
                                            icon={Percent}
                                            title={text('فتح الضرائب والمستحقات', 'Open taxes & obligations')}
                                            description={text('إضافة وتعديل نسب وقواعد الضرائب الفعلية.', 'Create and edit the actual tax rules used by finance.')}
                                        />
                                    </SettingsCard>

                                    <SettingsCard title={text('إعدادات النقد والشيكات', 'Cash & checks')} description={text('تعطيل طريقة دفع يخفيها ويمنع استخدامها من الخادم أيضاً.', 'Disabled methods are hidden and rejected by the server.')} icon={Banknote}>
                                        <SettingRow label={text('التحقق من تاريخ الشيك', 'Validate check date')} description={text('يمنع تاريخ استحقاق أقدم من تاريخ الحركة.', 'Prevents a due date earlier than the movement date.')} checked={settings.validate_check_date} onChange={() => updateSetting('validate_check_date', !settings.validate_check_date)} />
                                        <div className="mt-3 rounded-[12px] bg-blue-50/70 p-3 text-[10px] leading-5 text-blue-700">
                                            {text(
                                                'حالة الشيك عند التسجيل تبقى قيد التحصيل تلقائياً كما اعتمدنا سابقاً، ولا تتحول لمحصل بمجرد وصول التاريخ.',
                                                'New checks remain pending automatically and never clear only because the due date arrived.',
                                            )}
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('المخزون والتكلفة', 'Inventory & costing')} description={text('إدارة المنتجات والمخزون من الموديول التشغيلي الفعلي بدلاً من مفاتيح شكلية هنا.', 'Manage products and inventory in the real operating module instead of decorative toggles.')} icon={FileSpreadsheet}>
                                        <SectionLink
                                            href="/app/inventory"
                                            icon={FileSpreadsheet}
                                            title={text('فتح المخزون', 'Open inventory')}
                                            description={text('مراجعة الأصناف والمستودعات وحركات المخزون والتكاليف الحالية.', 'Review products, warehouses, stock movements and current costs.')}
                                        />
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'invoices' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
                                        <SettingsCard title={text('قالب الفاتورة الحالي', 'Current invoice template')} description={text('المعاينة تتغير مباشرة حسب الإعدادات.', 'Preview updates directly from the saved settings.')} icon={FileText}>
                                            <div className="rounded-[12px] border border-[#dfe8f4] bg-[#fbfdff] p-4">
                                                <div className="mx-auto max-w-[280px] bg-white p-4 shadow-sm">
                                                    <div className={[
                                                        'flex items-start gap-3',
                                                        settings.logo_position === 'center' ? 'flex-col items-center text-center' : 'justify-between',
                                                    ].join(' ')}>
                                                        {settings.show_invoice_logo && (
                                                            <strong className="text-[#1265d8]">{settings.trade_name || workspaceName}</strong>
                                                        )}
                                                        <div className={settings.logo_position === 'center' ? '' : 'text-end'}>
                                                            <strong className="text-xs">{text('فاتورة ضريبية', 'Tax invoice')}</strong>
                                                            <p className="text-[9px] text-slate-400">{settings.invoice_prefix}-2026-{String(settings.invoice_start_number).padStart(4, '0')}</p>
                                                        </div>
                                                    </div>
                                                    {settings.show_invoice_contact && (
                                                        <p className="mt-2 text-[8px] leading-4 text-[#8092aa]">
                                                            {[settings.phone, settings.support_email, settings.city].filter(Boolean).join(' · ')}
                                                        </p>
                                                    )}
                                                    <div className="my-4 h-px bg-[#e7edf5]" />
                                                    <div className="grid grid-cols-3 gap-2 text-[8px] text-[#6d82a0]">
                                                        <span>{text('الوصف','Description')}</span><span>{text('الكمية','Qty')}</span><span>{text('المجموع','Total')}</span>
                                                    </div>
                                                    <div className="mt-2 grid grid-cols-3 gap-2 border-b border-[#edf2f8] pb-2 text-[8px]"><span>{text('خدمة','Service')}</span><span>1</span><span>200.00</span></div>
                                                    <div className="mt-4 text-end text-[9px]"><strong>{text('الإجمالي','Total')}: 200.00 {settings.currency}</strong></div>
                                                </div>
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard title={text('اختر قالب الفاتورة', 'Choose invoice template')} description={text('هذا الاختيار يستخدم فعلياً عند طباعة الفاتورة.', 'This selection is used by the actual invoice print view.')} icon={FileText}>
                                            <div className="grid gap-3 sm:grid-cols-4">
                                                {([
                                                    ['professional', text('احترافي','Professional')],
                                                    ['classic', text('كلاسيكي','Classic')],
                                                    ['modern', text('مودرن','Modern')],
                                                    ['simple', text('بسيط','Simple')],
                                                ] as const).map(([value,label]) => (
                                                    <button
                                                        type="button"
                                                        key={value}
                                                        onClick={() => updateSetting('invoice_template', value)}
                                                        className={[
                                                            'rounded-[12px] border p-2',
                                                            settings.invoice_template === value
                                                                ? 'border-[#2f7df4] bg-[#f4f8ff]'
                                                                : 'border-[#dfe8f4]',
                                                        ].join(' ')}
                                                    >
                                                        <div className="h-20 rounded-[8px] border border-[#e4ebf4] bg-white p-2">
                                                            <div className="h-2 w-10 rounded bg-[#1265d8]/70" />
                                                            <div className="mt-3 h-1.5 rounded bg-slate-100" />
                                                            <div className="mt-2 h-1.5 rounded bg-slate-100" />
                                                            <div className="mt-2 h-5 rounded bg-blue-50" />
                                                        </div>
                                                        <span className="mt-2 block text-[10px] font-semibold text-[#17386d]">{label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <SettingsCard title={text('المحتوى والمظهر', 'Content & appearance')} description={text('كل خيار يؤثر على نسخة الطباعة الفعلية.', 'Every option affects the real printed invoice.')} icon={Image}>
                                            <SettingRow label={text('إظهار اسم/شعار المؤسسة', 'Show organization brand')} checked={settings.show_invoice_logo} onChange={() => updateSetting('show_invoice_logo', !settings.show_invoice_logo)} />
                                            <SettingRow label={text('إظهار معلومات التواصل', 'Show contact information')} checked={settings.show_invoice_contact} onChange={() => updateSetting('show_invoice_contact', !settings.show_invoice_contact)} />
                                            <SettingRow label={text('إظهار الرقم الضريبي', 'Show tax number')} checked={settings.show_invoice_tax_number} onChange={() => updateSetting('show_invoice_tax_number', !settings.show_invoice_tax_number)} />
                                            <SettingRow label={text('إظهار الملاحظات', 'Show notes')} checked={settings.show_invoice_notes} onChange={() => updateSetting('show_invoice_notes', !settings.show_invoice_notes)} />
                                        </SettingsCard>

                                        <SettingsCard title={text('إعدادات الطباعة', 'Print settings')} description={text('الحجم والهوامش وموقع هوية المؤسسة.', 'Paper, margins and brand placement.')} icon={Printer}>
                                            <label className="text-[11px] font-semibold text-[#5e789e]">
                                                {text('حجم الورق', 'Paper size')}
                                                <select className={input} value={settings.print_paper_size} onChange={event => updateSetting('print_paper_size', event.target.value as WorkspaceSettings['print_paper_size'])}>
                                                    <option value="a4">A4 (210 × 297 mm)</option>
                                                    <option value="letter">Letter</option>
                                                </select>
                                            </label>
                                            <label className="mt-4 block text-[11px] font-semibold text-[#5e789e]">
                                                {text('هوامش الطباعة', 'Print margins')}
                                                <select className={input} value={settings.print_margins} onChange={event => updateSetting('print_margins', event.target.value as WorkspaceSettings['print_margins'])}>
                                                    <option value="normal">{text('عادية', 'Normal')}</option>
                                                    <option value="compact">{text('ضيقة', 'Compact')}</option>
                                                </select>
                                            </label>
                                            <p className="mt-4 text-[11px] font-semibold text-[#5e789e]">{text('موقع الهوية', 'Brand position')}</p>
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                                {([
                                                    ['start', text('بداية','Start')],
                                                    ['center', text('وسط','Center')],
                                                    ['end', text('نهاية','End')],
                                                ] as const).map(([value,label]) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => updateSetting('logo_position', value)}
                                                        className={[
                                                            'rounded-[10px] border p-3 text-[10px] font-semibold',
                                                            settings.logo_position === value
                                                                ? 'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]'
                                                                : 'border-[#dfe8f4] text-[#6e85a5]',
                                                        ].join(' ')}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard title={text('ترقيم المستندات', 'Document numbering')} description={text('البادئات تستخدم في الأرقام الجديدة فعلياً.', 'Prefixes are used by newly created documents.')} icon={FileSpreadsheet}>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('بادئة البيع', 'Sales prefix')}
                                                    <input className={input} value={settings.invoice_prefix} onChange={event => updateSetting('invoice_prefix', event.target.value.toUpperCase())} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('رقم البداية', 'Start number')}
                                                    <input type="number" min={1} className={input} value={settings.invoice_start_number} onChange={event => updateSetting('invoice_start_number', Math.max(1, Number(event.target.value) || 1))} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('بادئة الشراء', 'Purchase prefix')}
                                                    <input className={input} value={settings.purchase_prefix} onChange={event => updateSetting('purchase_prefix', event.target.value.toUpperCase())} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('رقم البداية', 'Start number')}
                                                    <input type="number" min={1} className={input} value={settings.purchase_start_number} onChange={event => updateSetting('purchase_start_number', Math.max(1, Number(event.target.value) || 1))} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('بادئة المقبوض', 'Receipt prefix')}
                                                    <input className={input} value={settings.receipt_prefix} onChange={event => updateSetting('receipt_prefix', event.target.value.toUpperCase())} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[#5e789e]">
                                                    {text('بادئة الدفع', 'Payment prefix')}
                                                    <input className={input} value={settings.payment_prefix} onChange={event => updateSetting('payment_prefix', event.target.value.toUpperCase())} />
                                                </label>
                                            </div>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('الأعمدة الظاهرة في الفاتورة', 'Visible invoice columns')} description={text('اختر الأعمدة التي تظهر عند الطباعة.', 'Choose columns included in printed invoices.')} icon={Grid2X2}>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {invoiceColumnOptions.map(([value,label]) => {
                                                    const active = settings.invoice_columns.includes(value);
                                                    return (
                                                        <button
                                                            key={value}
                                                            type="button"
                                                            onClick={() => toggleArrayValue('invoice_columns', value)}
                                                            className={[
                                                                'rounded-[10px] border px-3 py-2 text-[10px] font-semibold',
                                                                active
                                                                    ? 'border-[#bcd5f6] bg-[#f5f9ff] text-[#1265d8]'
                                                                    : 'border-[#dfe8f4] text-[#8ba0bc]',
                                                            ].join(' ')}
                                                        >
                                                            {active ? '✓ ' : ''}{label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard title={text('الملاحظات والتذييل', 'Notes & footer')} description={text('يظهر هذا النص أسفل نسخة الطباعة.', 'This text appears on the printed invoice.')} icon={FileText}>
                                            <textarea className={input + ' min-h-28 py-3'} value={settings.invoice_footer} onChange={event => updateSetting('invoice_footer', event.target.value)} />
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            {section === 'users' && (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <SettingsCard title={text('المستخدمون', 'Users')} description={text('إدارة أعضاء مساحة العمل من المصدر الحقيقي للبيانات.', 'Manage real workspace members.')} icon={UsersRound}>
                                        <SectionLink href="/app/staff" icon={UserPlus} title={text('إدارة المستخدمين والموظفين', 'Manage users & staff')} description={text('إضافة المستخدمين ومراجعة بياناتهم وحالتهم.', 'Add and manage real users and staff.')} />
                                    </SettingsCard>
                                    <SettingsCard title={text('الأدوار والصلاحيات', 'Roles & permissions')} description={text('صلاحيات النظام الفعلية وليست معاينة.', 'Real workspace permission management.')} icon={ShieldCheck}>
                                        <SectionLink href="/app/roles" icon={ShieldCheck} title={text('فتح إدارة الصلاحيات', 'Open permissions')} description={text('تعديل الأدوار ومن يمكنه الوصول لكل جزء.', 'Control who can access each area.')} />
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'notifications' && (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <SettingsCard title={text('تنبيهات هذا الجهاز', 'This device notifications')} description={text('إذن إشعارات المتصفح الحقيقي لهذا الجهاز.', 'Real browser notification permission for this device.')} icon={Bell}>
                                        <SettingRow
                                            label={deviceNotifications ? text('مفعلة', 'Enabled') : text('متوقفة', 'Disabled')}
                                            description={text('هذا الإعداد خاص بالمتصفح والجهاز الحالي.', 'This setting is specific to the current browser/device.')}
                                            checked={deviceNotifications}
                                            onChange={() => void toggleDeviceNotifications()}
                                        />
                                    </SettingsCard>
                                    <SettingsCard title={text('موعد تذكير الاستحقاقات', 'Due reminder timing')} description={text('عدد الأيام قبل الاستحقاق.', 'Days before due date.')} icon={CalendarDays}>
                                        <label className="text-[11px] font-semibold text-[#5e789e]">
                                            {text('الأيام', 'Days')}
                                            <input type="number" min={0} max={30} className={input} value={settings.reminder_days} onChange={event => updateSetting('reminder_days', Math.min(30, Math.max(0, Number(event.target.value) || 0)))} />
                                        </label>
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'integrations' && (
                                <SettingsCard title={text('التكاملات', 'Integrations')} description={text('لن نعرض اتصالات وهمية. هذه الصفحة تعرض فقط التكاملات المتاحة فعلياً في النظام.', 'No fake connections are shown here; only real available integrations are listed.')} icon={Link2}>
                                    <div className="rounded-[14px] border border-dashed border-[#cadcf1] bg-[#fbfdff] p-8 text-center">
                                        <Mail size={26} className="mx-auto text-[#1265d8]" />
                                        <strong className="mt-3 block text-sm text-[#17386d]">
                                            {text('لا توجد تكاملات قابلة للإدارة من هذه الصفحة حالياً', 'No integrations are managed from this page yet')}
                                        </strong>
                                        <p className="mx-auto mt-2 max-w-xl text-[10px] leading-5 text-[#8ba0bc]">
                                            {text(
                                                'لن نضع أزرار ربط شكلية. عندما نضيف تكامل فعلي مثل Stripe أو Google Drive سيظهر هنا بحالته الحقيقية.',
                                                'We will not show decorative connect buttons. Real integrations will appear here with real connection state.',
                                            )}
                                        </p>
                                    </div>
                                </SettingsCard>
                            )}

                            {section === 'security' && (
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <SettingsCard title={text('أمان الحساب', 'Account security')} description={text('كلمة المرور والجلسات من مركز الحساب الحقيقي.', 'Password and sessions from the real account center.')} icon={LockKeyhole}>
                                        <SectionLink href="/app/profile" icon={LockKeyhole} title={text('فتح أمان الحساب', 'Open account security')} description={text('تغيير كلمة المرور ومراجعة إعدادات الحساب.', 'Change password and manage account security.')} />
                                    </SettingsCard>
                                    <SettingsCard title={text('صلاحيات مساحة العمل', 'Workspace access')} description={text('منع المستخدم العادي من الوصول للإعدادات مطبق من الخادم والواجهة.', 'Regular users are blocked from settings at both UI and server.')} icon={ShieldCheck}>
                                        <div className="rounded-[12px] bg-emerald-50 p-4 text-xs leading-6 text-emerald-800">
                                            <CheckCircle2 size={17} className="mb-2" />
                                            {text('صفحة الإعدادات متاحة فقط للمالك والمدير.', 'Settings are available only to workspace owners and admins.')}
                                        </div>
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'billing' && (
                                <SettingsCard title={text('الفوترة والاشتراك', 'Billing & subscription')} description={text('لا نعرض مبالغ أو بطاقات تجريبية غير مرتبطة باشتراك حقيقي.', 'No fake plans, cards, or billing history are shown.')} icon={WalletCards}>
                                    <div className="rounded-[14px] border border-dashed border-[#cadcf1] bg-[#fbfdff] p-8 text-center">
                                        <WalletCards size={26} className="mx-auto text-[#1265d8]" />
                                        <strong className="mt-3 block text-sm text-[#17386d]">
                                            {text('إدارة الاشتراك غير مربوطة بعد بمصدر فوترة حقيقي', 'Subscription management is not connected to a real billing source yet')}
                                        </strong>
                                        <p className="mx-auto mt-2 max-w-xl text-[10px] leading-5 text-[#8ba0bc]">
                                            {text('تم حذف البيانات التجريبية من هذه الصفحة حتى لا تظهر كمعلومات حقيقية.', 'Sample billing data was removed so it cannot be mistaken for real information.')}
                                        </p>
                                    </div>
                                </SettingsCard>
                            )}

                            {section === 'appearance' && (
                                <div className="space-y-4">
                                    <div className="grid gap-4 xl:grid-cols-3">
                                        {([
                                            ['light', text('فاتح', 'Light')],
                                            ['dark', text('داكن', 'Dark')],
                                            ['system', text('تلقائي', 'System')],
                                        ] as const).map(([value,label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setProfilePreferences(current => ({ ...current, theme: value }))}
                                                className={[
                                                    panel,
                                                    'p-4 text-start',
                                                    profilePreferences.theme === value ? 'ring-2 ring-[#2f7df4]' : '',
                                                ].join(' ')}
                                            >
                                                <div className={['h-28 rounded-[12px] border', value === 'dark' ? 'border-slate-700 bg-[#172033]' : value === 'system' ? 'bg-gradient-to-r from-white from-50% to-[#172033] to-50%' : 'bg-white'].join(' ')} />
                                                <strong className="mt-3 block text-xs text-[#17386d]">{label}</strong>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard title={text('كثافة العرض', 'Display density')} description={text('تطبق على حسابك.', 'Saved to your account.')} icon={Grid2X2}>
                                            <div className="grid grid-cols-2 gap-3">
                                                {([
                                                    ['comfortable', text('مريح', 'Comfortable')],
                                                    ['compact', text('مضغوط', 'Compact')],
                                                ] as const).map(([value,label]) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => setProfilePreferences(current => ({ ...current, density: value }))}
                                                        className={[
                                                            'rounded-[12px] border p-4 text-xs font-semibold',
                                                            profilePreferences.density === value ? 'border-[#2f7df4] bg-[#f4f8ff] text-[#1265d8]' : 'border-[#dfe8f4] text-[#6e85a5]',
                                                        ].join(' ')}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </SettingsCard>
                                        <SettingsCard title={text('الحركة وحجم القوائم', 'Motion & list size')} description={text('تفضيلات عرض شخصية.', 'Personal display preferences.')} icon={Palette}>
                                            <SettingRow label={text('تقليل الحركة', 'Reduce motion')} checked={profilePreferences.reduced_motion} onChange={() => setProfilePreferences(current => ({ ...current, reduced_motion: !current.reduced_motion }))} />
                                            <label className="mt-3 block text-[11px] font-semibold text-[#5e789e]">
                                                {text('عدد العناصر في الصفحة', 'Items per page')}
                                                <select className={input} value={profilePreferences.page_size} onChange={event => setProfilePreferences(current => ({ ...current, page_size: Number(event.target.value) }))}>
                                                    <option value={10}>10</option>
                                                    <option value={25}>25</option>
                                                    <option value={50}>50</option>
                                                </select>
                                            </label>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            <div className="sticky bottom-0 z-20 mt-5 flex items-center justify-between gap-3 border-t border-[#dfe8f4] bg-[#f8fbff]/95 py-3 backdrop-blur">
                                <div className="min-w-0 text-[10px] text-[#8ba0bc]">
                                    {message && (
                                        <span className="inline-flex items-center gap-2 text-emerald-700">
                                            <CheckCircle2 size={14} />
                                            {message}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className={secondaryButton}
                                        disabled={saving}
                                        onClick={() => window.location.reload()}
                                    >
                                        {text('إلغاء', 'Cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        className={primaryButton}
                                        disabled={saving}
                                        onClick={() => void saveChanges()}
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
                                                    setMessage('');
                                                    setError('');
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
                            </div>
                        </aside>
                    </div>
                </div>
            </main>
        </AppShell>
    );
}
