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
    useEffect(() => {
        if (!organizationId) { return; }
        let active = true;
        const refresh = () => {
            apiRequest<{ count: number; latest_id: number | null }>('/api/notifications/count')
                .then(({ count, latest_id }) => { if (active) { setState({ organizationId, count }); if (auth.user) { deliverDeviceNotification(deviceKey(auth.user.id, organizationId), count, latest_id ?? 0); } } })
                .catch(() => { if (active) { setState({ organizationId, count: 0 }); } });
        };
        refresh();
        const timer = setInterval(refresh, 60000);
        window.addEventListener('notifications-changed', refresh);
        window.addEventListener('payment-plans-changed', refresh);
        return () => { active = false; clearInterval(timer); window.removeEventListener('notifications-changed', refresh); window.removeEventListener('payment-plans-changed', refresh); };
    }, [organizationId, auth.user?.id]);
    if (!organizationId) { return null; }
    const count = state.organizationId === organizationId ? state.count : 0;
    return <Link href="/app/notifications" aria-label={count ? t('notifications.count', { count }) : t('notifications.title')} className="relative flex size-10 items-center justify-center rounded-xl border border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-accent-soft)]">
        <Bell size={18} />{count > 0 && <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-[var(--ac-accent-strong)] px-1 text-center text-[9px] font-bold leading-4 text-white">{count > 99 ? '99+' : count}</span>}
    </Link>;
}
