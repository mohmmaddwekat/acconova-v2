import { deliverDeviceNotification, deviceKey } from '@/lib/deviceNotifications';
import { apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import { Link, router, usePage } from '@inertiajs/react';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type UnreadNotice = {
    id: number;
    kind: string;
    data: { name: string; detail?: string; amount?: string };
    url: string;
    created_at: string;
};

const PREVIEW_LIMIT = 5;

export function NotificationBell() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const { workspace, auth } = usePage<AppPageProps>().props;
    const organizationId = workspace.activeOrganization?.id;
    const rootRef = useRef<HTMLDivElement>(null);
    const [state, setState] = useState({ organizationId: 0, count: 0 });
    const [toast, setToast] = useState<number | null>(null);
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<UnreadNotice[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);

    function loadUnread(): void {
        setLoading(true);
        apiRequest<{ data: UnreadNotice[] }>(`/api/notifications?page=1&per_page=${PREVIEW_LIMIT}&unread=1`)
            .then(response => setItems(response.data))
            .catch(() => undefined)
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        if (!organizationId) { return; }
        let active = true;
        let latestSeen: number | null = null;
        const refresh = () => {
            apiRequest<{ count: number; latest_id: number | null }>('/api/notifications/count')
                .then(({ count, latest_id }) => { if (active) {
                    setState({ organizationId, count });
                    if (latestSeen !== null && latest_id && latest_id > latestSeen && count > 0) { setToast(organizationId); }
                    latestSeen = Math.max(latestSeen ?? 0, latest_id ?? 0);
                    if (auth.user) { deliverDeviceNotification(deviceKey(auth.user.id, organizationId), count, latest_id ?? 0); }
                } })
                .catch(() => { if (active) { setState({ organizationId, count: 0 }); } });
        };
        refresh();
        const timer = setInterval(() => { if (!document.hidden) { refresh(); } }, 8000);
        window.addEventListener('notifications-changed', refresh);
        window.addEventListener('payment-plans-changed', refresh);
        return () => { active = false; clearInterval(timer); window.removeEventListener('notifications-changed', refresh); window.removeEventListener('payment-plans-changed', refresh); };
    }, [organizationId, auth.user?.id]);

    useEffect(() => {
        if (!open) { return; }
        const handleOutside = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) { setOpen(false); }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setOpen(false); }
        };
        document.addEventListener('mousedown', handleOutside);
        window.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    async function markRead(notice?: UnreadNotice): Promise<void> {
        if (busy) { return; }
        setBusy(true);
        try {
            await apiRequest(
                notice ? `/api/notifications/${notice.id}/read` : '/api/notifications/read-all',
                { method: notice ? 'PATCH' : 'POST' },
            );
            window.dispatchEvent(new Event('notifications-changed'));
            if (notice) {
                setOpen(false);
                router.visit(notice.url);
            } else {
                setItems([]);
            }
        } catch {
            // The next count refresh restores the true state.
        } finally {
            setBusy(false);
        }
    }

    if (!organizationId) { return null; }
    const count = state.organizationId === organizationId ? state.count : 0;
    return <><div ref={rootRef} className="relative">
        <button
            type="button"
            aria-label={count ? t('notifications.count', { count }) : t('notifications.title')}
            onClick={() => {
                setOpen(current => !current);
                if (!open) { loadUnread(); }
            }}
            className={['relative flex size-10 items-center justify-center rounded-xl border bg-[var(--ac-surface)] transition', open ? 'border-[var(--ac-accent)] text-[var(--ac-accent-strong)] ring-4 ring-[var(--ac-accent-soft)]' : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-accent-soft)]'].join(' ')}
        >
            <Bell size={18} />{count > 0 && <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-[var(--ac-accent-strong)] px-1 text-center text-[9px] font-bold leading-4 text-white">{count > 99 ? '99+' : count}</span>}
        </button>

        {open && <div className="fixed inset-x-3 top-[4.6rem] z-[120] overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[0_24px_70px_rgba(15,35,30,.18)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-[calc(100%+0.75rem)] sm:w-[410px]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--ac-line)] p-4">
                <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"><Bell size={18} /></div>
                    <div>
                        <div className="flex items-center gap-2">
                            <strong className="text-sm">{t('notifications.title')}</strong>
                            {count > 0 && <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--ac-accent-strong)]">{count}</span>}
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">{ar ? 'آخر التنبيهات غير المقروءة' : 'Latest unread notifications'}</p>
                    </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-[11px] bg-[var(--ac-bg-soft)]"><X size={14} /></button>
            </div>

            <div className="max-h-[430px] overflow-y-auto p-2">
                {loading && items.length === 0 && <div className="p-10 text-center text-xs text-[var(--ac-text-muted)]">…</div>}
                {!loading && items.length === 0 && <div className="p-10 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"><Bell size={22} /></div>
                    <p className="mt-3 text-xs font-semibold">{ar ? 'لا توجد تنبيهات غير مقروءة' : 'No unread notifications'}</p>
                </div>}
                {items.map(notice => <button
                    key={notice.id}
                    type="button"
                    onClick={() => void markRead(notice)}
                    className="flex w-full items-center gap-3 rounded-[17px] p-3 text-start transition hover:bg-[var(--ac-surface-soft)]"
                >
                    <span className="size-2.5 shrink-0 rounded-full bg-[var(--ac-accent-strong)]" />
                    <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs font-bold">{notice.data.name}</strong>
                        {notice.data.detail && <span className="mt-1 block truncate text-[10px] text-[var(--ac-text-muted)]">{notice.data.detail}</span>}
                    </span>
                </button>)}
            </div>

            <div className="flex gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
                <Link
                    href="/app/notifications"
                    onClick={() => setOpen(false)}
                    className="flex h-11 flex-1 items-center justify-center rounded-[14px] bg-[var(--ac-text)] text-xs font-semibold text-white transition hover:-translate-y-px"
                >
                    {ar ? 'عرض الكل' : 'View all'}
                </Link>
                <button
                    type="button"
                    disabled={busy || count === 0}
                    onClick={() => void markRead()}
                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 text-xs font-semibold transition hover:bg-[var(--ac-accent-soft)] disabled:opacity-50"
                >
                    <CheckCheck size={14} />{t('notifications.readAll')}
                </button>
            </div>
        </div>}
    </div>{toast === organizationId && count > 0 && <div role="status" className="fixed end-4 top-20 z-50 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-[var(--ac-surface)] p-4 shadow-xl"><Link href="/app/notifications" onClick={() => setToast(null)} className="text-sm text-emerald-800">{t('notifications.count', { count })}</Link><button type="button" onClick={() => setToast(null)} aria-label="Close / إغلاق" className="rounded-full px-2 py-1">×</button></div>}</>;
}
