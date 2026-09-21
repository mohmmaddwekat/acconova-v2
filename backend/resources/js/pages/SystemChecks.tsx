import { AppShell } from '@/layouts/AppShell';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    CheckCircle2,
    FlaskConical,
    RefreshCw,
    XCircle,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

type CheckRow = {
    key: string;
    label: string;
    passed: boolean;
    detail: string;
};

type CheckResponse = {
    workspace: {
        id: number;
        name: string;
    };
    summary: {
        passed: number;
        failed: number;
        total: number;
    };
    checks: CheckRow[];
    checked_at: string;
};

export default function SystemChecks() {
    const ar = useLocale() === 'ar';
    const [data, setData] =
        useState<CheckResponse | null>(
            null,
        );
    const [loading, setLoading] =
        useState(false);
    const [error, setError] =
        useState('');

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar ? arabic : english;

    async function run(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: CheckResponse;
                }>(
                    '/api/system-checks',
                );

            setData(
                response.data,
            );
        } catch {
            setError(
                text(
                    'تعذر تشغيل اختبارات الجاهزية.',
                    'System readiness checks could not be run.',
                ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void run();
    }, [ar]);

    return (
        <AppShell>
            <Head
                title={text(
                    'اختبارات النظام — AccoNova',
                    'System Checks — AccoNova',
                )}
            />

            <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <FlaskConical
                                size={18}
                            />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--ac-text)] sm:text-3xl">
                                {text(
                                    'اختبارات جاهزية النظام',
                                    'System readiness checks',
                                )}
                            </h1>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                                {text(
                                    'صفحة آمنة للقراءة فقط تتأكد من اتصال قاعدة البيانات، الجداول المطلوبة، وروابط ومسارات الفيتشرز الجديدة.',
                                    'A read-only admin page that checks the database connection, required tables, and important feature routes.',
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/app/settings"
                            className="inline-flex h-10 items-center rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                        >
                            {text(
                                'الإعدادات',
                                'Settings',
                            )}
                        </Link>

                        <button
                            type="button"
                            onClick={() =>
                                void run()
                            }
                            disabled={
                                loading
                            }
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[var(--ac-accent-solid)] px-3 text-xs font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-50"
                        >
                            <RefreshCw
                                size={14}
                                className={
                                    loading
                                        ? 'animate-spin'
                                        : ''
                                }
                            />
                            {text(
                                'إعادة الفحص',
                                'Run again',
                            )}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mt-5 rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {data && (
                    <>
                        <section className="mt-6 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                    {text(
                                        'نجح',
                                        'Passed',
                                    )}
                                </p>
                                <strong className="mt-2 block text-3xl text-emerald-600">
                                    {
                                        data.summary
                                            .passed
                                    }
                                </strong>
                            </div>

                            <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                    {text(
                                        'فشل',
                                        'Failed',
                                    )}
                                </p>
                                <strong className="mt-2 block text-3xl text-red-600">
                                    {
                                        data.summary
                                            .failed
                                    }
                                </strong>
                            </div>

                            <div className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                                    {text(
                                        'مساحة العمل',
                                        'Workspace',
                                    )}
                                </p>
                                <strong className="mt-2 block truncate text-lg text-[var(--ac-text)]">
                                    {
                                        data.workspace
                                            .name
                                    }
                                </strong>
                            </div>
                        </section>

                        <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
                            <div className="border-b border-[var(--ac-line)] px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="text-sm font-bold text-[var(--ac-text)]">
                                        {text(
                                            'نتيجة الفحص',
                                            'Check results',
                                        )}
                                    </h2>

                                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                                        {data.checked_at}
                                    </span>
                                </div>
                            </div>

                            <div className="divide-y divide-[var(--ac-line)]">
                                {data.checks.map(
                                    check => (
                                        <div
                                            key={
                                                check.key
                                            }
                                            className="grid gap-2 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,.8fr)] sm:items-center"
                                        >
                                            <div
                                                className={[
                                                    'flex size-8 items-center justify-center rounded-[10px]',
                                                    check.passed
                                                        ? 'bg-emerald-50 text-emerald-600'
                                                        : 'bg-red-50 text-red-600',
                                                ].join(
                                                    ' ',
                                                )}
                                            >
                                                {check.passed ? (
                                                    <CheckCircle2
                                                        size={
                                                            14
                                                        }
                                                    />
                                                ) : (
                                                    <XCircle
                                                        size={
                                                            14
                                                        }
                                                    />
                                                )}
                                            </div>

                                            <div>
                                                <p className="text-xs font-semibold text-[var(--ac-text)]">
                                                    {
                                                        check.label
                                                    }
                                                </p>

                                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                    {
                                                        check.key
                                                    }
                                                </p>
                                            </div>

                                            <p className="break-all text-[10px] leading-5 text-[var(--ac-text-soft)]">
                                                {
                                                    check.detail
                                                }
                                            </p>
                                        </div>
                                    ),
                                )}
                            </div>
                        </section>
                    </>
                )}
            </main>
        </AppShell>
    );
}
