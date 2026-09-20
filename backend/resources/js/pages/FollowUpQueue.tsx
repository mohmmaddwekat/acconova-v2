import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    AlertCircle,
    BellRing,
    Clock3,
    ContactRound,
    MailWarning,
    ReceiptText,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

type FollowUpData = {
    reminders: Array<{
        id: number;
        record_type: string;
        record_id: number;
        name: string;
        note: string | null;
        due_at: string;
        overdue: boolean;
        url: string;
    }>;
    overdue_invoices: Array<{
        id: number;
        number: string;
        party_id: number | null;
        party_name: string | null;
        due_date: string | null;
        balance_due: string;
        currency: string;
        url: string;
    }>;
    inactive_customers: Array<{
        id: number;
        name: string;
        email: string | null;
        phone: string | null;
        last_known_activity: string | null;
        url: string;
    }>;
    missing_contact: Array<{
        id: number;
        name: string;
        email: string | null;
        phone: string | null;
        url: string;
    }>;
};

export default function FollowUpQueue() {
    const ar = useLocale() === 'ar';
    const [data, setData] = useState<FollowUpData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        apiRequest<{ data: FollowUpData }>(
            '/api/business-pulse/follow-ups',
            {
                signal: controller.signal,
            },
        )
            .then((response) => setData(response.data))
            .catch((failure) => {
                if (! controller.signal.aborted) {
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : (
                                ar
                                    ? 'تعذر تحميل قائمة المتابعة.'
                                    : 'The follow-up queue could not be loaded.'
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
    }, [ar]);

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    return (
        <AppShell>
            <Head title={text('قائمة المتابعة', 'Follow-up queue')} />

            <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
                <header className="rounded-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-6 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <ContactRound size={19} />
                        </span>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                {text('العلاقات', 'Relationships')}
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {text('قائمة متابعة العملاء', 'Customer follow-up queue')}
                            </h1>
                            <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                {text(
                                    'التذكيرات، الفواتير المتأخرة، العملاء غير النشطين وبيانات التواصل الناقصة في مكان واحد.',
                                    'Reminders, overdue invoices, inactive customers and missing contact data in one place.',
                                )}
                            </p>
                        </div>
                    </div>
                </header>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="mt-5 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                        {text('جارٍ التحميل…', 'Loading…')}
                    </div>
                ) : data && (
                    <div className="mt-5 grid gap-5 xl:grid-cols-2">
                        <QueueSection
                            title={text('تذكيراتي القادمة', 'My upcoming reminders')}
                            icon={BellRing}
                            empty={text('لا توجد تذكيرات خلال 7 أيام.', 'No reminders in the next 7 days.')}
                        >
                            {data.reminders.map((item) => (
                                <QueueLink
                                    key={item.id}
                                    href={item.url}
                                    title={item.name}
                                    detail={[
                                        item.note,
                                        new Date(item.due_at).toLocaleString(),
                                    ].filter(Boolean).join(' · ')}
                                    tone={item.overdue ? 'red' : 'amber'}
                                />
                            ))}
                        </QueueSection>

                        <QueueSection
                            title={text('فواتير بيع متأخرة', 'Overdue sales invoices')}
                            icon={ReceiptText}
                            empty={text('لا توجد فواتير بيع متأخرة.', 'No overdue sales invoices.')}
                        >
                            {data.overdue_invoices.map((item) => (
                                <QueueLink
                                    key={item.id}
                                    href={item.url}
                                    title={item.party_name ?? item.number}
                                    detail={[
                                        item.number,
                                        item.due_date,
                                        item.balance_due + ' ' + item.currency,
                                    ].filter(Boolean).join(' · ')}
                                    tone="red"
                                />
                            ))}
                        </QueueSection>

                        <QueueSection
                            title={text('عملاء غير نشطين منذ 90 يوماً', 'Customers inactive for 90 days')}
                            icon={Clock3}
                            empty={text('لا يوجد عملاء غير نشطين ضمن هذا التعريف.', 'No inactive customers under this rule.')}
                        >
                            {data.inactive_customers.map((item) => (
                                <QueueLink
                                    key={item.id}
                                    href={item.url}
                                    title={item.name}
                                    detail={[item.phone, item.email].filter(Boolean).join(' · ')}
                                    tone="neutral"
                                />
                            ))}
                        </QueueSection>

                        <QueueSection
                            title={text('بيانات تواصل ناقصة', 'Missing contact information')}
                            icon={MailWarning}
                            empty={text('بيانات التواصل مكتملة.', 'Contact information looks complete.')}
                        >
                            {data.missing_contact.map((item) => (
                                <QueueLink
                                    key={item.id}
                                    href={item.url}
                                    title={item.name}
                                    detail={text(
                                        item.email ? 'الهاتف ناقص' : item.phone ? 'البريد ناقص' : 'البريد والهاتف ناقصان',
                                        item.email ? 'Missing phone' : item.phone ? 'Missing email' : 'Missing email and phone',
                                    )}
                                    tone="amber"
                                />
                            ))}
                        </QueueSection>
                    </div>
                )}
            </main>
        </AppShell>
    );
}

function QueueSection({
    title,
    icon: Icon,
    empty,
    children,
}: {
    title: string;
    icon: typeof AlertCircle;
    empty: string;
    children: React.ReactNode;
}) {
    const items = Array.isArray(children)
        ? children
        : [children];
    const count = items.filter(Boolean).length;

    return (
        <section className="rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Icon size={15} className="text-[var(--ac-accent)]" />
                    <h2 className="text-sm font-bold text-[var(--ac-text)]">
                        {title}
                    </h2>
                </div>
                <span className="rounded-full bg-[var(--ac-surface-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--ac-text-muted)]">
                    {count}
                </span>
            </div>

            <div className="mt-3 space-y-2">
                {count
                    ? children
                    : (
                        <p className="rounded-[14px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                            {empty}
                        </p>
                    )}
            </div>
        </section>
    );
}

function QueueLink({
    href,
    title,
    detail,
    tone,
}: {
    href: string;
    title: string;
    detail: string;
    tone: 'red' | 'amber' | 'neutral';
}) {
    const dot =
        tone === 'red'
            ? 'bg-red-500'
            : tone === 'amber'
                ? 'bg-amber-500'
                : 'bg-[var(--ac-accent)]';

    return (
        <Link
            href={href}
            className="flex items-center gap-3 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-accent-soft)]"
        >
            <span className={['size-2 shrink-0 rounded-full', dot].join(' ')} />
            <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs text-[var(--ac-text)]">
                    {title}
                </strong>
                <span className="mt-1 block truncate text-[10px] text-[var(--ac-text-muted)]">
                    {detail || '—'}
                </span>
            </span>
        </Link>
    );
}
