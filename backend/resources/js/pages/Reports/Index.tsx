import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import type { AppPageProps } from '@/types/app';
import {
    ArrowRight,
    ReceiptText,
    ShoppingCart,
} from 'lucide-react';

export default function ReportsIndex() {
    const ar = useLocale() === 'ar';
    const activeOrganization =
        usePage<AppPageProps>().props.workspace
            .activeOrganization;
    const customPermissions =
        activeOrganization?.permissions;
    const builtInFinanceAccess = [
        'owner',
        'admin',
        'manager',
        'accountant',
    ].includes(
        activeOrganization?.role
        ?? '',
    );

    const canViewSales = customPermissions
        ? customPermissions.includes(
            'finance.sales.view',
        )
        : builtInFinanceAccess;

    const canViewPurchases = customPermissions
        ? customPermissions.includes(
            'finance.purchases.view',
        )
        : builtInFinanceAccess;

    const reports = [
        {
            title:
                ar
                    ? 'أعمار الذمم المدينة'
                    : 'A/R aging report',
            description:
                ar
                    ? 'أرصدة العملاء المستحقة موزعة إلى 0–30، 31–60، 61–90، وأكثر من 90 يوماً.'
                    : 'Customer receivables grouped into 0–30, 31–60, 61–90 and 90+ day buckets.',
            href: '/app/reports/ar-aging',
            icon: ReceiptText,
            visible: canViewSales,
        },
        {
            title:
                ar
                    ? 'أعمار الذمم الدائنة'
                    : 'A/P aging report',
            description:
                ar
                    ? 'مستحقات الموردين موزعة حسب عمر الاستحقاق لتحديد ما يجب دفعه أولاً.'
                    : 'Supplier payables grouped by aging bucket to show what should be paid first.',
            href: '/app/reports/ap-aging',
            icon: ShoppingCart,
            visible: canViewPurchases,
        },
    ];

    return (
        <AppShell>
            <Head title={ar ? 'التقارير' : 'Reports'} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                        Reports
                    </p>

                    <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                        {ar ? 'التقارير المالية' : 'Financial reports'}
                    </h1>

                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                        {ar
                            ? 'تقارير تشغيلية مباشرة من الفواتير والأرصدة الفعلية داخل مساحة العمل.'
                            : 'Operational reports calculated directly from live invoices and balances in the workspace.'}
                    </p>
                </section>

                <section className="mt-5 grid gap-4 md:grid-cols-2">
                    {reports
                        .filter(report => report.visible)
                        .map(report => {
                        const Icon = report.icon;

                        return (
                            <Link
                                key={report.href}
                                href={report.href}
                                className="group rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)]"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-accent)]">
                                        <Icon size={19} />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <h2 className="font-bold text-[var(--ac-text)]">
                                            {report.title}
                                        </h2>

                                        <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                            {report.description}
                                        </p>

                                        <span className="mt-4 inline-flex items-center gap-2 text-[10px] font-semibold text-[var(--ac-accent)]">
                                            {ar ? 'فتح التقرير' : 'Open report'}
                                            <ArrowRight
                                                size={12}
                                                className={ar ? 'rotate-180' : ''}
                                            />
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </section>
            </main>
        </AppShell>
    );
}
