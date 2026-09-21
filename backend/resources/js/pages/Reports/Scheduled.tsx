import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import { CalendarClock, Play, RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

type Schedule = {
    id: number;
    name: string;
    report_type: string;
    cadence: string;
    run_hour: number;
    day_of_week: number | null;
    day_of_month: number | null;
    recipient_user_ids: number[];
    active: boolean;
    last_run_at: string | null;
    next_run_at: string | null;
};

type Run = {
    id: number;
    scheduled_report_id: number | null;
    report_type: string;
    schedule_name: string | null;
    generated_at: string;
    snapshot: Record<string, any>;
};

type Member = {
    id: number;
    name: string;
};

type Response = {
    schedules: Schedule[];
    runs: Run[];
    members: Member[];
    can_manage: boolean;
};

const input =
    'h-10 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';

const button =
    'inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40';

function label(value: string, ar: boolean): string {
    const labels: Record<string, [string, string]> = {
        sales_summary: ['ملخص المبيعات', 'Sales summary'],
        ar_aging: ['أعمار الذمم المدينة', 'A/R aging'],
        ap_aging: ['أعمار الذمم الدائنة', 'A/P aging'],
        collections: ['التحصيل والمتأخرات', 'Collections'],
        budget_vs_actual: ['الميزانية مقابل الفعلي', 'Budget vs actual'],
        daily: ['يومي', 'Daily'],
        weekly: ['أسبوعي', 'Weekly'],
        monthly: ['شهري', 'Monthly'],
    };

    return labels[value]
        ? (ar ? labels[value][0] : labels[value][1])
        : value;
}

export default function ScheduledReports() {
    const ar = useLocale() === 'ar';
    const [data, setData] = useState<Response>({
        schedules: [],
        runs: [],
        members: [],
        can_manage: false,
    });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [selectedRun, setSelectedRun] = useState<number | null>(null);
    const [form, setForm] = useState({
        name: '',
        report_type: 'sales_summary',
        cadence: 'daily',
        run_hour: '8',
        day_of_week: '1',
        day_of_month: '1',
        recipient_user_ids: [] as number[],
    });

    const load = async (): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            setData(
                await apiRequest<Response>(
                    '/api/scheduled-reports',
                ),
            );
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (ar
                        ? 'تعذر تحميل التقارير المجدولة.'
                        : 'Could not load scheduled reports.'),
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const requestedRun = Number(
                new URLSearchParams(
                    window.location.search,
                ).get('run') ?? 0,
            );

            if (
                Number.isInteger(requestedRun)
                && requestedRun > 0
            ) {
                setSelectedRun(
                    requestedRun,
                );
            }
        }

        void load();
    }, []);

    const activeRun = useMemo(
        () =>
            data.runs.find(run => run.id === selectedRun)
            ?? data.runs[0]
            ?? null,
        [data.runs, selectedRun],
    );

    async function create(event: FormEvent): Promise<void> {
        event.preventDefault();
        setBusy(true);
        setError('');

        try {
            await apiRequest('/api/scheduled-reports', {
                method: 'POST',
                body: JSON.stringify({
                    name: form.name.trim(),
                    report_type: form.report_type,
                    cadence: form.cadence,
                    run_hour: Number(form.run_hour),
                    day_of_week:
                        form.cadence === 'weekly'
                            ? Number(form.day_of_week)
                            : null,
                    day_of_month:
                        form.cadence === 'monthly'
                            ? Number(form.day_of_month)
                            : null,
                    recipient_user_ids:
                        form.recipient_user_ids,
                }),
            });

            setForm(current => ({
                ...current,
                name: '',
            }));
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (ar
                        ? 'تعذر إنشاء الجدولة.'
                        : 'Could not create the schedule.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function patch(
        schedule: Schedule,
        payload: Record<string, unknown>,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/scheduled-reports/' + schedule.id,
                {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                },
            );
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (ar
                        ? 'تعذر تحديث الجدولة.'
                        : 'Could not update the schedule.'),
            );
        } finally {
            setBusy(false);
        }
    }

    async function runNow(schedule: Schedule): Promise<void> {
        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{
                data: { run_id: number };
            }>(
                '/api/scheduled-reports/'
                + schedule.id
                + '/run',
                { method: 'POST' },
            );
            setSelectedRun(response.data.run_id);
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (ar
                        ? 'تعذر تجهيز التقرير.'
                        : 'Could not generate the report.'),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head title={ar ? 'التقارير المجدولة' : 'Scheduled reports'} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                Reports
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {ar ? 'التقارير المجدولة' : 'Scheduled reports'}
                            </h1>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'جهّز تقارير المبيعات والذمم والتحصيل والميزانيات تلقائياً، واحفظ Snapshot تاريخي لكل تشغيل مع إشعار للمستلمين.'
                                    : 'Automatically generate sales, aging, collections and budget snapshots and notify recipients when each run is ready.'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className={button}
                        >
                            <RefreshCcw size={14} />
                            {ar ? 'تحديث' : 'Refresh'}
                        </button>
                    </div>
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {data.can_manage && (
                    <form
                        onSubmit={event => void create(event)}
                        className="mt-4 rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarClock size={15} className="text-[var(--ac-accent)]" />
                            <h2 className="text-sm font-bold text-[var(--ac-text)]">
                                {ar ? 'جدولة تقرير جديد' : 'Schedule a report'}
                            </h2>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <input
                                className={input}
                                value={form.name}
                                required
                                placeholder={ar ? 'اسم الجدولة' : 'Schedule name'}
                                onChange={event =>
                                    setForm(current => ({
                                        ...current,
                                        name: event.target.value,
                                    }))
                                }
                            />

                            <select
                                className={input}
                                value={form.report_type}
                                onChange={event =>
                                    setForm(current => ({
                                        ...current,
                                        report_type: event.target.value,
                                    }))
                                }
                            >
                                {[
                                    'sales_summary',
                                    'ar_aging',
                                    'ap_aging',
                                    'collections',
                                    'budget_vs_actual',
                                ].map(value => (
                                    <option key={value} value={value}>
                                        {label(value, ar)}
                                    </option>
                                ))}
                            </select>

                            <select
                                className={input}
                                value={form.cadence}
                                onChange={event =>
                                    setForm(current => ({
                                        ...current,
                                        cadence: event.target.value,
                                    }))
                                }
                            >
                                {['daily', 'weekly', 'monthly'].map(value => (
                                    <option key={value} value={value}>
                                        {label(value, ar)}
                                    </option>
                                ))}
                            </select>

                            <label className="text-[10px] text-[var(--ac-text-muted)]">
                                {ar ? 'ساعة التشغيل 0–23' : 'Run hour 0–23'}
                                <input
                                    type="number"
                                    min="0"
                                    max="23"
                                    className={input + ' mt-1'}
                                    value={form.run_hour}
                                    onChange={event =>
                                        setForm(current => ({
                                            ...current,
                                            run_hour: event.target.value,
                                        }))
                                    }
                                />
                            </label>

                            {form.cadence === 'weekly' && (
                                <label className="text-[10px] text-[var(--ac-text-muted)]">
                                    {ar ? 'يوم الأسبوع 0–6' : 'Day of week 0–6'}
                                    <input
                                        type="number"
                                        min="0"
                                        max="6"
                                        className={input + ' mt-1'}
                                        value={form.day_of_week}
                                        onChange={event =>
                                            setForm(current => ({
                                                ...current,
                                                day_of_week: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                            )}

                            {form.cadence === 'monthly' && (
                                <label className="text-[10px] text-[var(--ac-text-muted)]">
                                    {ar ? 'يوم الشهر 1–28' : 'Day of month 1–28'}
                                    <input
                                        type="number"
                                        min="1"
                                        max="28"
                                        className={input + ' mt-1'}
                                        value={form.day_of_month}
                                        onChange={event =>
                                            setForm(current => ({
                                                ...current,
                                                day_of_month: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                            )}

                            <label className="md:col-span-2 xl:col-span-2">
                                <span className="text-[10px] text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'المستلمون — إذا لم تحدد أحداً سيصل للمديرين'
                                        : 'Recipients — leave empty to notify managers'}
                                </span>
                                <select
                                    multiple
                                    className={input + ' mt-1 min-h-24 py-2'}
                                    value={form.recipient_user_ids.map(String)}
                                    onChange={event =>
                                        setForm(current => ({
                                            ...current,
                                            recipient_user_ids:
                                                Array.from(event.target.selectedOptions)
                                                    .map(option => Number(option.value)),
                                        }))
                                    }
                                >
                                    {data.members.map(member => (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="mt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={busy}
                                className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-4 text-xs font-bold text-[var(--ac-accent)] disabled:opacity-40"
                            >
                                <CalendarClock size={14} />
                                {ar ? 'حفظ الجدولة' : 'Save schedule'}
                            </button>
                        </div>
                    </form>
                )}

                <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="space-y-3">
                        <h2 className="text-sm font-bold text-[var(--ac-text)]">
                            {ar ? 'الجدولات' : 'Schedules'}
                        </h2>

                        {data.schedules.length === 0 ? (
                            <div className="rounded-[18px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-10 text-center text-sm text-[var(--ac-text-muted)]">
                                {ar ? 'لا توجد جدولات بعد.' : 'No schedules yet.'}
                            </div>
                        ) : (
                            data.schedules.map(schedule => (
                                <article
                                    key={schedule.id}
                                    className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <strong className="text-sm text-[var(--ac-text)]">
                                                {schedule.name}
                                            </strong>
                                            <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                {label(schedule.report_type, ar)}
                                                {' · '}
                                                {label(schedule.cadence, ar)}
                                                {' · '}
                                                {ar ? 'الساعة ' : 'Hour '}
                                                {schedule.run_hour}
                                            </p>
                                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                {ar ? 'القادم: ' : 'Next: '}
                                                {schedule.next_run_at ?? '—'}
                                            </p>
                                        </div>

                                        <div className="flex gap-2">
                                            {data.can_manage && (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => void runNow(schedule)}
                                                        className={button}
                                                    >
                                                        <Play size={12} />
                                                        {ar ? 'شغّل الآن' : 'Run now'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            void patch(schedule, {
                                                                active: ! schedule.active,
                                                            })
                                                        }
                                                        className={button}
                                                    >
                                                        {schedule.active
                                                            ? (ar ? 'إيقاف' : 'Pause')
                                                            : (ar ? 'تفعيل' : 'Activate')}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))
                        )}
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-sm font-bold text-[var(--ac-text)]">
                            {ar ? 'آخر التقارير الجاهزة' : 'Recent generated reports'}
                        </h2>

                        {data.runs.length === 0 ? (
                            <div className="rounded-[18px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-10 text-center text-sm text-[var(--ac-text-muted)]">
                                {ar ? 'لم يتم تجهيز تقرير بعد.' : 'No report runs yet.'}
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-2">
                                    {data.runs.slice(0, 12).map(run => (
                                        <button
                                            key={run.id}
                                            type="button"
                                            onClick={() => setSelectedRun(run.id)}
                                            className={[
                                                button,
                                                activeRun?.id === run.id
                                                    ? 'border-[var(--ac-accent)] text-[var(--ac-accent)]'
                                                    : '',
                                            ].join(' ')}
                                        >
                                            {run.schedule_name || label(run.report_type, ar)}
                                            {' · #'}
                                            {run.id}
                                        </button>
                                    ))}
                                </div>

                                {activeRun && (
                                    <article className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <strong className="text-sm text-[var(--ac-text)]">
                                                    {activeRun.schedule_name
                                                        || label(activeRun.report_type, ar)}
                                                </strong>
                                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                    {activeRun.generated_at}
                                                </p>
                                            </div>
                                        </div>

                                        <pre className="mt-4 max-h-[520px] overflow-auto rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4 text-[10px] leading-5 text-[var(--ac-text-soft)]">
                                            {JSON.stringify(
                                                activeRun.snapshot,
                                                null,
                                                2,
                                            )}
                                        </pre>
                                    </article>
                                )}
                            </>
                        )}
                    </div>
                </section>
            </main>
        </AppShell>
    );
}
