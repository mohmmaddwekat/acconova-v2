import { Link } from '@inertiajs/react';
import {
    Banknote,
    HandCoins,
    Landmark,
    ReceiptText,
    ShoppingCart,
    WalletCards,
} from 'lucide-react';
import {
    FinanceHeader,
    FPanel,
    financeButton,
    financePrimary,
} from './shared';
import type {
    FinanceLookups,
} from './types';

export function FinanceHome({
    lookups,
    ar,
}: {
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (
        arabic: string,
        english: string,
    ): string => ar ? arabic : english;

    const sections = [
        lookups.permissions.sales_view
            ? {
                href:
                    '/app/finance?view=sales',
                title:
                    text(
                        'فواتير البيع',
                        'Sales invoices',
                    ),
                description:
                    text(
                        'إنشاء الفواتير، متابعة الرصيد، التحصيل والتصحيحات.',
                        'Create invoices, track balances, collections and corrections.',
                    ),
                icon:
                    ReceiptText,
            }
            : null,

        lookups.permissions.purchases_view
            ? {
                href:
                    '/app/finance?view=purchases',
                title:
                    text(
                        'فواتير الشراء',
                        'Purchase invoices',
                    ),
                description:
                    text(
                        'موردون، مواد خام، بضائع لإعادة البيع، خدمات ومصاريف مرتبطة.',
                        'Suppliers, raw materials, resale goods, services and related costs.',
                    ),
                icon:
                    ShoppingCart,
            }
            : null,

        lookups.permissions.cash_view
            ? {
                href:
                    '/app/finance?view=receipts',
                title:
                    text(
                        'المقبوضات',
                        'Receipts',
                    ),
                description:
                    text(
                        'تحصيل العملاء نقداً أو بتحويل أو شيك أو بطاقة.',
                        'Customer collections by cash, transfer, check, card and more.',
                    ),
                icon:
                    HandCoins,
            }
            : null,

        lookups.permissions.cash_view
            ? {
                href:
                    '/app/finance?view=payments',
                title:
                    text(
                        'المدفوعات',
                        'Payments',
                    ),
                description:
                    text(
                        'سداد الموردين والمصاريف والرواتب والضرائب وأي صرف آخر.',
                        'Supplier settlement, expenses, payroll, taxes and other outgoing cash.',
                    ),
                icon:
                    Banknote,
            }
            : null,

        lookups.permissions.taxes_view
            ? {
                href:
                    '/app/finance?view=taxes',
                title:
                    text(
                        'الضرائب والمستحقات',
                        'Taxes & obligations',
                    ),
                description:
                    text(
                        'قواعد ضريبية حسب الدولة أو الولاية ومتابعة مستحقات الجهات الحكومية.',
                        'Jurisdiction-aware tax rules and government obligations.',
                    ),
                icon:
                    Landmark,
            }
            : null,    ].filter(
        (
            item,
        ): item is NonNullable<typeof item> =>
            item !== null,
    );

    return (
        <div className="space-y-5">
            <FinanceHeader
                title={text(
                    'المركز المالي',
                    'Finance Center',
                )}
                subtitle={text(
                    'مكان واحد لكل فواتير البيع والشراء، المقبوضات، المدفوعات، الشيكات، الضرائب والمستحقات الحكومية.',
                    'One workspace for sales and purchase invoices, receipts, payments, checks, taxes and government obligations.',
                )}
                actions={
                    <>
                        {lookups.permissions.sales_manage && (
                            <Link
                                href="/app/finance?view=sales-create"
                                className={financePrimary}
                            >
                                <ReceiptText size={15} />
                                {text(
                                    'فاتورة بيع',
                                    'Sales invoice',
                                )}
                            </Link>
                        )}

                        {lookups.permissions.cash_receive && (
                            <Link
                                href="/app/finance?view=receipt-create"
                                className={financeButton}
                            >
                                <HandCoins size={15} />
                                {text(
                                    'قبض',
                                    'Receipt',
                                )}
                            </Link>
                        )}

                        {lookups.permissions.cash_pay && (
                            <Link
                                href="/app/finance?view=payment-create"
                                className={financeButton}
                            >
                                <Banknote size={15} />
                                {text(
                                    'دفع',
                                    'Payment',
                                )}
                            </Link>
                        )}
                    </>
                }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sections.map(
                    section => {
                        const Icon =
                            section.icon;

                        return (
                            <Link
                                key={
                                    section.href
                                }
                                href={
                                    section.href
                                }
                                className="group rounded-[20px] border border-[#dbe6f5] bg-white p-5 shadow-[0_8px_28px_rgba(30,75,140,.055)] transition hover:-translate-y-0.5 hover:border-[#9bc3f8] hover:shadow-[0_16px_36px_rgba(30,75,140,.09)]"
                            >
                                <span className="flex size-12 items-center justify-center rounded-[15px] bg-blue-50 text-[#1265d8] transition group-hover:bg-[#1265d8] group-hover:text-white">
                                    <Icon
                                        size={
                                            22
                                        }
                                    />
                                </span>

                                <h2 className="mt-5 text-base font-bold text-[#102c62]">
                                    {
                                        section.title
                                    }
                                </h2>

                                <p className="mt-2 text-xs leading-6 text-[#7890b1]">
                                    {
                                        section.description
                                    }
                                </p>
                            </Link>
                        );
                    },
                )}
            </div>

            <FPanel
                title={text(
                    'طريقة العمل',
                    'How it works',
                )}
                icon={
                    WalletCards
                }
            >
                <div className="grid gap-3 p-4 text-xs leading-6 text-[#58739a] md:grid-cols-3">
                    <div className="rounded-[14px] bg-[#f7faff] p-4">
                        <strong className="text-[#123d78]">
                            {text(
                                'المسودة قابلة للتعديل',
                                'Drafts stay editable',
                            )}
                        </strong>
                        <p className="mt-1">
                            {text(
                                'قبل الاعتماد تستطيع تعديل السعر والكمية والطرف والضريبة بشكل طبيعي.',
                                'Before posting you can freely edit price, quantity, party and tax.',
                            )}
                        </p>
                    </div>

                    <div className="rounded-[14px] bg-[#f7faff] p-4">
                        <strong className="text-[#123d78]">
                            {text(
                                'بعد الاعتماد لا نمسح التاريخ',
                                'Posted history is preserved',
                            )}
                        </strong>
                        <p className="mt-1">
                            {text(
                                'أي خطأ لاحق يتم عبر تصحيح مرتبط بالمستند الأصلي وسجل تدقيق واضح.',
                                'Later mistakes use linked corrections with a clear audit trail.',
                            )}
                        </p>
                    </div>

                    <div className="rounded-[14px] bg-[#f7faff] p-4">
                        <strong className="text-[#123d78]">
                            {text(
                                'الدفع لا يعني مخزوناً دائماً',
                                'Cash is independent from stock',
                            )}
                        </strong>
                        <p className="mt-1">
                            {text(
                                'يمكن تسجيل إيجار أو صيانة أو ضريبة أو راتب أو مصروف آخر بدون أي حركة مخزون.',
                                'Rent, maintenance, tax, payroll and other expenses can be recorded without inventory movement.',
                            )}
                        </p>
                    </div>
                </div>
            </FPanel>
        </div>
    );
}
