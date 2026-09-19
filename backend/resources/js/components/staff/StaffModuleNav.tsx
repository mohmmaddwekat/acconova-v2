import {
    Link,
    usePage,
} from '@inertiajs/react';
import {
    BarChart3,
    CalendarDays,
    FileSpreadsheet,
    LayoutDashboard,
    UsersRound,
    WalletCards,
} from 'lucide-react';

import {
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';

type Item = {
    href: string;
    labelAr: string;
    labelEn: string;
    icon: typeof LayoutDashboard;
};

const items: Item[] = [
    {
        href: '/app/staff',
        labelAr: 'نظرة عامة',
        labelEn: 'Overview',
        icon: LayoutDashboard,
    },
    {
        href: '/app/staff/directory',
        labelAr: 'دليل الموظفين',
        labelEn: 'Directory',
        icon: UsersRound,
    },
    {
        href: '/app/staff/attendance',
        labelAr: 'الحضور والدوام',
        labelEn: 'Attendance',
        icon: CalendarDays,
    },
    {
        href: '/app/staff/payroll',
        labelAr: 'الرواتب والمستحقات',
        labelEn: 'Payroll',
        icon: WalletCards,
    },
    {
        href: '/app/staff/insights',
        labelAr: 'تحليلات الموظفين',
        labelEn: 'People insights',
        icon: BarChart3,
    },
    {
        href: '/app/staff/import',
        labelAr: 'استيراد البيانات',
        labelEn: 'Import data',
        icon: FileSpreadsheet,
    },
];

/**
 * Shared navigation for the employee/HR workspace.
 */
export function StaffModuleNav() {
    const ar =
        useLocale() ===
        'ar';

    const {
        url,
        props,
    } =
        usePage<AppPageProps>();

    const organization =
        props.workspace.activeOrganization;

    const canImport =
        organization?.role === 'owner'
        || organization?.role === 'admin'
        || organization?.permissions?.includes(
            'staff.import',
        );

    return (
        <nav
            aria-label={ar ? 'صفحات الموظفين' : 'Employee pages'}
            className="overflow-x-auto rounded-[18px] border border-[var(--ac-line)] bg-white p-1.5"
        >
            <div className="flex min-w-max items-center gap-1">
                {items
                    .filter(
                        (item: Item) =>
                            item.href !== '/app/staff/import'
                            || canImport,
                    )
                    .map((item: Item) => {
                    const Icon =
                        item.icon;

                    const active =
                        item.href ===
                            '/app/staff'
                            ? url ===
                                '/app/staff'
                            : url.startsWith(
                                item.href,
                            );

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={[
                                'inline-flex min-h-10 items-center gap-2 rounded-[13px] px-4 text-xs font-semibold transition',
                                active
                                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] shadow-sm'
                                    : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]',
                            ].join(' ')}
                        >
                            <Icon
                                size={
                                    15
                                }
                            />

                            {ar
                                ? item.labelAr
                                : item.labelEn}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
