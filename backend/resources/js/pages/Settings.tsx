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
    Eye,
    FileSpreadsheet,
    FlaskConical,
    FileText,
    Globe2,
    Hash,
    Grid2X2,
    Image,
    Link2,
    LockKeyhole,
    Mail,
    Palette,
    Percent,
    Printer,
    ReceiptText,
    Settings2,
    ShieldCheck,
    ShoppingCart,
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
    useRef,
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
    approval_invoice_threshold: string;
    approval_discount_percent: string;
    approval_payment_threshold: string;
    inventory_reorder_lead_days: number;
    inventory_safety_days: number;
    payment_methods: string[];
    validate_check_date: boolean;
    post_dated_checks_pending: boolean;
    bank_accounts: BankAccount[];
    invoice_template: 'professional' | 'classic' | 'modern' | 'simple';
    purchase_template: 'professional' | 'classic' | 'modern' | 'simple';
    receipt_template: 'professional' | 'classic' | 'modern' | 'simple';
    invoice_accent_color: string;
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
    'rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)] shadow-[0_10px_28px_rgba(30,75,140,.045)]';

const input =
    'mt-2 min-h-11 w-full rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-control)] px-3.5 text-sm text-[var(--acs-text)] outline-none transition placeholder:text-[var(--acs-text-muted)] focus:border-[var(--acs-accent)] focus:ring-2 focus:ring-[#2f7df4]/10 disabled:bg-slate-50 disabled:text-slate-400';

const secondaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[var(--acs-line-strong)] bg-[var(--acs-control)] px-4 text-xs font-semibold text-[var(--acs-accent)] transition hover:bg-[var(--acs-control-hover)] disabled:cursor-not-allowed disabled:opacity-45';

