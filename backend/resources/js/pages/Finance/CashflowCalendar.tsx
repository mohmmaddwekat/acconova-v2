import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type CashflowItem = {
    key: string;
    date: string;
    direction: 'incoming' | 'outgoing';
    kind: string;
    label: string;
    amount: string;
    currency: string;
    url: string;
};

type CashflowDay = {
    date: string;
    incoming: string;
    outgoing: string;
    items: CashflowItem[];
};

function monthKey(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
    ].join('-');
}

export default function CashflowCalendar() {
    const ar = useLocale() === 'ar';
    const [month, setMonth] = useState(() => monthKey(new Date()));
    const [days, setDays] = useState<CashflowDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');

        apiRequest<{
            data: {
                month: string;
                days: CashflowDay[];
            };
        }>(
            '/api/business-pulse/cashflow?month='
            + month,
            {
                signal: controller.signal,
            },
        )
            .then((response) => {
                setDays(response.data.days);
            })
            .catch((failure) => {
                if (! controller.signal.aborted) {
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : (
                                ar
                                    ? 'تعذر تحميل التدفق النقدي.'
                                    : 'Cashflow could not be loaded.'
                            ),
                    );
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [month, ar]);

    const date = useMemo(
        () => new Date(month + '-01T12:00:00'),
        [month],
    );

    const lookup = useMemo(
        () => new Map(
            days.map((day) => [
                day.date,
                day,
            ]),
        ),
        [days],
    );

    const cells = useMemo(() => {
        const year = date.getFullYear();
        const monthIndex = date.getMonth();
        const firstDay = new Date(year, monthIndex, 1).getDay();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const result: Array<number | null> = [];

        for (let index = 0; index < firstDay; index += 1) {
            result.push(null);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            result.push(day);
        }

        while (result.length % 7 !== 0) {
            result.push(null);
        }

        return result;
    }, [date]);

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    function move(delta: number): void {
        const next = new Date(
            date.getFullYear(),
            date.getMonth() + delta,
            1,
        );
        setMonth(monthKey(next));
    }

    const monthLabel = new Intl.DateTimeFormat(
        ar ? 'ar' : 'en',
        {
            month: 'long',
            year: 'numeric',
        },
    ).format(date);

    return (
        <AppShell>
            <Head title={text('تقويم التدفق النقدي', 'Cashflow calendar')} />
            <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                            Finance
                        </p>
                        <h1 className="mt-1 text-2xl font-bold">
                            {text('تقويم التدفق النقدي المتوقع', 'Expected cashflow calendar')}
                        </h1>
                        <p className="mt-1 text-xs text-[var(--ac-text-muted)]">
                            {text(
                                'يعتمد على أرصدة الفواتير المستحقة والمدفوعات المتكررة المجدولة؛ ليس رصيد بنك فعلياً.',
                                'Based on outstanding invoice due dates and scheduled recurring payments; it is not a bank balance forecast.',
                            )}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => move(ar ? 1 : -1)}
                            className="flex size-10 items-center justify-center rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                        >
                            {ar ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
                        </button>
                        <strong className="min-w-36 text-center text-sm">
                            {monthLabel}
                        </strong>
                        <button
                            type="button"
                            onClick={() => move(ar ? -1 : 1)}
                            className="flex size-10 items-center justify-center rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                        >
                            {ar ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
                        </button>
                    </div>
                </header>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
                    <div className="grid grid-cols-7 border-b border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-center text-[10px] font-semibold text-[var(--ac-text-muted)]">
                        {(ar
                            ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
                            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                        ).map((label) => (
                            <div key={label} className="p-2">
                                {label}
                            </div>
                        ))}
                    </div>

                    {loading ? (
                        <div className="p-16 text-center text-sm text-[var(--ac-text-muted)]">
                            {text('جارٍ التحميل…', 'Loading…')}
                        </div>
                    ) : (
                        <div className="grid grid-cols-7">
                            {cells.map((day, index) => {
                                if (! day) {
                                    return (
                                        <div
                                            key={'empty-' + index}
                                            className="min-h-28 border-b border-s border-[var(--ac-line)] bg-[var(--ac-bg-soft)]/30"
                                        />
                                    );
                                }

                                const key =
                                    month
                                    + '-'
                                    + String(day).padStart(2, '0');
                                const info = lookup.get(key);

                                return (
                                    <div
                                        key={key}
                                        className="min-h-28 border-b border-s border-[var(--ac-line)] p-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <strong className="text-xs">
                                                {day}
                                            </strong>
                                            {info?.items.length ? (
                                                <span className="rounded-full bg-[var(--ac-accent-soft)] px-1.5 py-0.5 text-[8px] font-bold text-[var(--ac-accent)]">
                                                    {info.items.length}
                                                </span>
                                            ) : null}
                                        </div>

                                        {info && (
                                            <div className="mt-2 space-y-1.5">
                                                {Number(info.incoming) > 0 && (
                                                    <div className="flex items-center gap-1 rounded-[8px] bg-emerald-50 px-1.5 py-1 text-[8px] font-semibold text-emerald-700">
                                                        <TrendingUp size={9} />
                                                        {Number(info.incoming).toLocaleString()}
                                                    </div>
                                                )}
                                                {Number(info.outgoing) > 0 && (
                                                    <div className="flex items-center gap-1 rounded-[8px] bg-red-50 px-1.5 py-1 text-[8px] font-semibold text-red-700">
                                                        <TrendingDown size={9} />
                                                        {Number(info.outgoing).toLocaleString()}
                                                    </div>
                                                )}

                                                {info.items.slice(0, 2).map((item) => (
                                                    <Link
                                                        key={item.key}
                                                        href={item.url}
                                                        className="block truncate text-[8px] text-[var(--ac-text-muted)] hover:text-[var(--ac-accent)]"
                                                    >
                                                        {item.label}
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </main>
        </AppShell>
    );
}
