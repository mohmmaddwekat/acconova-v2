import { CurrencyPicker } from '@/components/CurrencyPicker';
import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import { locales, setLocale } from '@/lib/locale';
import { deviceEnabled, deviceKey, deviceSupported, showDeviceNotification } from '@/lib/deviceNotifications';
import type { AppPageProps } from '@/types/app';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Bell, Building2, Globe2, Settings2, Wallet, Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

type Preferences = { name: string; currency: string; reminder_days: number; can_manage: boolean };
const button = 'rounded-xl border border-[var(--ac-line)] bg-white px-4 py-3 text-sm transition hover:bg-[var(--ac-accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ac-accent)] disabled:opacity-50';
export default function Settings() {
    const { workspace } = usePage<AppPageProps>().props;
    return <SettingsWorkspace key={workspace.activeOrganization?.id ?? 'none'} />;
}
function SettingsWorkspace() {
    const locale = useLocale();
    const { auth, workspace } = usePage<AppPageProps>().props;
    const key = deviceKey(auth.user?.id ?? 0, workspace.activeOrganization?.id ?? 0);
    const [section, setSection] = useState<'finance' | 'device' | 'personal' | 'team'>('finance');
    const [preferences, setPreferences] = useState<Preferences | null>(null);
    const [revision, setRevision] = useState(0);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [enabled, setEnabled] = useState(() => deviceEnabled(key));
    useEffect(() => {
        const controller = new AbortController();
        setError('');
        apiRequest<Preferences>('/api/workspace-settings', { signal: controller.signal }).then(setPreferences).catch((failure: unknown) => { if (!controller.signal.aborted) { setError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed')); } });
        return () => controller.abort();
    }, [revision]);
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault(); if (busy) { return; }
        const data = Object.fromEntries(new FormData(event.currentTarget));
        setBusy(true); setError(''); setMessage('');
        try { setPreferences(await apiRequest<Preferences>('/api/workspace-settings', { method: 'PATCH', body: JSON.stringify({ ...data, reminder_days: Number(data.reminder_days) }) })); setMessage(t('settings.saved')); router.reload({ only: ['workspace'] }); }
        catch (failure) { setError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed')); }
        finally { setBusy(false); }
    }
    async function toggleDevice() {
        setError(''); setMessage('');
        if (!deviceSupported()) { setError(t('settings.unsupported')); return; }
        setBusy(true);
        try {
            if (enabled) { localStorage.removeItem(key); setEnabled(false); return; }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') { setError(t('settings.denied')); return; }
            showDeviceNotification(1);
            localStorage.setItem(key, 'on'); setEnabled(true);
        } catch { setError(t('settings.unsupported')); }
        finally { setBusy(false); }
    }
    return <AppShell><Head title={t('settings.title')} /><main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <header className="flex items-center gap-5 rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-br from-white to-[var(--ac-accent-soft)] p-7 sm:p-9"><Settings2 className="shrink-0 text-[var(--ac-accent-strong)]" size={36} /><div><h1 className="text-3xl font-semibold">{t('settings.title')}</h1><p className="mt-2 text-sm text-[var(--ac-text-soft)]">{t('settings.subtitle')}</p></div></header>
        <div className="grid items-start gap-6 md:grid-cols-[230px_1fr]"><nav aria-label={t('settings.title')} className="space-y-2 rounded-2xl border border-[var(--ac-line)] bg-white p-3">{(['finance', 'device', 'personal', 'team'] as const).map((item) => { const Icon = item === 'finance' ? Wallet : item === 'device' ? Bell : Globe2; return <button key={item} aria-pressed={section === item} onClick={() => { setSection(item); setMessage(''); }} className={`flex w-full items-center gap-3 rounded-xl px-4 py-4 text-start text-sm transition ${section === item ? 'bg-[var(--ac-accent-soft)] font-semibold text-[var(--ac-accent-strong)]' : 'hover:bg-[var(--ac-surface-soft)]'}`}><Icon size={18} />{t(`settings.${item}`)}</button>; })}<div className="mt-4 border-t border-[var(--ac-line)] px-4 pt-4 pb-2 text-xs leading-6 text-[var(--ac-text-muted)]"><Building2 size={16} /><p>{workspace.activeOrganization?.name}</p></div></nav>
        <section className="min-w-0 rounded-[24px] border border-[var(--ac-line)] bg-white p-6 sm:p-8"><h2 className="mb-6 text-xl font-semibold">{t(`settings.${section}`)}</h2>
            {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}{!preferences && <button className={button} onClick={() => setRevision((value) => value + 1)}>{t('catalog.operations.retry')}</button>}</div>}
            {message && <p role="status" className="mb-4 flex items-center gap-2 text-sm text-[var(--ac-accent-strong)]"><Check size={16} />{message}</p>}
            {section === 'finance' && (preferences ? <form onSubmit={save}><fieldset disabled={busy || !preferences.can_manage} className="space-y-6"><fieldset><legend className="text-sm font-medium">{t('settings.currency')}</legend><CurrencyPicker initial={preferences.currency}/></fieldset><label className="block text-sm">{t('payments.reminderDays')}<input required name="reminder_days" type="number" min="0" max="30" defaultValue={preferences.reminder_days} className="mt-3 block w-32 rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3" /></label><p className="text-xs leading-6 text-[var(--ac-text-muted)]">{t('settings.defaults')}</p>{preferences.can_manage && <button className="rounded-xl bg-[var(--ac-accent-strong)] px-6 py-3 text-sm font-semibold text-white">{t('payments.save')}</button>}</fieldset>{!preferences.can_manage && <p className="mt-4 text-xs text-[var(--ac-text-muted)]">{t('settings.readonly')}</p>}</form> : !error && <p role="status">{t('catalog.operations.loading')}</p>)}
            {section === 'device' && <div className="space-y-5"><span className={`inline-block rounded-full px-4 py-2 text-xs ${enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-[var(--ac-surface-soft)]'}`}>{t(enabled ? 'settings.enabled' : 'settings.disabled')}</span><p className="max-w-xl text-sm leading-7 text-[var(--ac-text-soft)]">{t('settings.deviceHelp')}</p><div className="flex flex-wrap gap-3"><button disabled={busy} className={button} onClick={() => void toggleDevice()}>{t(enabled ? 'settings.disable' : 'settings.enable')}</button>{enabled && <button className={button} onClick={() => { try { showDeviceNotification(1); } catch { setError(t('settings.unsupported')); } }}>{t('settings.test')}</button>}</div></div>}
            {section === 'team' && <div className="grid gap-4"><Link href="/app/staff" className="rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-6"><strong>{t('staff.title')}</strong><p className="mt-2 text-sm text-[var(--ac-text-muted)]">{t('staff.subtitle')}</p></Link>{workspace.activeOrganization?.role === 'owner' && <Link href="/app/roles" className="rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-6"><strong>{t('staff.roles')}</strong><p className="mt-2 text-sm text-[var(--ac-text-muted)]">{t('staff.access')}</p></Link>}</div>}
            {section === 'personal' && <div className="space-y-6"><div className="flex gap-3">{(['ar', 'en'] as const).map((value) => <button key={value} aria-pressed={locale === value} className={`${button} ${locale === value ? 'ring-2 ring-[var(--ac-accent)]' : ''}`} onClick={() => setLocale(value)}>{locales[value].label}</button>)}</div><dl className="space-y-4 rounded-2xl bg-[var(--ac-surface-soft)] p-5 text-sm"><div><dt className="text-xs text-[var(--ac-text-muted)]">{t('settings.identity')}</dt><dd className="mt-2">{workspace.activeOrganization?.name}</dd></div><div><dt className="text-xs text-[var(--ac-text-muted)]">{t('settings.email')}</dt><dd className="mt-2 break-all"><bdi>{auth.user?.email}</bdi></dd></div></dl></div>}
        </section></div>
    </main></AppShell>;
}
