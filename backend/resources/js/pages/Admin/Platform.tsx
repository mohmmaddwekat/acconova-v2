import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { setLocale } from '@/lib/locale';
import { Head, Link } from '@inertiajs/react';
import {
    Activity,
    Building2,
    CheckCircle2,
    CircleDollarSign,
    ContactRound,
    CreditCard,
    ExternalLink,
    FileSearch,
    Gauge,
    Globe2,
    LayoutDashboard,
    LogOut,
    Mail,
    RefreshCw,
    Search,
    Settings,
    ShieldCheck,
    Sparkles,
    Users,
    WalletCards,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type Overview = {
    users: number;
    organizations: number;
    active_subscriptions: number;
    trialing_subscriptions: number;
    mrr_minor: number;
    currency: string;
    new_contacts: number;
    new_users_30d: number;
    new_organizations_30d: number;
};

type OrganizationRow = {
    id: number;
    name: string;
    members: number;
    plan: string | null;
    subscription_status: string | null;
    created_at: string | null;
};

type UserRow = {
    id: number;
    name: string;
    email: string;
    verified: boolean;
    memberships: number;
    last_login_at: string | null;
    created_at: string | null;
};

type SubscriptionRow = {
    id: number;
    organization_id: number;
    organization: string | null;
    plan: string | null;
    status: string | null;
    interval: string | null;
    amount_minor: number | null;
    currency: string | null;
    quantity: number;
    renews_at: string | null;
    cancel_at_period_end: boolean;
    payment_brand: string | null;
    payment_last4: string | null;
};

type PlanRow = {
    key: string;
    name_ar: string;
    name_en: string;
    recommended: boolean;
    monthly_minor: number;
    yearly_minor: number;
    currency: string;
    seats: number | null;
    ai_tokens: number | null;
    storage_bytes: number | null;
    monthly_price_configured: boolean;
    yearly_price_configured: boolean;
};

type WebsiteRow = {
    name: string;
    path: string;
    purpose: string;
};

type ContactMessage = {
    id: number;
    name: string;
    email: string;
    company: string | null;
    subject: string;
    message: string;
    locale: string;
    status: 'new' | 'read' | 'resolved';
    created_at: string | null;
    read_at: string | null;
    resolved_at: string | null;
};

type SystemInfo = {
    environment?: string;
    app_url?: string;
    https_ready?: boolean;
    billing_enabled?: boolean;
    stripe_secret_configured?: boolean;
    stripe_webhook_configured?: boolean;
    contact_email_configured?: boolean;
    mail_driver?: string;
    queue_driver?: string;
    admin_email_count?: number;
    local_admin_bypass?: boolean;
    contact_storage_ready?: boolean;
    database_connection?: string;
};

type Props = {
    section: string;
    adminEmail: string;
    overview: Overview;
    organizations: OrganizationRow[];
    users: UserRow[];
    subscriptions: SubscriptionRow[];
    plans: PlanRow[];
    website: WebsiteRow[];
    contacts: ContactMessage[];
    system: SystemInfo;
};

const card = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900';

function formatMoney(amountMinor: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: 2,
        }).format(amountMinor / 100);
    } catch {
        return `${currency} ${(amountMinor / 100).toFixed(2)}`;
    }
}

function formatDate(value: string | null, locale: string): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(parsed);
}

function bytes(value: number | null): string {
    if (value === null) return '—';
    const gb = value / (1024 ** 3);
    return `${gb.toLocaleString(undefined, { maximumFractionDigits: 0 })} GB`;
}

