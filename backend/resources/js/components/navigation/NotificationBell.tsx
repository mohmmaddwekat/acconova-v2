import { deliverDeviceNotification, deviceKey } from '@/lib/deviceNotifications';
import { apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import { Link, usePage } from '@inertiajs/react';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';

export function NotificationBell() {
    useLocale();
    const { workspace, auth } = usePage<AppPageProps>().props;
    const organizationId = workspace.activeOrganization?.id;
    const [state, setState] = useState({ organizationId: 0, count: 0 });
    const [toast, setToast] = useState<number | null>(null);
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
        const timer = setInterval(refresh, 8000);
        window.addEventListener('notifications-changed', refresh);
        window.addEventListener('payment-plans-changed', refresh);
        return () => { active = false; clearInterval(timer); window.removeEventListener('notifications-changed', refresh); window.removeEventListener('payment-plans-changed', refresh); };
    }, [organizationId, auth.user?.id]);
    if (!organizationId) { return null; }
    const count = state.organizationId === organizationId ? state.count : 0;
    return <><Link href="/app/notifications" aria-label={count ? t('notifications.count', { count }) : t('notifications.title')} className="relative flex size-10 items-center justify-center rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-accent-soft)]">
        <Bell size={18} />{count > 0 && <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-[var(--ac-accent-strong)] px-1 text-center text-[9px] font-bold leading-4 text-white">{count > 99 ? '99+' : count}</span>}
    </Link>{toast === organizationId && count > 0 && <div role="status" className="fixed end-4 top-20 z-50 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-[var(--ac-surface)] p-4 shadow-xl"><Link href="/app/notifications" onClick={() => setToast(null)} className="text-sm text-emerald-800">{t('notifications.count', { count })}</Link><button type="button" onClick={() => setToast(null)} aria-label="Close / إغلاق" className="rounded-full px-2 py-1">×</button></div>}</>;
}
