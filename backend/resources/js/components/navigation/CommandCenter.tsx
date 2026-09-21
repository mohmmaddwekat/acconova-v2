import { fetchParties } from '@/features/parties/api';
import { fetchProducts } from '@/features/products/api';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    rememberRecent,
    useWorkspaceRecords,
    type WorkspaceRecordKind,
    type WorkspaceRecordLink,
} from '@/lib/workspaceRecords';
import type { AppPageProps } from '@/types/app';
import { router, usePage } from '@inertiajs/react';
import {
    ArrowRightLeft,
    Banknote,
    Bell,
    Boxes,
    ClipboardCheck,
    ClipboardList,
    Clock3,
    Command,
    HandCoins,
    Keyboard,
    ListTodo,
    PackagePlus,
    Plus,
    ReceiptText,
    Landmark,
    Radar,
    Search,
    ShoppingCart,
    Star,
    UserPlus,
    UsersRound,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

type SearchHit = {
    key: string;
    label: string;
    detail: string;
    href: string;
    icon: LucideIcon;
    kind: 'module' | 'party' | 'product' | 'staff';
    aliases?: string[];
};

type StaffSearchResponse = {
    data: {
        data: Array<{
            id: number;
            name: string;
            job_title: string | null;
            email: string | null;
        }>;
    };
};

type FinanceSearchResponse = {
    data: Array<{
        id: number;
        number: string;
        kind: 'sale_invoice' | 'purchase_invoice';
        status: string;
        party: {
            id: number;
            name: string;
        } | null;
        total: string;
        currency: string;
    }>;
};

type CashSearchResponse = {
    data: Array<{
        id: number;
        number: string;
        direction: 'incoming' | 'outgoing';
        status: string;
        party: {
            id: number;
            name: string;
        } | null;
        amount: string;
        currency: string;
    }>;
};

type TaskSearchResponse = {
    data: {
        data: Array<{
            id: number;
            title: string;
            status: string;
            priority: string;
            project: {
                id: number;
                name: string;
            } | null;
        }>;
    };
};

type Mode = 'search' | 'create' | 'shortcuts';

function normalize(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase();
}

function iconForRecordKind(
    kind: WorkspaceRecordKind,
): LucideIcon {
    switch (kind) {
        case 'party':
            return UsersRound;
        case 'product':
            return Boxes;
        case 'staff':
            return UserPlus;
        case 'sale_invoice':
            return ReceiptText;
        case 'purchase_invoice':
            return ShoppingCart;
        case 'payment':
            return Banknote;
        case 'receipt':
            return HandCoins;
        case 'task':
            return ListTodo;
        default:
            return Command;
    }
}

export function CommandCenter() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const { workspace } = usePage<AppPageProps>().props;
    const organizationId = workspace.activeOrganization?.id ?? null;
    const {
        recent,
        favorites,
    } = useWorkspaceRecords(organizationId);
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode>('search');
    const [query, setQuery] = useState('');
    const [remoteHits, setRemoteHits] = useState<SearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const modules = useMemo<SearchHit[]>(() => [
        {
            key: 'parties',
            label: text('الأطراف والعملاء والموردون', 'Parties, customers & suppliers'),
            detail: text('فتح دليل العلاقات', 'Open relationship directory'),
            href: '/app/parties',
            icon: UsersRound,
            kind: 'module',
        },
        {
            key: 'products',
            label: text('المنتجات والخدمات', 'Products & services'),
            detail: text('فتح كتالوج المنتجات والخدمات', 'Open product and service catalog'),
            href: '/app/products',
            icon: Boxes,
            kind: 'module',
        },
        {
            key: 'sales',
            label: text('فواتير البيع', 'Sales invoices'),
            detail: text('فتح فواتير العملاء', 'Open customer invoices'),
            href: '/app/invoices',
            icon: ReceiptText,
            kind: 'module',
        },
        {
            key: 'purchases',
            label: text('فواتير الشراء', 'Purchase invoices'),
            detail: text('فتح فواتير الموردين', 'Open supplier invoices'),
            href: '/app/invoices/purchases',
            icon: ShoppingCart,
            kind: 'module',
        },
        {
            key: 'tasks',
            label: text('إدارة المهام', 'Task management'),
            detail: text('المهام والمشاريع وعبء العمل', 'Tasks, projects and workload'),
            href: '/app/task-management',
            icon: ListTodo,
            kind: 'module',
        },
        {
            key: 'follow-ups',
            label: text('قائمة متابعة العملاء', 'Customer follow-up queue'),
            detail: text('التذكيرات والفواتير المتأخرة والعملاء غير النشطين', 'Reminders, overdue invoices and inactive customers'),
            href: '/app/follow-ups',
            icon: UsersRound,
            kind: 'module',
            aliases: ['متابعة العملاء', 'follow ups', 'follow-up'],
        },
        {
            key: 'cashflow',
            label: text('تقويم التدفق النقدي', 'Cashflow calendar'),
            detail: text('المقبوضات والمدفوعات المتوقعة حسب الاستحقاق', 'Expected inflows and outflows by due date'),
            href: '/app/finance/cashflow',
            icon: Clock3,
            kind: 'module',
            aliases: ['cash flow', 'تدفق نقدي'],
        },
        {
            key: 'anomalies',
            label: text('مركز العمليات غير المعتادة', 'Anomaly center'),
            detail: text('مراجعة الأسعار والفواتير والمدفوعات والأرصدة غير المعتادة', 'Review unusual prices, invoices, payments and balances'),
            href: '/app/finance/anomalies',
            icon: Radar,
            kind: 'module',
            aliases: ['anomaly', 'مراجعة', 'غير معتاد'],
        },
        {
            key: 'customer-intelligence',
            label: text('ذكاء العملاء وتقسيمهم', 'Customer intelligence & segmentation'),
            detail: text('VIP والمخاطر والتأخر بالدفع والربحية', 'VIP, churn risk, overdue balances and profitability'),
            href: '/app/parties/intelligence',
            icon: UsersRound,
            kind: 'module',
            aliases: ['تقسيم العملاء', 'customer segments', 'vip customers'],
        },
        {
            key: 'inventory-intelligence',
            label: text('ذكاء المخزون', 'Inventory intelligence'),
            detail: text('المخزون الراكد وإعادة الطلب وتوقع النفاد والتقادم', 'Dead stock, reorder suggestions, stockout forecasting and aging'),
            href: '/app/inventory/intelligence',
            icon: Boxes,
            kind: 'module',
            aliases: ['مخزون راكد', 'إعادة الطلب', 'stockout', 'inventory intelligence', 'reorder'],
        },
        {
            key: 'inventory-transfers',
            label: text('تحويلات المستودعات', 'Warehouse transfers'),
            detail: text('طلب وموافقة وشحن واستلام بين المستودعات', 'Request, approve, ship and receive between warehouses'),
            href: '/app/inventory/transfers',
            icon: ArrowRightLeft,
            kind: 'module',
            aliases: ['نقل مخزون', 'stock transfer', 'warehouse transfer'],
        },
        {
            key: 'purchase-requisitions',
            label: text('طلبات الشراء', 'Purchase requisitions'),
            detail: text('طلبات المواد قبل إنشاء فاتورة الشراء', 'Item requests before creating purchase invoices'),
            href: '/app/purchases/requisitions',
            icon: ClipboardList,
            kind: 'module',
            aliases: ['طلب شراء', 'purchase request', 'requisition'],
        },
        {
            key: 'approval-center',
            label: text('مركز الموافقات', 'Approval center'),
            detail: text('الفواتير والخصومات والمدفوعات التي تحتاج قراراً', 'Invoices, discounts and payments requiring a decision'),
            href: '/app/finance/approvals',
            icon: ClipboardCheck,
            kind: 'module',
            aliases: ['موافقة', 'approvals', 'approval'],
        },
        {
            key: 'bank-reconciliation',
            label: text('المطابقة البنكية', 'Bank reconciliation'),
            detail: text('مطابقة كشف البنك مع المقبوضات والمدفوعات', 'Match bank statements to receipts and payments'),
            href: '/app/finance/bank-reconciliation',
            icon: Landmark,
            kind: 'module',
            aliases: ['مطابقة البنك', 'bank reconcile', 'reconciliation'],
        },
        {
            key: 'inventory-expiry',
            label: text('تنبيهات انتهاء الصلاحية', 'Expiry date tracking'),
            detail: text('دفعات المخزون التي ستنتهي قريباً', 'Inventory lots approaching expiry'),
            href: '/app/inventory/expiry',
            icon: Bell,
            kind: 'module',
            aliases: ['صلاحية', 'expiry', 'expiration'],
        },
        {
            key: 'landed-costs',
            label: text('تكلفة الاستيراد والتوريد', 'Landed cost'),
            detail: text('الشحن والجمارك والتأمين على فاتورة الشراء', 'Freight, customs and import cost allocation'),
            href: '/app/purchases/landed-costs',
            icon: ShoppingCart,
            kind: 'module',
            aliases: ['landed cost', 'جمارك', 'شحن مشتريات'],
        },
        {
            key: 'exchange-rate-history',
            label: text('سجل أسعار الصرف', 'Exchange rate history'),
            detail: text('سعر الصرف المستخدم في المستندات وتاريخ تغييره', 'Document exchange rates and change history'),
            href: '/app/finance/exchange-rates',
            icon: ArrowRightLeft,
            kind: 'module',
            aliases: ['exchange rate', 'سعر الصرف', 'عملة'],
        },
        {
            key: 'budgets',
            label: text('الميزانية مقابل الفعلي', 'Budget vs actual'),
            detail: text('ميزانيات الأقسام ومقارنتها بالصرف', 'Department budgets versus actual spend'),
            href: '/app/finance/budgets',
            icon: Radar,
            kind: 'module',
            aliases: ['budget', 'ميزانية'],
        },
        {
            key: 'spending-limits',
            label: text('سقوف صرف الأقسام', 'Department spending limits'),
            detail: text('حدود الصرف الشهرية للأقسام', 'Monthly department spending caps'),
            href: '/app/departments/spending-limits',
            icon: ShieldCheck,
            kind: 'module',
            aliases: ['سقف صرف', 'spending limit'],
        },
        {
            key: 'expense-claims',
            label: text('مطالبات المصاريف', 'Expense claims'),
            detail: text('تعويض مصاريف الموظفين ومراجعتها', 'Employee reimbursements and review'),
            href: '/app/staff/expense-claims',
            icon: ClipboardCheck,
            kind: 'module',
            aliases: ['تعويض', 'expense claim', 'مصاريف موظف'],
        },
        {
            key: 'petty-cash',
            label: text('صناديق النثريات', 'Petty cash'),
            detail: text('أرصدة وسقوف وحركات صناديق النثريات', 'Petty cash balances, caps and transactions'),
            href: '/app/finance/petty-cash',
            icon: Banknote,
            kind: 'module',
            aliases: ['نثريات', 'petty cash'],
        },
        {
            key: 'recurring-expenses',
            label: text('المصاريف المتكررة', 'Recurring expenses'),
            detail: text('الإيجار والاشتراكات والمصاريف الدورية', 'Rent, subscriptions and recurring costs'),
            href: '/app/finance/recurring-expenses',
            icon: Clock3,
            kind: 'module',
            aliases: ['مصاريف شهرية', 'recurring expense'],
        },
        {
            key: 'contracts',
            label: text('إدارة العقود', 'Contract management'),
            detail: text('عقود العملاء والموردين وتنبيهات الانتهاء', 'Customer and supplier contracts with expiry alerts'),
            href: '/app/parties/contracts',
            icon: ClipboardList,
            kind: 'module',
            aliases: ['عقد', 'contracts', 'contract expiry'],
        },
        {
            key: 'document-expiry',
            label: text('انتهاء الوثائق', 'Document expiry'),
            detail: text('الرخص والشهادات والإقامات قبل انتهائها', 'Licenses, certificates and permits before expiry'),
            href: '/app/documents/expiry',
            icon: Bell,
            kind: 'module',
            aliases: ['وثائق منتهية', 'document expiry', 'ترخيص'],
        },
        {
            key: 'data-quality',
            label: text('مركز جودة البيانات', 'Data quality center'),
            detail: text('بيانات ناقصة وسجلات محتمل تكرارها', 'Missing data and possible duplicate records'),
            href: '/app/data-quality',
            icon: Radar,
            kind: 'module',
            aliases: ['جودة البيانات', 'duplicates', 'بيانات ناقصة'],
        },
        {
            key: 'notifications',
            label: text('مركز الإشعارات', 'Notification center'),
            detail: text('المخزون والمدفوعات والنشاط والرسائل', 'Stock, payments, activity and messages'),
            href: '/app/notifications',
            icon: Bell,
            kind: 'module',
        },
        {
            key: 'staff',
            label: text('دليل الموظفين', 'Employee directory'),
            detail: text('فتح الموظفين والملفات', 'Open employees and profiles'),
            href: '/app/staff/directory',
            icon: UserPlus,
            kind: 'module',
            aliases: [
                'موظف جديد',
                'اضف موظف',
                'أضف موظف',
                'new employee',
                'add employee',
            ],
        },
    ], [ar]);

    const createActions = useMemo<SearchHit[]>(() => [
        {
            key: 'create-party',
            label: text('إضافة عميل / مورد / جهة', 'Add customer / supplier / contact'),
            detail: text('فتح نموذج جهة جديدة', 'Open a new Party form'),
            href: '/app/parties?create=1',
            icon: UsersRound,
            kind: 'module',
            aliases: [
                'اضف عميل',
                'أضف عميل',
                'عميل جديد',
                'مورد جديد',
                'جهة جديدة',
                'new customer',
                'new supplier',
                'add customer',
                'add party',
            ],
        },
        {
            key: 'create-product',
            label: text('إضافة منتج أو خدمة', 'Add product or service'),
            detail: text('فتح نموذج عنصر جديد', 'Open a new catalog item form'),
            href: '/app/products?create=1',
            icon: PackagePlus,
            kind: 'module',
            aliases: [
                'منتج جديد',
                'خدمة جديدة',
                'اضف منتج',
                'أضف منتج',
                'new product',
                'new service',
                'add product',
            ],
        },
        {
            key: 'create-sale',
            label: text('فاتورة بيع جديدة', 'New sales invoice'),
            detail: text('إنشاء فاتورة للعميل', 'Create a customer invoice'),
            href: '/app/invoices/sales/create',
            icon: ReceiptText,
            kind: 'module',
            aliases: [
                'فاتورة جديدة',
                'فاتورة بيع',
                'انشاء فاتورة',
                'إنشاء فاتورة',
                'new invoice',
                'sales invoice',
                'create invoice',
            ],
        },
        {
            key: 'create-purchase',
            label: text('فاتورة شراء جديدة', 'New purchase invoice'),
            detail: text('إنشاء فاتورة مورد', 'Create a supplier invoice'),
            href: '/app/invoices/purchases/create',
            icon: ShoppingCart,
            kind: 'module',
            aliases: [
                'فاتورة شراء',
                'شراء جديد',
                'new purchase invoice',
                'purchase invoice',
            ],
        },
        {
            key: 'create-payment',
            label: text('تسجيل دفعة', 'Record payment'),
            detail: text('سداد مورد أو مصروف أو تحويل', 'Supplier, expense or transfer payment'),
            href: '/app/payments/create',
            icon: Banknote,
            kind: 'module',
            aliases: [
                'سجل دفعة',
                'دفعة جديدة',
                'دفع جديد',
                'record payment',
                'new payment',
            ],
        },
        {
            key: 'create-receipt',
            label: text('تسجيل مقبوض', 'Record receipt'),
            detail: text('تحصيل عميل أو دفعة مقدمة', 'Customer collection or advance'),
            href: '/app/receipts/create',
            icon: HandCoins,
            kind: 'module',
            aliases: [
                'سجل مقبوض',
                'مقبوض جديد',
                'قبض جديد',
                'record receipt',
                'new receipt',
            ],
        },
        {
            key: 'create-task',
            label: text('مهمة جديدة', 'New task'),
            detail: text('إنشاء مهمة وتعيين المسؤولين', 'Create a task and assign owners'),
            href: '/app/task-management/create',
            icon: ListTodo,
            kind: 'module',
            aliases: [
                'مهمة جديدة',
                'اضف مهمة',
                'أضف مهمة',
                'new task',
                'add task',
            ],
        },
        {
            key: 'create-staff',
            label: text('إضافة موظف', 'Add employee'),
            detail: text('فتح نموذج موظف جديد', 'Open a new employee form'),
            href: '/app/staff/directory?create=1',
            icon: UserPlus,
            kind: 'module',
            aliases: [
                'موظف جديد',
                'اضف موظف',
                'أضف موظف',
                'new employee',
                'add employee',
            ],
        },
    ], [ar]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            const target = event.target as HTMLElement | null;
            const typing =
                target?.tagName === 'INPUT'
                || target?.tagName === 'TEXTAREA'
                || target?.tagName === 'SELECT'
                || target?.isContentEditable;

            const key =
                event.key.toLocaleLowerCase();

            if (
                (event.ctrlKey || event.metaKey)
                && key === 'k'
            ) {
                event.preventDefault();
                setMode('search');
                setOpen(true);
                return;
            }

            if (
                (event.ctrlKey || event.metaKey)
                && key === 's'
            ) {
                event.preventDefault();
                window.dispatchEvent(
                    new CustomEvent('acconova:save'),
                );
                return;
            }

            if (
                (event.ctrlKey || event.metaKey)
                && event.key === '/'
            ) {
                event.preventDefault();
                setMode('shortcuts');
                setOpen(true);
                return;
            }

            if (! typing && event.key === '/') {
                event.preventDefault();
                setMode('search');
                setOpen(true);
                return;
            }

            if (! typing && key === 'n') {
                event.preventDefault();
                setMode('create');
                setOpen(true);
                return;
            }

            if (! typing && key === 's') {
                event.preventDefault();
                window.dispatchEvent(
                    new CustomEvent('acconova:save'),
                );
                return;
            }

            if (! typing && event.key === '?') {
                event.preventDefault();
                setMode('shortcuts');
                setOpen(true);
                return;
            }

            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () =>
            window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (! open) {
            setQuery('');
            setRemoteHits([]);
            setLoading(false);
            return;
        }

        const timer = window.setTimeout(() => {
            inputRef.current?.focus();
        }, 30);

        return () => window.clearTimeout(timer);
    }, [open, mode]);

    useEffect(() => {
        if (
            ! open
            || mode !== 'search'
            || ! organizationId
            || query.trim().length < 2
        ) {
            setRemoteHits([]);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);

            void Promise.allSettled([
                fetchParties({
                    search: query,
                    status: 'active',
                    page: 1,
                    perPage: 6,
                }),
                fetchProducts({
                    search: query,
                    status: 'active',
                    page: 1,
                    perPage: 6,
                }),
                apiRequest<StaffSearchResponse>(
                    '/api/staff?page=1&per_page=6&search='
                    + encodeURIComponent(query),
                    {
                        signal: controller.signal,
                    },
                ),
                apiRequest<FinanceSearchResponse>(
                    '/api/finance/documents?kind=sale_invoice&per_page=10&search='
                    + encodeURIComponent(query),
                    {
                        signal: controller.signal,
                    },
                ),
                apiRequest<FinanceSearchResponse>(
                    '/api/finance/documents?kind=purchase_invoice&per_page=10&search='
                    + encodeURIComponent(query),
                    {
                        signal: controller.signal,
                    },
                ),
                apiRequest<CashSearchResponse>(
                    '/api/finance/cash-movements?per_page=10&search='
                    + encodeURIComponent(query),
                    {
                        signal: controller.signal,
                    },
                ),
                apiRequest<TaskSearchResponse>(
                    '/api/task-management/search?per_page=10&search='
                    + encodeURIComponent(query),
                    {
                        signal: controller.signal,
                    },
                ),
            ]).then((results) => {
                if (controller.signal.aborted) {
                    return;
                }

                const hits: SearchHit[] = [];

                const parties = results[0];
                if (parties.status === 'fulfilled') {
                    parties.value.data.forEach((party) => {
                        const label = party.type === 'company'
                            ? party.company_name ?? text('شركة بدون اسم', 'Unnamed company')
                            : party.name ?? text('جهة بدون اسم', 'Unnamed contact');

                        hits.push({
                            key: 'party-' + String(party.id),
                            label,
                            detail: [
                                text('جهة', 'Party'),
                                party.email,
                                party.phone,
                            ].filter(Boolean).join(' · '),
                            href: '/app/parties?focus=' + String(party.id),
                            icon: UsersRound,
                            kind: 'party',
                        });
                    });
                }

                const products = results[1];
                if (products.status === 'fulfilled') {
                    products.value.data.forEach((product) => {
                        hits.push({
                            key: 'product-' + String(product.id),
                            label: product.name,
                            detail: [
                                product.type === 'service'
                                    ? text('خدمة', 'Service')
                                    : product.type === 'raw_material'
                                        ? text('مادة خام', 'Raw material')
                                        : text('منتج', 'Product'),
                                product.sku,
                            ].filter(Boolean).join(' · '),
                            href: '/app/products?focus=' + String(product.id),
                            icon: Boxes,
                            kind: 'product',
                        });
                    });
                }

                const staff = results[2];
                if (staff.status === 'fulfilled') {
                    staff.value.data.data.forEach((member) => {
                        hits.push({
                            key: 'staff-' + String(member.id),
                            label: member.name,
                            detail: [
                                text('موظف', 'Employee'),
                                member.job_title,
                                member.email,
                            ].filter(Boolean).join(' · '),
                            href: '/app/staff/directory?staff=' + String(member.id),
                            icon: UserPlus,
                            kind: 'staff',
                        });
                    });
                }

                const salesDocuments = results[3];
                if (salesDocuments.status === 'fulfilled') {
                    salesDocuments.value.data.forEach((document) => {
                        hits.push({
                            key: 'sale-' + String(document.id),
                            label: document.number,
                            detail: [
                                text('فاتورة بيع', 'Sales invoice'),
                                document.party?.name,
                                document.total + ' ' + document.currency,
                            ].filter(Boolean).join(' · '),
                            href: '/app/invoices/sales/' + String(document.id),
                            icon: ReceiptText,
                            kind: 'module',
                        });
                    });
                }

                const purchaseDocuments = results[4];
                if (purchaseDocuments.status === 'fulfilled') {
                    purchaseDocuments.value.data.forEach((document) => {
                        hits.push({
                            key: 'purchase-' + String(document.id),
                            label: document.number,
                            detail: [
                                text('فاتورة شراء', 'Purchase invoice'),
                                document.party?.name,
                                document.total + ' ' + document.currency,
                            ].filter(Boolean).join(' · '),
                            href: '/app/invoices/purchases/' + String(document.id),
                            icon: ShoppingCart,
                            kind: 'module',
                        });
                    });
                }

                const cashMovements = results[5];
                if (cashMovements.status === 'fulfilled') {
                    cashMovements.value.data.forEach((movement) => {
                        hits.push({
                            key: 'cash-' + String(movement.id),
                            label: movement.number,
                            detail: [
                                movement.direction === 'incoming'
                                    ? text('مقبوض', 'Receipt')
                                    : text('دفعة', 'Payment'),
                                movement.party?.name,
                                movement.amount + ' ' + movement.currency,
                            ].filter(Boolean).join(' · '),
                            href: movement.direction === 'incoming'
                                ? '/app/receipts/' + String(movement.id)
                                : '/app/payments/' + String(movement.id),
                            icon: movement.direction === 'incoming'
                                ? HandCoins
                                : Banknote,
                            kind: 'module',
                        });
                    });
                }

                const tasks = results[6];
                if (tasks.status === 'fulfilled') {
                    tasks.value.data.data.forEach((task) => {
                        hits.push({
                            key: 'task-' + String(task.id),
                            label: task.title,
                            detail: [
                                text('مهمة', 'Task'),
                                task.project?.name,
                                task.status,
                            ].filter(Boolean).join(' · '),
                            href: '/app/task-management/' + String(task.id),
                            icon: ListTodo,
                            kind: 'module',
                        });
                    });
                }

                setRemoteHits(hits);
            }).finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });
        }, 180);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [open, mode, query, organizationId, ar]);

    if (! organizationId) {
        return null;
    }

    const normalizedQuery = normalize(query);

    const matchesQuery = (
        item: SearchHit,
    ): boolean => {
        if (! normalizedQuery) {
            return true;
        }

        return normalize(
            [
                item.label,
                item.detail,
                ...(item.aliases ?? []),
            ].join(' '),
        ).includes(
            normalizedQuery,
        );
    };

    const actionHits =
        mode === 'search'
        && normalizedQuery
            ? createActions.filter(
                matchesQuery,
            )
            : [];

    const localHits =
        mode === 'search'
            ? modules.filter(
                matchesQuery,
            )
            : mode === 'create'
                ? createActions.filter(
                    matchesQuery,
                )
                : [];

    const go = (
        href: string,
        recentItem?: Omit<WorkspaceRecordLink, 'touchedAt'>,
    ): void => {
        if (recentItem) {
            rememberRecent(
                organizationId,
                recentItem,
            );
        }

        setOpen(false);
        router.visit(href);
    };

    const overlay = open && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[300]">
                <button
                    type="button"
                    aria-label={text('إغلاق', 'Close')}
                    className="absolute inset-0 bg-[var(--ac-text)]/35 backdrop-blur-[4px]"
                    onClick={() => setOpen(false)}
                />

                <section
                    role="dialog"
                    aria-modal="true"
                    aria-label={
                        mode === 'search'
                            ? text('البحث السريع', 'Global search')
                            : mode === 'create'
                                ? text('إنشاء سريع', 'Quick create')
                                : text('اختصارات لوحة المفاتيح', 'Keyboard shortcuts')
                    }
                    className="absolute left-1/2 top-[10vh] flex max-h-[78vh] w-[min(92vw,760px)] -translate-x-1/2 flex-col overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[0_32px_100px_rgba(1,20,35,.32)]"
                >
                    <header className="flex items-center gap-3 border-b border-[var(--ac-line)] p-3 sm:p-4">
                        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] bg-[var(--ac-surface-soft)] px-4">
                            {mode === 'search'
                                ? <Search size={18} className="shrink-0 text-[var(--ac-accent)]" />
                                : mode === 'create'
                                    ? <Plus size={18} className="shrink-0 text-[var(--ac-accent)]" />
                                    : <Keyboard size={18} className="shrink-0 text-[var(--ac-accent)]" />}

                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter') {
                                        return;
                                    }

                                    const target =
                                        actionHits[0]
                                        ?? localHits[0]
                                        ?? remoteHits[0];

                                    if (target) {
                                        event.preventDefault();
                                        go(target.href);
                                    }
                                }}
                                placeholder={
                                    mode === 'search'
                                        ? text('ابحث أو اكتب أمراً مثل: فاتورة جديدة…', 'Search or type a command like: new invoice…')
                                        : mode === 'create'
                                            ? text('فلتر أوامر الإنشاء…', 'Filter create actions…')
                                            : text('ابحث داخل الاختصارات…', 'Filter shortcuts…')
                                }
                                className="h-12 min-w-0 flex-1 bg-transparent text-sm text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-text-muted)]"
                            />

                            {loading && (
                                <span className="text-[10px] text-[var(--ac-text-muted)]">
                                    {text('بحث…', 'Searching…')}
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                        >
                            <X size={17} />
                        </button>
                    </header>

                    <div className="flex gap-2 border-b border-[var(--ac-line)] px-4 py-3">
                        <button
                            type="button"
                            aria-pressed={mode === 'search'}
                            onClick={() => setMode('search')}
                            className={[
                                'rounded-[12px] px-3 py-2 text-xs font-semibold transition',
                                mode === 'search'
                                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                    : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]',
                            ].join(' ')}
                        >
                            {text('بحث شامل', 'Global search')}
                        </button>

                        <button
                            type="button"
                            aria-pressed={mode === 'create'}
                            onClick={() => setMode('create')}
                            className={[
                                'rounded-[12px] px-3 py-2 text-xs font-semibold transition',
                                mode === 'create'
                                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                    : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]',
                            ].join(' ')}
                        >
                            {text('إنشاء سريع', 'Quick create')}
                        </button>

                        <button
                            type="button"
                            aria-pressed={mode === 'shortcuts'}
                            onClick={() => setMode('shortcuts')}
                            className={[
                                'rounded-[12px] px-3 py-2 text-xs font-semibold transition',
                                mode === 'shortcuts'
                                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                    : 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]',
                            ].join(' ')}
                        >
                            {text('الاختصارات', 'Shortcuts')}
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                        <div className="space-y-2">
                            {mode === 'shortcuts' ? (
                                <ShortcutList
                                    ar={ar}
                                    query={query}
                                />
                            ) : (
                                <>
                                    {mode === 'search' && actionHits.length > 0 && (
                                        <>
                                            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                                {text('أوامر', 'Commands')}
                                            </p>
                                            {actionHits.map((item) => (
                                                <CommandRow
                                                    key={'command-' + item.key}
                                                    item={item}
                                                    onOpen={go}
                                                />
                                            ))}
                                        </>
                                    )}

                                    {mode === 'search' && ! normalizedQuery && favorites.length > 0 && (
                                        <WorkspaceLinkSection
                                            title={text('المفضلة', 'Favorites')}
                                            items={favorites}
                                            icon={Star}
                                            onOpen={(item) => go(item.href, {
                                                key: item.key,
                                                kind: item.kind,
                                                label: item.label,
                                                detail: item.detail,
                                                href: item.href,
                                            })}
                                        />
                                    )}

                                    {mode === 'search' && ! normalizedQuery && recent.length > 0 && (
                                        <WorkspaceLinkSection
                                            title={text('آخر ما فتحته', 'Recent items')}
                                            items={recent}
                                            icon={Clock3}
                                            onOpen={(item) => go(item.href, {
                                                key: item.key,
                                                kind: item.kind,
                                                label: item.label,
                                                detail: item.detail,
                                                href: item.href,
                                            })}
                                        />
                                    )}

                                    {localHits.map((item) => (
                                        <CommandRow
                                            key={item.key}
                                            item={item}
                                            onOpen={go}
                                        />
                                    ))}

                                    {mode === 'search' && remoteHits.length > 0 && (
                                        <>
                                            <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                                {text('نتائج البيانات', 'Data results')}
                                            </p>

                                            {remoteHits.map((item) => (
                                                <CommandRow
                                                    key={item.key}
                                                    item={item}
                                                    onOpen={go}
                                                />
                                            ))}
                                        </>
                                    )}

                                    {! loading
                                        && actionHits.length === 0
                                        && localHits.length === 0
                                        && remoteHits.length === 0
                                        && (
                                            <div className="rounded-[18px] border border-dashed border-[var(--ac-line)] px-5 py-12 text-center text-sm text-[var(--ac-text-muted)]">
                                                {text('لا توجد نتائج مطابقة.', 'No matching results.')}
                                            </div>
                                        )}
                                </>
                            )}
                        </div>
                    </div>

                    <footer className="flex items-center justify-between gap-3 border-t border-[var(--ac-line)] px-4 py-3 text-[10px] text-[var(--ac-text-muted)]">
                        <span>
                            {text('Ctrl / ⌘ + K لفتح البحث من أي صفحة', 'Ctrl / ⌘ + K opens search from anywhere')}
                        </span>

                        <span>
                            Esc
                        </span>
                    </footer>
                </section>
            </div>,
            document.body,
        )
        : null;

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    setMode('search');
                    setOpen(true);
                }}
                aria-label={text('بحث شامل', 'Global search')}
                className="flex size-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] sm:h-10 sm:w-auto sm:px-3"
            >
                <Search size={15} />
                <span className="hidden lg:inline">
                    {text('بحث', 'Search')}
                </span>
                <kbd className="hidden rounded-md border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--ac-text-muted)] xl:inline">
                    Ctrl K
                </kbd>
            </button>

            <button
                type="button"
                onClick={() => {
                    setMode('create');
                    setOpen(true);
                }}
                aria-label={text('إنشاء سريع', 'Quick create')}
                className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-solid)] text-[var(--ac-accent-solid-text)] shadow-[var(--ac-shadow-soft)] transition hover:bg-[var(--ac-accent-hover)]"
            >
                <Plus size={17} />
            </button>

            {overlay}
        </>
    );
}

