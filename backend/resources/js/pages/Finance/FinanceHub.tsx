import { Link } from '@inertiajs/react';
import {
    AlertTriangle,
    Banknote,
    CalendarDays,
    ClipboardCheck,
    ClipboardList,
    FileSpreadsheet,
    HandCoins,
    Landmark,
    ReceiptText,
    Scale,
    ShoppingCart,
    WalletCards,
} from 'lucide-react';
import { FPanel, FinanceHeader } from './shared';
import type { FinanceLookups } from './types';

type HubCard = {
    title: string;
    description: string;
    href: string;
    icon: typeof ReceiptText;
    visible: boolean;
};

export function FinanceHub({
    lookups,
    ar,
}: {
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const cards: HubCard[] = [
        {
            title: text('فواتير البيع', 'Sales invoices'),
            description: text(
                'إنشاء ومتابعة فواتير العملاء والتحصيلات المرتبطة بها.',
                'Create and follow customer invoices and their collections.',
            ),
            href: '/app/invoices',
            icon: ReceiptText,
            visible: lookups.permissions.sales_view,
        },
        {
            title: text('فواتير الشراء', 'Purchase invoices'),
            description: text(
                'مشتريات الموردين والأسعار المؤقتة والتعديلات الموثقة.',
                'Supplier purchases, provisional prices and traceable corrections.',
            ),
            href: '/app/invoices/purchases',
            icon: ShoppingCart,
            visible: lookups.permissions.purchases_view,
        },
        {
            title: text('المقبوضات', 'Receipts'),
            description: text(
                'تحصيل فواتير، دفعات مقدمة، أرصدة عملاء وشيكات.',
                'Invoice collections, advances, customer credits and checks.',
            ),
            href: '/app/receipts',
            icon: HandCoins,
            visible: lookups.permissions.cash_view,
        },
        {
            title: text('المدفوعات', 'Payments'),
            description: text(
                'سداد الموردين والمصاريف والتحويلات والشيكات، ومن داخلها المدفوعات المتكررة.',
                'Supplier settlements, expenses, transfers, checks, and recurring payments inside the same area.',
            ),
            href: lookups.permissions.cash_view
                ? '/app/payments'
                : '/app/payments/recurring',
            icon: Banknote,
            visible: lookups.permissions.cash_view
                || lookups.permissions.recurring_payments_view,
        },
        {
            title: text('دفعات غير مخصصة', 'Unallocated payments'),
            description: text(
                'دفعات دخلت أو خرجت وبقي منها مبلغ غير مربوط بفاتورة.',
                'Posted receipts or payments with an amount still not allocated to an invoice.',
            ),
            href: '/app/finance/unallocated',
            icon: WalletCards,
            visible: lookups.permissions.cash_view,
        },
        {
            title: text('لوحة التحصيل', 'Collections dashboard'),
            description: text(
                'العملاء المتأخرون ومن يجب التواصل معه اليوم وقيمة التحصيل المتوقعة.',
                'Overdue customers, today\'s collection calls and expected cash recovery.',
            ),
            href: '/app/finance/collections',
            icon: HandCoins,
            visible: lookups.permissions.sales_view,
        },
        {
            title: text('أعمار الذمم المدينة', 'A/R aging'),
            description: text(
                'أرصدة العملاء حسب 0–30 و31–60 و61–90 وأكثر من 90 يوماً.',
                'Customer receivables grouped into standard aging buckets.',
            ),
            href: '/app/reports/ar-aging',
            icon: ReceiptText,
            visible: lookups.permissions.sales_view,
        },
        {
            title: text('أعمار الذمم الدائنة', 'A/P aging'),
            description: text(
                'مستحقات الموردين حسب عمر الاستحقاق.',
                'Supplier payables grouped by aging bucket.',
            ),
            href: '/app/reports/ap-aging',
            icon: ShoppingCart,
            visible: lookups.permissions.purchases_view,
        },
        {
            title: text('عروض الأسعار', 'Quotations'),
            description: text(
                'عرض سعر مستقل يتحول إلى فاتورة بيع بدون إعادة الإدخال.',
                'Create quotations and convert accepted ones into sales invoice drafts.',
            ),
            href: '/app/sales/quotations',
            icon: FileSpreadsheet,
            visible: lookups.permissions.sales_view,
        },
        {
            title: text('الفاتورة المبدئية', 'Proforma invoices'),
            description: text(
                'مستند مبدئي لا يؤثر محاسبياً حتى يتم تحويله إلى فاتورة.',
                'Non-accounting proforma documents that convert into sales invoices.',
            ),
            href: '/app/sales/proforma',
            icon: ReceiptText,
            visible: lookups.permissions.sales_view,
        },
        {
            title: text('أوامر البيع', 'Sales orders'),
            description: text(
                'تتبع الطلب والتسليم الجزئي والكميات المؤجلة ثم الفوترة.',
                'Track ordered, delivered, backordered and invoiced quantities.',
            ),
            href: '/app/sales/orders',
            icon: ClipboardList,
            visible: lookups.permissions.sales_view,
        },
        {
            title: text('أوامر الشراء', 'Purchase orders'),
            description: text(
                'تتبع ما تم طلبه من المورد وما استلم وما تمت فوترته.',
                'Track ordered, received and invoiced supplier quantities.',
            ),
            href: '/app/purchases/orders',
            icon: ShoppingCart,
            visible: lookups.permissions.purchases_view,
        },
        {
            title: text('الطلبات المؤجلة', 'Backorders'),
            description: text(
                'الكميات التي طلبها العملاء ولم يتم تسليمها بعد.',
                'Customer order quantities that are still waiting for delivery.',
            ),
            href: '/app/sales/backorders',
            icon: AlertTriangle,
            visible: lookups.permissions.sales_view,
        },
        {
            title: text('المرتجعات / RMA', 'Returns / RMA'),
            description: text(
                'مرتجعات بيع وشراء مرتبطة بالفاتورة الأصلية مع السبب والحالة.',
                'Track sales and purchase returns against their source invoice.',
            ),
            href: '/app/returns',
            icon: ClipboardCheck,
            visible: lookups.permissions.sales_view
                || lookups.permissions.purchases_view,
        },
        {
            title: text('نقل البيانات القديمة', 'Import legacy data'),
            description: text(
                'نزّل نموذج Excel وانقل فواتير البيع والشراء والدفعات والمصاريف من النظام القديم.',
                'Download an Excel template and move legacy invoices, payments and expenses into AccoNova.',
            ),
            href: '/app/finance/import',
            icon: FileSpreadsheet,
            visible: lookups.permissions.sales_manage
                || lookups.permissions.purchases_manage
                || lookups.permissions.cash_view,
        },
        {
            title: text('مركز الموافقات', 'Approval center'),
            description: text(
                'مراجعة الفواتير عالية القيمة والخصومات الكبيرة والمدفوعات التي تحتاج قراراً.',
                'Review high-value invoices, large discounts and payments that require a decision.',
            ),
            href: '/app/finance/approvals',
            icon: ClipboardCheck,
            visible: lookups.permissions.approvals_review
                || lookups.permissions.sales_view
                || lookups.permissions.purchases_view
                || lookups.permissions.cash_view,
        },
        {
            title: text('طلبات الشراء', 'Purchase requisitions'),
            description: text(
                'طلب مادة ثم موافقتها وتحويل الطلب المعتمد إلى مسودة فاتورة شراء.',
                'Request an item, approve it, then convert the approved request into a purchase invoice draft.',
            ),
            href: '/app/purchases/requisitions',
            icon: ClipboardList,
            visible: lookups.permissions.purchases_view,
        },
        {
            title: text('المطابقة البنكية', 'Bank reconciliation'),
            description: text(
                'استيراد كشف البنك ومطابقة الحركات مع المقبوضات والمدفوعات المسجلة.',
                'Import bank statement lines and reconcile them with posted receipts and payments.',
            ),
            href: '/app/finance/bank-reconciliation',
            icon: Scale,
            visible: lookups.permissions.cash_view,
        },
        {
            title: text('تقويم التدفق النقدي', 'Cashflow calendar'),
            description: text(
                'المبالغ المتوقع دخولها وخروجها يومياً حسب تواريخ الاستحقاق.',
                'Expected daily inflows and outflows based on due dates.',
            ),
            href: '/app/finance/cashflow',
            icon: CalendarDays,
            visible: lookups.permissions.sales_view
                || lookups.permissions.purchases_view
                || lookups.permissions.cash_view,
        },
        {
            title: text('مركز الحالات الشاذة', 'Anomaly center'),
            description: text(
                'إشارات الأسعار والفواتير والدفعات والأرصدة التي تحتاج مراجعة.',
                'Pricing, invoice, payment and balance signals that need review.',
            ),
            href: '/app/finance/anomalies',
            icon: AlertTriangle,
            visible: lookups.permissions.sales_view
                || lookups.permissions.purchases_view
                || lookups.permissions.cash_view,
        },
        {
            title: text('الضرائب والمستحقات', 'Taxes & obligations'),
            description: text(
                'القواعد الضريبية والمستحقات الحكومية ومتابعة السداد.',
                'Tax rules, government obligations and settlement tracking.',
            ),
            href: '/app/finance/taxes',
            icon: Landmark,
            visible: lookups.permissions.taxes_view,
        },
    ];

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={text('المالية', 'Finance')}
                subtitle={text(
                    'الفواتير والمقبوضات والمدفوعات والضرائب في مساحة مالية واحدة بدل تشتيتها في القائمة الرئيسية.',
                    'Invoices, receipts, payments and taxes in one finance workspace instead of separate primary navigation items.',
                )}
            />

            <FPanel
                title={text('الحركة المالية', 'Financial activity')}
                icon={WalletCards}
            >
                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    {cards
                        .filter((card) => card.visible)
                        .map((card) => {
                            const Icon = card.icon;

                            return (
                                <Link
                                    key={card.href}
                                    href={card.href}
                                    className="group rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] hover:shadow-[var(--ac-shadow-soft)]"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)] transition group-hover:bg-[var(--ac-accent-solid)] group-hover:text-[var(--ac-accent-solid-text)]">
                                            <Icon size={20} />
                                        </div>

                                        <div className="min-w-0">
                                            <h3 className="font-bold text-[var(--ac-text)]">
                                                {card.title}
                                            </h3>

                                            <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                                {card.description}
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                </div>
            </FPanel>
        </div>
    );
}
