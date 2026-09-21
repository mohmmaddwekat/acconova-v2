import {
    ChevronLeft,
    ChevronRight,
    Menu,
    Star,
} from 'lucide-react';

import {
    AccountMenu,
} from '@/components/navigation/AccountMenu';
import {
    CommandCenter,
} from '@/components/navigation/CommandCenter';
import {
    LanguageSwitcher,
} from '@/components/navigation/LanguageSwitcher';
import {
    MessageBell,
} from '@/components/navigation/MessageBell';
import {
    NotificationBell,
} from '@/components/navigation/NotificationBell';
import {
    WorkspaceSwitcher,
} from '@/components/navigation/WorkspaceSwitcher';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    toggleFavorite,
    useWorkspaceRecords,
} from '@/lib/workspaceRecords';
import type {
    AppPageProps,
} from '@/types/app';
import {
    router,
    usePage,
} from '@inertiajs/react';

type ContextBarProps = {
    onOpenNavigation: () => void;
};

/**
 * Render global workspace, language, messages, notifications and account
 * controls.
 *
 * Messaging lives globally in the Context Bar rather than being coupled to the
 * employee-management page because Team Space is an Organization-wide surface.
 */
export function ContextBar({
    onOpenNavigation,
}: ContextBarProps) {
    const locale =
        useLocale();
    const page =
        usePage<AppPageProps>();
    const organizationId =
        page.props.workspace
            .activeOrganization
            ?.id
        ?? null;
    const {
        favorites,
    } =
        useWorkspaceRecords(
            organizationId,
        );

    const pathname =
        page.url.split(
            '?',
        )[0];

    const pageLabels:
        Record<
            string,
            [string, string]
        > = {
        '/app': [
            'لوحة التحكم',
            'Dashboard',
        ],
        '/app/finance': [
            'المالية',
            'Finance',
        ],
        '/app/invoices': [
            'فواتير البيع',
            'Sales invoices',
        ],
        '/app/invoices/purchases': [
            'فواتير الشراء',
            'Purchase invoices',
        ],
        '/app/payments': [
            'المدفوعات',
            'Payments',
        ],
        '/app/receipts': [
            'المقبوضات',
            'Receipts',
        ],
        '/app/parties': [
            'العملاء والموردون',
            'Parties',
        ],
        '/app/products': [
            'المنتجات والخدمات',
            'Products & services',
        ],
        '/app/staff/directory': [
            'دليل الموظفين',
            'Employee directory',
        ],
        '/app/task-management': [
            'إدارة المهام',
            'Task management',
        ],
        '/app/settings': [
            'الإعدادات',
            'Settings',
        ],
    };

    const pageLabel =
        (
            pageLabels[
                pathname
            ]?.[
                locale ===
                    'ar'
                    ? 0
                    : 1
            ]
            ?? (
                typeof document !==
                    'undefined'
                    ? document.title
                        .replace(
                            /\s*[|·-]\s*AccoNova.*$/i,
                            '',
                        )
                    : pathname
            )
        )
        || pathname;

    const pageFavoriteKey =
        'page:'
        + pathname;
    const pagePinned =
        favorites.some(
            item =>
                item.key ===
                    pageFavoriteKey,
        );

    return (
        <header className="ac-app-header sticky top-0 z-40 border-b border-[var(--ac-line)] bg-[var(--ac-chrome)]">
            <div className="mx-auto flex h-14 w-full max-w-[1760px] min-w-0 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-5 lg:px-8">
                <button
                    type="button"
                    aria-label={t(
                        'ui.open_navigation',
                    )}
                    onClick={
                        onOpenNavigation
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-soft)] transition duration-200 hover:-translate-y-px hover:border-[var(--ac-line-strong)] hover:text-[var(--ac-text)] active:translate-y-0 active:scale-95 motion-reduce:transform-none md:hidden"
                >
                    <Menu
                        size={
                            17
                        }
                    />
                </button>

                {pathname !== '/app' && (
                    <button
                        type="button"
                        aria-label={
                            locale === 'ar'
                                ? 'العودة إلى الصفحة السابقة'
                                : 'Go back to the previous page'
                        }
                        title={
                            locale === 'ar'
                                ? 'رجوع'
                                : 'Back'
                        }
                        onClick={() => {
                            if (window.history.length > 1) {
                                window.history.back();
                                return;
                            }

                            router.visit('/app');
                        }}
                        className="flex size-9 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-soft)] transition duration-200 hover:-translate-y-px hover:border-[var(--ac-line-strong)] hover:text-[var(--ac-text)] active:translate-y-0 active:scale-95 motion-reduce:transform-none sm:size-10"
                    >
                        {locale === 'ar'
                            ? <ChevronRight size={17} />
                            : <ChevronLeft size={17} />}
                    </button>
                )}

                <div className="min-w-0 flex-1">
                    <WorkspaceSwitcher />
                </div>

                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <CommandCenter />

                    <button
                        type="button"
                        aria-pressed={
                            pagePinned
                        }
                        aria-label={
                            pagePinned
                                ? (
                                    locale === 'ar'
                                        ? 'إزالة الصفحة من المفضلة'
                                        : 'Unpin this page'
                                )
                                : (
                                    locale === 'ar'
                                        ? 'تثبيت الصفحة في المفضلة'
                                        : 'Pin this page'
                                )
                        }
                        title={
                            pagePinned
                                ? (
                                    locale === 'ar'
                                        ? 'إزالة من المفضلة'
                                        : 'Unpin page'
                                )
                                : (
                                    locale === 'ar'
                                        ? 'تثبيت الصفحة'
                                        : 'Pin page'
                                )
                        }
                        onClick={() =>
                            toggleFavorite(
                                organizationId,
                                {
                                    key:
                                        pageFavoriteKey,
                                    kind:
                                        'page',
                                    label:
                                        pageLabel,
                                    detail:
                                        pathname,
                                    href:
                                        page.url,
                                },
                            )
                        }
                        className={[
                            'flex size-10 items-center justify-center rounded-[13px] border transition',
                            pagePinned
                                ? 'border-amber-400/50 bg-[var(--ac-surface-soft)] text-amber-500'
                                : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]',
                        ].join(' ')}
                    >
                        <Star
                            size={15}
                            fill={
                                pagePinned
                                    ? 'currentColor'
                                    : 'none'
                            }
                        />
                    </button>

                    <LanguageSwitcher />

                    <NotificationBell />

                    <MessageBell />

                    <AccountMenu />
                </div>
            </div>
        </header>
    );
}