function WorkspaceLinkSection({
    title,
    items,
    icon: SectionIcon,
    onOpen,
}: {
    title: string;
    items: WorkspaceRecordLink[];
    icon: LucideIcon;
    onOpen: (item: WorkspaceRecordLink) => void;
}) {
    return (
        <section className="pb-2">
            <p className="flex items-center gap-2 px-2 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                <SectionIcon size={12} />
                {title}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
                {items.map((item) => {
                    const Icon =
                        iconForRecordKind(
                            item.kind,
                        );

                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onOpen(item)}
                            className="flex min-w-0 items-center gap-3 rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 py-3 text-start transition hover:bg-[var(--ac-surface-soft)]"
                        >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                <Icon size={15} />
                            </span>

                            <span className="min-w-0">
                                <strong className="block truncate text-xs text-[var(--ac-text)]">
                                    {item.label}
                                </strong>
                                {item.detail && (
                                    <span className="mt-0.5 block truncate text-[10px] text-[var(--ac-text-muted)]">
                                        {item.detail}
                                    </span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

function ShortcutList({
    ar,
    query,
}: {
    ar: boolean;
    query: string;
}) {
    const rows = [
        ['Ctrl / ⌘ + K', ar ? 'فتح البحث الشامل' : 'Open global search'],
        ['/', ar ? 'فتح البحث من أي صفحة' : 'Open search from any page'],
        ['N', ar ? 'فتح الإنشاء السريع' : 'Open quick create'],
        ['S / Ctrl / ⌘ + S', ar ? 'حفظ النموذج النشط' : 'Save the active form'],
        ['Esc', ar ? 'إغلاق النافذة أو البحث' : 'Close the active dialog/search'],
        ['Ctrl / ⌘ + /', ar ? 'عرض هذه الاختصارات' : 'Show keyboard shortcuts'],
        ['?', ar ? 'عرض الاختصارات عندما لا تكون تكتب' : 'Show shortcuts when not typing'],
    ].filter((row) =>
        ! query.trim()
        || normalize(row.join(' ')).includes(normalize(query)),
    );

    return (
        <div className="overflow-hidden rounded-[18px] border border-[var(--ac-line)]">
            {rows.map(([keys, label]) => (
                <div
                    key={keys}
                    className="flex items-center justify-between gap-4 border-b border-[var(--ac-line)] px-4 py-3 last:border-b-0"
                >
                    <span className="text-xs text-[var(--ac-text-soft)]">
                        {label}
                    </span>
                    <kbd className="rounded-[9px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-2 py-1 text-[10px] font-bold text-[var(--ac-text)]">
                        {keys}
                    </kbd>
                </div>
            ))}
        </div>
    );
}

function CommandRow({
    item,
    onOpen,
}: {
    item: SearchHit;
    onOpen: (href: string) => void;
}) {
    const Icon = item.icon;

    return (
        <button
            type="button"
            onClick={() => onOpen(item.href)}
            className="group flex w-full items-center gap-3 rounded-[16px] border border-transparent px-3 py-3 text-start transition hover:border-[var(--ac-line)] hover:bg-[var(--ac-surface-soft)]"
        >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)] transition group-hover:bg-[var(--ac-accent-solid)] group-hover:text-[var(--ac-accent-solid-text)]">
                <Icon size={17} />
            </span>

            <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-[var(--ac-text)]">
                    {item.label}
                </strong>
                <span className="mt-0.5 block truncate text-[11px] text-[var(--ac-text-muted)]">
                    {item.detail}
                </span>
            </span>

            <Command size={14} className="shrink-0 text-[var(--ac-text-faint)] opacity-0 transition group-hover:opacity-100" />
        </button>
    );
}