export default function PlatformAdmin(props: Props) {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string) => ar ? arabic : english;
    const [contacts, setContacts] = useState(props.contacts);
    const [busyContact, setBusyContact] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const [logoutBusy, setLogoutBusy] = useState(false);

    const nav = [
        ['overview', text('نظرة عامة', 'Overview'), LayoutDashboard],
        ['organizations', text('المؤسسات', 'Organizations'), Building2],
        ['users', text('المستخدمون', 'Users'), Users],
        ['subscriptions', text('الاشتراكات', 'Subscriptions'), CreditCard],
        ['plans', text('الباقات والسعات', 'Plans & capacity'), WalletCards],
        ['website', text('الموقع والصفحات', 'Website & pages'), Globe2],
        ['seo', text('SEO وظهور AI', 'SEO & AI discovery'), FileSearch],
        ['contacts', text('صندوق التواصل', 'Contact inbox'), Mail],
        ['system', text('صحة النظام', 'System health'), Gauge],
        ['settings', text('إعدادات المنصة', 'Platform settings'), Settings],
    ] as const;

    const title = nav.find(item => item[0] === props.section)?.[1] ?? text('نظرة عامة', 'Overview');

    const filteredOrganizations = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return props.organizations;
        return props.organizations.filter(item =>
            item.name.toLowerCase().includes(q)
            || String(item.id).includes(q)
            || (item.plan ?? '').toLowerCase().includes(q),
        );
    }, [props.organizations, query]);

    const filteredUsers = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return props.users;
        return props.users.filter(item =>
            item.name.toLowerCase().includes(q)
            || item.email.toLowerCase().includes(q)
            || String(item.id).includes(q),
        );
    }, [props.users, query]);

    async function logout(): Promise<void> {
        if (logoutBusy) return;
        setLogoutBusy(true);
        try {
            await apiRequest('/api/auth/logout', { method: 'POST' });
            window.location.assign('/');
        } finally {
            setLogoutBusy(false);
        }
    }

    async function updateContactStatus(id: number, status: ContactMessage['status']): Promise<void> {
        if (busyContact) return;
        setBusyContact(id);
        try {
            const response = await apiRequest<{ data: { status: ContactMessage['status']; read_at: string | null; resolved_at: string | null } }>(
                `/admin/contacts/${id}/status`,
                {
                    method: 'PUT',
                    body: JSON.stringify({ status }),
                },
            );
            setContacts(current => current.map(item => item.id === id
                ? { ...item, ...response.data }
                : item));
        } finally {
            setBusyContact(null);
        }
    }

    const healthRows = [
        [text('الرابط يستخدم HTTPS', 'APP_URL uses HTTPS'), Boolean(props.system.https_ready)],
        [text('الفوترة مفعلة', 'Billing enabled'), Boolean(props.system.billing_enabled)],
        [text('مفتاح Stripe مضبوط', 'Stripe secret configured'), Boolean(props.system.stripe_secret_configured)],
        [text('Webhook الخاص بـ Stripe مضبوط', 'Stripe webhook configured'), Boolean(props.system.stripe_webhook_configured)],
        [text('بريد التواصل مضبوط', 'Contact email configured'), Boolean(props.system.contact_email_configured)],
        [text('تخزين رسائل الموقع جاهز', 'Website contact storage ready'), Boolean(props.system.contact_storage_ready)],
    ] as const;

    return (
        <>
            <Head title={`${title} | AccoNova Admin`} />
            <div dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
                    <aside className="border-e border-slate-200 bg-[#162235] text-white dark:border-slate-800">
                        <div className="sticky top-0 flex min-h-screen flex-col p-4">
                            <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-3">
                                <span className="grid size-10 place-items-center rounded-xl bg-sky-500 font-black">A</span>
                                <div>
                                    <strong className="block">AccoNova</strong>
                                    <span className="text-[11px] text-slate-300">Platform Admin</span>
                                </div>
                            </Link>

                            <nav className="mt-6 space-y-1">
                                {nav.map(([key, label, Icon]) => (
                                    <Link
                                        key={key}
                                        href={key === 'overview' ? '/admin' : `/admin/${key}`}
                                        className={[
                                            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                                            props.section === key
                                                ? 'bg-sky-500 text-white shadow-lg shadow-sky-950/20'
                                                : 'text-slate-300 hover:bg-white/10 hover:text-white',
                                        ].join(' ')}
                                    >
                                        <Icon size={17} />
                                        {label}
                                    </Link>
                                ))}
                            </nav>

                            <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
                                <p className="truncate px-3 text-[11px] text-slate-400">{props.adminEmail}</p>
                                <button
                                    type="button"
                                    onClick={() => setLocale(ar ? 'en' : 'ar')}
                                    className="w-full rounded-xl border border-white/15 px-3 py-2 text-start text-xs text-slate-200 hover:bg-white/10"
                                >
                                    {ar ? 'English' : 'العربية'}
                                </button>
                                <button
                                    type="button"
                                    onClick={logout}
                                    disabled={logoutBusy}
                                    className="flex w-full items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                                >
                                    <LogOut size={14} />
                                    {text('تسجيل الخروج', 'Sign out')}
                                </button>
                            </div>
                        </div>
                    </aside>

                    <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">AccoNova Control Center</p>
                                <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
                            </div>
                            <div className="flex gap-2">
                                <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold shadow-sm dark:border-slate-700 dark:bg-slate-900">
                                    <Globe2 size={14} /> {text('فتح الموقع', 'Open website')}
                                </a>
                                <Link href="/app" className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-xs font-bold text-white shadow-sm">
                                    <ExternalLink size={14} /> {text('فتح التطبيق', 'Open app')}
                                </Link>
                            </div>
                        </header>

                        {props.section === 'overview' && (
                            <div className="space-y-6">
                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <Metric icon={Users} label={text('المستخدمون', 'Users')} value={props.overview.users.toLocaleString()} meta={`${props.overview.new_users_30d} ${text('جديد خلال 30 يوم', 'new in 30 days')}`} />
                                    <Metric icon={Building2} label={text('المؤسسات', 'Organizations')} value={props.overview.organizations.toLocaleString()} meta={`${props.overview.new_organizations_30d} ${text('جديدة خلال 30 يوم', 'new in 30 days')}`} />
                                    <Metric icon={CreditCard} label={text('اشتراكات فعالة', 'Active subscriptions')} value={props.overview.active_subscriptions.toLocaleString()} meta={`${props.overview.trialing_subscriptions} ${text('تجريبية', 'trialing')}`} />
                                    <Metric icon={CircleDollarSign} label={text('MRR أساسي', 'Base MRR')} value={formatMoney(props.overview.mrr_minor, props.overview.currency, locale)} meta={text('قبل الإضافات السنوية وغير الشهرية', 'Monthly base subscriptions only')} />
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
                                    <section className={`${card} p-5`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <h2 className="font-extrabold">{text('خريطة إدارة المنصة', 'Platform management map')}</h2>
                                                <p className="mt-1 text-sm text-slate-500">{text('هذه هي المناطق التي تحتاجها لإدارة SaaS من التسجيل حتى الاشتراك والدعم.', 'These are the core surfaces for running the SaaS from signup through billing and support.')}</p>
                                            </div>
                                            <Sparkles className="text-sky-500" size={20} />
                                        </div>
                                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                            {nav.slice(1).map(([key, label, Icon]) => (
                                                <Link key={key} href={`/admin/${key}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:hover:bg-slate-800">
                                                    <span className="grid size-9 place-items-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Icon size={16} /></span>
                                                    <span className="font-bold">{label}</span>
                                                </Link>
                                            ))}
                                        </div>
                                    </section>

                                    <section className={`${card} p-5`}>
                                        <div className="flex items-center gap-3">
                                            <Mail className="text-sky-500" size={19} />
                                            <div>
                                                <h2 className="font-extrabold">{text('رسائل جديدة', 'New website enquiries')}</h2>
                                                <p className="text-sm text-slate-500">{text('عملاء محتملون من صفحة التواصل.', 'Leads captured from the public contact page.')}</p>
                                            </div>
                                        </div>
                                        <div className="mt-6 text-5xl font-black">{props.overview.new_contacts}</div>
                                        <Link href="/admin/contacts" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-sky-600">
                                            {text('فتح صندوق التواصل', 'Open contact inbox')} <ExternalLink size={14} />
                                        </Link>
                                    </section>
                                </div>

                                <SystemChecklist rows={healthRows} ar={ar} />
                            </div>
                        )}

                        {(props.section === 'organizations' || props.section === 'users') && (
                            <div className="space-y-4">
                                <div className={`${card} flex items-center gap-3 p-3`}>
                                    <Search size={16} className="text-slate-400" />
                                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder={text('بحث بالاسم أو البريد أو الرقم...', 'Search by name, email or ID...')} className="w-full bg-transparent text-sm outline-none" />
                                </div>
                                {props.section === 'organizations'
                                    ? <OrganizationsTable rows={filteredOrganizations} locale={locale} ar={ar} />
                                    : <UsersTable rows={filteredUsers} locale={locale} ar={ar} />}
                            </div>
                        )}

                        {props.section === 'subscriptions' && <SubscriptionsTable rows={props.subscriptions} locale={locale} ar={ar} />}

                        {props.section === 'plans' && (
                            <div className="grid gap-4 xl:grid-cols-3">
                                {props.plans.map(plan => (
                                    <section key={plan.key} className={`${card} p-5 ${plan.recommended ? 'ring-2 ring-sky-400' : ''}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xs font-bold uppercase text-sky-600">{plan.key}</p>
                                                <h2 className="mt-1 text-xl font-black">{ar ? plan.name_ar : plan.name_en}</h2>
                                            </div>
                                            {plan.recommended && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black text-sky-700">{text('موصى بها', 'Recommended')}</span>}
                                        </div>
                                        <div className="mt-5 flex items-end gap-2">
                                            <strong className="text-3xl font-black">{formatMoney(plan.monthly_minor, plan.currency, locale)}</strong>
                                            <span className="pb-1 text-sm text-slate-500">/{text('شهر', 'month')}</span>
                                        </div>
                                        <div className="mt-4 space-y-2 text-sm">
                                            <InfoRow label={text('المقاعد', 'Seats')} value={String(plan.seats ?? '—')} />
                                            <InfoRow label={text('توكنز AI', 'AI tokens')} value={(plan.ai_tokens ?? 0).toLocaleString()} />
                                            <InfoRow label={text('التخزين', 'Storage')} value={bytes(plan.storage_bytes)} />
                                            <InfoRow label={text('سعر Stripe الشهري', 'Monthly Stripe price')} value={plan.monthly_price_configured ? '✓' : '—'} />
                                            <InfoRow label={text('سعر Stripe السنوي', 'Yearly Stripe price')} value={plan.yearly_price_configured ? '✓' : '—'} />
                                        </div>
                                        <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                            {text('تعديل السعر التجاري يتم من إعدادات الباقات وStripe حتى يبقى السعر في النظام ومزود الدفع متطابقين.', 'Commercial price changes stay code/config + Stripe controlled so product pricing and provider pricing cannot drift.')}
                                        </p>
                                    </section>
                                ))}
                            </div>
                        )}

                        {props.section === 'website' && (
                            <section className={`${card} overflow-hidden`}>
                                <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                                    <h2 className="font-extrabold">{text('جميع صفحات الموقع العامة', 'All public website pages')}</h2>
                                    <p className="mt-1 text-sm text-slate-500">{text('افتح أي صفحة لمراجعة المحتوى والتصميم والترجمة.', 'Open any page to review its content, design and translation.')}</p>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {props.website.map(item => (
                                        <div key={item.path} className="flex flex-wrap items-center justify-between gap-3 p-4">
                                            <div>
                                                <strong>{item.name}</strong>
                                                <p className="mt-1 text-xs text-slate-500">{item.purpose}</p>
                                            </div>
                                            <a href={item.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">
                                                {item.path} <ExternalLink size={13} />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {props.section === 'seo' && (
                            <div className="space-y-4">
                                <section className={`${card} p-5`}>
                                    <h2 className="font-extrabold">{text('اكتشاف محركات البحث وأدوات AI', 'Search & AI discovery')}</h2>
                                    <p className="mt-1 text-sm text-slate-500">{text('الأسطح العامة التي تساعد Google ومحركات الإجابة والـAI على فهم AccoNova.', 'Public surfaces that help Google, answer engines and AI systems understand AccoNova.')}</p>
                                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                        <SeoLink href="/sitemap.xml" label="sitemap.xml" />
                                        <SeoLink href="/robots.txt" label="robots.txt" />
                                        <SeoLink href="/llms.txt" label="llms.txt" />
                                    </div>
                                </section>
                                <section className={`${card} p-5`}>
                                    <h2 className="font-extrabold">{text('حالة الدومين', 'Domain readiness')}</h2>
                                    <div className="mt-4 space-y-2">
                                        <InfoRow label="APP_URL" value={props.system.app_url ?? '—'} />
                                        <InfoRow label="HTTPS" value={props.system.https_ready ? text('جاهز', 'Ready') : text('غير جاهز', 'Not ready')} />
                                        <InfoRow label={text('صفحات SEO العامة', 'Public SEO pages')} value={String(props.website.length)} />
                                    </div>
                                    <p className="mt-4 text-sm text-slate-500">{text('بعد وضع الدومين الحقيقي: اربط Google Search Console وBing Webmaster Tools وارفع sitemap.xml. هذه خطوة نشر خارج الكود ولا يمكن للوحة تنفيذها قبل وجود الدومين.', 'After the real domain is live, connect Google Search Console and Bing Webmaster Tools and submit sitemap.xml. That is a deployment/account step outside the codebase.')}</p>
                                </section>
                            </div>
                        )}

                        {props.section === 'contacts' && (
                            <div className="space-y-4">
                                {contacts.length === 0 ? (
                                    <section className={`${card} p-8 text-center text-slate-500`}>{text('لا توجد رسائل بعد، أو تحتاج تشغيل migration أولًا.', 'No messages yet, or the contact-message migration still needs to run.')}</section>
                                ) : contacts.map(message => (
                                    <section key={message.id} className={`${card} p-5`}>
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <strong className="text-base">{message.subject}</strong>
                                                    <StatusBadge status={message.status} ar={ar} />
                                                </div>
                                                <p className="mt-1 text-sm text-slate-500">{message.name} · {message.email}{message.company ? ` · ${message.company}` : ''}</p>
                                                <p className="mt-1 text-xs text-slate-400">{formatDate(message.created_at, locale)} · {message.locale.toUpperCase()}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button disabled={busyContact === message.id} onClick={() => updateContactStatus(message.id, 'read')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">{text('مقروءة', 'Read')}</button>
                                                <button disabled={busyContact === message.id} onClick={() => updateContactStatus(message.id, 'resolved')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">{text('تمت المعالجة', 'Resolve')}</button>
                                            </div>
                                        </div>
                                        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 dark:bg-slate-800">{message.message}</p>
                                    </section>
                                ))}
                            </div>
                        )}

                        {props.section === 'system' && (
                            <div className="space-y-4">
                                <SystemChecklist rows={healthRows} ar={ar} />
                                <section className={`${card} p-5`}>
                                    <h2 className="font-extrabold">{text('بيئة التشغيل', 'Runtime summary')}</h2>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <InfoBox label={text('البيئة', 'Environment')} value={props.system.environment ?? '—'} />
                                        <InfoBox label={text('قاعدة البيانات', 'Database')} value={props.system.database_connection ?? '—'} />
                                        <InfoBox label={text('البريد', 'Mail')} value={props.system.mail_driver ?? '—'} />
                                        <InfoBox label={text('الطابور', 'Queue')} value={props.system.queue_driver ?? '—'} />
                                    </div>
                                </section>
                            </div>
                        )}

                        {props.section === 'settings' && (
                            <div className="grid gap-4 lg:grid-cols-2">
                                <section className={`${card} p-5`}>
                                    <h2 className="font-extrabold">{text('وصول Platform Admin', 'Platform Admin access')}</h2>
                                    <p className="mt-2 text-sm text-slate-500">{text('في الإنتاج يجب تحديد حسابات الإدارة صراحةً. لا تعتمد على أدوار المؤسسات للوصول إلى إدارة المنصة كلها.', 'Production platform admins must be explicitly allowlisted. Workspace roles should not grant global SaaS administration.')}</p>
                                    <code className="mt-4 block rounded-xl bg-slate-950 p-4 text-xs text-slate-100">PLATFORM_ADMIN_EMAILS=you@example.com</code>
                                    <InfoRow label={text('عدد حسابات الإدارة المضبوطة', 'Configured admin emails')} value={String(props.system.admin_email_count ?? 0)} />
                                    <InfoRow label={text('تجاوز محلي للتطوير', 'Local development bypass')} value={props.system.local_admin_bypass ? text('مفعل', 'Enabled') : text('معطل', 'Disabled')} />
                                </section>
                                <section className={`${card} p-5`}>
                                    <h2 className="font-extrabold">{text('قبل الإطلاق الحقيقي', 'Before production launch')}</h2>
                                    <div className="mt-4 space-y-3 text-sm">
                                        {[
                                            text('اضبط APP_URL على الدومين الحقيقي وHTTPS.', 'Set APP_URL to the real HTTPS domain.'),
                                            text('ضع Stripe Live keys وWebhook الخاص بالـLive mode.', 'Use Stripe Live keys and the Live webhook secret.'),
                                            text('اضبط بريد الإرسال وبريد استقبال طلبات الموقع.', 'Configure outbound email and the marketing contact inbox.'),
                                            text('حدد PLATFORM_ADMIN_EMAILS ولا تترك الإدارة العامة للمستخدمين.', 'Set PLATFORM_ADMIN_EMAILS and do not expose global admin access to normal users.'),
                                            text('شغّل migrations وqueue worker والنسخ الاحتياطي والمراقبة.', 'Run migrations, queue workers, backups and monitoring.'),
                                            text('اربط Search Console وAnalytics/قياس التحويلات بعد النشر.', 'Connect Search Console and analytics/conversion measurement after launch.'),
                                        ].map(item => <div key={item} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" /><span>{item}</span></div>)}
                                    </div>
                                </section>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </>
    );
}

function Metric({ icon: Icon, label, value, meta }: { icon: typeof Users; label: string; value: string; meta: string }) {
    return <section className={`${card} p-5`}><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Icon size={18} /></span><Activity size={15} className="text-slate-300" /></div><p className="mt-5 text-xs font-bold text-slate-500">{label}</p><strong className="mt-1 block text-3xl font-black">{value}</strong><p className="mt-2 text-xs text-slate-400">{meta}</p></section>;
}

function OrganizationsTable({ rows, locale, ar }: { rows: OrganizationRow[]; locale: string; ar: boolean }) {
    return <section className={`${card} overflow-x-auto`}><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800"><tr><th className="p-3 text-start">ID</th><th className="p-3 text-start">{ar ? 'المؤسسة' : 'Organization'}</th><th className="p-3 text-start">{ar ? 'الأعضاء' : 'Members'}</th><th className="p-3 text-start">{ar ? 'الباقة' : 'Plan'}</th><th className="p-3 text-start">{ar ? 'الاشتراك' : 'Subscription'}</th><th className="p-3 text-start">{ar ? 'أُنشئت' : 'Created'}</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map(row => <tr key={row.id}><td className="p-3 text-slate-500">{row.id}</td><td className="p-3 font-bold">{row.name}</td><td className="p-3">{row.members}</td><td className="p-3">{row.plan ?? '—'}</td><td className="p-3"><StatusBadge status={(row.subscription_status ?? 'none') as any} ar={ar} /></td><td className="p-3 text-slate-500">{formatDate(row.created_at, locale)}</td></tr>)}</tbody></table></section>;
}

function UsersTable({ rows, locale, ar }: { rows: UserRow[]; locale: string; ar: boolean }) {
    return <section className={`${card} overflow-x-auto`}><table className="w-full min-w-[820px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800"><tr><th className="p-3 text-start">ID</th><th className="p-3 text-start">{ar ? 'المستخدم' : 'User'}</th><th className="p-3 text-start">{ar ? 'التحقق' : 'Verified'}</th><th className="p-3 text-start">{ar ? 'العضويات' : 'Memberships'}</th><th className="p-3 text-start">{ar ? 'آخر دخول' : 'Last login'}</th><th className="p-3 text-start">{ar ? 'أُنشئ' : 'Created'}</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map(row => <tr key={row.id}><td className="p-3 text-slate-500">{row.id}</td><td className="p-3"><strong className="block">{row.name}</strong><span className="text-xs text-slate-500">{row.email}</span></td><td className="p-3">{row.verified ? '✓' : '—'}</td><td className="p-3">{row.memberships}</td><td className="p-3 text-slate-500">{formatDate(row.last_login_at, locale)}</td><td className="p-3 text-slate-500">{formatDate(row.created_at, locale)}</td></tr>)}</tbody></table></section>;
}

function SubscriptionsTable({ rows, locale, ar }: { rows: SubscriptionRow[]; locale: string; ar: boolean }) {
    return <section className={`${card} overflow-x-auto`}><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800"><tr><th className="p-3 text-start">{ar ? 'المؤسسة' : 'Organization'}</th><th className="p-3 text-start">{ar ? 'الباقة' : 'Plan'}</th><th className="p-3 text-start">{ar ? 'الحالة' : 'Status'}</th><th className="p-3 text-start">{ar ? 'السعر' : 'Price'}</th><th className="p-3 text-start">{ar ? 'الدورة' : 'Interval'}</th><th className="p-3 text-start">{ar ? 'التجديد' : 'Renews'}</th><th className="p-3 text-start">{ar ? 'الدفع' : 'Payment'}</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map(row => <tr key={row.id}><td className="p-3 font-bold">{row.organization ?? `#${row.organization_id}`}</td><td className="p-3">{row.plan ?? '—'}</td><td className="p-3"><StatusBadge status={(row.status ?? 'none') as any} ar={ar} /></td><td className="p-3">{row.amount_minor !== null && row.currency ? formatMoney(row.amount_minor * row.quantity, row.currency, locale) : '—'}</td><td className="p-3">{row.interval ?? '—'}</td><td className="p-3 text-slate-500">{formatDate(row.renews_at, locale)}{row.cancel_at_period_end ? ` · ${ar ? 'سيلغى' : 'cancels'}` : ''}</td><td className="p-3">{row.payment_last4 ? `${row.payment_brand ?? 'card'} •••• ${row.payment_last4}` : '—'}</td></tr>)}</tbody></table></section>;
}

function StatusBadge({ status, ar }: { status: string; ar: boolean }) {
    const map: Record<string, [string, string, string]> = {
        active: ['نشط', 'Active', 'bg-emerald-100 text-emerald-700'],
        trialing: ['تجريبي', 'Trialing', 'bg-sky-100 text-sky-700'],
        new: ['جديد', 'New', 'bg-amber-100 text-amber-700'],
        read: ['مقروء', 'Read', 'bg-slate-100 text-slate-700'],
        resolved: ['تمت المعالجة', 'Resolved', 'bg-emerald-100 text-emerald-700'],
        canceled: ['ملغى', 'Canceled', 'bg-rose-100 text-rose-700'],
        past_due: ['متأخر', 'Past due', 'bg-rose-100 text-rose-700'],
        none: ['بدون اشتراك', 'No subscription', 'bg-slate-100 text-slate-600'],
    };
    const item = map[status] ?? [status, status, 'bg-slate-100 text-slate-600'];
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${item[2]}`}>{ar ? item[0] : item[1]}</span>;
}

function SystemChecklist({ rows, ar }: { rows: readonly (readonly [string, boolean])[]; ar: boolean }) {
    return <section className={`${card} p-5`}><div className="flex items-center gap-3"><ShieldCheck size={19} className="text-sky-500" /><h2 className="font-extrabold">{ar ? 'جاهزية المنصة' : 'Platform readiness'}</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(([label, ok]) => <div key={label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><span className="text-sm">{label}</span><span className={ok ? 'text-emerald-500' : 'text-amber-500'}>{ok ? <CheckCircle2 size={17} /> : <RefreshCw size={17} />}</span></div>)}</div></section>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0 dark:border-slate-800"><span className="text-slate-500">{label}</span><strong className="text-end">{value}</strong></div>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
    return <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block">{value}</strong></div>;
}

function SeoLink({ href, label }: { href: string; label: string }) {
    return <a href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-slate-200 p-4 font-bold hover:border-sky-300 dark:border-slate-700"><span>{label}</span><ExternalLink size={14} /></a>;
}
