import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    AlertTriangle,
    CircleAlert,
    PackageX,
    Radar,
    ReceiptText,
    WalletCards,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

type Anomaly = {
    key: string;
    severity: 'warning' | 'review';
    kind: string;
    title: string;
    detail: string | null;
    url: string;
};

export default function AnomalyCenter() {
    const ar = useLocale() === 'ar';
    const [items, setItems] = useState<Anomaly[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();

        apiRequest<{
            data: {
                items: Anomaly[];
            };
        }>(
            '/api/business-pulse/anomalies',
            {
                signal: controller.signal,
            },
        )
            .then((response) => setItems(response.data.items))
            .catch((failure) => {
                if (! controller.signal.aborted) {
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : (
                                ar
                                    ? 'تعذر تحميل مركز المراجعة.'
                                    : 'The anomaly center could not be loaded.'
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

    function label(kind: string): string {
        const labels: Record<string, [string, string]> = {
            product_without_cost: ['منتج بدون تكلفة', 'Product without cost'],
            possible_duplicate_invoice: ['فاتورة قد تكون مكررة', 'Possible duplicate invoice'],
            unusual_price: ['سعر غير معتاد', 'Unusual price'],
            large_payment: ['دفعة كبيرة مقارنة بالمعتاد', 'Payment larger than usual'],
            unusual_customer_balance: ['رصيد عميل أعلى من المعتاد', 'Customer balance above the usual range'],
        };

        return labels[kind]?.[ar ? 0 : 1]
            ?? kind;
    }

    function icon(kind: string) {
        if (kind === 'product_without_cost') {
            return PackageX;
        }
        if (kind === 'possible_duplicate_invoice') {
            return ReceiptText;
        }
        if (kind === 'large_payment') {
            return WalletCards;
        }

        return AlertTriangle;
    }

    return (
        <AppShell>
            <Head title={text('مركز العمليات غير المعتادة', 'Anomaly center')} />
            <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
                <header className="rounded-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-6 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <Radar size={19} />
                        </span>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                {text('مراجعة تشغيلية', 'Operational review')}
                            </p>
                            <h1 className="mt-1 text-2xl font-bold">
                                {text('مركز العمليات غير المعتادة', 'Anomaly center')}
                            </h1>
                            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--ac-text-muted)]">
                                {text(
                                    'هذه إشارات للمراجعة وليست اتهامات أو أخطاء مؤكدة. AccoNova يوضح القاعدة التي جعلت العملية تستحق النظر.',
                                    'These are review signals, not accusations or confirmed errors. AccoNova surfaces explainable rules that deserve a second look.',
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
                    <div className="mt-5 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-14 text-center text-sm text-[var(--ac-text-muted)]">
                        {text('جارٍ التحليل…', 'Analyzing…')}
                    </div>
                ) : ! items.length ? (
                    <div className="mt-5 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-14 text-center">
                        <CircleAlert className="mx-auto text-emerald-600" size={28} />
                        <h2 className="mt-3 text-sm font-bold">
                            {text('لا توجد إشارات تحتاج مراجعة الآن', 'No review signals right now')}
                        </h2>
                    </div>
                ) : (
                    <section className="mt-5 grid gap-3 lg:grid-cols-2">
                        {items.map((item) => {
                            const Icon = icon(item.kind);

                            return (
                                <Link
                                    key={item.key}
                                    href={item.url}
                                    className="group rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)]"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className={[
                                            'flex size-10 shrink-0 items-center justify-center rounded-[13px]',
                                            item.severity === 'warning'
                                                ? 'bg-amber-50 text-amber-700'
                                                : 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]',
                                        ].join(' ')}>
                                            <Icon size={16} />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                                {label(item.kind)}
                                            </p>
                                            <h2 className="mt-1 truncate text-sm font-bold text-[var(--ac-text)]">
                                                {item.title}
                                            </h2>
                                            {item.detail && (
                                                <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                                    {item.detail}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </section>
                )}
            </main>
        </AppShell>
    );
}
