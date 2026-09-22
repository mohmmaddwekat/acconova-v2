import {
    t,
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    useWorkspaceRecords,
} from '@/lib/workspaceRecords';
import {
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Boxes,
    ChartColumn,
    ContactRound,
    Factory,
    Gauge,
    ListTodo,
    PanelLeftClose,
    PanelLeftOpen,
    ReceiptText,
    Settings,
    ShieldCheck,
    Sparkles,
    Star,
    Users,
    Warehouse,
    X,
    type LucideIcon,
} from 'lucide-react';

type NavigationItem = {
    label: string;

    description: string;

    href?: string;

    icon: LucideIcon;

    disabled?: boolean;
};

type CommandRailProps = {
    expanded: boolean;

    mobileOpen: boolean;

    onExpandedChange: (
        expanded: boolean,
    ) => void;

    onMobileOpenChange: (
        open: boolean,
    ) => void;
};

/**
 * Determine whether a navigation destination matches the current Inertia URL.
 *
 * Inventory itself remains exact so its nested Production surface receives the
 * active state independently.
 */
function destinationIsActive(
    currentUrl: string,
    href: string | undefined,
): boolean {
    if (! href) {
        return false;
    }

    if (
        href ===
        '/app'
    ) {
        return currentUrl ===
            '/app';
    }

    if (
        [
            '/app/invoices',
            '/app/invoices/purchases',
            '/app/receipts',
            '/app/payments',
            '/app/finance/taxes',
        ].includes(
            href,
        )
    ) {
        return currentUrl.startsWith(
            '/app/finance',
        )
            || currentUrl.startsWith(
                '/app/invoices',
            )
            || currentUrl.startsWith(
                '/app/payments',
            )
            || currentUrl.startsWith(
                '/app/receipts',
            )
            || currentUrl.startsWith(
                '/app/purchases',
            );
    }

    if (
        href ===
        '/app/inventory'
    ) {
        return currentUrl ===
            '/app/inventory'
            || currentUrl.startsWith(
                '/app/inventory/transfers',
            )
            || currentUrl.startsWith(
                '/app/inventory/intelligence',
            );
    }

    return currentUrl.startsWith(
        href,
    );
}

/**
 * Render AccoNova's adaptive primary command navigation.
 */
