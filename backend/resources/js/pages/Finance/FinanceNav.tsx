import { Link } from '@inertiajs/react';
import {
    Banknote,
    HandCoins,
    Landmark,
    ReceiptText,
    ShoppingCart,
    UploadCloud,
} from 'lucide-react';
import type {
    FinanceLookups,
} from './types';

type FinanceDestination =
    | 'sales'
    | 'purchases'
    | 'receipts'
    | 'payments'
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

    const canImport =
        lookups.permissions.sales_manage
        || lookups.permissions.purchases_manage
        || lookups.permissions.cash_pay
        || lookups.permissions.cash_receive;

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

    if (items.length <= 1 && ! canImport) {
        return null;
    }

    return (
        <nav
            aria-label={text(
                'التنقل المالي',
                'Finance navigation',
            )}
            className="flex flex-wrap gap-2 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-2 shadow-[var(--ac-shadow-soft)]"
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
                                    ? 'border border-[var(--ac-accent)] bg-[var(--ac-accent-solid)] text-[var(--ac-accent-solid-text)] shadow-[var(--ac-shadow-soft)]'
                                    : 'border border-transparent text-[var(--ac-text-soft)] hover:border-[var(--ac-line)] hover:bg-[var(--ac-accent-soft)] hover:text-[var(--ac-accent)]',
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

            {canImport && (
                <Link
                    href="/app/finance/import"
                    className="ms-auto inline-flex min-h-9 items-center gap-2 rounded-[10px] border border-dashed border-[var(--ac-line-strong)] px-3.5 py-2 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)] hover:text-[var(--ac-accent)]"
                >
                    <UploadCloud size={14} />
                    {text(
                        'نقل بيانات',
                        'Import data',
                    )}
                </Link>
            )}
        </nav>
    );
}
