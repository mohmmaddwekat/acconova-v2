import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import type { AppPageProps } from '@/types/app';
import { Head, router, usePage } from '@inertiajs/react';
import { Bell, Check, CheckCheck, CalendarClock, Package, CircleCheck, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';

type Notice = {
    id: number; kind: 'low_stock' | 'out_of_stock' | 'production' | 'service' | 'payment_due' | 'payment_soon' | 'payment_recorded';
    category: 'stock' | 'payments' | 'activity'; data: { name: string; detail?: string; amount?: string };
    url: string; read_at: string | null; created_at: string;
};
const button = 'rounded-xl border border-[var(--ac-line)] bg-white px-3 py-2 text-xs transition hover:bg-[var(--ac-surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ac-accent)] disabled:opacity-50';
export default function Notifications() {
    const { workspace } = usePage<AppPageProps>().props;
    return <NotificationWorkspace key={workspace.activeOrganization?.id ?? 'none'} />;
}
function NotificationWorkspace() {
    useLocale();
    const [unread, setUnread] = useState(false);
    const [category, setCategory] = useState('');
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{ data: Notice[]; meta: { last_page: number; total: number } } | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError('');
        apiRequest<NonNullable<typeof result>>(`/api/notifications?page=${page}&unread=${unread ? 1 : 0}${category ? `&category=${category}` : ''}`, { signal: controller.signal })
            .then(setResult).catch((failure: unknown) => { if (!controller.signal.aborted) { setError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed')); } })
            .finally(() => { if (!controller.signal.aborted) { setLoading(false); } });
        return () => controller.abort();
    }, [unread, category, page, revision]);
    async function read(notice?: Notice, open = false): Promise<void> {
        if (busy) { return; } setBusy(true); setError('');
        try {
            await apiRequest(notice ? `/api/notifications/${notice.id}/read` : '/api/notifications/read-all', { method: notice ? 'PATCH' : 'POST' });
            window.dispatchEvent(new Event('notifications-changed'));
            if (open && notice) { router.visit(notice.url); } else { setRevision((value) => value + 1); }
        } catch (failure) { setError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed')); }
        finally { setBusy(false); }
    }
    return <AppShell><Head title={t('notifications.title')} /><main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-br from-white via-white to-[var(--ac-accent-soft)] p-6 shadow-sm sm:p-9"><div className="flex items-center gap-4"><div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"><Bell size={25} /></div><div><h1 className="text-3xl font-semibold tracking-tight">{t('notifications.title')}</h1><p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">{t('notifications.help')}</p></div></div><button disabled={busy || loading || !result?.data.length} onClick={() => void read()} className={`${button} flex items-center gap-2`}><CheckCheck size={15} />{t('notifications.readAll')}</button></header>
        <div className="my-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--ac-line)] bg-white p-4"><div className="flex gap-1 rounded-xl bg-[var(--ac-surface-soft)] p-1">{[false, true].map((value) => <button key={String(value)} aria-pressed={unread === value} onClick={() => { setUnread(value); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm ${unread === value ? 'bg-[var(--ac-text)] font-semibold text-white shadow-sm' : 'text-[var(--ac-text-muted)]'}`}>{t(value ? 'notifications.unread' : 'notifications.all')}</button>)}</div><div className="flex flex-wrap gap-2">{(['', 'stock', 'payments', 'activity'] as const).map((value) => { const Icon = value === 'stock' ? Package : value === 'payments' ? CalendarClock : value === 'activity' ? CircleCheck : Bell; return <button key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setPage(1); }} className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs transition ${category === value ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] font-semibold text-[var(--ac-accent-strong)]' : 'border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]'}`}><Icon size={14} />{t(value ? `notifications.${value}` : 'notifications.all')}</button>; })}</div></div>
        {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button className={button} onClick={() => setRevision((value) => value + 1)}>{t('catalog.operations.retry')}</button></div>}
        {loading ? <p role="status" className="py-12 text-center text-sm">{t('catalog.operations.loading')}</p> : error ? null : !result?.data.length ? <div className="rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-b from-white to-[var(--ac-surface-soft)] px-6 py-20 text-center"><CircleCheck className="mx-auto box-content rounded-full bg-[var(--ac-accent-soft)] p-6 text-[var(--ac-accent-strong)]" size={40} /><h2 className="mt-5 font-semibold">{t('notifications.empty')}</h2><p className="mt-2 text-sm text-[var(--ac-text-muted)]">{t('notifications.emptyHelp')}</p></div> : <ul className="space-y-3">{result.data.map((notice) => {
            const Icon = notice.category === 'stock' ? Package : notice.category === 'payments' ? CalendarClock : CircleCheck;
            return <li key={notice.id} className={`rounded-2xl border bg-white p-5 transition hover:shadow-md sm:p-6 ${notice.read_at ? 'border-[var(--ac-line)]' : 'border-[var(--ac-accent)]/35 shadow-sm'}`}><div className="flex items-start gap-3 sm:gap-4"><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${notice.category === 'stock' ? 'bg-amber-50 text-amber-700' : 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'}`}><Icon size={19} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold">{!notice.read_at && <span className="size-2 shrink-0 rounded-full bg-[var(--ac-accent)]" />}{t(`notifications.kind.${notice.kind}`)}</h2><time dateTime={notice.created_at} className="text-[11px] text-[var(--ac-text-muted)]">{new Date(notice.created_at).toLocaleString(getLocale())}</time></div><p className="mt-2 break-words text-sm">{notice.data.name}</p>{notice.data.detail && <p className="mt-1 break-words text-xs text-[var(--ac-text-muted)]">{notice.data.detail}</p>}{notice.data.amount && <p className="mt-2 text-sm font-medium"><bdi>{notice.data.amount}</bdi></p>}<div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} className={`${button} flex items-center gap-1`} onClick={() => void read(notice, true)}>{t('notifications.open')}<ArrowUpRight size={14} /></button>{!notice.read_at && <button disabled={busy} className={`${button} flex items-center gap-1`} onClick={() => void read(notice)}><Check size={14} />{t('notifications.read')}</button>}</div></div></div></li>;
        })}</ul>}
        {!error && result && result.meta.last_page > 1 && <div className="mt-6 flex items-center justify-between"><button className={button} disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>{t('catalog.operations.previous')}</button><span className="text-xs">{page} / {result.meta.last_page}</span><button className={button} disabled={loading || page >= result.meta.last_page} onClick={() => setPage((value) => value + 1)}>{t('catalog.operations.next')}</button></div>}
    </main></AppShell>;
}
