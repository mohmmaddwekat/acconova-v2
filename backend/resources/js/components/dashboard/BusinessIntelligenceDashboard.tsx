import { ApiError, apiRequest } from '@/lib/http';
import type { AppPageProps } from '@/types/app';
import { Link, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowRight,
    ArrowUp,
    BarChart3,
    CheckCircle2,
    CircleDollarSign,
    Eye,
    EyeOff,
    GripVertical,
    ListChecks,
    Plus,
    RefreshCcw,
    Settings2,
    Sparkles,
    Target,
    TrendingDown,
    TrendingUp,
    UsersRound,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type DragEvent,
    type FormEvent,
    type ReactNode,
} from 'react';

type WidgetKey =
    | 'kpi_targets'
    | 'trend_comparison'
    | 'profitability'
    | 'morning_actions'
    | 'exceptions'
    | 'changed_today';

type KpiTarget = {
    id: number;
    metric: string;
    period: string;
    target_value: string;
    current_value: string;
    achievement_percent: number;
    currency: string | null;
};

type Trend = {
    metric: string;
    current: string;
    previous_month: string;
    previous_year: string;
    vs_previous_month_percent: number | null;
    vs_previous_year_percent: number | null;
};

type ProfitRow = {
    id: number;
    name: string;
    revenue: string;
    gross_profit: string;
    url: string;
};

type Profitability = {
    visible: boolean;
    period?: string;
    revenue: string;
    cogs: string;
    gross_profit: string;
    margin_percent: string;
    currency: string;
    top_customers: ProfitRow[];
    top_products: ProfitRow[];
};

type ChangedItem = {
    key: string;
    kind: string;
    title: string;
    detail: string | null;
    actor: string | null;
    created_at: string;
    url: string;
};

type ActionItem = {
    kind: string;
    title: string;
    count: number;
    priority: 'high' | 'medium';
    url: string;
};

type ExceptionItem = {
    kind: string;
    severity: 'critical' | 'warning' | 'decision';
    title: string;
    count: number;
    url: string;
};

type DashboardData = {
    preferences: {
        layout: WidgetKey[];
        exception_only: boolean;
    };
    kpi_targets: KpiTarget[];
    trends: Trend[];
    profitability: Profitability;
    changed_today: ChangedItem[];
    changed_since: string;
    morning_actions: {
        total_actions: number;
        items: ActionItem[];
    };
    exceptions: {
        total: number;
        items: ExceptionItem[];
    };
    generated_at: string;
};

const ALL_WIDGETS: WidgetKey[] = [
    'kpi_targets',
    'trend_comparison',
    'profitability',
    'morning_actions',
    'exceptions',
    'changed_today',
];

function money(
    value: string | number,
    currency = '',
): string {
    const parsed = Number(value);

    return (
        Number.isFinite(parsed)
            ? parsed.toLocaleString(undefined, {
                maximumFractionDigits: 2,
            })
            : String(value)
    ) + (currency ? ' ' + currency : '');
}

function percent(value: number | null): string {
    if (value === null) {
        return '—';
    }

    return (
        value > 0
            ? '+'
            : ''
    ) + value.toFixed(1) + '%';
}

function metricLabel(
    metric: string,
    ar: boolean,
): string {
    const labels: Record<
        string,
        [string, string]
    > = {
        sales_revenue: ['مبيعات الشهر', 'Monthly sales'],
        purchases: ['مشتريات الشهر', 'Monthly purchases'],
        collections: ['تحصيلات الشهر', 'Monthly collections'],
        gross_profit: ['الربح الإجمالي', 'Gross profit'],
        new_customers: ['عملاء جدد', 'New customers'],
    };

    return labels[metric]
        ? (
            ar
                ? labels[metric][0]
                : labels[metric][1]
        )
        : metric;
}