const primaryButton =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-[var(--acs-accent)] px-5 text-xs font-semibold text-white shadow-[0_8px_18px_rgba(20,104,234,.2)] transition hover:bg-[var(--acs-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45';

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
            <div className="border-b border-[var(--acs-line-soft)] px-5 py-4">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--acs-text)]">
                    <Icon size={17} className="text-[var(--acs-accent)]" />
                    {title}
                </h2>
                {description && (
                    <p className="mt-1 text-[10px] leading-5 text-[var(--acs-text-muted)]">
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
                checked ? 'bg-[var(--acs-accent)]' : 'bg-[var(--acs-toggle-off)]',
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
        <div className="flex items-center justify-between gap-4 border-b border-[var(--acs-line-soft)] py-3 last:border-b-0">
            <div>
                <p className="text-xs font-semibold text-[var(--acs-text)]">{label}</p>
                {description && (
                    <p className="mt-1 text-[10px] leading-5 text-[var(--acs-text-muted)]">
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
            className="flex items-center gap-4 rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface)] p-4 transition hover:border-[var(--acs-line-strong)] hover:bg-[var(--acs-bg)]"
        >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-[var(--acs-surface-strong)] text-[var(--acs-accent)]">
                <Icon size={19} />
            </span>
            <span className="min-w-0">
                <strong className="block text-xs text-[var(--acs-text)]">{title}</strong>
                <span className="mt-1 block text-[10px] leading-5 text-[var(--acs-text-muted)]">
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
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoSavePatchRef = useRef<Partial<WorkspaceSettings>>({});
    const autoSaveInFlightRef = useRef(false);
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

    function scheduleWorkspaceAutosave(delay = 700): void {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        setSaving(true);
        setMessage(
            text(
                'جارٍ الحفظ تلقائياً...',
                'Saving automatically...',
            ),
        );

        autoSaveTimerRef.current = setTimeout(() => {
            void flushWorkspaceAutosave();
        }, delay);
    }

    async function flushWorkspaceAutosave(): Promise<void> {
        if (autoSaveInFlightRef.current) {
            scheduleWorkspaceAutosave(250);
            return;
        }

        const patch = autoSavePatchRef.current;

        if (Object.keys(patch).length === 0) {
            setSaving(false);
            return;
        }

        autoSavePatchRef.current = {};
        autoSaveTimerRef.current = null;
        autoSaveInFlightRef.current = true;
        setError('');

        const payload: Partial<WorkspaceSettings> = {
            ...patch,
        };

        if (typeof payload.currency === 'string') {
            payload.currency = payload.currency.trim().toUpperCase();
        }

        try {
            const saved = await apiRequest<WorkspaceSettings>(
                '/api/workspace-settings',
                {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                },
            );

            setSettings(current => {
                if (!current) {
                    return saved;
                }

                return {
                    ...saved,
                    ...autoSavePatchRef.current,
                };
            });

            if (Object.prototype.hasOwnProperty.call(payload, 'decimal_places')) {
                document.documentElement.dataset.acFinanceDecimals =
                    String(saved.decimal_places);
            }

            setMessage(
                text(
                    'تم الحفظ تلقائياً.',
                    'Saved automatically.',
                ),
            );
        } catch (failure) {
            setMessage('');
            setError(
                errorText(
                    failure,
                    text(
                        'تعذر الحفظ التلقائي. صحح القيمة وسيعاد الحفظ تلقائياً عند التعديل التالي.',
                        'Auto-save failed. Correct the value and it will save automatically on the next change.',
                    ),
                ),
            );
        } finally {
            autoSaveInFlightRef.current = false;

            if (Object.keys(autoSavePatchRef.current).length > 0) {
                scheduleWorkspaceAutosave(500);
            } else {
                setSaving(false);
            }
        }
    }

    function updateSetting<K extends keyof WorkspaceSettings>(
        key: K,
        value: WorkspaceSettings[K],
    ): void {
        setSettings(current =>
            current
                ? { ...current, [key]: value }
                : current,
        );

        autoSavePatchRef.current = {
            ...autoSavePatchRef.current,
            [key]: value,
        };

        setError('');
        scheduleWorkspaceAutosave();
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

    async function changeProfilePreferences(
        patch: Partial<ProfilePreferences>,
    ): Promise<void> {
        const next = {
            ...profilePreferences,
            ...patch,
        };

        setProfilePreferences(next);
        applyProfilePreferences(next);
        setSaving(true);
        setError('');
        setMessage(
            text(
                'جارٍ الحفظ تلقائياً...',
                'Saving automatically...',
            ),
        );

        try {
            const response = await apiRequest<{ settings: ProfilePreferences }>(
                '/api/profile/preferences',
                {
                    method: 'PUT',
                    body: JSON.stringify(next),
                },
            );

            const saved = {
                ...next,
                ...response.settings,
            };

            setProfilePreferences(saved);
            applyProfilePreferences(saved);

            setMessage(
                text(
                    'تم الحفظ تلقائياً وتطبيق تفضيلات المظهر.',
                    'Saved automatically and appearance preferences applied.',
                ),
            );
        } catch (failure) {
            setMessage('');
            setError(
                errorText(
                    failure,
                    text(
                        'تعذر حفظ تفضيلات المظهر.',
                        'Could not save appearance preferences.',
                    ),
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
                <main className="ac-settings-page min-h-[calc(100dvh-72px)] bg-[var(--acs-bg)] p-8 text-[var(--acs-text)]">
                    <div className="mx-auto max-w-[1540px] rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)] p-12 text-center text-sm text-[var(--acs-text-muted)]">
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
                className="ac-settings-page min-h-[calc(100dvh-72px)] bg-[var(--acs-bg)] px-3 py-4 text-[var(--acs-text)] sm:px-5 lg:px-6"
            >
                <div className="mx-auto max-w-[1540px]">
                    <div className="mb-5">
                        {section !== 'general' && (
                            <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold text-[var(--acs-text-muted)]">
                                <span>{text('الإعدادات', 'Settings')}</span>
                                <span>›</span>
                                <span>
                                    {navItems.find(item => item.key === section)?.label}
                                </span>
                            </div>
                        )}
                        <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-[var(--acs-text-strong)] sm:text-3xl">
                            {section === 'invoices'
                                ? text('الفواتير والطباعة', 'Invoices & printing')
                                : section === 'general'
                                    ? text('الإعدادات', 'Settings')
                                    : navItems.find(item => item.key === section)?.label}
                        </h1>
                        <p className="mt-1 max-w-3xl text-xs leading-6 text-[var(--acs-text-muted)]">
                            {section === 'invoices'
                                ? text(
                                    'خصص قوالب الفواتير والإيصالات والمستندات المطبوعة بما يناسب هوية مؤسستك، وتنعكس الإعدادات على الطباعة الفعلية.',
                                    'Customize invoice, receipt and printed document templates. Saved changes are applied to actual printing.',
                                )
                                : text(
                                    'إعدادات المؤسسة والمالية والطباعة متصلة فعلياً بالنظام وتحفظ على مستوى مساحة العمل.',
                                    'Organization, finance and print settings are persisted and applied across the workspace.',
                                )}
                        </p>
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
                                    <section className="rounded-[18px] border border-[var(--acs-line-strong)] bg-gradient-to-l from-[var(--acs-accent-soft)] to-[var(--acs-surface)] p-5">
                                        <h2 className="text-xl font-extrabold text-[var(--acs-text)]">
                                            {text(
                                                'مرحباً ' + (auth.user?.name ?? '') + ' 👋',
                                                'Welcome ' + (auth.user?.name ?? ''),
                                            )}
                                        </h2>
                                        <p className="mt-1 text-xs leading-6 text-[var(--acs-text-soft)]">
                                            {text(
                                                'هذه إعدادات إدارية لمساحة العمل، ولا تظهر للمستخدمين العاديين.',
                                                'These are workspace administration settings and are hidden from regular users.',
                                            )}
                                        </p>
                                    </section>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard
                                            title={text('اللغة والمنطقة', 'Language & region')}
                                            description={text('تفضيلات حسابك الشخصية وتحفظ لحسابك.', 'Personal account preferences.')}
                                            icon={Globe2}
                                        >
                                            <label className="block text-[11px] font-semibold text-[var(--acs-text-soft)]">
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
                                            <label className="mt-4 block text-[11px] font-semibold text-[var(--acs-text-soft)]">
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

                                        <SettingsCard
                                            title={text('إعدادات مساحة العمل', 'Workspace settings')}
                                            description={text('هوية مؤسستك وإعدادات العمل، وليس إعدادات منتج AccoNova نفسه.', 'Your organization preferences, not AccoNova product-level settings.')}
                                            icon={Building2}
                                        >
                                            <p className="text-[10px] leading-6 text-[var(--acs-text-soft)]">
                                                {text(
                                                    'اسم وشعار AccoNova يظلان ثابتين. من تبويب المؤسسة يمكنك تعديل اسم مؤسستك وشعارها وبياناتها التي تظهر في الفواتير والمستندات.',
                                                    'The AccoNova product name and brand stay fixed. Use Organization to edit your company identity and invoice details.',
                                                )}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => setSection('organization')}
                                                className={secondaryButton + ' mt-4'}
                                            >
                                                <Building2 size={14} />
                                                {text('فتح إعدادات المؤسسة', 'Open organization settings')}
                                            </button>
                                        </SettingsCard>

                                        <SettingsCard
                                            title={text('اختبارات النظام', 'System checks')}
                                            description={text(
                                                'فحص قراءة فقط لقاعدة البيانات والجداول والمسارات المهمة بعد إضافة أو تعديل فيتشرز.',
                                                'Read-only checks for the database, required tables and key feature routes after product changes.',
                                            )}
                                            icon={FlaskConical}
                                        >
                                            <p className="text-[10px] leading-6 text-[var(--acs-text-soft)]">
                                                {text(
                                                    'استخدمها بعد migrations أو دفعة تطوير كبيرة للتأكد أن أجزاء AccoNova الأساسية جاهزة ومتصلة.',
                                                    'Run it after migrations or a large development batch to verify that key AccoNova surfaces are ready and connected.',
                                                )}
                                            </p>

                                            <Link
                                                href="/app/system-checks"
                                                className={secondaryButton + ' mt-4'}
                                            >
                                                <FlaskConical size={14} />
                                                {text('فتح اختبارات النظام', 'Open system checks')}
                                            </Link>
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
                                            <div className="flex min-h-64 flex-col items-center justify-center rounded-[15px] border border-dashed border-[var(--acs-line-strong)] bg-[var(--acs-surface-soft)] p-4">
                                                {settings.logo_url ? (
                                                    <img
                                                        src={settings.logo_url}
                                                        alt={settings.trade_name || settings.name}
                                                        className="max-h-24 max-w-[180px] object-contain"
                                                    />
                                                ) : (
                                                    <div className="flex size-24 items-center justify-center rounded-[24px] bg-[var(--acs-surface-strong)] text-4xl font-black text-[var(--acs-accent)]">
                                                        {(settings.trade_name || settings.name).charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <strong className="mt-3 text-xl text-[var(--acs-text-strong)]">
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
                                                <p className="mt-2 text-[9px] text-[var(--acs-text-muted)]">
                                                    PNG / JPG / WEBP · 2MB max
                                                </p>
                                            </div>

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('اسم مساحة العمل *', 'Workspace name *')}
                                                    <input className={input} value={settings.name} onChange={event => updateSetting('name', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('الاسم القانوني للمؤسسة *', 'Legal name *')}
                                                    <input className={input} value={settings.legal_name} onChange={event => updateSetting('legal_name', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('الاسم التجاري *', 'Trade name *')}
                                                    <input className={input} value={settings.trade_name} onChange={event => updateSetting('trade_name', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('البريد الإلكتروني للدعم', 'Support email')}
                                                    <input className={input} type="email" value={settings.support_email} onChange={event => updateSetting('support_email', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('رقم الجوال', 'Phone')}
                                                    <input className={input} dir="ltr" value={settings.phone} onChange={event => updateSetting('phone', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('رقم السجل التجاري', 'Commercial registration')}
                                                    <input className={input} value={settings.commercial_registration} onChange={event => updateSetting('commercial_registration', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('الرقم الضريبي (VAT)', 'VAT number')}
                                                    <input className={input} value={settings.vat_number} onChange={event => updateSetting('vat_number', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
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
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('الدولة', 'Country')}
                                                    <input className={input} value={settings.country} onChange={event => updateSetting('country', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('المدينة', 'City')}
                                                    <input className={input} value={settings.city} onChange={event => updateSetting('city', event.target.value)} />
                                                </label>
                                                <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
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
                                            <div className="rounded-[14px] bg-[var(--acs-bg)] p-5 text-center">
                                                <Building2 size={24} className="mx-auto text-[var(--acs-accent)]" />
                                                <p className="mt-3 text-[10px] leading-5 text-[var(--acs-text-muted)]">
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
                                        <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
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
                                        <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
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
                                        <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
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
                                        <div className="mt-4 rounded-[12px] bg-[var(--acs-surface-soft)] p-4 text-center text-xl font-bold text-[var(--acs-text)]">
                                            {settings.currency} {moneyPreview}
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard
                                        title={text('قواعد الموافقات', 'Approval rules')}
                                        description={text(
                                            'حدد متى يجب إيقاف العملية للمراجعة. القيمة 0 تعطل حد المبلغ، بينما التحويل البنكي الصادر يبقى بحاجة لموافقة.',
                                            'Choose when an operation must pause for review. A value of 0 disables the amount threshold; outgoing bank transfers still require approval.',
                                        )}
                                        icon={ShieldCheck}
                                    >
                                        <div className="space-y-3">
                                            <label className="block text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('فاتورة تحتاج موافقة من مبلغ', 'Invoice approval from amount')}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    className={input}
                                                    value={settings.approval_invoice_threshold}
                                                    onChange={event => updateSetting('approval_invoice_threshold', event.target.value)}
                                                />
                                            </label>

                                            <label className="block text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('خصم بيع يحتاج موافقة فوق %', 'Sales discount approval above %')}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step="0.1"
                                                    className={input}
                                                    value={settings.approval_discount_percent}
                                                    onChange={event => updateSetting('approval_discount_percent', event.target.value)}
                                                />
                                            </label>

                                            <label className="block text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('دفعة صادرة تحتاج موافقة من مبلغ', 'Outgoing payment approval from amount')}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="0.01"
                                                    className={input}
                                                    value={settings.approval_payment_threshold}
                                                    onChange={event => updateSetting('approval_payment_threshold', event.target.value)}
                                                />
                                            </label>

                                            <Link
                                                href="/app/finance/approvals"
                                                className={secondaryButton + ' w-full'}
                                            >
                                                <ShieldCheck size={13} />
                                                {text('فتح مركز الموافقات', 'Open approval center')}
                                            </Link>
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard
                                        title={text('تخطيط المخزون', 'Inventory planning')}
                                        description={text(
                                            'تستخدم هذه الأيام في اقتراحات إعادة الطلب وتوقع النفاد، ولا تنشئ طلب شراء تلقائياً.',
                                            'These day values drive reorder suggestions and stockout forecasts; they never create a purchase automatically.',
                                        )}
                                        icon={ShoppingCart}
                                    >
                                        <div className="grid grid-cols-2 gap-3">
                                            <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('مهلة التوريد بالأيام', 'Lead time days')}
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={365}
                                                    step={1}
                                                    className={input}
                                                    value={settings.inventory_reorder_lead_days}
                                                    onChange={event => updateSetting(
                                                        'inventory_reorder_lead_days',
                                                        Math.min(365, Math.max(1, Number(event.target.value) || 1)),
                                                    )}
                                                />
                                            </label>

                                            <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('مخزون الأمان بالأيام', 'Safety stock days')}
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={365}
                                                    step={1}
                                                    className={input}
                                                    value={settings.inventory_safety_days}
                                                    onChange={event => updateSetting(
                                                        'inventory_safety_days',
                                                        Math.min(365, Math.max(0, Number(event.target.value) || 0)),
                                                    )}
                                                />
                                            </label>
                                        </div>
                                    </SettingsCard>

                                    <SettingsCard title={text('الحسابات البنكية', 'Bank accounts')} description={text('لا يتم إنشاء أي حساب افتراضي. أضف حساباتك الحقيقية فقط.', 'No fake accounts are created. Add only real accounts.')} icon={Banknote}>
                                        {settings.bank_accounts.length === 0 && !addingBank && (
                                            <div className="rounded-[12px] border border-dashed border-[var(--acs-line-strong)] bg-[var(--acs-surface-soft)] p-5 text-center">
                                                <p className="text-xs font-semibold text-[var(--acs-text)]">{text('لا توجد حسابات بنكية', 'No bank accounts')}</p>
                                                <p className="mt-1 text-[10px] text-[var(--acs-text-muted)]">{text('أضف حساباً فقط إذا كنت تستخدمه فعلياً.', 'Add an account only when you actually use one.')}</p>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            {settings.bank_accounts.map(account => (
                                                <div key={account.id} className="rounded-[12px] border border-[var(--acs-line)] p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <strong className="text-xs text-[var(--acs-text)]">{account.bank_name}</strong>
                                                                {account.is_primary && (
                                                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                                                                        {text('الأساسي', 'Primary')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {account.account_name && <p className="mt-1 text-[10px] text-[var(--acs-text-soft)]">{account.account_name}</p>}
                                                            {(account.iban || account.account_number) && (
                                                                <p className="mt-1 text-[9px] text-[var(--acs-text-muted)]" dir="ltr">
                                                                    {account.iban || account.account_number}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <button type="button" onClick={() => removeBankAccount(account.id)} className="rounded-[9px] border border-red-100 bg-red-50 p-2 text-red-500">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    {!account.is_primary && (
                                                        <button type="button" onClick={() => makePrimaryBank(account.id)} className="mt-2 text-[10px] font-semibold text-[var(--acs-accent)]">
                                                            {text('تعيين كأساسي', 'Make primary')}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {addingBank ? (
                                            <div className="mt-3 rounded-[12px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3">
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
                                            <label key={value} className="flex items-center justify-between border-b border-[var(--acs-line-soft)] py-3 last:border-0">
                                                <span className="text-xs font-semibold text-[var(--acs-text)]">{label}</span>
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
                                    <div className="grid gap-4 xl:grid-cols-[1.42fr_1fr]">
                                        <div className="space-y-4">
                                            <SettingsCard
                                                title={text('اختر قالب الفاتورة', 'Choose invoice template')}
                                                description={text('اختر التصميم الأساسي لفواتير البيع. الاختيار يستخدم في الطباعة الفعلية.', 'Choose the sales invoice layout used by actual printing.')}
                                                icon={FileText}
                                            >
                                                <div className="grid gap-3 sm:grid-cols-4">
                                                    {([
                                                        ['professional', text('احترافي', 'Professional')],
                                                        ['classic', text('كلاسيكي', 'Classic')],
                                                        ['modern', text('مودرن', 'Modern')],
                                                        ['simple', text('بسيط', 'Simple')],
                                                    ] as const).map(([value, label]) => {
                                                        const active = settings.invoice_template === value;

                                                        return (
                                                            <button
                                                                type="button"
                                                                key={value}
                                                                onClick={() => updateSetting('invoice_template', value)}
                                                                className={[
                                                                    'group rounded-[13px] border p-2.5 text-start transition',
                                                                    active
                                                                        ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] shadow-[0_0_0_1px_var(--acs-accent)]'
                                                                        : 'border-[var(--acs-line)] bg-[var(--acs-surface)] hover:border-[var(--acs-line-strong)]',
                                                                ].join(' ')}
                                                            >
                                                                <div className="ac-settings-paper relative h-[92px] overflow-hidden rounded-[9px] border border-[#e4ebf4] bg-white p-2.5">
                                                                    <div
                                                                        className={[
                                                                            'absolute inset-x-2.5 top-2 h-1.5 rounded-full',
                                                                            value === 'classic' ? 'bg-slate-700' : '',
                                                                        ].join(' ')}
                                                                        style={{
                                                                            backgroundColor: value === 'classic'
                                                                                ? undefined
                                                                                : settings.invoice_accent_color,
                                                                        }}
                                                                    />
                                                                    <div className="mt-4 flex items-start justify-between gap-2">
                                                                        <div
                                                                            className="size-4 rounded-[4px]"
                                                                            style={{ backgroundColor: settings.invoice_accent_color + '20' }}
                                                                        />
                                                                        <div className="w-10 space-y-1">
                                                                            <div className="h-1 rounded bg-slate-200" />
                                                                            <div className="h-1 rounded bg-slate-100" />
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-3 space-y-1.5">
                                                                        <div className="h-1.5 rounded bg-slate-100" />
                                                                        <div className="h-1.5 rounded bg-slate-100" />
                                                                        <div
                                                                            className="h-1.5 w-2/3 rounded"
                                                                            style={{ backgroundColor: settings.invoice_accent_color + '25' }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="mt-2 flex items-center justify-between">
                                                                    <span className="text-[10px] font-semibold text-[var(--acs-text)]">{label}</span>
                                                                    {active && (
                                                                        <span
                                                                            className="flex size-4 items-center justify-center rounded-full text-[9px] text-white"
                                                                            style={{ backgroundColor: settings.invoice_accent_color }}
                                                                        >
                                                                            ✓
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </SettingsCard>

                                            <div className="grid gap-4 md:grid-cols-2">
                                                <SettingsCard
                                                    title={text('قالب أمر الشراء', 'Purchase document template')}
                                                    description={text('قالب طباعة فواتير وأوامر الشراء.', 'Template for purchase invoices and purchase documents.')}
                                                    icon={ShoppingCart}
                                                >
                                                    <div className="grid grid-cols-[96px_1fr] items-center gap-4">
                                                        <div className="ac-settings-paper rounded-[10px] border border-[#e4ebf4] bg-white p-2 shadow-sm">
                                                            <div
                                                                className="h-1.5 w-12 rounded"
                                                                style={{ backgroundColor: settings.invoice_accent_color }}
                                                            />
                                                            <div className="mt-3 space-y-1.5">
                                                                <div className="h-1 rounded bg-slate-200" />
                                                                <div className="h-1 rounded bg-slate-100" />
                                                                <div className="h-1 rounded bg-slate-100" />
                                                            </div>
                                                        </div>
                                                        <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                            {text('القالب', 'Template')}
                                                            <select
                                                                className={input}
                                                                value={settings.purchase_template}
                                                                onChange={event => updateSetting(
                                                                    'purchase_template',
                                                                    event.target.value as WorkspaceSettings['purchase_template'],
                                                                )}
                                                            >
                                                                <option value="professional">{text('احترافي', 'Professional')}</option>
                                                                <option value="classic">{text('كلاسيكي', 'Classic')}</option>
                                                                <option value="modern">{text('مودرن', 'Modern')}</option>
                                                                <option value="simple">{text('بسيط', 'Simple')}</option>
                                                            </select>
                                                        </label>
                                                    </div>
                                                </SettingsCard>

                                                <SettingsCard
                                                    title={text('قالب الإيصال', 'Receipt template')}
                                                    description={text('قالب طباعة سندات القبض والصرف.', 'Template for receipt and payment vouchers.')}
                                                    icon={ReceiptText}
                                                >
                                                    <div className="grid grid-cols-[96px_1fr] items-center gap-4">
                                                        <div className="ac-settings-paper rounded-[10px] border border-[#e4ebf4] bg-white p-2 shadow-sm">
                                                            <div
                                                                className="mx-auto size-5 rounded-full"
                                                                style={{ backgroundColor: settings.invoice_accent_color + '20' }}
                                                            />
                                                            <div className="mt-2 h-1.5 rounded bg-slate-200" />
                                                            <div
                                                                className="mx-auto mt-2 h-4 w-2/3 rounded"
                                                                style={{ backgroundColor: settings.invoice_accent_color + '18' }}
                                                            />
                                                        </div>
                                                        <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                            {text('القالب', 'Template')}
                                                            <select
                                                                className={input}
                                                                value={settings.receipt_template}
                                                                onChange={event => updateSetting(
                                                                    'receipt_template',
                                                                    event.target.value as WorkspaceSettings['receipt_template'],
                                                                )}
                                                            >
                                                                <option value="professional">{text('احترافي', 'Professional')}</option>
                                                                <option value="classic">{text('كلاسيكي', 'Classic')}</option>
                                                                <option value="modern">{text('مودرن', 'Modern')}</option>
                                                                <option value="simple">{text('بسيط', 'Simple')}</option>
                                                            </select>
                                                        </label>
                                                    </div>
                                                </SettingsCard>
                                            </div>
                                        </div>

                                        <SettingsCard
                                            title={text('قالب الفاتورة الحالي', 'Current invoice template')}
                                            description={text('معاينة مباشرة قريبة من شكل الطباعة النهائي.', 'Live preview close to the final printed output.')}
                                            icon={Eye}
                                        >
                                            <div className="rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-surface-soft)] p-3 sm:p-4">
                                                <div className="ac-settings-paper mx-auto min-h-[455px] max-w-[390px] bg-white p-5 text-[#17386d] shadow-[0_8px_30px_rgba(24,50,90,.09)]">
                                                    <div
                                                        className={[
                                                            'flex gap-4',
                                                            settings.logo_position === 'center'
                                                                ? 'flex-col items-center text-center'
                                                                : settings.logo_position === 'end'
                                                                    ? 'flex-row-reverse items-start justify-between text-end'
                                                                    : 'items-start justify-between',
                                                        ].join(' ')}
                                                    >
                                                        <div>
                                                            {settings.show_invoice_logo && (
                                                                settings.logo_url
                                                                    ? (
                                                                        <img
                                                                            src={settings.logo_url}
                                                                            alt={settings.trade_name || workspaceName}
                                                                            className="mb-2 max-h-12 max-w-[130px] object-contain"
                                                                        />
                                                                    )
                                                                    : (
                                                                        <div
                                                                            className="mb-2 flex size-10 items-center justify-center rounded-[11px] text-lg font-extrabold text-white"
                                                                            style={{ backgroundColor: settings.invoice_accent_color }}
                                                                        >
                                                                            {(settings.trade_name || workspaceName).charAt(0).toUpperCase()}
                                                                        </div>
                                                                    )
                                                            )}
                                                            <strong
                                                                className="block text-sm font-extrabold"
                                                                style={{ color: settings.invoice_accent_color }}
                                                            >
                                                                {settings.trade_name || workspaceName}
                                                            </strong>
                                                            {settings.show_invoice_contact && (
                                                                <p className="mt-1 text-[7px] leading-3 text-slate-500">
                                                                    {[settings.phone, settings.support_email].filter(Boolean).join(' · ')}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <strong className="text-[11px]">{text('فاتورة ضريبية', 'Tax invoice')}</strong>
                                                            <p className="mt-1 text-[7px] text-slate-400">
                                                                {settings.invoice_prefix}-2026-{String(settings.invoice_start_number).padStart(4, '0')}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="my-4 grid grid-cols-2 gap-3 rounded-[8px] bg-slate-50 p-2.5 text-[7px]">
                                                        <div>
                                                            <span className="text-slate-400">{text('التاريخ', 'Date')}</span>
                                                            <strong className="mt-0.5 block">20/09/2026</strong>
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-400">{text('العميل', 'Customer')}</span>
                                                            <strong className="mt-0.5 block">{text('عميل تجريبي', 'Sample customer')}</strong>
                                                        </div>
                                                    </div>

                                                    <div className="overflow-hidden rounded-[7px] border border-slate-200">
                                                        <div className="grid grid-cols-[30px_1.6fr_.55fr_.8fr_.8fr] bg-slate-50 px-2 py-2 text-[6px] font-semibold text-slate-500">
                                                            <span>#</span>
                                                            <span>{text('الوصف', 'Description')}</span>
                                                            <span>{text('الكمية', 'Qty')}</span>
                                                            <span>{text('سعر الوحدة', 'Unit price')}</span>
                                                            <span>{text('المجموع', 'Total')}</span>
                                                        </div>
                                                        {[
                                                            [text('خدمة محاسبية شهرية', 'Monthly accounting service'), '1', '200.00', '200.00'],
                                                            [text('دعم فني', 'Technical support'), '1', '100.00', '100.00'],
                                                        ].map((row, index) => (
                                                            <div key={index} className="grid grid-cols-[30px_1.6fr_.55fr_.8fr_.8fr] border-t border-slate-100 px-2 py-2 text-[6px]">
                                                                <span>{index + 1}</span>
                                                                <span>{row[0]}</span>
                                                                <span>{row[1]}</span>
                                                                <span>{row[2]}</span>
                                                                <span>{row[3]}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="mt-4 ms-auto w-[190px] space-y-1.5 text-[7px]">
                                                        <div className="flex justify-between"><span>{text('المجموع الفرعي', 'Subtotal')}</span><strong>300.00</strong></div>
                                                        <div className="flex justify-between"><span>{text('الخصم', 'Discount')}</span><strong>0.00</strong></div>
                                                        <div className="flex justify-between"><span>{text('الضريبة', 'Tax')}</span><strong>45.00</strong></div>
                                                        <div className="border-t border-slate-200 pt-1.5">
                                                            <div className="flex justify-between text-[8px]">
                                                                <strong>{text('الإجمالي', 'Total')}</strong>
                                                                <strong style={{ color: settings.invoice_accent_color }}>
                                                                    345.00 {settings.currency}
                                                                </strong>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {settings.show_invoice_tax_number && settings.vat_number && (
                                                        <p className="mt-5 text-[6px] text-slate-400">
                                                            {text('الرقم الضريبي', 'VAT')}: {settings.vat_number}
                                                        </p>
                                                    )}

                                                    {settings.show_invoice_notes && settings.invoice_footer && (
                                                        <div className="mt-5 border-t border-slate-100 pt-3 text-center text-[6px] leading-3 text-slate-400">
                                                            {settings.invoice_footer}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between gap-3">
                                                <span className="text-[10px] text-[var(--acs-text-muted)]">
                                                    {text('المعاينة تتحدث فوراً قبل الحفظ.', 'Preview updates instantly before saving.')}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--acs-accent)]">
                                                    <Eye size={13} />
                                                    {text('معاينة مباشرة', 'Live preview')}
                                                </span>
                                            </div>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-3">
                                        <SettingsCard
                                            title={text('ترقيم الفواتير والمستندات', 'Invoice & document numbering')}
                                            description={text('هذه البادئات والأرقام تستخدم فعلياً عند إنشاء مستندات جديدة.', 'These prefixes and counters are used for new documents.')}
                                            icon={Hash}
                                        >
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-[1fr_110px] gap-3">
                                                    <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                        {text('بادئة فواتير البيع', 'Sales prefix')}
                                                        <input className={input} value={settings.invoice_prefix} onChange={event => updateSetting('invoice_prefix', event.target.value.toUpperCase())} />
                                                    </label>
                                                    <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                        {text('رقم البداية', 'Start')}
                                                        <input type="number" min={1} className={input} value={settings.invoice_start_number} onChange={event => updateSetting('invoice_start_number', Math.max(1, Number(event.target.value) || 1))} />
                                                    </label>
                                                </div>
                                                <div className="grid grid-cols-[1fr_110px] gap-3">
                                                    <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                        {text('بادئة الشراء', 'Purchase prefix')}
                                                        <input className={input} value={settings.purchase_prefix} onChange={event => updateSetting('purchase_prefix', event.target.value.toUpperCase())} />
                                                    </label>
                                                    <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                        {text('رقم البداية', 'Start')}
                                                        <input type="number" min={1} className={input} value={settings.purchase_start_number} onChange={event => updateSetting('purchase_start_number', Math.max(1, Number(event.target.value) || 1))} />
                                                    </label>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                        {text('بادئة المقبوض', 'Receipt prefix')}
                                                        <input className={input} value={settings.receipt_prefix} onChange={event => updateSetting('receipt_prefix', event.target.value.toUpperCase())} />
                                                    </label>
                                                    <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                        {text('بادئة الدفع', 'Payment prefix')}
                                                        <input className={input} value={settings.payment_prefix} onChange={event => updateSetting('payment_prefix', event.target.value.toUpperCase())} />
                                                    </label>
                                                </div>
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard
                                            title={text('إعدادات الطباعة', 'Print settings')}
                                            description={text('حجم الورق والهوامش وموقع هوية المؤسسة في المستند.', 'Paper size, margins and organization identity position.')}
                                            icon={Printer}
                                        >
                                            <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('حجم الورق', 'Paper size')}
                                                <select className={input} value={settings.print_paper_size} onChange={event => updateSetting('print_paper_size', event.target.value as WorkspaceSettings['print_paper_size'])}>
                                                    <option value="a4">A4 (210 × 297 mm)</option>
                                                    <option value="letter">Letter (216 × 279 mm)</option>
                                                </select>
                                            </label>
                                            <label className="mt-4 block text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('هوامش الطباعة', 'Print margins')}
                                                <select className={input} value={settings.print_margins} onChange={event => updateSetting('print_margins', event.target.value as WorkspaceSettings['print_margins'])}>
                                                    <option value="normal">{text('عادية', 'Normal')}</option>
                                                    <option value="compact">{text('ضيقة', 'Compact')}</option>
                                                </select>
                                            </label>
                                            <p className="mt-4 text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('موقع الهوية', 'Brand position')}
                                            </p>
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                                {([
                                                    ['start', text('بداية', 'Start')],
                                                    ['center', text('وسط', 'Center')],
                                                    ['end', text('نهاية', 'End')],
                                                ] as const).map(([value, label]) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => updateSetting('logo_position', value)}
                                                        className={[
                                                            'rounded-[10px] border p-3 text-[10px] font-semibold transition',
                                                            settings.logo_position === value
                                                                ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]'
                                                                : 'border-[var(--acs-line)] bg-[var(--acs-surface)] text-[var(--acs-text-soft)]',
                                                        ].join(' ')}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard
                                            title={text('المحتوى والمظهر', 'Content & appearance')}
                                            description={text('الخيارات التالية تتحكم فعلياً بما يظهر في المستند المطبوعة.', 'These options control what is actually rendered on printed documents.')}
                                            icon={Image}
                                        >
                                            <SettingRow label={text('إظهار اسم/شعار المؤسسة', 'Show organization brand')} checked={settings.show_invoice_logo} onChange={() => updateSetting('show_invoice_logo', !settings.show_invoice_logo)} />
                                            <SettingRow label={text('إظهار معلومات التواصل', 'Show contact information')} checked={settings.show_invoice_contact} onChange={() => updateSetting('show_invoice_contact', !settings.show_invoice_contact)} />
                                            <SettingRow label={text('إظهار الرقم الضريبي', 'Show tax number')} checked={settings.show_invoice_tax_number} onChange={() => updateSetting('show_invoice_tax_number', !settings.show_invoice_tax_number)} />
                                            <SettingRow label={text('إظهار خانة الملاحظات', 'Show notes')} checked={settings.show_invoice_notes} onChange={() => updateSetting('show_invoice_notes', !settings.show_invoice_notes)} />

                                            <div className="mt-4 border-t border-[var(--acs-line-soft)] pt-4">
                                                <p className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                    {text('لون هوية المستند', 'Document accent color')}
                                                </p>
                                                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                                                    {['#7C3AED','#EC407A','#EF4444','#10B981','#14B8A6','#2563EB','#334155'].map(color => (
                                                        <button
                                                            key={color}
                                                            type="button"
                                                            aria-label={color}
                                                            onClick={() => updateSetting('invoice_accent_color', color)}
                                                            className={[
                                                                'size-7 rounded-full border-2 border-[var(--acs-surface)] shadow-[0_0_0_1px_var(--acs-line-strong)] transition',
                                                                settings.invoice_accent_color.toUpperCase() === color
                                                                    ? 'ring-2 ring-[var(--acs-accent)] ring-offset-2 ring-offset-[var(--acs-surface)]'
                                                                    : '',
                                                            ].join(' ')}
                                                            style={{ backgroundColor: color }}
                                                        />
                                                    ))}
                                                    <input
                                                        type="color"
                                                        value={settings.invoice_accent_color}
                                                        onChange={event => updateSetting('invoice_accent_color', event.target.value.toUpperCase())}
                                                        className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
                                                        title={text('لون مخصص', 'Custom color')}
                                                    />
                                                    <input
                                                        value={settings.invoice_accent_color}
                                                        onChange={event => {
                                                            const value = event.target.value.toUpperCase();
                                                            if (/^#[0-9A-F]{0,6}$/.test(value)) {
                                                                updateSetting('invoice_accent_color', value);
                                                            }
                                                        }}
                                                        className="h-9 w-24 rounded-[9px] border border-[var(--acs-line)] bg-[var(--acs-control)] px-2 text-center text-[10px] font-semibold text-[var(--acs-text)] outline-none"
                                                        dir="ltr"
                                                    />
                                                </div>
                                            </div>
                                        </SettingsCard>
                                    </div>

                                    <div className="grid gap-4 xl:grid-cols-2">
                                        <SettingsCard
                                            title={text('الملاحظات والتذييل', 'Notes & footer')}
                                            description={text('النص الافتراضي الذي يظهر أسفل الفواتير والمستندات.', 'Default text rendered at the bottom of invoices and documents.')}
                                            icon={FileText}
                                        >
                                            <textarea
                                                className={input + ' min-h-28 resize-y py-3'}
                                                maxLength={1200}
                                                value={settings.invoice_footer}
                                                onChange={event => updateSetting('invoice_footer', event.target.value)}
                                            />
                                            <div className="mt-2 flex items-center justify-between text-[9px] text-[var(--acs-text-muted)]">
                                                <span>{text('يظهر فقط عند وجود نص.', 'Rendered only when text is present.')}</span>
                                                <span>{settings.invoice_footer.length}/1200</span>
                                            </div>
                                        </SettingsCard>

                                        <SettingsCard
                                            title={text('الأعمدة الظاهرة في الفاتورة', 'Visible invoice columns')}
                                            description={text('اختر الأعمدة التي ستظهر فعلياً في جدول بنود الفاتورة عند الطباعة.', 'Choose the columns rendered in the printed invoice lines table.')}
                                            icon={Eye}
                                        >
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                {invoiceColumnOptions.map(([value, label]) => {
                                                    const active = settings.invoice_columns.includes(value);

                                                    return (
                                                        <button
                                                            key={value}
                                                            type="button"
                                                            onClick={() => toggleArrayValue('invoice_columns', value)}
                                                            className={[
                                                                'rounded-[10px] border px-3 py-2.5 text-[10px] font-semibold transition',
                                                                active
                                                                    ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]'
                                                                    : 'border-[var(--acs-line)] bg-[var(--acs-surface)] text-[var(--acs-text-muted)]',
                                                            ].join(' ')}
                                                        >
                                                            {active ? '✓ ' : ''}{label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
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
                                        {activeOrganization?.role === 'owner' ? (
                                            <SectionLink href="/app/roles" icon={ShieldCheck} title={text('فتح إدارة الصلاحيات', 'Open permissions')} description={text('تعديل الأدوار ومن يمكنه الوصول لكل جزء.', 'Control who can access each area.')} />
                                        ) : (
                                            <div className="rounded-[12px] bg-[var(--acs-bg)] p-4 text-[10px] leading-5 text-[var(--acs-text-soft)]">
                                                {text(
                                                    'إدارة الأدوار محصورة بمالك مساحة العمل. يمكنك كمدير إدارة الإعدادات والمستخدمين ضمن صلاحياتك الحالية.',
                                                    'Role management is restricted to the workspace owner. Admins can manage settings and users within their current permissions.',
                                                )}
                                            </div>
                                        )}
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
                                        <label className="text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                            {text('الأيام', 'Days')}
                                            <input type="number" min={0} max={30} className={input} value={settings.reminder_days} onChange={event => updateSetting('reminder_days', Math.min(30, Math.max(0, Number(event.target.value) || 0)))} />
                                        </label>
                                    </SettingsCard>
                                </div>
                            )}

                            {section === 'integrations' && (
                                <SettingsCard title={text('التكاملات', 'Integrations')} description={text('لن نعرض اتصالات وهمية. هذه الصفحة تعرض فقط التكاملات المتاحة فعلياً في النظام.', 'No fake connections are shown here; only real available integrations are listed.')} icon={Link2}>
                                    <div className="rounded-[14px] border border-dashed border-[var(--acs-line-strong)] bg-[var(--acs-surface-soft)] p-8 text-center">
                                        <Mail size={26} className="mx-auto text-[var(--acs-accent)]" />
                                        <strong className="mt-3 block text-sm text-[var(--acs-text)]">
                                            {text('لا توجد تكاملات قابلة للإدارة من هذه الصفحة حالياً', 'No integrations are managed from this page yet')}
                                        </strong>
                                        <p className="mx-auto mt-2 max-w-xl text-[10px] leading-5 text-[var(--acs-text-muted)]">
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
                                    <div className="rounded-[14px] border border-dashed border-[var(--acs-line-strong)] bg-[var(--acs-surface-soft)] p-8 text-center">
                                        <WalletCards size={26} className="mx-auto text-[var(--acs-accent)]" />
                                        <strong className="mt-3 block text-sm text-[var(--acs-text)]">
                                            {text('إدارة الاشتراك غير مربوطة بعد بمصدر فوترة حقيقي', 'Subscription management is not connected to a real billing source yet')}
                                        </strong>
                                        <p className="mx-auto mt-2 max-w-xl text-[10px] leading-5 text-[var(--acs-text-muted)]">
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
                                                onClick={() => void changeProfilePreferences({ theme: value })}
                                                className={[
                                                    panel,
                                                    'p-4 text-start',
                                                    profilePreferences.theme === value ? 'ring-2 ring-[#2f7df4]' : '',
                                                ].join(' ')}
                                            >
                                                <div className={['h-28 rounded-[12px] border', value === 'dark' ? 'border-slate-700 bg-[#172033]' : value === 'system' ? 'bg-gradient-to-r from-white from-50% to-[#172033] to-50%' : 'bg-white'].join(' ')} />
                                                <strong className="mt-3 block text-xs text-[var(--acs-text)]">{label}</strong>
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
                                                        onClick={() => void changeProfilePreferences({ density: value })}
                                                        className={[
                                                            'rounded-[12px] border p-4 text-xs font-semibold',
                                                            profilePreferences.density === value ? 'border-[var(--acs-accent)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]' : 'border-[var(--acs-line)] text-[var(--acs-text-soft)]',
                                                        ].join(' ')}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </SettingsCard>
                                        <SettingsCard title={text('الحركة وحجم القوائم', 'Motion & list size')} description={text('تفضيلات عرض شخصية.', 'Personal display preferences.')} icon={Palette}>
                                            <SettingRow label={text('تقليل الحركة', 'Reduce motion')} checked={profilePreferences.reduced_motion} onChange={() => void changeProfilePreferences({ reduced_motion: !profilePreferences.reduced_motion })} />
                                            <label className="mt-3 block text-[11px] font-semibold text-[var(--acs-text-soft)]">
                                                {text('عدد العناصر في الصفحة', 'Items per page')}
                                                <select className={input} value={profilePreferences.page_size} onChange={event => void changeProfilePreferences({ page_size: Number(event.target.value) })}>
                                                    <option value={10}>10</option>
                                                    <option value={25}>25</option>
                                                    <option value={50}>50</option>
                                                </select>
                                            </label>
                                        </SettingsCard>
                                    </div>
                                </div>
                            )}

                            <div className="sticky bottom-0 z-20 mt-5 flex items-center gap-3 border-t border-[var(--acs-line)] bg-[var(--acs-bg)]/95 py-3 backdrop-blur">
                                <div className="min-w-0 text-[10px] text-[var(--acs-text-muted)]">
                                    {saving ? (
                                        <span className="inline-flex items-center gap-2 text-[var(--acs-accent)]">
                                            <span className="size-2 animate-pulse rounded-full bg-[var(--acs-accent)]" />
                                            {text('جارٍ الحفظ تلقائياً...', 'Saving automatically...')}
                                        </span>
                                    ) : message ? (
                                        <span className="inline-flex items-center gap-2 text-emerald-700">
                                            <CheckCircle2 size={14} />
                                            {message}
                                        </span>
                                    ) : (
                                        <span>
                                            {text(
                                                'أي تعديل تحفظه AccoNova تلقائياً.',
                                                'AccoNova saves every change automatically.',
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </section>

                        <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">
                            <div className={panel + ' overflow-hidden p-2.5'}>
                                <div className="px-3 pb-3 pt-2">
                                    <p className="text-sm font-bold text-[var(--acs-text)]">
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
                                                        ? 'bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]'
                                                        : 'text-[var(--acs-text)] hover:bg-[var(--acs-surface-soft)]',
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
