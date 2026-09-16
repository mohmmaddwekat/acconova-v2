import { apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import { Link, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';

export function PaymentReminders() {
    useLocale();
    const { workspace } = usePage<AppPageProps>().props;
    const organization = workspace.activeOrganization;
    const enabled = ['owner', 'admin', 'manager', 'accountant'].includes(organization?.role ?? '');
    const [reminder, setReminder] = useState<{ count: number; url: string } | null>(null);
    useEffect(() => {
        let active = true;
        setReminder(null);
        if (!enabled || !organization) { return; }
        const refresh = () => {
            apiRequest<{ count: number; url: string }>('/api/payment-plans/reminders')
                .then((result) => { if (active) { setReminder(result); } })
                .catch(() => { if (active) { setReminder(null); } });
        };
        refresh();
        const interval = setInterval(refresh, 60000);
        window.addEventListener('payment-plans-changed', refresh);
        return () => { active = false; clearInterval(interval); window.removeEventListener('payment-plans-changed', refresh); };
    }, [organization?.id, enabled]);
    if (!enabled || !reminder?.count) { return null; }
    return <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
        <span>{t('payments.reminder', { count: reminder.count })}</span>
        <Link href={reminder.url} className="font-semibold underline underline-offset-4">{t('payments.view')}</Link>
    </div>;
}
