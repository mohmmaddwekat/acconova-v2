import { Link } from '@inertiajs/react';
import {
    Banknote,
    FileSpreadsheet,
    HandCoins,
    Landmark,
    ReceiptText,
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