export function CommandRail({
    expanded,
    mobileOpen,
    onExpandedChange,
    onMobileOpenChange,
}: CommandRailProps) {
    const locale =
        useLocale();

    const page =
        usePage<AppPageProps>();

    const activeOrganization =
        page.props
            .workspace
            .activeOrganization;

    const {
        favorites,
    } = useWorkspaceRecords(
        activeOrganization?.id
        ?? null,
    );

    const customPermissions =
        activeOrganization
            ?.permissions;

    /*
     * Keep Task Management as one primary rail destination. Custom roles land
     * on the first task surface they are actually allowed to open.
     */
    const taskManagementHref =
        ! customPermissions
            ? '/app/task-management'
            : customPermissions.includes(
                  'tasks.dashboard',
              )
                ? '/app/task-management'
                : customPermissions.includes(
                      'tasks.view',
                  )
                    ? '/app/task-management/tasks'
                    : customPermissions.includes(
                          'tasks.projects.view',
                      )
                        ? '/app/task-management/projects'
                        : customPermissions.includes(
                              'tasks.team',
                          )
                            ? '/app/task-management/team'
                            : null;

    const navigationItems:
        NavigationItem[] = [
        {
            label:
                t(
                    'ui.command',
                ),

            description:
                t(
                    'ui.business_pulse',
                ),

            href:
                '/app',

            icon:
                Gauge,
        },

        {
            label:
                'AccoNova AI',

            description:
                locale === 'ar'
                    ? 'مساعد ذكي بذاكرة وصلاحيات'
                    : 'AI assistant with memory & permissions',

            href:
                '/app/ai',

            icon:
                Sparkles,
        },

        ...(taskManagementHref
            ? [
                  {
                      label:
                          locale ===
                          'ar'
                              ? 'إدارة المهام'
                              : 'Task Management',

                      description:
                          locale ===
                          'ar'
                              ? 'المهام والمشاريع وعبء العمل'
                              : 'Tasks, projects & workload',

                      href:
                          taskManagementHref,

                      icon:
                          ListTodo,
                  },
              ]
            : []),

        {
            label:
                t(
                    'ui.parties',
                ),

            description:
                t(
                    'ui.relationships',
                ),

            href:
                '/app/parties',

            icon:
                ContactRound,
        },

        {
            label:
                t(
                    'ui.products',
                ),

            description:
                t(
                    'ui.catalog',
                ),

            href:
                '/app/products',

            icon:
                Boxes,
        },

        {
            label:
                t(
                    'inventory.nav',
                ),

            description:
                t(
                    'inventory.navDescription',
                ),

            href:
                '/app/inventory',

            icon:
                Warehouse,
        },

        {
            label:
                locale ===
                'ar'
                    ? 'الإنتاج'
                    : 'Production',

            description:
                locale ===
                'ar'
                    ? 'الإنتاج والاستهلاك الفعلي'
                    : 'Production & actual usage',

            href:
                '/app/inventory/production',

            icon:
                Factory,
        },
    ];

    const builtinFinanceAccess =
        [
            'owner',
            'admin',
            'manager',
            'accountant',
        ].includes(
            activeOrganization
                ?.role
            ?? '',
        );

    const canViewSalesInvoices =
        customPermissions
            ? customPermissions.includes(
                  'finance.sales.view',
              )
            : builtinFinanceAccess;

    const canViewPurchaseInvoices =
        customPermissions
            ? customPermissions.includes(
                  'finance.purchases.view',
              )
            : builtinFinanceAccess;

    const canViewCash =
        customPermissions
            ? customPermissions.includes(
                  'finance.cash.view',
              )
            : builtinFinanceAccess;

    const canViewTaxes =
        customPermissions
            ? customPermissions.includes(
                  'finance.taxes.view',
              )
            : builtinFinanceAccess;

    const canReviewFinanceApprovals =
        customPermissions
            ? customPermissions.includes(
                  'finance.approvals.review',
              )
            : [
                'owner',
                'admin',
                'manager',
            ].includes(
                activeOrganization?.role
                ?? '',
            );

    const canViewFinance =
        canViewSalesInvoices
        || canViewPurchaseInvoices
        || canViewCash
        || canViewTaxes
        || canReviewFinanceApprovals;

    const financeHref =
        '/app/finance';

    if (canViewFinance) {
        navigationItems.push({
            label:
                locale ===
                'ar'
                    ? 'المالية'
                    : 'Finance',

            description:
                canReviewFinanceApprovals
                && ! canViewSalesInvoices
                && ! canViewPurchaseInvoices
                && ! canViewCash
                && ! canViewTaxes
                    ? (
                        locale === 'ar'
                            ? 'الموافقات المالية'
                            : 'Finance approvals'
                    )
                    : (
                        locale === 'ar'
                            ? 'الفواتير والقبض والدفع والضرائب'
                            : 'Invoices, cash & taxes'
                    ),

            href:
                financeHref,

            icon:
                ReceiptText,
        });
    }

    if (
        canViewSalesInvoices
        || canViewPurchaseInvoices
    ) {
        navigationItems.push({
            label:
                locale === 'ar'
                    ? 'التقارير'
                    : 'Reports',

            description:
                locale === 'ar'
                    ? 'أعمار الذمم والتحليلات المالية'
                    : 'Aging & financial reports',

            href:
                '/app/reports',

            icon:
                ChartColumn,
        });
    }

    navigationItems.push({
        label:
            t(
                'staff.title',
            ),

        description:
            t(
                'staff.subtitle',
            ),

        href:
            '/app/staff',

        icon:
            Users,
    });

    if (
        activeOrganization
            ?.role ===
        'owner'
    ) {
        navigationItems.push({
            label:
                t(
                    'staff.roles',
                ),

            description:
                t(
                    'staff.access',
                ),

            href:
                '/app/roles',

            icon:
                ShieldCheck,
        });
    }

    if (
        activeOrganization?.role === 'owner'
        || activeOrganization?.role === 'admin'
    ) {
        navigationItems.push({
            label:
                t(
                    'settings.title',
                ),

            description:
                t(
                    'settings.subtitle',
                ),

            href:
                '/app/settings',

            icon:
                Settings,
        });
    }

    /*
     * Custom workspace roles receive only destinations their explicit
     * permissions allow. Production follows Inventory visibility.
     */
    const permissionByDestination:
        Record<
            string,
            string
        > = {
        '/app/ai':
            'ai.assistant.use',

        '/app/products':
            'products.view',

        '/app/parties':
            'parties.view',

        '/app/inventory':
            'inventory.view',

        '/app/inventory/production':
            'inventory.view',

        /*
         * Finance and Reports are already conditionally added above using the
         * union of the relevant permissions. Do not force them back through a
         * single sales permission here, otherwise approval-only reviewers and
         * purchase-only users lose destinations they are explicitly allowed
         * to open.
         */
        '/app/finance/taxes':
            'finance.taxes.view',
    };

    const visibleItems =
        customPermissions
            ? navigationItems.filter(
                  (
                      item,
                  ) => {
                      if (! item.href) {
                          return true;
                      }

                      const permission =
                          permissionByDestination[
                              item.href
                          ];

                      if (
                          item.href === '/app/finance'
                      ) {
                          return canViewFinance;
                      }

                      if (
                          item.href === '/app/reports'
                      ) {
                          return canViewSalesInvoices
                              || canViewPurchaseInvoices;
                      }

                      return ! permission
                          ||
                          customPermissions.includes(
                              permission,
                          );
                  },
              )
            : navigationItems;

    return (
        <>
            <aside
                className={[
                    'ac-app-nav fixed inset-y-0 start-0 z-50 hidden flex-col border-e border-[var(--ac-line)] bg-[var(--ac-chrome)] shadow-none transition-[width] duration-300 ease-out md:flex',
                    expanded
                        ? 'w-[248px]'
                        : 'w-[84px]',
                ].join(
                    ' ',
                )}
            >
                <div
                    className={[
                        'flex h-[72px] shrink-0 items-center border-b border-[var(--ac-line)] transition-[padding] duration-300',
                        expanded
                            ? 'justify-start px-4'
                            : 'justify-center px-2',
                    ].join(
                        ' ',
                    )}
                >
                    <Link
                        href="/app"
                        aria-label={t(
                            'ui.acconova_home',
                        )}
                        className="group flex min-w-0 items-center gap-3"
                    >
                        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-text)] text-[11px] font-bold tracking-[-0.02em] text-white shadow-[var(--ac-shadow-soft)] transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[var(--ac-shadow-panel)]">
                            AN

                            <span className="absolute -end-1 -top-1 size-2.5 rounded-full border-2 border-white bg-[var(--ac-accent)] motion-safe:animate-pulse" />
                        </div>

                        <div
                            className={[
                                'min-w-0 overflow-hidden transition-all duration-300',
                                expanded
                                    ? 'max-w-[150px] opacity-100'
                                    : 'max-w-0 opacity-0',
                            ].join(
                                ' ',
                            )}
                        >
                            <p className="whitespace-nowrap text-sm font-semibold tracking-[-0.03em] text-[var(--ac-text)]">
                                AccoNova
                            </p>

                            <p className="mt-0.5 whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
                                {t(
                                    'ui.operating_system',
                                )}
                            </p>
                        </div>
                    </Link>
                </div>

                <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 py-5">
                    {visibleItems.map(
                        (
                            item,
                        ) => (
                            <DesktopNavigationItem
                                key={
                                    item.label
                                }
                                item={
                                    item
                                }
                                active={destinationIsActive(
                                    page.url,
                                    item.href,
                                )}
                                expanded={
                                    expanded
                                }
                            />
                        ),
                    )}
                </nav>

                {favorites.length > 0 && (
                    <div className="border-t border-[var(--ac-line)] px-2 py-3">
                        {expanded && (
                            <p className="mb-2 flex items-center gap-2 px-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                <Star size={11} />
                                {locale === 'ar' ? 'المفضلة' : 'Favorites'}
                            </p>
                        )}

                        <div className="space-y-1">
                            {favorites.slice(0, expanded ? 5 : 3).map((favorite) => (
                                <Link
                                    key={favorite.key}
                                    href={favorite.href}
                                    title={expanded ? undefined : favorite.label}
                                    className={[
                                        'flex min-h-10 items-center rounded-[13px] text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-button-hover-bg)]',
                                        expanded
                                            ? 'gap-2 px-2'
                                            : 'justify-center px-1',
                                    ].join(' ')}
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                        <Star size={12} fill="currentColor" />
                                    </span>

                                    {expanded && (
                                        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">
                                            {favorite.label}
                                        </span>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <div className="border-t border-[var(--ac-line)] p-2">
                    {expanded && (
                        <div className="mb-2 rounded-[16px] bg-[var(--ac-accent-soft)] px-3 py-3">
                            <div className="flex items-center gap-2 text-[var(--ac-accent-strong)]">
                                <Sparkles
                                    size={
                                        14
                                    }
                                />

                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                                    {t(
                                        'ui.signal_ready',
                                    )}
                                </span>
                            </div>

                            <p className="mt-2 text-[11px] leading-4 text-[var(--ac-text-soft)]">
                                {t(
                                    'ui.acconova_is_watching_the_operating_picture',
                                )}
                            </p>
                        </div>
                    )}

                    <button
                        type="button"
                        aria-label={
                            expanded
                                ? t(
                                      'ui.collapse_navigation',
                                  )
                                : t(
                                      'ui.expand_navigation',
                                  )
                        }
                        onClick={() =>
                            onExpandedChange(
                                ! expanded,
                            )
                        }
                        className={[
                            'flex h-11 w-full items-center rounded-[14px] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]',
                            expanded
                                ? 'justify-start gap-3 px-3'
                                : 'justify-center px-2',
                        ].join(
                            ' ',
                        )}
                    >
                        {expanded ? (
                            <PanelLeftClose
                                size={
                                    17
                                }
                            />
                        ) : (
                            <PanelLeftOpen
                                size={
                                    17
                                }
                            />
                        )}

                        {expanded && (
                            <span className="text-xs font-semibold">
                                {t(
                                    'ui.collapse',
                                )}
                            </span>
                        )}
                    </button>
                </div>
            </aside>

            <div
                aria-hidden={
                    ! mobileOpen
                }
                onClick={() =>
                    onMobileOpenChange(
                        false,
                    )
                }
                className={[
                    'fixed inset-0 z-[70] bg-[var(--ac-text)]/22 backdrop-blur-[3px] transition-opacity duration-300 md:hidden',
                    mobileOpen
                        ? 'pointer-events-auto opacity-100'
                        : 'pointer-events-none opacity-0',
                ].join(
                    ' ',
                )}
            />

            <aside
                className={[
                    'ac-app-nav fixed inset-y-0 start-0 z-[80] flex w-[min(84vw,310px)] flex-col border-e border-[var(--ac-line)] bg-[var(--ac-chrome)] shadow-none transition-transform duration-300 ease-out md:hidden',
                    mobileOpen
                        ? 'translate-x-0'
                        : '-translate-x-full rtl:translate-x-full',
                ].join(
                    ' ',
                )}
                style={{
                    paddingTop:
                        'env(safe-area-inset-top)',

                    paddingBottom:
                        'env(safe-area-inset-bottom)',
                }}
            >
                <div className="flex h-[68px] items-center justify-between border-b border-[var(--ac-line)] px-4">
                    <Link
                        href="/app"
                        onClick={() =>
                            onMobileOpenChange(
                                false,
                            )
                        }
                        className="flex items-center gap-3"
                    >
                        <div className="relative flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-text)] text-[10px] font-bold text-white">
                            AN

                            <span className="absolute -end-1 -top-1 size-2.5 rounded-full border-2 border-white bg-[var(--ac-accent)] motion-safe:animate-pulse" />
                        </div>

                        <div>
                            <p className="text-sm font-semibold tracking-[-0.03em]">
                                AccoNova
                            </p>

                            <p className="text-[8px] font-semibold uppercase tracking-[0.17em] text-[var(--ac-text-muted)]">
                                {t(
                                    'ui.business_operating_system',
                                )}
                            </p>
                        </div>
                    </Link>

                    <button
                        type="button"
                        aria-label={t(
                            'ui.close_navigation',
                        )}
                        onClick={() =>
                            onMobileOpenChange(
                                false,
                            )
                        }
                        className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)]"
                    >
                        <X
                            size={
                                18
                            }
                        />
                    </button>
                </div>

                <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-5">
                    {visibleItems.map(
                        (
                            item,
                        ) => (
                            <MobileNavigationItem
                                key={
                                    item.label
                                }
                                item={
                                    item
                                }
                                active={destinationIsActive(
                                    page.url,
                                    item.href,
                                )}
                                onNavigate={() =>
                                    onMobileOpenChange(
                                        false,
                                    )
                                }
                            />
                        ),
                    )}
                </nav>

                {favorites.length > 0 && (
                    <div className="mx-3 mt-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                        <p className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                            <Star size={11} />
                            {locale === 'ar' ? 'المفضلة' : 'Favorites'}
                        </p>

                        <div className="space-y-1">
                            {favorites.slice(0, 5).map((favorite) => (
                                <Link
                                    key={favorite.key}
                                    href={favorite.href}
                                    onClick={() => onMobileOpenChange(false)}
                                    className="flex items-center gap-2 rounded-[12px] px-2 py-2 text-xs text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)]"
                                >
                                    <Star size={12} className="shrink-0 text-[var(--ac-accent)]" fill="currentColor" />
                                    <span className="min-w-0 flex-1 truncate">
                                        {favorite.label}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                <div className="m-3 rounded-[18px] bg-[var(--ac-accent-soft)] p-4">
                    <div className="flex items-center gap-2 text-[var(--ac-accent-strong)]">
                        <Sparkles
                            size={
                                15
                            }
                        />

                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                            {t(
                                'ui.business_signal',
                            )}
                        </span>
                    </div>

                    <p className="mt-2 text-xs leading-5 text-[var(--ac-text-soft)]">
                        {t(
                            'ui.keep_the_business_moving_from_one_operating_surface',
                        )}
                    </p>
                </div>
            </aside>
        </>
    );
}

type DesktopNavigationItemProps = {
    item: NavigationItem;

    active: boolean;

    expanded: boolean;
};

/**
 * Render one desktop command-rail destination.
 */
function DesktopNavigationItem({
    item,
    active,
    expanded,
}: DesktopNavigationItemProps) {
    const Icon =
        item.icon;

    const content = (
        <>
            <div
                className={[
                    'flex size-10 shrink-0 items-center justify-center rounded-[13px] transition duration-200',
                    active
                        ? 'bg-white text-[var(--ac-text)] shadow-[var(--ac-shadow-soft)]'
                        : 'text-[var(--ac-text-muted)]',
                ].join(
                    ' ',
                )}
            >
                <Icon
                    size={
                        17
                    }
                />
            </div>

            <div
                className={[
                    'min-w-0 overflow-hidden transition-all duration-300',
                    expanded
                        ? 'max-w-[150px] opacity-100'
                        : 'max-w-0 opacity-0',
                ].join(
                    ' ',
                )}
            >
                <p className="whitespace-nowrap text-xs font-semibold">
                    {
                        item.label
                    }
                </p>

                <p className="mt-0.5 whitespace-nowrap text-[10px] text-[var(--ac-text-muted)]">
                    {
                        item.description
                    }
                </p>
            </div>
        </>
    );

    if (
        item.disabled
        ||
        ! item.href
    ) {
        return (
            <div
                title={
                    expanded
                        ? undefined
                        : item.label
                }
                className={[
                    'flex min-h-12 items-center rounded-[16px] opacity-35',
                    expanded
                        ? 'gap-3 px-2'
                        : 'justify-center px-1',
                ].join(
                    ' ',
                )}
            >
                {
                    content
                }
            </div>
        );
    }

    return (
        <Link
            href={
                item.href
            }
            title={
                expanded
                    ? undefined
                    : item.label
            }
            className={[
                'relative flex min-h-12 items-center rounded-[16px] transition duration-200',
                expanded
                    ? 'gap-3 px-2'
                    : 'justify-center px-1',

                active
                    ? 'bg-[var(--ac-button-hover-bg)] text-[var(--ac-text)]'
                    : 'text-[var(--ac-text-soft)] hover:bg-[var(--ac-button-hover-bg)]',
            ].join(
                ' ',
            )}
        >
            {active && (
                <span className="absolute -start-2 h-6 w-[3px] rounded-e-full bg-[var(--ac-accent)]" />
            )}

            {
                content
            }
        </Link>
    );
}

type MobileNavigationItemProps = {
    item: NavigationItem;

    active: boolean;

    onNavigate: () => void;
};

/**
 * Render one mobile navigation destination.
 */
function MobileNavigationItem({
    item,
    active,
    onNavigate,
}: MobileNavigationItemProps) {
    const Icon =
        item.icon;

    if (
        item.disabled
        ||
        ! item.href
    ) {
        return (
            <div className="flex items-center gap-3 rounded-[16px] px-3 py-3 opacity-35">
                <div className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)]">
                    <Icon
                        size={
                            17
                        }
                    />
                </div>

                <div>
                    <p className="text-sm font-semibold">
                        {
                            item.label
                        }
                    </p>

                    <p className="mt-0.5 text-[11px] text-[var(--ac-text-muted)]">
                        {
                            item.description
                        }
                    </p>
                </div>
            </div>
        );
    }

    return (
        <Link
            href={
                item.href
            }
            onClick={
                onNavigate
            }
            className={[
                'flex items-center gap-3 rounded-[16px] px-3 py-3 transition',
                active
                    ? 'bg-[var(--ac-button-hover-bg)]'
                    : 'hover:bg-[var(--ac-button-hover-bg)]',
            ].join(
                ' ',
            )}
        >
            <div
                className={[
                    'flex size-10 items-center justify-center rounded-[13px]',
                    active
                        ? 'bg-white shadow-[var(--ac-shadow-soft)]'
                        : 'bg-[var(--ac-bg-soft)]',
                ].join(
                    ' ',
                )}
            >
                <Icon
                    size={
                        17
                    }
                />
            </div>

            <div>
                <p className="text-sm font-semibold">
                    {
                        item.label
                    }
                </p>

                <p className="mt-0.5 text-[11px] text-[var(--ac-text-muted)]">
                    {
                        item.description
                    }
                </p>
            </div>
        </Link>
    );
}
