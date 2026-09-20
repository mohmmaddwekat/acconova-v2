import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import { Wallet, Plus, ChevronDown, CalendarClock, ArrowDownLeft, ArrowUpRight, ReceiptText, ArrowLeft } from 'lucide-react';
import { Head, Link, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type Frequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
type Plan = { id: number; title: string; direction: 'incoming' | 'outgoing'; amount: string; currency: string; frequency: Frequency; interval_count: number; next_due_on: string; counterparty: string | null; active: boolean; completed: boolean; due: boolean; reminder: boolean };
type Payment = { id: number; title: string; direction: 'incoming' | 'outgoing'; amount: string; currency: string; due_on: string; paid_on: string; counterparty: string | null; method: 'cash' | 'bank' | 'electronic'; notes: string | null };
type Result<T> = { data: T[]; meta: { last_page: number } };
const field = 'mt-2 w-full rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 text-sm transition focus:bg-white focus:outline-2 focus:outline-[var(--ac-accent)]';
const button = 'rounded-xl border border-[var(--ac-line)] bg-white px-4 py-2 text-sm font-medium transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ac-accent)] disabled:opacity-50';
function localDate(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function Payments() {
    const { workspace } = usePage<AppPageProps>().props;
    return <PaymentsWorkspace key={workspace.activeOrganization?.id ?? 'none'} />;
}

function PaymentsWorkspace() {
    const locale = useLocale();
    const { workspace } = usePage<AppPageProps>().props;
    const permissions = workspace.activeOrganization?.permissions;
    const allowed = permissions ? permissions.includes('payments.view') : ['owner', 'admin', 'manager', 'accountant'].includes(workspace.activeOrganization?.role ?? '');
    const canCreate=permissions ? permissions.some(p=>['payments.manage','payments.create'].includes(p)) : allowed;
    const canRecord=permissions ? permissions.some(p=>['payments.manage','payments.record'].includes(p)) : allowed;
    const canManage = permissions ? permissions.some(p=>['payments.manage','payments.update'].includes(p)) : allowed;
    const [frequency, setFrequency] = useState('once');
    const [defaults, setDefaults] = useState<{ currency: string; reminder_days: number } | null>(null);
    useEffect(() => { let active = true; apiRequest<{ currency: string; reminder_days: number }>('/api/workspace-settings').then((data) => { if (active) { setDefaults(data); } }).catch(() => {}); return () => { active = false; }; }, []);
    const [tab, setTab] = useState<'active' | 'inactive' | 'history'>('active');
    const [direction, setDirection] = useState('');
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [records, setRecords] = useState<Payment[]>([]);
    const [lastPage, setLastPage] = useState(1);
    const [selected, setSelected] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loadError, setLoadError] = useState('');
    const [success, setSuccess] = useState(false);
    const recordSection = useRef<HTMLElement>(null);
    useEffect(() => { if (selected) { recordSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, [selected]);
    useEffect(() => {
        if (!allowed) { return; }
        const controller = new AbortController();
        setLoading(true); setLoadError('');
        const path = tab === 'history' ? `/api/payment-records?page=${page}` : `/api/payment-plans?status=${tab}&page=${page}${direction ? `&direction=${direction}` : ''}`;
        apiRequest<Result<Plan> | Result<Payment>>(path, { signal: controller.signal })
            .then((result) => { setLastPage(result.meta.last_page); if (tab === 'history') { setRecords((result as Result<Payment>).data); } else { setPlans((result as Result<Plan>).data); } })
            .catch((failure: unknown) => { if (!controller.signal.aborted) { setLoadError(failure instanceof ApiError ? failure.message : t('catalog.operations.failed')); } })
            .finally(() => { if (!controller.signal.aborted) { setLoading(false); } });
        return () => controller.abort();
    }, [allowed, tab, page, direction, revision]);

    async function mutate(path: string, data: Record<string, unknown>, method = 'POST'): Promise<boolean> {
        setBusy(true); setError(''); setSuccess(false);
        try {
            await apiRequest(path, { method, body: JSON.stringify(data) });
            setSuccess(true); setRevision((value) => value + 1);
            window.dispatchEvent(new Event('payment-plans-changed'));
            return true;
        } catch (failure) {
            if (failure instanceof ApiError && failure.status === 409) {
                setError(t('payments.stale')); setSelected(null); setRevision((value) => value + 1);
            } else {
                setError(failure instanceof ApiError ? [failure.message, ...Object.values(failure.errors).flat()].join(' ') : t('catalog.operations.failed'));
            }
            return false;
        } finally { setBusy(false); }
    }

    async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault(); if (busy) { return; }
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        if (await mutate('/api/payment-plans', { ...data, reminder_days: Number(data.reminder_days) })) { form.reset(); setFrequency('once'); setTab('active'); setPage(1); }
    }

    async function record(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault(); if (busy || !selected) { return; }
        const data = Object.fromEntries(new FormData(event.currentTarget));
        if (await mutate(`/api/payment-plans/${selected.id}/record`, { ...data, due_on: selected.next_due_on })) { setSelected(null); }
    }

    const ar = locale === 'ar';

    return <AppShell><Head title={ar ? 'المدفوعات المتكررة' : 'Recurring payments'} /><main dir={ar ? 'rtl' : 'ltr'} className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <header className="rounded-[24px] border border-[var(--ac-line)] bg-gradient-to-br from-white via-white to-[var(--ac-accent-soft)] p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-5">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"><CalendarClock size={26} /></span>
                    <div>
                        <p className="text-xs font-semibold text-[var(--ac-text-muted)]">{ar ? 'المالية / المدفوعات' : 'Finance / Payments'}</p>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{ar ? 'المدفوعات المتكررة' : 'Recurring payments'}</h1>
                        <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--ac-text-soft)]">
                            {ar
                                ? 'أنشئ التزامات تتكرر تلقائياً في جدول المتابعة مثل الإيجار والاشتراكات والخدمات. الرواتب لا تُسجل هنا لأنها تُدار من نظام الموظفين.'
                                : 'Track repeating obligations such as rent, subscriptions and services. Payroll is managed in the staff module instead.'}
                        </p>
                    </div>
                </div>

                <Link href="/app/payments" className={button}>
                    <ArrowLeft size={15} className="rtl:rotate-180" />
                    {ar ? 'رجوع للمدفوعات' : 'Back to payments'}
                </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--ac-line)] pt-4">
                <Link href="/app/payments" className={button}>
                    <Wallet size={15} />
                    {ar ? 'الحركات' : 'Transactions'}
                </Link>
                <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-text)] px-4 text-xs font-semibold text-white">
                    <CalendarClock size={15} />
                    {ar ? 'المتكررة' : 'Recurring'}
                </span>
            </div>
        </header>
        {!allowed ? <p>{t('payments.noAccess')}</p> : <>
            {canCreate && <details className="group rounded-2xl border border-[var(--ac-line)] bg-white p-5 shadow-sm open:border-[var(--ac-accent)] sm:p-6">
                <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold [&::-webkit-details-marker]:hidden"><span className="flex size-10 items-center justify-center rounded-xl bg-[var(--ac-text)] text-white"><Plus size={19} /></span>{t('payments.new')}<ChevronDown size={18} className="ms-auto text-[var(--ac-text-muted)] transition group-open:rotate-180" /></summary>
                <form onSubmit={create} className="mt-5"><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs sm:col-span-2">{t('payments.name')}<input required name="title" maxLength={255} className={field} /></label>
                    <ChoiceField name="direction" label={t('payments.direction')} defaultValue="outgoing" options={(['outgoing', 'incoming'] as const).map((value) => ({ value, label: t(`payments.${value}`) }))} />
                    <ChoiceField name="frequency" label={t('payments.frequency')} defaultValue="once" onChange={setFrequency} options={(['once', 'daily', 'weekly', 'monthly', 'yearly'] as const).map((value) => ({ value, label: t(`payments.${value}`) }))} />
                    <label className="text-xs">{t('settings.every')}<input name="interval_count" type="number" min="1" max="365" step="1" required disabled={frequency === 'once'} defaultValue="1" className={field} /></label><label className="text-xs">{t('payments.amount')}<input required name="amount" type="number" dir="ltr" min="0.0001" max="9999999999" step="0.0001" className={field} /></label>
                    <div className="text-xs">{t('payments.currency')}<div className="mt-2 rounded-xl bg-[var(--ac-accent-soft)] px-4 py-3 font-semibold">{defaults?.currency ?? workspace.activeOrganization?.currency ?? 'ILS'}</div></div>
                    <label className="text-xs">{t('payments.due')}<input required name="next_due_on" type="date" defaultValue={localDate()} className={field} /></label>
                    <label className="text-xs">{t('payments.reminderDays')}<input required name="reminder_days" type="number" min="0" max="30" key={defaults?.reminder_days ?? 'loading'} defaultValue={defaults?.reminder_days ?? 3} className={field} /></label>
                    <label className="text-xs sm:col-span-2">{t('payments.party')}<input name="counterparty" maxLength={255} className={field} /></label>
                    <button disabled={busy} className="rounded-xl bg-[var(--ac-accent-strong)] px-5 py-3 text-sm text-white sm:col-span-2">{t('payments.save')}</button>
                </fieldset></form>
            </details>}
            {selected && <section ref={recordSection} className="rounded-2xl border border-[var(--ac-accent)] bg-white p-5">
                <h2 className="font-semibold">{t('payments.record')} — {selected.title}</h2><p className="mt-2 text-xs leading-6">{t('payments.recordHelp')}</p>
                <form key={`${selected.id}-${selected.next_due_on}`} onSubmit={record} className="mt-4"><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs">{t('payments.actual')} ({selected.currency})<input required name="amount" type="number" min="0.0001" max="9999999999" step="0.0001" dir="ltr" defaultValue={selected.amount} className={field} /></label>
                    <label className="text-xs">{t('payments.paidOn')}<input required type="date" name="paid_on" max={localDate()} defaultValue={localDate()} className={field} /></label>
                    <label className="text-xs">{t('payments.party')}<input name="counterparty" maxLength={255} defaultValue={selected.counterparty ?? ''} className={field} /></label>
                    <ChoiceField name="method" label={t('payments.method')} defaultValue="cash" options={(['cash', 'bank', 'electronic'] as const).map((value) => ({ value, label: t(`payments.${value}`) }))} />
                    <label className="text-xs sm:col-span-2">{t('payments.notes')}<textarea name="notes" maxLength={2000} className={field} /></label>
                    <button disabled={busy} className="rounded-xl bg-[var(--ac-accent-strong)] px-4 py-3 text-sm text-white">{t('payments.confirm')}</button><button type="button" className={button} onClick={() => setSelected(null)}>{t('payments.cancel')}</button>
                </fieldset></form>
            </section>}
            {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
            {success && <p role="status" className="text-sm text-[var(--ac-accent-strong)]">{t('payments.saved')}</p>}
            <div className="space-y-4 rounded-2xl border border-[var(--ac-line)] bg-white p-4 sm:p-5"><div className="flex flex-wrap gap-2">{(['active', 'inactive', 'history'] as const).map((value) => <button key={value} type="button" disabled={busy} aria-pressed={tab === value} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm transition ${tab === value ? 'bg-[var(--ac-text)] font-semibold text-white shadow-sm' : 'bg-[var(--ac-surface-soft)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-accent-soft)]'}`} onClick={() => { setTab(value); setPage(1); setSelected(null); }}>{value === 'history' ? <ReceiptText size={16} /> : <CalendarClock size={16} />}{t(`payments.${value}`)}</button>)}</div>
{tab !== 'history' && <div className="flex flex-wrap gap-2 border-t border-[var(--ac-line)] pt-4">{(['', 'outgoing', 'incoming'] as const).map((value) => <button key={value} aria-pressed={direction === value} onClick={() => { setDirection(value); setPage(1); }} className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition ${direction === value ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] font-semibold text-[var(--ac-accent-strong)]' : 'border-transparent bg-[var(--ac-surface-soft)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line)]'}`}>{value === 'incoming' ? <ArrowDownLeft size={14} /> : value === 'outgoing' ? <ArrowUpRight size={14} /> : <Wallet size={14} />}{t(value ? `payments.${value}` : 'payments.all')}</button>)}</div>}</div>
            {loading ? <p role="status">{t('catalog.operations.loading')}</p> : loadError ? <div role="alert">{loadError}<button type="button" className={button} onClick={() => setRevision((value) => value + 1)}>{t('catalog.operations.retry')}</button></div> : tab === 'history' ? <div className="space-y-3">{!records.length && <div className="col-span-full rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-b from-white to-[var(--ac-surface-soft)] px-6 py-16 text-center"><span className="mx-auto flex size-20 items-center justify-center rounded-full bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"><Wallet size={32} /></span><h2 className="mt-5 font-semibold">{t('payments.empty')}</h2><p className="mt-2 text-sm text-[var(--ac-text-muted)]">{t('payments.new')}</p></div>}{records.map((entry) => <article key={entry.id} className="rounded-[24px] border border-[var(--ac-line)] bg-white p-6 transition hover:shadow-md"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{entry.title}</h3><bdi>{entry.amount} {entry.currency}</bdi></div><p className="mt-2 text-xs">{t(`payments.${entry.direction}`)} · {entry.paid_on} · {t(`payments.${entry.method}`)}</p><p className="mt-2 text-xs">{t('payments.due')}: {entry.due_on}</p>{entry.counterparty && <p className="mt-2 text-sm">{entry.counterparty}</p>}{entry.notes && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{entry.notes}</p>}</article>)}</div> : <div className="grid gap-4 md:grid-cols-2">{!plans.length && <div className="col-span-full rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-b from-white to-[var(--ac-surface-soft)] px-6 py-16 text-center"><span className="mx-auto flex size-20 items-center justify-center rounded-full bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]"><Wallet size={32} /></span><h2 className="mt-5 font-semibold">{t('payments.empty')}</h2><p className="mt-2 text-sm text-[var(--ac-text-muted)]">{t('payments.new')}</p></div>}{plans.map((plan) => <article key={plan.id} className="rounded-[24px] border border-[var(--ac-line)] bg-white p-6 transition hover:shadow-md"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-words font-semibold">{plan.title}</h3><span className={`rounded-lg px-2 py-1 text-xs ${plan.direction === 'outgoing' ? 'bg-orange-50 text-orange-800' : 'bg-emerald-50 text-emerald-800'}`}>{t(`payments.${plan.direction}`)}</span></div><p className="mt-5 text-3xl font-semibold tracking-tight"><bdi>{plan.amount} {plan.currency}</bdi></p><p className="mt-2 text-xs">{plan.interval_count > 1 && plan.frequency !== 'once' ? t('settings.repeat', { count: plan.interval_count, unit: t(plan.frequency === 'daily' ? 'settings.days' : plan.frequency === 'weekly' ? 'settings.weeks' : plan.frequency === 'monthly' ? 'settings.months' : 'settings.years') }) : t(`payments.${plan.frequency}`)} · {t('payments.due')}: {plan.next_due_on}</p>{plan.counterparty && <p className="mt-2 text-sm">{plan.counterparty}</p>}{plan.reminder && <p className="mt-3 text-xs font-semibold text-amber-800">{t(plan.due ? 'payments.dueNow' : 'payments.soon')}</p>}<div className="mt-5 flex flex-wrap gap-2">{canRecord && plan.active && <button type="button" disabled={busy} className={button} onClick={() => { setSelected(plan); setError(''); setSuccess(false); }}>{t('payments.record')}</button>}{canManage && !plan.completed && <button type="button" disabled={busy} className={button} onClick={() => void mutate(`/api/payment-plans/${plan.id}`, { active: !plan.active }, 'PATCH')}>{t(plan.active ? 'payments.pause' : 'payments.resume')}</button>}</div></article>)}</div>}
            {!loading && !loadError && lastPage > 1 && <div className="flex items-center justify-between"><button className={button} disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t('catalog.operations.previous')}</button><span>{page} / {lastPage}</span><button className={button} disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)}>{t('catalog.operations.next')}</button></div>}
            <p className="text-xs leading-6 text-[var(--ac-text-muted)]">{t('payments.notice')}</p>
        </>}
    </main></AppShell>;
}

function ChoiceField({ name, label, options, defaultValue, onChange }: { name: string; label: string; options: { value: string; label: string }[]; defaultValue?: string; onChange?: (value: string) => void }) {
    return <fieldset className="min-w-0"><legend className="text-xs">{label}</legend><div className="mt-2 flex flex-wrap gap-2">{options.map((option) => <label key={option.value} className="cursor-pointer"><input type="radio" name={name} value={option.value} onChange={() => onChange?.(option.value)} defaultChecked={defaultValue === option.value} required className="peer sr-only" /><span className="block rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-4 py-3 text-xs transition peer-checked:border-[var(--ac-accent)] peer-checked:bg-[var(--ac-accent-soft)] peer-checked:font-semibold peer-checked:text-[var(--ac-accent-strong)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ac-accent)] peer-disabled:cursor-wait peer-disabled:opacity-50">{option.label}</span></label>)}</div></fieldset>;
}