function widgetLabel(
    widget: WidgetKey,
    ar: boolean,
): string {
    const labels: Record<
        WidgetKey,
        [string, string]
    > = {
        kpi_targets: ['أهداف KPI', 'KPI targets'],
        trend_comparison: ['مقارنة الاتجاهات', 'Trend comparison'],
        profitability: ['لوحة الربحية', 'Profitability'],
        morning_actions: ['قائمة الصباح', 'Morning actions'],
        exceptions: ['الاستثناءات أولاً', 'Exception first'],
        changed_today: ['ماذا تغيّر؟', 'What changed'],
    };

    return ar
        ? labels[widget][0]
        : labels[widget][1];
}

function WidgetShell({
    title,
    eyebrow,
    icon,
    children,
}: {
    title: string;
    eyebrow: string;
    icon: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                    {icon}
                </div>
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                        {eyebrow}
                    </p>
                    <h2 className="mt-1 text-base font-bold text-[var(--ac-text)]">
                        {title}
                    </h2>
                </div>
            </div>
            <div className="mt-4">
                {children}
            </div>
        </section>
    );
}

export function BusinessIntelligenceDashboard({
    ar,
}: {
    ar: boolean;
}) {
    const organization =
        usePage<AppPageProps>().props.workspace
            .activeOrganization;
    const role =
        organization?.role ?? '';
    const canManageTargets = [
        'owner',
        'admin',
        'manager',
    ].includes(role);

    const [data, setData] =
        useState<DashboardData | null>(null);
    const [loading, setLoading] =
        useState(true);
    const [busy, setBusy] =
        useState(false);
    const [error, setError] =
        useState('');
    const [builderOpen, setBuilderOpen] =
        useState(false);
    const [draftLayout, setDraftLayout] =
        useState<WidgetKey[]>(ALL_WIDGETS);
    const [dragged, setDragged] =
        useState<WidgetKey | null>(null);
    const [targetOpen, setTargetOpen] =
        useState(false);
    const [targetForm, setTargetForm] =
        useState({
            metric: 'sales_revenue',
            target_value: '50000',
            currency:
                organization?.currency ?? '',
        });

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar
            ? arabic
            : english;

    async function load(): Promise<void> {
        if (! organization) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: DashboardData;
                }>(
                    '/api/dashboard-intelligence',
                );

            setData(
                response.data,
            );
            setDraftLayout(
                response.data
                    .preferences
                    .layout,
            );
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر تحميل ذكاء لوحة التحكم.',
                        'Could not load dashboard intelligence.',
                    ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [
        organization?.id,
    ]);

    async function savePreferences(
        layout = draftLayout,
        exceptionOnly =
            data?.preferences
                .exception_only
            ?? false,
    ): Promise<void> {
        if (
            busy
            || layout.length === 0
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: {
                        layout: WidgetKey[];
                        exception_only: boolean;
                    };
                }>(
                    '/api/dashboard-intelligence/preferences',
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            layout,
                            exception_only:
                                exceptionOnly,
                        }),
                    },
                );

            setData(current =>
                current
                    ? {
                        ...current,
                        preferences:
                            response.data,
                    }
                    : current,
            );
            setDraftLayout(
                response.data.layout,
            );
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر حفظ تصميم لوحة التحكم.',
                        'Could not save dashboard layout.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    function toggleWidget(
        widget: WidgetKey,
    ): void {
        setDraftLayout(current => {
            if (
                current.includes(
                    widget,
                )
            ) {
                if (
                    current.length === 1
                ) {
                    return current;
                }

                return current.filter(
                    item =>
                        item !== widget,
                );
            }

            return [
                ...current,
                widget,
            ];
        });
    }

    function dropOn(
        target: WidgetKey,
        event: DragEvent,
    ): void {
        event.preventDefault();

        if (
            ! dragged
            || dragged === target
        ) {
            return;
        }

        setDraftLayout(current => {
            const next =
                current.filter(
                    item =>
                        item !== dragged,
                );
            const index =
                next.indexOf(
                    target,
                );

            next.splice(
                Math.max(
                    0,
                    index,
                ),
                0,
                dragged,
            );

            return next;
        });

        setDragged(null);
    }

    function moveWidget(
        widget: WidgetKey,
        direction: -1 | 1,
    ): void {
        setDraftLayout(current => {
            const index =
                current.indexOf(
                    widget,
                );
            const nextIndex =
                index + direction;

            if (
                index < 0
                || nextIndex < 0
                || nextIndex >=
                    current.length
            ) {
                return current;
            }

            const next = [
                ...current,
            ];
            [
                next[index],
                next[nextIndex],
            ] = [
                next[nextIndex],
                next[index],
            ];

            return next;
        });
    }

    async function removeTarget(
        id: number,
    ): Promise<void> {
        if (
            busy
            || ! canManageTargets
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/dashboard-intelligence/kpi-targets/'
                + id,
                {
                    method: 'DELETE',
                },
            );
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر حذف الهدف.',
                        'Could not delete KPI target.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function createTarget(
        event: FormEvent,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
            || ! canManageTargets
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/dashboard-intelligence/kpi-targets',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        metric:
                            targetForm.metric,
                        period:
                            'monthly',
                        target_value:
                            targetForm.target_value,
                        currency:
                            targetForm.currency
                            || null,
                    }),
                },
            );

            setTargetOpen(false);
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : text(
                        'تعذر حفظ الهدف.',
                        'Could not save KPI target.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    const renderedLayout =
        useMemo(
            () =>
                data?.preferences
                    .layout
                    ?? [],
            [data],
        );

    if (
        loading
        && ! data
    ) {
        return (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {[1, 2, 3, 4].map(
                    value => (
                        <div
                            key={value}
                            className="h-48 animate-pulse rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                        />
                    ),
                )}
            </div>
        );
    }

    if (! data) {
        return error ? (
            <div className="mt-5 rounded-[18px] border border-red-400/30 bg-red-500/10 p-4 text-xs text-red-300">
                {error}
            </div>
        ) : null;
    }

    const exceptionOnly =
        data.preferences
            .exception_only;

    const widget = (
        key: WidgetKey,
    ): ReactNode => {
        if (
            exceptionOnly
            && key !== 'exceptions'
            && key !== 'morning_actions'
        ) {
            return null;
        }

        if (
            key === 'kpi_targets'
        ) {
            return (
                <WidgetShell
                    title={text(
                        'أهداف KPI',
                        'KPI targets',
                    )}
                    eyebrow="Targets"
                    icon={
                        <Target
                            size={17}
                        />
                    }
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {text(
                                'حوّل الهدف الشهري إلى نسبة إنجاز واضحة بدل رقم منفصل.',
                                'Turn monthly goals into visible achievement progress.',
                            )}
                        </p>
                        {canManageTargets && (
                            <button
                                type="button"
                                onClick={() =>
                                    setTargetOpen(
                                        true,
                                    )
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                            >
                                <Plus
                                    size={13}
                                />
                                {text(
                                    'هدف جديد',
                                    'New target',
                                )}
                            </button>
                        )}
                    </div>

                    {data.kpi_targets
                        .length === 0 ? (
                        <div className="mt-4 rounded-[14px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                            {text(
                                'لم يتم تحديد أهداف KPI بعد.',
                                'No KPI targets yet.',
                            )}
                        </div>
                    ) : (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {data.kpi_targets.map(
                                target => {
                                    const achieved =
                                        Math.min(
                                            100,
                                            target
                                                .achievement_percent,
                                        );

                                    return (
                                        <div
                                            key={
                                                target.id
                                            }
                                            className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                                                        {metricLabel(
                                                            target.metric,
                                                            ar,
                                                        )}
                                                    </p>
                                                    <strong className="mt-1 block text-2xl text-[var(--ac-text)]">
                                                        {target
                                                            .achievement_percent
                                                            .toFixed(
                                                                0,
                                                            )}
                                                        %
                                                    </strong>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Target
                                                        size={16}
                                                        className="text-[var(--ac-accent)]"
                                                    />
                                                    {canManageTargets && (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                void removeTarget(
                                                                    target.id,
                                                                )
                                                            }
                                                            className="flex size-7 items-center justify-center rounded-[8px] border border-red-400/30 text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                                                            aria-label={text(
                                                                'حذف الهدف',
                                                                'Delete target',
                                                            )}
                                                        >
                                                            <X
                                                                size={11}
                                                            />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ac-line)]">
                                                <div
                                                    className="h-full rounded-full bg-[var(--ac-accent)] transition-[width]"
                                                    style={{
                                                        width:
                                                            achieved
                                                            + '%',
                                                    }}
                                                />
                                            </div>

                                            <p className="mt-2 text-[9px] text-[var(--ac-text-muted)]">
                                                {money(
                                                    target.current_value,
                                                    target.currency
                                                    ?? '',
                                                )}
                                                {' / '}
                                                {money(
                                                    target.target_value,
                                                    target.currency
                                                    ?? '',
                                                )}
                                            </p>
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    )}
                </WidgetShell>
            );
        }

        if (
            key ===
            'trend_comparison'
        ) {
            return (
                <WidgetShell
                    title={text(
                        'مقارنة الاتجاهات',
                        'Trend comparison',
                    )}
                    eyebrow="MoM / YoY"
                    icon={
                        <TrendingUp
                            size={17}
                        />
                    }
                >
                    {data.trends.length ===
                    0 ? (
                        <p className="rounded-[14px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                            {text(
                                'لا توجد بيانات كافية للمقارنة.',
                                'Not enough data for comparison.',
                            )}
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {data.trends.map(
                                trend => {
                                    const rising =
                                        (
                                            trend
                                                .vs_previous_month_percent
                                            ?? 0
                                        ) >= 0;
                                    const Icon =
                                        rising
                                            ? TrendingUp
                                            : TrendingDown;

                                    return (
                                        <div
                                            key={
                                                trend.metric
                                            }
                                            className="grid items-center gap-3 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                                        >
                                            <div>
                                                <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                    {metricLabel(
                                                        trend.metric,
                                                        ar,
                                                    )}
                                                </p>
                                                <strong className="mt-1 block text-base text-[var(--ac-text)]">
                                                    {money(
                                                        trend.current,
                                                        data
                                                            .profitability
                                                            .currency,
                                                    )}
                                                </strong>
                                            </div>
                                            <div className="text-start sm:text-end">
                                                <p className="text-[8px] uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'مقابل الشهر السابق',
                                                        'vs previous month',
                                                    )}
                                                </p>
                                                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--ac-accent)]">
                                                    <Icon
                                                        size={12}
                                                    />
                                                    {percent(
                                                        trend
                                                            .vs_previous_month_percent,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="text-start sm:text-end">
                                                <p className="text-[8px] uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                    {text(
                                                        'مقابل السنة السابقة',
                                                        'vs previous year',
                                                    )}
                                                </p>
                                                <strong className="mt-1 block text-[10px] text-[var(--ac-text-soft)]">
                                                    {percent(
                                                        trend
                                                            .vs_previous_year_percent,
                                                    )}
                                                </strong>
                                            </div>
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    )}
                </WidgetShell>
            );
        }

        if (
            key ===
            'profitability'
        ) {
            if (
                ! data
                    .profitability
                    .visible
            ) {
                return null;
            }

            const profit =
                data.profitability;

            return (
                <WidgetShell
                    title={text(
                        'لوحة الربحية',
                        'Profitability dashboard',
                    )}
                    eyebrow={
                        profit.period
                        ?? 'Profit'
                    }
                    icon={
                        <CircleDollarSign
                            size={17}
                        />
                    }
                >
                    <div className="grid gap-2 sm:grid-cols-4">
                        {[
                            [
                                text(
                                    'الإيرادات',
                                    'Revenue',
                                ),
                                profit.revenue,
                            ],
                            [
                                text(
                                    'تكلفة البضاعة',
                                    'COGS',
                                ),
                                profit.cogs,
                            ],
                            [
                                text(
                                    'الربح الإجمالي',
                                    'Gross profit',
                                ),
                                profit.gross_profit,
                            ],
                            [
                                text(
                                    'هامش الربح',
                                    'Margin',
                                ),
                                profit
                                    .margin_percent
                                    + '%',
                            ],
                        ].map(
                            ([
                                label,
                                value,
                            ]) => (
                                <div
                                    key={
                                        label
                                    }
                                    className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3"
                                >
                                    <p className="text-[8px] uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                        {
                                            label
                                        }
                                    </p>
                                    <strong className="mt-2 block text-sm text-[var(--ac-text)]">
                                        {label ===
                                        text(
                                            'هامش الربح',
                                            'Margin',
                                        )
                                            ? value
                                            : money(
                                                value,
                                                profit.currency,
                                            )}
                                    </strong>
                                </div>
                            ),
                        )}
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {([
                            {
                                heading: text(
                                    'أفضل العملاء ربحية',
                                    'Most profitable customers',
                                ),
                                rows:
                                    profit.top_customers,
                                Icon: UsersRound,
                            },
                            {
                                heading: text(
                                    'أفضل المنتجات ربحية',
                                    'Most profitable products',
                                ),
                                rows:
                                    profit.top_products,
                                Icon: BarChart3,
                            },
                        ] satisfies Array<{
                            heading: string;
                            rows: ProfitRow[];
                            Icon: LucideIcon;
                        }>).map(
                            ({
                                heading,
                                rows,
                                Icon,
                            }) => (
                                <div
                                    key={
                                        heading
                                    }
                                    className="overflow-hidden rounded-[15px] border border-[var(--ac-line)]"
                                >
                                    <div className="flex items-center gap-2 bg-[var(--ac-surface-soft)] px-3 py-2.5">
                                        <Icon
                                            size={13}
                                            className="text-[var(--ac-accent)]"
                                        />
                                        <strong className="text-[10px] text-[var(--ac-text)]">
                                            {
                                                heading
                                            }
                                        </strong>
                                    </div>
                                    <div className="divide-y divide-[var(--ac-line)]">
                                        {rows.length ===
                                        0 ? (
                                            <p className="p-4 text-center text-[10px] text-[var(--ac-text-muted)]">
                                                {text(
                                                    'لا توجد بيانات.',
                                                    'No data yet.',
                                                )}
                                            </p>
                                        ) : (
                                            rows.map(
                                                row => (
                                                    <Link
                                                        key={
                                                            row.id
                                                        }
                                                        href={
                                                            row.url
                                                        }
                                                        className="flex items-center justify-between gap-3 px-3 py-2.5 transition hover:bg-[var(--ac-surface-soft)]"
                                                    >
                                                        <span className="truncate text-[10px] font-semibold text-[var(--ac-text)]">
                                                            {
                                                                row.name
                                                            }
                                                        </span>
                                                        <span className="shrink-0 text-[9px] font-bold text-[var(--ac-accent)]">
                                                            {money(
                                                                row.gross_profit,
                                                                profit.currency,
                                                            )}
                                                        </span>
                                                    </Link>
                                                ),
                                            )
                                        )}
                                    </div>
                                </div>
                            ),
                        )}
                    </div>
                </WidgetShell>
            );
        }

        if (
            key ===
            'morning_actions'
        ) {
            return (
                <WidgetShell
                    title={text(
                        'قائمة الصباح',
                        'Morning action list',
                    )}
                    eyebrow={text(
                        'شو لازم تعمل اليوم؟',
                        'What needs doing today?',
                    )}
                    icon={
                        <ListChecks
                            size={17}
                        />
                    }
                >
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <strong className="text-3xl text-[var(--ac-text)]">
                                {
                                    data
                                        .morning_actions
                                        .total_actions
                                }
                            </strong>
                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                {text(
                                    'إجراء مستحق أو متأخر',
                                    'due or overdue actions',
                                )}
                            </p>
                        </div>
                        <Sparkles
                            size={20}
                            className="text-[var(--ac-accent)]"
                        />
                    </div>

                    <div className="mt-4 space-y-2">
                        {data
                            .morning_actions
                            .items.length ===
                        0 ? (
                            <div className="rounded-[14px] border border-emerald-400/25 bg-emerald-500/10 p-4 text-xs text-emerald-300">
                                <CheckCircle2
                                    size={15}
                                    className="mb-2"
                                />
                                {text(
                                    'ما في إجراءات حرجة مستحقة اليوم.',
                                    'No critical actions are due today.',
                                )}
                            </div>
                        ) : (
                            data
                                .morning_actions
                                .items.map(
                                    item => (
                                        <Link
                                            key={
                                                item.kind
                                            }
                                            href={
                                                item.url
                                            }
                                            className="flex items-center justify-between gap-3 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2.5 transition hover:border-[var(--ac-accent)]"
                                        >
                                            <div>
                                                <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                    {text(
                                                        item.title,
                                                        item.title,
                                                    )}
                                                </p>
                                                <p className="mt-0.5 text-[8px] text-[var(--ac-text-muted)]">
                                                    {
                                                        item.priority
                                                    }
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-[var(--ac-line)] px-2 py-1 text-[9px] font-bold text-[var(--ac-accent)]">
                                                {
                                                    item.count
                                                }
                                            </span>
                                        </Link>
                                    ),
                                )
                        )}
                    </div>
                </WidgetShell>
            );
        }

        if (
            key === 'exceptions'
        ) {
            return (
                <WidgetShell
                    title={text(
                        'الاستثناءات أولاً',
                        'Exception-first dashboard',
                    )}
                    eyebrow={text(
                        'فقط ما يحتاج قرار',
                        'Only what needs a decision',
                    )}
                    icon={
                        <AlertTriangle
                            size={17}
                        />
                    }
                >
                    {data.exceptions
                        .items.length ===
                    0 ? (
                        <div className="rounded-[14px] border border-emerald-400/25 bg-emerald-500/10 p-5 text-xs text-emerald-300">
                            <CheckCircle2
                                size={16}
                                className="mb-2"
                            />
                            {text(
                                'لا توجد استثناءات حرجة الآن.',
                                'No critical exceptions right now.',
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {data.exceptions.items.map(
                                item => (
                                    <Link
                                        key={
                                            item.kind
                                        }
                                        href={
                                            item.url
                                        }
                                        className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 transition hover:border-[var(--ac-accent)]"
                                    >
                                        <div>
                                            <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                {
                                                    item.title
                                                }
                                            </p>
                                            <p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                {
                                                    item.severity
                                                }
                                            </p>
                                        </div>
                                        <strong className="text-xl text-[var(--ac-accent)]">
                                            {
                                                item.count
                                            }
                                        </strong>
                                    </Link>
                                ),
                            )}
                        </div>
                    )}
                </WidgetShell>
            );
        }

        return (
            <WidgetShell
                title={text(
                    'ماذا تغيّر منذ آخر مرة؟',
                    'What changed since last time?',
                )}
                eyebrow={text(
                    'منذ آخر تسجيل دخول',
                    'Since your previous login',
                )}
                icon={
                    <RefreshCcw
                        size={17}
                    />
                }
            >
                {data.changed_today
                    .length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                        {text(
                            'لا توجد تغييرات مهمة جديدة.',
                            'No important new changes.',
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--ac-line)] overflow-hidden rounded-[14px] border border-[var(--ac-line)]">
                        {data.changed_today
                            .slice(
                                0,
                                8,
                            )
                            .map(
                                item => (
                                    <Link
                                        key={
                                            item.key
                                        }
                                        href={
                                            item.url
                                        }
                                        className="flex items-start justify-between gap-3 bg-[var(--ac-surface-soft)] px-3 py-3 transition hover:bg-[var(--ac-bg)]"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-[10px] font-semibold text-[var(--ac-text)]">
                                                {
                                                    item.title
                                                }
                                            </p>
                                            <p className="mt-1 truncate text-[8px] text-[var(--ac-text-muted)]">
                                                {[
                                                    item.actor,
                                                    item.detail,
                                                ]
                                                    .filter(
                                                        Boolean,
                                                    )
                                                    .join(
                                                        ' · ',
                                                    )}
                                            </p>
                                        </div>
                                        <ArrowRight
                                            size={13}
                                            className="mt-0.5 shrink-0 text-[var(--ac-text-muted)]"
                                        />
                                    </Link>
                                ),
                            )}
                    </div>
                )}
            </WidgetShell>
        );
    };

    return (
        <section className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                <div>
                    <p className="text-[10px] font-bold text-[var(--ac-text)]">
                        {text(
                            'لوحة ذكاء الأعمال',
                            'Business intelligence dashboard',
                        )}
                    </p>
                    <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                        {text(
                            'رتّب Widgets واسحبها بالشكل الذي يناسب عملك.',
                            'Reorder and choose the widgets that fit your operation.',
                        )}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            void savePreferences(
                                data
                                    .preferences
                                    .layout,
                                ! exceptionOnly,
                            )
                        }
                        className={[
                            'inline-flex h-9 items-center gap-2 rounded-[11px] border px-3 text-[10px] font-semibold transition',
                            exceptionOnly
                                ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)]',
                        ].join(' ')}
                    >
                        {exceptionOnly
                            ? (
                                <EyeOff
                                    size={13}
                                />
                            )
                            : (
                                <Eye
                                    size={13}
                                />
                            )}
                        {text(
                            'الاستثناءات فقط',
                            'Exceptions only',
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setDraftLayout(
                                data
                                    .preferences
                                    .layout,
                            );
                            setBuilderOpen(
                                true,
                            );
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                    >
                        <Settings2
                            size={13}
                        />
                        {text(
                            'تخصيص اللوحة',
                            'Customize dashboard',
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mt-3 rounded-[14px] border border-red-400/30 bg-red-500/10 p-3 text-[10px] text-red-300">
                    {error}
                </div>
            )}

            <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
                {renderedLayout.map(
                    key => (
                        <div
                            key={
                                key
                            }
                            className={
                                key ===
                                    'profitability'
                                ? 'xl:col-span-2'
                                : ''
                            }
                        >
                            {
                                widget(
                                    key,
                                )
                            }
                        </div>
                    ),
                )}
            </div>

            {builderOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-2xl rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-[var(--ac-text)]">
                                    {text(
                                        'Dashboard Builder',
                                        'Dashboard Builder',
                                    )}
                                </h3>
                                <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                    {text(
                                        'اسحب العناصر لترتيبها، أو أخفِ أي Widget لا تحتاجه.',
                                        'Drag widgets to reorder them or hide anything you do not need.',
                                    )}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setBuilderOpen(
                                        false,
                                    )
                                }
                                className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--ac-line)] text-[var(--ac-text-muted)]"
                            >
                                <X
                                    size={14}
                                />
                            </button>
                        </div>

                        <div className="mt-4 space-y-2">
                            {ALL_WIDGETS.map(
                                item => {
                                    const visible =
                                        draftLayout.includes(
                                            item,
                                        );
                                    const index =
                                        draftLayout.indexOf(
                                            item,
                                        );

                                    return (
                                        <div
                                            key={
                                                item
                                            }
                                            draggable={
                                                visible
                                            }
                                            onDragStart={() =>
                                                setDragged(
                                                    item,
                                                )
                                            }
                                            onDragOver={
                                                event =>
                                                    event.preventDefault()
                                            }
                                            onDrop={
                                                event =>
                                                    dropOn(
                                                        item,
                                                        event,
                                                    )
                                            }
                                            className={[
                                                'flex items-center gap-3 rounded-[14px] border p-3 transition',
                                                visible
                                                    ? 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)]'
                                                    : 'border-dashed border-[var(--ac-line)] opacity-60',
                                            ].join(' ')}
                                        >
                                            <GripVertical
                                                size={15}
                                                className="cursor-grab text-[var(--ac-text-muted)]"
                                            />
                                            <span className="min-w-0 flex-1 text-[10px] font-semibold text-[var(--ac-text)]">
                                                {widgetLabel(
                                                    item,
                                                    ar,
                                                )}
                                            </span>

                                            {visible && (
                                                <div className="flex gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            index <= 0
                                                        }
                                                        onClick={() =>
                                                            moveWidget(
                                                                item,
                                                                -1,
                                                            )
                                                        }
                                                        className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] disabled:opacity-30"
                                                    >
                                                        <ArrowUp
                                                            size={12}
                                                        />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            index ===
                                                            draftLayout.length
                                                                - 1
                                                        }
                                                        onClick={() =>
                                                            moveWidget(
                                                                item,
                                                                1,
                                                            )
                                                        }
                                                        className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] disabled:opacity-30"
                                                    >
                                                        <ArrowDown
                                                            size={12}
                                                        />
                                                    </button>
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    toggleWidget(
                                                        item,
                                                    )
                                                }
                                                className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)]"
                                            >
                                                {visible
                                                    ? (
                                                        <Eye
                                                            size={12}
                                                        />
                                                    )
                                                    : (
                                                        <EyeOff
                                                            size={12}
                                                        />
                                                    )}
                                            </button>
                                        </div>
                                    );
                                },
                            )}
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setBuilderOpen(
                                        false,
                                    )
                                }
                                className="h-10 rounded-[11px] border border-[var(--ac-line)] px-4 text-xs font-semibold text-[var(--ac-text-soft)]"
                            >
                                {text(
                                    'إلغاء',
                                    'Cancel',
                                )}
                            </button>
                            <button
                                type="button"
                                disabled={
                                    busy
                                    || draftLayout.length ===
                                        0
                                }
                                onClick={() =>
                                    void savePreferences()
                                        .then(
                                            () =>
                                                setBuilderOpen(
                                                    false,
                                                ),
                                        )
                                }
                                className="h-10 rounded-[11px] border border-[var(--ac-accent)] px-4 text-xs font-bold text-[var(--ac-accent)] disabled:opacity-40"
                            >
                                {text(
                                    'حفظ التصميم',
                                    'Save layout',
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {targetOpen && (
                <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
                    <form
                        onSubmit={
                            event =>
                                void createTarget(
                                    event,
                                )
                        }
                        className="w-full max-w-md rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-[var(--ac-text)]">
                                    {text(
                                        'هدف KPI جديد',
                                        'New KPI target',
                                    )}
                                </h3>
                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                    {text(
                                        'الهدف حاليًا شهري ويُقارن تلقائيًا بالقيمة الفعلية.',
                                        'Targets are monthly and compare automatically with actuals.',
                                    )}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() =>
                                    setTargetOpen(
                                        false,
                                    )
                                }
                                className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--ac-line)]"
                            >
                                <X
                                    size={14}
                                />
                            </button>
                        </div>

                        <div className="mt-4 space-y-3">
                            <select
                                value={
                                    targetForm.metric
                                }
                                onChange={
                                    event =>
                                        setTargetForm(
                                            current => ({
                                                ...current,
                                                metric:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                }
                                className="h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                            >
                                {[
                                    'sales_revenue',
                                    'gross_profit',
                                    'collections',
                                    'new_customers',
                                ].map(
                                    metric => (
                                        <option
                                            key={
                                                metric
                                            }
                                            value={
                                                metric
                                            }
                                        >
                                            {metricLabel(
                                                metric,
                                                ar,
                                            )}
                                        </option>
                                    ),
                                )}
                            </select>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                required
                                value={
                                    targetForm
                                        .target_value
                                }
                                onChange={
                                    event =>
                                        setTargetForm(
                                            current => ({
                                                ...current,
                                                target_value:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                }
                                className="h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                                placeholder={
                                    text(
                                        'القيمة المستهدفة',
                                        'Target value',
                                    )
                                }
                            />
                            <input
                                value={
                                    targetForm
                                        .currency
                                }
                                onChange={
                                    event =>
                                        setTargetForm(
                                            current => ({
                                                ...current,
                                                currency:
                                                    event
                                                        .target
                                                        .value
                                                        .toUpperCase()
                                                        .slice(
                                                            0,
                                                            3,
                                                        ),
                                            }),
                                        )
                                }
                                className="h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                                placeholder="ILS"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={busy}
                            className="mt-4 h-11 w-full rounded-[11px] border border-[var(--ac-accent)] text-xs font-bold text-[var(--ac-accent)] disabled:opacity-40"
                        >
                            {text(
                                'حفظ الهدف',
                                'Save target',
                            )}
                        </button>
                    </form>
                </div>
            )}
        </section>
    );
}
