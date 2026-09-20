import { Link } from '@inertiajs/react';
import {
    Banknote,
    CalendarClock,
    HandCoins,
    Landmark,
    ReceiptText,
    ShoppingCart,
} from 'lucide-react';
import type {
    FinanceLookups,
} from './types';

type FinanceDestination =
    | 'sales'
    | 'purchases'
    | 'receipts'
    | 'payments'
    | 'recurring'
    | 'taxes';

export function FinanceNav({
    lookups,
    ar,
    active,
}: {
    lookups: FinanceLookups;
    ar: boolean;
    active: FinanceDestination;
}) {
    const text = (
        arabic: string,
        english: string,
    ): string => ar ? arabic : english;

    const items = [
        lookups.permissions.sales_view
            ? {
                key: 'sales' as const,
                href: '/app/invoices',
                label: text('فواتير البيع', 'Sales invoices'),
                icon: ReceiptText,
            }
            : null,

        lookups.permissions.purchases_view
            ? {
                key: 'purchases' as const,
                href: '/app/invoices/purchases',
                label: text('فواتير الشراء', 'Purchase invoices'),
                icon: ShoppingCart,
            }
            : null,

        lookups.permissions.cash_view
            ? {
                key: 'receipts' as const,
                href: '/app/receipts',
                label: text('المقبوضات', 'Receipts'),
                icon: HandCoins,
            }
            : null,

        lookups.permissions.cash_view
            ? {
                key: 'payments' as const,
                href: '/app/payments',
                label: text('المدفوعات', 'Payments'),
                icon: Banknote,
            }
            : null,

        lookups.permissions.recurring_payments_view
            ? {
                key: 'recurring' as const,
                href: '/app/payments/recurring',
                label: text('الدفعات المتكررة', 'Recurring'),
                icon: CalendarClock,
            }
            : null,

        lookups.permissions.taxes_view
            ? {
                key: 'taxes' as const,
                href: '/app/finance/taxes',
                label: text('الضرائب والمستحقات', 'Taxes & obligations'),
                icon: Landmark,
            }
            : null,
    ].filter(
        (
            item,
        ): item is NonNullable<typeof item> =>
            item !== null,
    );

    if (items.length <= 1) {
        return null;
    }

    return (
        <nav
            aria-label={text(
                'التنقل المالي',
                'Finance navigation',
            )}
            className="flex flex-wrap gap-2 rounded-[16px] border border-[#dbe6f5] bg-white p-2 shadow-[0_8px_28px_rgba(30,75,140,.04)]"
        >
            {items.map(
                item => {
                    const Icon =
                        item.icon;

                    const selected =
                        active ===
                        item.key;

                    return (
                        <Link
                            key={
                                item.key
                            }
                            href={
                                item.href
                            }
                            aria-current={
                                selected
                                    ? 'page'
                                    : undefined
                            }
                            className={[
                                'inline-flex min-h-9 items-center gap-2 rounded-[10px] px-3.5 py-2 text-xs font-semibold transition',
                                selected
                                    ? 'bg-[#1265d8] text-white shadow-[0_5px_14px_rgba(18,101,216,.16)]'
                                    : 'text-[#52709a] hover:bg-blue-50 hover:text-[#1958a6]',
                            ].join(
                                ' ',
                            )}
                        >
                            <Icon
                                size={
                                    14
                                }
                            />

                            {
                                item.label
                            }
                        </Link>
                    );
                },
            )}
        </nav>
    );
}
