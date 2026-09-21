import {
    CustomerSegmentsPanel,
} from '@/components/dashboard/CustomerSegmentsPanel';
import {
    DailyBusinessBrief,
} from '@/components/dashboard/DailyBusinessBrief';
import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowUpRight,
    BadgeCheck,
    Banknote,
    Boxes,
    Building2,
    ClipboardCheck,
    ClipboardList,
    ContactRound,
    FilePlus2,
    Landmark,
    PackageSearch,
    Radar,
    ReceiptText,
    ShieldCheck,
    WalletCards,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type LucideIcon,
} from 'react';

type DashboardSignals = {
    approvals: number | null;
    unmatchedBank: number | null;
    reorderProducts: number | null;
    stockoutProducts: number | null;
};

type Shortcut = {
    title: string;
    description: string;
    href: string;
    icon: LucideIcon;
    visible: boolean;
};

export default function Dashboard() {
    const ar =
        useLocale() === 'ar';
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const organization =
        workspace.activeOrganization;

    const canViewCustomerIntelligence =
        organization?.permissions
            ? organization.permissions.includes('parties.view')
            : [
                'owner',
                'admin',
                'manager',
                'accountant',
            ].includes(
                organization?.role ?? '',
            );

    const [
        signals,
        setSignals,
    ] = useState<DashboardSignals>({
        approvals: null,
        unmatchedBank: null,
        reorderProducts: null,
        stockoutProducts: null,
    });

    useEffect(() => {
        if (! organization) {
            return;
        }

        let mounted =
            true;

        void Promise.allSettled([
            apiRequest<{
                data: Array<unknown>;
            }>(
                '/api/approval-requests?status=pending',
            ),
            apiRequest<{
                summary: {
                    unmatched: number;
                };
            }>(
                '/api/bank-reconciliation?status=unmatched',
            ),
            apiRequest<{
                data: {
                    summary: {
                        reorder_products: number;
                        stockout_30_days: number;
                    };
                };
            }>(
                '/api/inventory/intelligence',
            ),
        ]).then(
            results => {
                if (! mounted) {
                    return;
                }

                setSignals({
                    approvals:
                        results[0].status ===
                        'fulfilled'
                            ? results[0]
                                .value
                                .data
                                .length
                            : null,
                    unmatchedBank:
                        results[1].status ===
                        'fulfilled'
                            ? results[1]
                                .value
                                .summary
                                .unmatched
                            : null,
                    reorderProducts:
                        results[2].status ===
                        'fulfilled'
                            ? results[2]
                                .value
                                .data
                                .summary
                                .reorder_products
                            : null,
                    stockoutProducts:
                        results[2].status ===
                        'fulfilled'
                            ? results[2]
                                .value
                                .data
                                .summary
                                .stockout_30_days
                            : null,
                });
            },
        );

        return () => {
            mounted = false;
        };
    }, [
        organization?.id,
    ]);

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar ? arabic : english;

    const permissions =
        organization?.permissions;

    const builtinFinance =
        [
            'owner',
            'admin',
            'manager',
            'accountant',
        ].includes(
            organization?.role
            ?? '',
        );

    const canViewSales =
        permissions
            ? permissions.includes(
                'finance.sales.view',
            )
            : builtinFinance;
    const canManageSales =
        permissions
            ? permissions.includes(
                'finance.sales.manage',
            )
            : builtinFinance;
    const canViewPurchases =
        permissions
            ? permissions.includes(
                'finance.purchases.view',
            )
            : builtinFinance;
    const canViewCash =
        permissions
            ? permissions.includes(
                'finance.cash.view',
            )
            : builtinFinance;
    const canPayCash =
        permissions
            ? permissions.includes(
                'finance.cash.pay',
            )
            : builtinFinance;
    const canViewTaxes =
        permissions
            ? permissions.includes(
                'finance.taxes.view',
            )
            : builtinFinance;
    const canViewFinance =
        canViewSales
        || canViewPurchases
        || canViewCash
        || canViewTaxes;

    const canViewParties =
        permissions
            ? permissions.includes(
                'parties.view',
            )
            : true;
    const canCreateParties =
        permissions
            ? permissions.some(
                permission =>
                    [
                        'parties.manage',
                        'parties.create',
                    ].includes(
                        permission,
                    ),
            )
            : [
                'owner',
                'admin',
                'manager',
                'accountant',
            ].includes(
                organization?.role
                ?? '',
            );
    const canCreateProducts =
        permissions
            ? permissions.some(
                permission =>
                    [
                        'products.manage',
                        'products.create',
                    ].includes(
                        permission,
                    ),
            )
            : [
                'owner',
                'admin',
                'manager',
                'accountant',
            ].includes(
                organization?.role
                ?? '',
            );
    const canViewInventory =
        permissions
            ? permissions.includes(
                'inventory.view',
            )
            : true;
    const canManageInventory =
        permissions
            ? permissions.includes(
                'inventory.manage',
            )
            : [
                'owner',
                'admin',
                'manager',
            ].includes(
                organization?.role
                ?? '',
            );

    const shortcuts:
        Shortcut[] = [
        {
            title:
                text(
                    'مركز المالية',
                    'Finance command center',
                ),
            description:
                text(
                    'الفواتير، المقبوضات، المدفوعات، الضرائب وكل أدوات المالية.',
                    'Invoices, receipts, payments, tax and finance tools.',
                ),
            href:
                '/app/finance',
            visible:
                canViewFinance,
            icon:
                WalletCards,
        },
        {
            title:
                text(
                    'مركز الموافقات',
                    'Approval center',
                ),
            description:
                text(
                    'الفواتير عالية القيمة والخصومات والمدفوعات التي تنتظر قراراً.',
                    'High-value invoices, discounts and payments waiting for a decision.',
                ),
            href:
                '/app/finance/approvals',
            visible:
                canViewFinance,
            icon:
                ShieldCheck,
        },
        {
            title:
                text(
                    'المطابقة البنكية',
                    'Bank reconciliation',
                ),
            description:
                text(
                    'طابق كشف البنك مع المقبوضات والمدفوعات المسجلة.',
                    'Match bank statement lines with posted cash movements.',
                ),
            href:
                '/app/finance/bank-reconciliation',
            visible:
                canViewCash,
            icon:
                Landmark,
        },
        {
            title:
                text(
                    'طلبات الشراء',
                    'Purchase requisitions',
                ),
            description:
                text(
                    'طلب → اعتماد → تحويل لمسودة فاتورة شراء.',
                    'Request → approve → convert to a purchase invoice draft.',
                ),
            href:
                '/app/purchases/requisitions',
            visible:
                true,
            icon:
                ClipboardList,
        },
        {
            title:
                text(
                    'ذكاء المخزون',
                    'Inventory intelligence',
                ),
            description:
                text(
                    'راكد، إعادة طلب، توقع نفاد وعمر المخزون.',
                    'Dead stock, reorder, stockout forecasting and aging.',
                ),
            href:
                '/app/inventory/intelligence',
            visible:
                canViewInventory,
            icon:
                PackageSearch,
        },
        {
            title:
                text(
                    'تحويلات المستودعات',
                    'Warehouse transfers',
                ),
            description:
                text(
                    'طلب نقل بمراحل موافقة وشحن واستلام.',
                    'Controlled request, approval, shipment and receipt workflow.',
                ),
            href:
                '/app/inventory/transfers',
            visible:
                canManageInventory,
            icon:
                Boxes,
        },
        {
            title:
                text(
                    'ذكاء العملاء',
                    'Customer intelligence',
                ),
            description:
                text(
                    'VIP، معرض للفقد، متأخر بالدفع وعالي الربحية.',
                    'VIP, at-risk, overdue and high-profitability customers.',
                ),
            href:
                '/app/parties/intelligence',
            visible:
                canViewParties,
            icon:
                ContactRound,
        },
        {
            title:
                text(
                    'مركز الحالات الشاذة',
                    'Anomaly center',
                ),
            description:
                text(
                    'أسعار، أرصدة وحركات غير طبيعية تحتاج مراجعة.',
                    'Unusual prices, balances and transactions needing review.',
                ),
            href:
                '/app/finance/anomalies',
            visible:
                canViewFinance,
            icon:
                AlertTriangle,
        },
    ];

    return (
        <AppShell>
            <Head
                title={
                    t(
                        'ui.command_acconova',
                    )
                }
            />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10 2xl:px-10">
                <section className="relative overflow-hidden rounded-[28px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-panel)] sm:p-7 lg:p-9">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -end-20 -top-32 size-[26rem] rounded-full bg-[var(--ac-accent)]/[0.08] blur-[100px]"
                    />

                    <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-end">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="relative flex size-2.5">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--ac-accent)] opacity-35" />
                                    <span className="relative inline-flex size-2.5 rounded-full bg-[var(--ac-accent)]" />
                                </span>

                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ac-accent)]">
                                    {text(
                                        'Executive Command Center',
                                        'Executive Command Center',
                                    )}
                                </p>
                            </div>

                            <h1 className="mt-4 max-w-[920px] text-[clamp(2.3rem,5vw,4.9rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-[var(--ac-text)]">
                                {text(
                                    'كل قرار مهم، قدامك قبل ما تضيع بين الصفحات.',
                                    'Every important decision, surfaced before it gets buried.',
                                )}
                            </h1>

                            <p className="mt-5 max-w-[760px] text-sm leading-7 text-[var(--ac-text-soft)]">
                                {organization
                                    ? text(
                                        'لوحة تشغيل مباشرة لمساحة '
                                        + organization.name
                                        + ' تجمع المال، العملاء، المخزون والموافقات في نقطة واحدة.',
                                        'A live operating view for '
                                        + organization.name
                                        + ' bringing finance, customers, inventory and approvals into one command surface.',
                                    )
                                    : text(
                                        'اختر مساحة عمل لبدء عرض البيانات التشغيلية.',
                                        'Select a workspace to begin.',
                                    )}
                            </p>

                            <div className="mt-6 flex flex-wrap gap-2">
                                {canManageSales && (
                                <Link
                                    href="/app/invoices/sales/create"
                                    className="inline-flex h-11 items-center gap-2 rounded-[13px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-px"
                                >
                                    <FilePlus2
                                        size={14}
                                    />
                                    {text(
                                        'فاتورة بيع جديدة',
                                        'New sales invoice',
                                    )}
                                </Link>
                                )}

                                {canPayCash && (
                                <Link
                                    href="/app/payments/create"
                                    className="inline-flex h-11 items-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-accent)]"
                                >
                                    <Banknote
                                        size={14}
                                    />
                                    {text(
                                        'تسجيل دفعة',
                                        'Record payment',
                                    )}
                                </Link>
                                )}

                                {canCreateParties && (
                                <Link
                                    href="/app/parties?create=1"
                                    className="inline-flex h-11 items-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-accent)]"
                                >
                                    <ContactRound
                                        size={14}
                                    />
                                    {text(
                                        'إضافة عميل/مورد',
                                        'Add customer/supplier',
                                    )}
                                </Link>
                                )}

                                {canCreateProducts && (
                                <Link
                                    href="/app/products?create=1"
                                    className="inline-flex h-11 items-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 text-xs font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-accent)]"
                                >
                                    <Boxes
                                        size={14}
                                    />
                                    {text(
                                        'إضافة منتج',
                                        'Add product',
                                    )}
                                </Link>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {[
                                {
                                    label:
                                        text(
                                            'موافقات معلقة',
                                            'Pending approvals',
                                        ),
                                    value:
                                        signals.approvals,
                                    icon:
                                        ClipboardCheck,
                                    href:
                                        '/app/finance/approvals',
                                    visible:
                                        canViewFinance,
                                },
                                {
                                    label:
                                        text(
                                            'بنود بنك غير مطابقة',
                                            'Unmatched bank lines',
                                        ),
                                    value:
                                        signals.unmatchedBank,
                                    icon:
                                        Landmark,
                                    href:
                                        '/app/finance/bank-reconciliation',
                                    visible:
                                        canViewCash,
                                },
                                {
                                    label:
                                        text(
                                            'منتجات لإعادة الطلب',
                                            'Products to reorder',
                                        ),
                                    value:
                                        signals.reorderProducts,
                                    icon:
                                        PackageSearch,
                                    href:
                                        '/app/inventory/intelligence',
                                    visible:
                                        canViewInventory,
                                },
                                {
                                    label:
                                        text(
                                            'خطر نفاد ≤ 30 يوم',
                                            'Stockout ≤ 30 days',
                                        ),
                                    value:
                                        signals.stockoutProducts,
                                    icon:
                                        AlertTriangle,
                                    href:
                                        '/app/inventory/intelligence',
                                    visible:
                                        canViewInventory,
                                },
                            ].filter(
                                card =>
                                    card.visible,
                            ).map(
                                card => {
                                    const Icon =
                                        card.icon;

                                    return (
                                        <Link
                                            key={
                                                card.label
                                            }
                                            href={
                                                card.href
                                            }
                                            className="group rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--ac-accent)]"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <Icon
                                                    size={15}
                                                    className="text-[var(--ac-accent)]"
                                                />
                                                <ArrowUpRight
                                                    size={13}
                                                    className="text-[var(--ac-text-muted)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                                                />
                                            </div>

                                            <strong className="mt-4 block text-2xl tracking-[-0.04em] text-[var(--ac-text)]">
                                                {card.value ===
                                                null
                                                    ? '—'
                                                    : card.value}
                                            </strong>

                                            <span className="mt-1 block text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                                {
                                                    card.label
                                                }
                                            </span>
                                        </Link>
                                    );
                                },
                            )}
                        </div>
                    </div>
                </section>

                <section className="mt-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ac-accent)]">
                                {text(
                                    'Operating Workspaces',
                                    'Operating Workspaces',
                                )}
                            </p>
                            <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[var(--ac-text)]">
                                {text(
                                    'الوصول المباشر للأدوات المهمة',
                                    'Direct access to critical workspaces',
                                )}
                            </h2>
                        </div>

                        <Radar
                            size={20}
                            className="text-[var(--ac-accent)]"
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {shortcuts
                            .filter(
                                shortcut =>
                                    shortcut.visible,
                            )
                            .map(
                            shortcut => {
                                const Icon =
                                    shortcut.icon;

                                return (
                                    <Link
                                        key={
                                            shortcut.href
                                        }
                                        href={
                                            shortcut.href
                                        }
                                        className="group min-h-[170px] rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-1 hover:border-[var(--ac-accent)] hover:shadow-[var(--ac-shadow-panel)]"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                                <Icon
                                                    size={16}
                                                />
                                            </div>

                                            <ArrowUpRight
                                                size={14}
                                                className="text-[var(--ac-text-muted)] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--ac-accent)]"
                                            />
                                        </div>

                                        <h3 className="mt-5 text-sm font-bold text-[var(--ac-text)]">
                                            {
                                                shortcut.title
                                            }
                                        </h3>

                                        <p className="mt-2 text-[11px] leading-5 text-[var(--ac-text-muted)]">
                                            {
                                                shortcut.description
                                            }
                                        </p>
                                    </Link>
                                );
                            },
                        )}
                    </div>
                </section>

                <DailyBusinessBrief
                    ar={ar}
                />

                {organization
                    && canViewParties && (
                    <CustomerSegmentsPanel
                        ar={ar}
                        currency={
                            organization.currency
                            ?? ''
                        }
                    />
                )}

                <section className="mt-5 grid gap-3 lg:grid-cols-3">
                    {canViewParties && (
                    <Link
                        href="/app/follow-ups"
                        className="flex items-center gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 transition hover:border-[var(--ac-accent)]"
                    >
                        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <Building2
                                size={16}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <strong className="text-xs text-[var(--ac-text)]">
                                {text(
                                    'طابور متابعة العملاء',
                                    'Customer follow-up queue',
                                )}
                            </strong>
                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                {text(
                                    'مين لازم تتواصل معه اليوم؟',
                                    'Who needs contact today?',
                                )}
                            </p>
                        </div>
                        <ArrowUpRight
                            size={14}
                        />
                    </Link>
                    )}

                    {canViewFinance && (
                    <Link
                        href="/app/finance/cashflow"
                        className="flex items-center gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 transition hover:border-[var(--ac-accent)]"
                    >
                        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <ReceiptText
                                size={16}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <strong className="text-xs text-[var(--ac-text)]">
                                {text(
                                    'تقويم التدفق النقدي',
                                    'Cashflow calendar',
                                )}
                            </strong>
                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                {text(
                                    'المتوقع دخوله وخروجه حسب الاستحقاق.',
                                    'Expected inflows and outflows by due date.',
                                )}
                            </p>
                        </div>
                        <ArrowUpRight
                            size={14}
                        />
                    </Link>
                    )}

                    {canViewFinance && (
                    <Link
                        href="/app/finance"
                        className="flex items-center gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 transition hover:border-[var(--ac-accent)]"
                    >
                        <div className="flex size-10 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <BadgeCheck
                                size={16}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <strong className="text-xs text-[var(--ac-text)]">
                                {text(
                                    'كل المالية',
                                    'All finance',
                                )}
                            </strong>
                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                {text(
                                    'Hub واحد لكل مساحات المالية.',
                                    'One hub for every finance workspace.',
                                )}
                            </p>
                        </div>
                        <ArrowUpRight
                            size={14}
                        />
                    </Link>
                    )}
                </section>
            </main>
        </AppShell>
    );
}
