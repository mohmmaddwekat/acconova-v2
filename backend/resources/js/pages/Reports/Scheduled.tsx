import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import {
    BarChart3,
    CalendarClock,
    CalendarDays,
    CheckCircle2,
    Clock3,
    FileClock,
    FileText,
    Pause,
    Play,
    Plus,
    RefreshCcw,
    Save,
    Search,
    UsersRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react';

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
    'h-12 w-full rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-4 text-xs text-[var(--ac-text)] outline-none transition placeholder:text-[var(--ac-text-muted)] focus:border-[var(--ac-accent)] focus:ring-2 focus:ring-[var(--ac-accent)]/10';

const outlineButton =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40';

const card =
    'rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]';

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

function cadenceDescription(
    schedule: Schedule,
    ar: boolean,
): string {
    if (schedule.cadence === 'weekly') {
        return ar
            ? `أسبوعياً · اليوم ${schedule.day_of_week ?? '—'} · الساعة ${schedule.run_hour}:00`
            : `Weekly · day ${schedule.day_of_week ?? '—'} · ${schedule.run_hour}:00`;
    }

    if (schedule.cadence === 'monthly') {
        return ar
            ? `شهرياً · يوم ${schedule.day_of_month ?? '—'} · الساعة ${schedule.run_hour}:00`
            : `Monthly · day ${schedule.day_of_month ?? '—'} · ${schedule.run_hour}:00`;
    }

    return ar
        ? `يومياً · الساعة ${schedule.run_hour}:00`
        : `Daily · ${schedule.run_hour}:00`;
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
    const [selectedRun, setSelectedRun] =
        useState<number | null>(null);
    const [recipientQuery, setRecipientQuery] = useState('');

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
                    : (
                        ar
                            ? 'تعذر تحميل التقارير المجدولة.'
                            : 'Could not load scheduled reports.'
                    ),
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
                setSelectedRun(requestedRun);
            }
        }

        void load();
    }, []);

    const activeRun = useMemo(
        () =>
            data.runs.find(
                run => run.id === selectedRun,
            )
            ?? data.runs[0]
            ?? null,
        [data.runs, selectedRun],
    );

    const selectedRecipients = useMemo(
        () =>
            data.members.filter(member =>
                form.recipient_user_ids.includes(member.id),
            ),
        [data.members, form.recipient_user_ids],
    );

    const availableRecipients = useMemo(() => {
        const query = recipientQuery.trim().toLowerCase();

        return data.members.filter(member => {
            if (form.recipient_user_ids.includes(member.id)) {
                return false;
            }

            return ! query
                || member.name.toLowerCase().includes(query);
        });
    }, [
        data.members,
        form.recipient_user_ids,
        recipientQuery,
    ]);

    function resetForm(): void {
        setForm({
            name: '',
            report_type: 'sales_summary',
            cadence: 'daily',
            run_hour: '8',
            day_of_week: '1',
            day_of_month: '1',
            recipient_user_ids: [],
        });
        setRecipientQuery('');
    }

    function toggleRecipient(id: number): void {
        setForm(current => ({
            ...current,
            recipient_user_ids:
                current.recipient_user_ids.includes(id)
                    ? current.recipient_user_ids.filter(
                        value => value !== id,
                    )
                    : [
                        ...current.recipient_user_ids,
                        id,
                    ],
        }));
    }

    async function create(
        event: FormEvent,
    ): Promise<void> {
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

            resetForm();
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر إنشاء الجدولة.'
                            : 'Could not create the schedule.'
                    ),
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
                    : (
                        ar
                            ? 'تعذر تحديث الجدولة.'
                            : 'Could not update the schedule.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function runNow(
        schedule: Schedule,
    ): Promise<void> {
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

            setSelectedRun(
                response.data.run_id,
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تجهيز التقرير.'
                            : 'Could not generate the report.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head
                title={
                    ar
                        ? 'التقارير المجدولة'
                        : 'Scheduled reports'
                }
            />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto w-full max-w-[1720px] px-3 py-6 sm:px-5 lg:px-8"
            >
                <section
                    className={[
                        card,
                        'relative overflow-hidden p-6 sm:p-7',
                    ].join(' ')}
                >
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 start-0 hidden w-[34%] lg:block"
                    >
                        <div className="absolute start-20 top-1/2 size-48 -translate-y-1/2 rounded-full bg-[var(--ac-accent)]/10 blur-[55px]" />
                        <div className="absolute start-28 top-9 h-28 w-20 rotate-[8deg] rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] shadow-[var(--ac-shadow-soft)]" />
                        <div className="absolute start-20 top-14 h-28 w-20 -rotate-[4deg] rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)]" />
                        <div className="absolute start-[8.8rem] top-[4.2rem] flex size-16 items-center justify-center rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-accent)] shadow-[var(--ac-shadow-soft)]">
                            <BarChart3 size={28} />
                        </div>
                        <div className="absolute start-[15.8rem] top-[7.6rem] flex size-12 items-center justify-center rounded-full border border-[var(--ac-line)] bg-[var(--ac-accent)] text-white shadow-[var(--ac-shadow-soft)]">
                            <Clock3 size={20} />
                        </div>
                    </div>

                    <div className="relative flex flex-wrap items-start justify-between gap-5">
                        <div className="max-w-4xl">
                            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ac-accent)]">
                                {ar ? 'التقارير' : 'REPORTS'}
                            </p>

                            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--ac-text)] sm:text-3xl">
                                {ar
                                    ? 'التقارير المجدولة'
                                    : 'Scheduled reports'}
                            </h1>

                            <p className="mt-3 max-w-3xl text-xs leading-6 text-[var(--ac-text-muted)] sm:text-sm">
                                {ar
                                    ? 'جهّز تقارير المبيعات والأداء والتحصيل والمخزون تلقائياً، واحتفظ بلقطة تاريخية لكل تشغيل مع إشعار المستلمين.'
                                    : 'Automatically generate sales, performance, collections and inventory reports, preserve a historical snapshot for every run, and notify recipients.'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className={outlineButton}
                        >
                            <RefreshCcw
                                size={14}
                                className={
                                    loading
                                        ? 'animate-spin'
                                        : ''
                                }
                            />
                            {ar ? 'تحديث' : 'Refresh'}
                        </button>
                    </div>
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-300/35 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                        {error}
                    </div>
                )}

                {data.can_manage && (
                    <form
                        onSubmit={event =>
                            void create(event)
                        }
                        className={[
                            card,
                            'mt-5 p-5 sm:p-6',
                        ].join(' ')}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                    <CalendarClock size={18} />
                                </span>

                                <div>
                                    <h2 className="text-base font-bold text-[var(--ac-text)]">
                                        {ar
                                            ? 'جدولة تقرير جديد'
                                            : 'Schedule a new report'}
                                    </h2>
                                    <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                        {ar
                                            ? 'اختر التقرير والجدول الزمني والمستلمين ليتم تجهيز التقرير وإرساله تلقائياً.'
                                            : 'Choose the report, schedule and recipients to generate and deliver it automatically.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <FieldLabel
                                label={
                                    ar
                                        ? 'اسم الجدولة'
                                        : 'Schedule name'
                                }
                                required
                            >
                                <input
                                    className={input}
                                    value={form.name}
                                    required
                                    placeholder={
                                        ar
                                            ? 'مثلاً: تقرير المبيعات الأسبوعي'
                                            : 'Example: Weekly sales report'
                                    }
                                    onChange={event =>
                                        setForm(current => ({
                                            ...current,
                                            name:
                                                event.target.value,
                                        }))
                                    }
                                />
                            </FieldLabel>

                            <FieldLabel
                                label={
                                    ar
                                        ? 'نوع التقرير'
                                        : 'Report type'
                                }
                                required
                            >
                                <div className="relative">
                                    <BarChart3 className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-[var(--ac-accent)]" size={14} />
                                    <select
                                        className={input + ' appearance-none pe-10'}
                                        value={form.report_type}
                                        onChange={event =>
                                            setForm(current => ({
                                                ...current,
                                                report_type:
                                                    event.target.value,
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
                                            <option
                                                key={value}
                                                value={value}
                                            >
                                                {label(value, ar)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </FieldLabel>

                            <FieldLabel
                                label={
                                    ar
                                        ? 'تكرار الإرسال'
                                        : 'Delivery cadence'
                                }
                                required
                            >
                                <div className="relative">
                                    <CalendarDays className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-[var(--ac-accent)]" size={14} />
                                    <select
                                        className={input + ' appearance-none pe-10'}
                                        value={form.cadence}
                                        onChange={event =>
                                            setForm(current => ({
                                                ...current,
                                                cadence:
                                                    event.target.value,
                                            }))
                                        }
                                    >
                                        {[
                                            'daily',
                                            'weekly',
                                            'monthly',
                                        ].map(value => (
                                            <option
                                                key={value}
                                                value={value}
                                            >
                                                {label(value, ar)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </FieldLabel>

                            <FieldLabel
                                label={
                                    ar
                                        ? 'ساعة التشغيل (0–23)'
                                        : 'Run hour (0–23)'
                                }
                                required
                            >
                                <div className="relative">
                                    <Clock3 className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-[var(--ac-accent)]" size={14} />
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        className={input + ' pe-10'}
                                        value={form.run_hour}
                                        onChange={event =>
                                            setForm(current => ({
                                                ...current,
                                                run_hour:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </div>
                            </FieldLabel>

                            {form.cadence === 'weekly' && (
                                <FieldLabel
                                    label={
                                        ar
                                            ? 'يوم الأسبوع (0–6)'
                                            : 'Day of week (0–6)'
                                    }
                                >
                                    <input
                                        type="number"
                                        min="0"
                                        max="6"
                                        className={input}
                                        value={form.day_of_week}
                                        onChange={event =>
                                            setForm(current => ({
                                                ...current,
                                                day_of_week:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </FieldLabel>
                            )}

                            {form.cadence === 'monthly' && (
                                <FieldLabel
                                    label={
                                        ar
                                            ? 'يوم الشهر (1–28)'
                                            : 'Day of month (1–28)'
                                    }
                                >
                                    <input
                                        type="number"
                                        min="1"
                                        max="28"
                                        className={input}
                                        value={form.day_of_month}
                                        onChange={event =>
                                            setForm(current => ({
                                                ...current,
                                                day_of_month:
                                                    event.target.value,
                                            }))
                                        }
                                    />
                                </FieldLabel>
                            )}
                        </div>

                        <div className="mt-6 border-t border-[var(--ac-line)] pt-5">
                            <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <UsersRound
                                            size={15}
                                            className="text-[var(--ac-accent)]"
                                        />
                                        <h3 className="text-xs font-bold text-[var(--ac-text)]">
                                            {ar
                                                ? 'المستلمون'
                                                : 'Recipients'}
                                            <span className="ms-1 text-red-300">
                                                *
                                            </span>
                                        </h3>
                                    </div>

                                    <p className="mt-1 text-[9px] leading-5 text-[var(--ac-text-muted)]">
                                        {ar
                                            ? 'اختر الأشخاص الذين سيتم إرسال التقرير لهم. إذا تركتها فارغة سيتم إشعار المديرين.'
                                            : 'Choose who receives the report. Leave empty to notify managers.'}
                                    </p>
                                </div>

                                <div className="rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3">
                                    <div className="flex flex-wrap gap-2">
                                        {selectedRecipients.map(
                                            member => (
                                                <span
                                                    key={member.id}
                                                    className="inline-flex h-8 items-center gap-2 rounded-[9px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 text-[9px] font-semibold text-[var(--ac-text-soft)]"
                                                >
                                                    {member.name}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            toggleRecipient(
                                                                member.id,
                                                            )
                                                        }
                                                        className="text-[var(--ac-text-muted)] hover:text-red-300"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </span>
                                            ),
                                        )}

                                        <div className="relative min-w-[220px] flex-1">
                                            <Search
                                                size={13}
                                                className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                            />
                                            <input
                                                value={recipientQuery}
                                                onChange={event =>
                                                    setRecipientQuery(
                                                        event.target.value,
                                                    )
                                                }
                                                className="h-8 w-full bg-transparent px-2 pe-8 text-[10px] text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-text-muted)]"
                                                placeholder={
                                                    ar
                                                        ? 'ابحث عن مستخدمين...'
                                                        : 'Search users...'
                                                }
                                            />
                                        </div>
                                    </div>

                                    {recipientQuery.trim() && (
                                        <div className="mt-2 max-h-36 overflow-auto rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-1.5">
                                            {availableRecipients.length ===
                                            0 ? (
                                                <p className="px-2 py-2 text-[9px] text-[var(--ac-text-muted)]">
                                                    {ar
                                                        ? 'لا يوجد مستخدم مطابق.'
                                                        : 'No matching user.'}
                                                </p>
                                            ) : (
                                                availableRecipients
                                                    .slice(0, 8)
                                                    .map(member => (
                                                        <button
                                                            key={member.id}
                                                            type="button"
                                                            onClick={() => {
                                                                toggleRecipient(
                                                                    member.id,
                                                                );
                                                                setRecipientQuery(
                                                                    '',
                                                                );
                                                            }}
                                                            className="flex w-full items-center gap-2 rounded-[8px] px-2 py-2 text-start text-[10px] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]"
                                                        >
                                                            <span className="flex size-6 items-center justify-center rounded-full border border-[var(--ac-line)] text-[8px] font-bold text-[var(--ac-accent)]">
                                                                {member.name
                                                                    .slice(
                                                                        0,
                                                                        1,
                                                                    )
                                                                    .toUpperCase()}
                                                            </span>
                                                            {member.name}
                                                        </button>
                                                    ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={resetForm}
                                className={outlineButton + ' min-w-24'}
                            >
                                {ar ? 'إلغاء' : 'Cancel'}
                            </button>

                            <button
                                type="submit"
                                disabled={busy || ! form.name.trim()}
                                className="inline-flex h-11 min-w-40 items-center justify-center gap-2 rounded-[12px] border border-[var(--ac-accent)] bg-[var(--ac-accent)] px-5 text-xs font-bold text-white shadow-[var(--ac-shadow-soft)] transition hover:brightness-110 disabled:opacity-40"
                            >
                                <Save size={15} />
                                {ar
                                    ? 'حفظ الجدولة'
                                    : 'Save schedule'}
                            </button>
                        </div>
                    </form>
                )}

                <section className="mt-5 grid gap-5 xl:grid-cols-2">
                    <div className={card + ' p-5'}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <CalendarDays
                                    size={17}
                                    className="text-[var(--ac-accent)]"
                                />
                                <h2 className="text-base font-bold text-[var(--ac-text)]">
                                    {ar
                                        ? 'الجدولات'
                                        : 'Schedules'}
                                </h2>
                            </div>

                            {data.schedules.length > 0 && (
                                <span className="rounded-full border border-[var(--ac-line)] px-2.5 py-1 text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                    {data.schedules.length}
                                </span>
                            )}
                        </div>

                        <div className="mt-4">
                            {data.schedules.length === 0 ? (
                                <EmptyState
                                    icon="calendar"
                                    title={
                                        ar
                                            ? 'لا توجد جدولات بعد.'
                                            : 'No schedules yet.'
                                    }
                                    description={
                                        ar
                                            ? 'قم بإنشاء أول جدول تقرير لبدء استلام التقارير تلقائياً.'
                                            : 'Create your first schedule to start receiving reports automatically.'
                                    }
                                    action={
                                        data.can_manage
                                            ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        window.scrollTo({
                                                            top: 240,
                                                            behavior:
                                                                'smooth',
                                                        })
                                                    }
                                                    className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] bg-[var(--ac-accent)] px-4 text-[10px] font-bold text-white"
                                                >
                                                    <Plus size={13} />
                                                    {ar
                                                        ? 'إنشاء جدول جديد'
                                                        : 'Create schedule'}
                                                </button>
                                            )
                                            : undefined
                                    }
                                />
                            ) : (
                                <div className="space-y-3">
                                    {data.schedules.map(
                                        schedule => (
                                            <article
                                                key={schedule.id}
                                                className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4 transition hover:border-[var(--ac-line-strong)]"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                    <div className="flex min-w-0 items-start gap-3">
                                                        <span
                                                            className={[
                                                                'flex size-10 shrink-0 items-center justify-center rounded-[12px] border',
                                                                schedule.active
                                                                    ? 'border-[var(--ac-accent)]/40 bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-muted)]',
                                                            ].join(
                                                                ' ',
                                                            )}
                                                        >
                                                            {schedule.active ? (
                                                                <CheckCircle2
                                                                    size={17}
                                                                />
                                                            ) : (
                                                                <Pause
                                                                    size={17}
                                                                />
                                                            )}
                                                        </span>

                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <strong className="truncate text-sm text-[var(--ac-text)]">
                                                                    {
                                                                        schedule.name
                                                                    }
                                                                </strong>

                                                                <span
                                                                    className={[
                                                                        'rounded-full border px-2 py-0.5 text-[8px] font-bold',
                                                                        schedule.active
                                                                            ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                                                                            : 'border-[var(--ac-line)] text-[var(--ac-text-muted)]',
                                                                    ].join(
                                                                        ' ',
                                                                    )}
                                                                >
                                                                    {schedule.active
                                                                        ? (
                                                                            ar
                                                                                ? 'نشط'
                                                                                : 'Active'
                                                                        )
                                                                        : (
                                                                            ar
                                                                                ? 'متوقف'
                                                                                : 'Paused'
                                                                        )}
                                                                </span>
                                                            </div>

                                                            <p className="mt-1 text-[10px] text-[var(--ac-text-soft)]">
                                                                {label(
                                                                    schedule.report_type,
                                                                    ar,
                                                                )}
                                                            </p>

                                                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                                {cadenceDescription(
                                                                    schedule,
                                                                    ar,
                                                                )}
                                                            </p>

                                                            <p className="mt-2 text-[9px] text-[var(--ac-text-muted)]">
                                                                {ar
                                                                    ? 'التشغيل القادم: '
                                                                    : 'Next run: '}
                                                                <span className="text-[var(--ac-text-soft)]">
                                                                    {schedule.next_run_at
                                                                        ?? '—'}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {data.can_manage && (
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() =>
                                                                    void runNow(
                                                                        schedule,
                                                                    )
                                                                }
                                                                className={
                                                                    outlineButton
                                                                }
                                                            >
                                                                <Play
                                                                    size={
                                                                        12
                                                                    }
                                                                />
                                                                {ar
                                                                    ? 'تشغيل الآن'
                                                                    : 'Run now'}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() =>
                                                                    void patch(
                                                                        schedule,
                                                                        {
                                                                            active:
                                                                                ! schedule.active,
                                                                        },
                                                                    )
                                                                }
                                                                className={
                                                                    outlineButton
                                                                }
                                                            >
                                                                {schedule.active
                                                                    ? (
                                                                        ar
                                                                            ? 'إيقاف'
                                                                            : 'Pause'
                                                                    )
                                                                    : (
                                                                        ar
                                                                            ? 'تفعيل'
                                                                            : 'Activate'
                                                                    )}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </article>
                                        ),
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={card + ' p-5'}>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <FileClock
                                    size={17}
                                    className="text-[var(--ac-accent)]"
                                />
                                <h2 className="text-base font-bold text-[var(--ac-text)]">
                                    {ar
                                        ? 'آخر التقارير الجاهزة'
                                        : 'Recent generated reports'}
                                </h2>
                            </div>

                            {data.runs.length > 0 && (
                                <span className="rounded-full border border-[var(--ac-line)] px-2.5 py-1 text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                    {data.runs.length}
                                </span>
                            )}
                        </div>

                        <div className="mt-4">
                            {data.runs.length === 0 ? (
                                <EmptyState
                                    icon="file"
                                    title={
                                        ar
                                            ? 'لم يتم تجهيز تقرير بعد.'
                                            : 'No report has been generated yet.'
                                    }
                                    description={
                                        ar
                                            ? 'عند اكتمال أي تقرير مجدول سيظهر هنا لتتمكن من مراجعته ومشاركته.'
                                            : 'Generated scheduled reports will appear here for review and sharing.'
                                    }
                                />
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex max-h-28 flex-wrap gap-2 overflow-auto">
                                        {data.runs
                                            .slice(0, 12)
                                            .map(run => (
                                                <button
                                                    key={run.id}
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedRun(
                                                            run.id,
                                                        )
                                                    }
                                                    className={[
                                                        outlineButton,
                                                        activeRun?.id ===
                                                        run.id
                                                            ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                            : '',
                                                    ].join(
                                                        ' ',
                                                    )}
                                                >
                                                    <FileText
                                                        size={
                                                            12
                                                        }
                                                    />
                                                    {run.schedule_name
                                                        || label(
                                                            run.report_type,
                                                            ar,
                                                        )}
                                                    {' · #'}
                                                    {run.id}
                                                </button>
                                            ))}
                                    </div>

                                    {activeRun && (
                                        <article className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <strong className="text-sm text-[var(--ac-text)]">
                                                        {activeRun.schedule_name
                                                            || label(
                                                                activeRun.report_type,
                                                                ar,
                                                            )}
                                                    </strong>
                                                    <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                        {
                                                            activeRun.generated_at
                                                        }
                                                    </p>
                                                </div>

                                                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[8px] font-bold text-emerald-300">
                                                    {ar
                                                        ? 'جاهز'
                                                        : 'Ready'}
                                                </span>
                                            </div>

                                            <pre className="mt-4 max-h-[420px] overflow-auto rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 text-[10px] leading-5 text-[var(--ac-text-soft)]">
                                                {JSON.stringify(
                                                    activeRun.snapshot,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        </article>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </AppShell>
    );
}

function FieldLabel({
    label,
    required = false,
    children,
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <label className="block space-y-2">
            <span className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                {label}
                {required && (
                    <span className="ms-1 text-red-300">
                        *
                    </span>
                )}
            </span>
            {children}
        </label>
    );
}

function EmptyState({
    icon,
    title,
    description,
    action,
}: {
    icon: 'calendar' | 'file';
    title: string;
    description: string;
    action?: React.ReactNode;
}) {
    const Icon =
        icon === 'calendar'
            ? CalendarDays
            : FileText;

    return (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-[17px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-bg)] px-6 py-10 text-center">
            <span className="flex size-16 items-center justify-center rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-accent)] shadow-[var(--ac-shadow-soft)]">
                <Icon size={25} />
            </span>

            <h3 className="mt-5 text-sm font-bold text-[var(--ac-text)]">
                {title}
            </h3>

            <p className="mt-2 max-w-sm text-[10px] leading-5 text-[var(--ac-text-muted)]">
                {description}
            </p>

            {action && (
                <div className="mt-5">
                    {action}
                </div>
            )}
        </div>
    );
}
