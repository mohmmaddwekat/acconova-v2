import { fetchParties } from '@/features/parties/api';
import { fetchProducts } from '@/features/products/api';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import { router, usePage } from '@inertiajs/react';
import {
    Banknote,
    Boxes,
    Command,
    HandCoins,
    PackagePlus,
    Plus,
    ReceiptText,
    Search,
    ShoppingCart,
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

type Mode = 'search' | 'create';

function normalize(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase();
}

export function CommandCenter() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const { workspace } = usePage<AppPageProps>().props;
    const organizationId = workspace.activeOrganization?.id ?? null;
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
            key: 'staff',
            label: text('دليل الموظفين', 'Employee directory'),
            detail: text('فتح الموظفين والملفات', 'Open employees and profiles'),
            href: '/app/staff/directory',
            icon: UserPlus,
            kind: 'module',
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
        },
        {
            key: 'create-product',
            label: text('إضافة منتج أو خدمة', 'Add product or service'),
            detail: text('فتح نموذج عنصر جديد', 'Open a new catalog item form'),
            href: '/app/products?create=1',
            icon: PackagePlus,
            kind: 'module',
        },
        {
            key: 'create-sale',
            label: text('فاتورة بيع جديدة', 'New sales invoice'),
            detail: text('إنشاء فاتورة للعميل', 'Create a customer invoice'),
            href: '/app/invoices/sales/create',
            icon: ReceiptText,
            kind: 'module',
        },
        {
            key: 'create-purchase',
            label: text('فاتورة شراء جديدة', 'New purchase invoice'),
            detail: text('إنشاء فاتورة مورد', 'Create a supplier invoice'),
            href: '/app/invoices/purchases/create',
            icon: ShoppingCart,
            kind: 'module',
        },
        {
            key: 'create-payment',
            label: text('تسجيل دفعة', 'Record payment'),
            detail: text('سداد مورد أو مصروف أو تحويل', 'Supplier, expense or transfer payment'),
            href: '/app/payments/create',
            icon: Banknote,
            kind: 'module',
        },
        {
            key: 'create-receipt',
            label: text('تسجيل مقبوض', 'Record receipt'),
            detail: text('تحصيل عميل أو دفعة مقدمة', 'Customer collection or advance'),
            href: '/app/receipts/create',
            icon: HandCoins,
            kind: 'module',
        },
        {
            key: 'create-staff',
            label: text('إضافة موظف', 'Add employee'),
            detail: text('فتح نموذج موظف جديد', 'Open a new employee form'),
            href: '/app/staff/directory?create=1',
            icon: UserPlus,
            kind: 'module',
        },
    ], [ar]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (
                (event.ctrlKey || event.metaKey)
                && event.key.toLocaleLowerCase() === 'k'
            ) {
                event.preventDefault();
                setMode('search');
                setOpen(true);
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
    const localHits = mode === 'search'
        ? modules.filter((item) => {
            if (! normalizedQuery) {
                return true;
            }

            return normalize(item.label + ' ' + item.detail)
                .includes(normalizedQuery);
        })
        : createActions;

    const go = (href: string): void => {
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
                    aria-label={mode === 'search'
                        ? text('البحث السريع', 'Global search')
                        : text('إنشاء سريع', 'Quick create')}
                    className="absolute left-1/2 top-[10vh] flex max-h-[78vh] w-[min(92vw,760px)] -translate-x-1/2 flex-col overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[0_32px_100px_rgba(1,20,35,.32)]"
                >
                    <header className="flex items-center gap-3 border-b border-[var(--ac-line)] p-3 sm:p-4">
                        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[16px] bg-[var(--ac-surface-soft)] px-4">
                            {mode === 'search'
                                ? <Search size={18} className="shrink-0 text-[var(--ac-accent)]" />
                                : <Plus size={18} className="shrink-0 text-[var(--ac-accent)]" />}

                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={mode === 'search'
                                    ? text('ابحث عن عميل، مورد، منتج، موظف أو صفحة…', 'Search customers, suppliers, products, employees or pages…')
                                    : text('فلتر أوامر الإنشاء…', 'Filter create actions…')}
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
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                        <div className="space-y-2">
                            {localHits
                                .filter((item) => ! normalizedQuery
                                    || normalize(item.label + ' ' + item.detail).includes(normalizedQuery))
                                .map((item) => (
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
                                && localHits.length === 0
                                && remoteHits.length === 0
                                && (
                                    <div className="rounded-[18px] border border-dashed border-[var(--ac-line)] px-5 py-12 text-center text-sm text-[var(--ac-text-muted)]">
                                        {text('لا توجد نتائج مطابقة.', 'No matching results.')}
                                    </div>
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
                className="hidden h-10 items-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] sm:flex"
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
