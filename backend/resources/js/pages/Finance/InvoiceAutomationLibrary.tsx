import { apiRequest } from '@/lib/http';
import { router } from '@inertiajs/react';
import {
    CalendarClock,
    CopyPlus,
    FileStack,
    Pause,
    Play,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

type AutomationData = {
    templates: Array<{
        id: number;
        name: string;
        kind: 'sale_invoice' | 'purchase_invoice';
        source_document_id: number | null;
        created_at: string;
        updated_at: string;
    }>;
    recurring: Array<{
        id: number;
        name: string;
        kind: 'sale_invoice' | 'purchase_invoice';
        source_document_id: number | null;
        frequency: 'weekly' | 'monthly' | 'quarterly';
        interval: number;
        next_run_on: string;
        ends_on: string | null;
        active: boolean;
        last_generated_on: string | null;
        created_at: string;
        updated_at: string;
    }>;
};

export function InvoiceAutomationLibrary({
    kind,
    ar,
    canManage,
}: {
    kind: 'sale_invoice' | 'purchase_invoice';
    ar: boolean;
    canManage: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<AutomationData | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: AutomationData;
                }>(
                    '/api/finance/invoice-automation?kind='
                    + kind,
                );

            setData(response.data);
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحميل القوالب والتكرارات.'
                            : 'Templates and recurring invoices could not be loaded.'
                    ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (open) {
            void load();
        }
    }, [
        open,
        kind,
    ]);

    async function createFromTemplate(
        templateId: number,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: {
                        id: number;
                        url: string;
                    };
                }>(
                    '/api/finance/invoice-templates/'
                    + templateId
                    + '/create-draft',
                    {
                        method: 'POST',
                    },
                );

            router.visit(
                response.data.url,
            );
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر إنشاء المسودة.'
                            : 'The draft could not be created.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function removeTemplate(
        templateId: number,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/finance/invoice-templates/'
                + templateId,
                {
                    method: 'DELETE',
                },
            );
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function toggleRecurring(
        profileId: number,
        active: boolean,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/finance/recurring-invoices/'
                + profileId,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        active,
                    }),
                },
            );
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function removeRecurring(
        profileId: number,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                '/api/finance/recurring-invoices/'
                + profileId,
                {
                    method: 'DELETE',
                },
            );
            await load();
        } finally {
            setBusy(false);
        }
    }

    const createHref =
        kind === 'sale_invoice'
            ? '/app/invoices/sales/create'
            : '/app/invoices/purchases/create';

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)]"
            >
                <FileStack size={14} />
                {ar
                    ? 'القوالب والتكرار'
                    : 'Templates & recurring'}
            </button>

            {open && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[330] flex items-center justify-center p-4">
                    <button
                        type="button"
                        aria-label={ar ? 'إغلاق' : 'Close'}
                        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />

                    <section className="relative z-10 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[0_30px_100px_rgba(0,0,0,.3)]">
                        <header className="flex items-start justify-between gap-4 border-b border-[var(--ac-line)] p-5">
                            <div>
                                <span className="flex size-10 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                                    <FileStack size={17} />
                                </span>
                                <h2 className="mt-3 text-lg font-bold">
                                    {ar
                                        ? 'قوالب الفواتير والفواتير المتكررة'
                                        : 'Invoice templates & recurring drafts'}
                                </h2>
                                <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'التكرارات تنشئ مسودات للمراجعة فقط ولا تصدر فواتير تلقائياً.'
                                        : 'Recurring schedules create review-only drafts and never auto-issue invoices.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="flex size-9 items-center justify-center rounded-[10px] hover:bg-[var(--ac-surface-soft)]"
                            >
                                <X size={15} />
                            </button>
                        </header>

                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                            {error && (
                                <div className="mb-4 rounded-[12px] border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                                    {error}
                                </div>
                            )}

                            {loading ? (
                                <p className="py-12 text-center text-xs text-[var(--ac-text-muted)]">
                                    {ar ? 'جارٍ التحميل…' : 'Loading…'}
                                </p>
                            ) : (
                                <div className="space-y-6">
                                    <section>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <CopyPlus size={14} className="text-[var(--ac-accent)]" />
                                                <h3 className="text-sm font-bold">
                                                    {ar ? 'القوالب' : 'Templates'}
                                                </h3>
                                            </div>
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    onClick={() => router.visit(createHref)}
                                                    className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold"
                                                >
                                                    <Plus size={12} />
                                                    {ar ? 'فاتورة جديدة' : 'New invoice'}
                                                </button>
                                            )}
                                        </div>

                                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                                            {(data?.templates ?? []).map((template) => (
                                                <article
                                                    key={template.id}
                                                    className="rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3"
                                                >
                                                    <strong className="text-xs">
                                                        {template.name}
                                                    </strong>
                                                    <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                        {ar ? 'قالب محفوظ' : 'Saved template'}
                                                        {template.source_document_id
                                                            ? ' · #' + template.source_document_id
                                                            : ''}
                                                    </p>
                                                    <div className="mt-3 flex gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={! canManage || busy}
                                                            onClick={() => void createFromTemplate(template.id)}
                                                            className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-[var(--ac-accent-solid)] px-2.5 text-[10px] font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-50"
                                                        >
                                                            <CopyPlus size={11} />
                                                            {ar ? 'إنشاء مسودة' : 'Create draft'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={! canManage || busy}
                                                            onClick={() => void removeTemplate(template.id)}
                                                            className="flex size-8 items-center justify-center rounded-[9px] text-[var(--ac-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                                        >
                                                            <Trash2 size={11} />
                                                        </button>
                                                    </div>
                                                </article>
                                            ))}

                                            {! data?.templates.length && (
                                                <div className="rounded-[14px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)] md:col-span-2">
                                                    {ar
                                                        ? 'افتح أي فاتورة محفوظة واختر «حفظ كقالب».'
                                                        : 'Open any saved invoice and choose “Save template”.'}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    <section className="border-t border-[var(--ac-line)] pt-5">
                                        <div className="flex items-center gap-2">
                                            <CalendarClock size={14} className="text-[var(--ac-accent)]" />
                                            <h3 className="text-sm font-bold">
                                                {ar ? 'الفواتير المتكررة' : 'Recurring drafts'}
                                            </h3>
                                        </div>

                                        <div className="mt-3 space-y-2">
                                            {(data?.recurring ?? []).map((profile) => (
                                                <article
                                                    key={profile.id}
                                                    className="flex flex-col gap-3 rounded-[15px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 sm:flex-row sm:items-center"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <strong className="truncate text-xs">
                                                                {profile.name}
                                                            </strong>
                                                            <span className={[
                                                                'rounded-full px-2 py-0.5 text-[9px] font-semibold',
                                                                profile.active
                                                                    ? 'bg-emerald-50 text-emerald-700'
                                                                    : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                                                            ].join(' ')}>
                                                                {profile.active
                                                                    ? (ar ? 'نشط' : 'Active')
                                                                    : (ar ? 'متوقف' : 'Paused')}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                            {frequencyLabel(profile.frequency, ar)}
                                                            {' · '}
                                                            {ar ? 'القادم' : 'Next'}: {profile.next_run_on}
                                                            {profile.last_generated_on
                                                                ? ' · ' + (ar ? 'آخر مسودة ' : 'Last draft ') + profile.last_generated_on
                                                                : ''}
                                                        </p>
                                                    </div>

                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={! canManage || busy}
                                                            onClick={() => void toggleRecurring(profile.id, ! profile.active)}
                                                            className="flex size-8 items-center justify-center rounded-[9px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                                                        >
                                                            {profile.active
                                                                ? <Pause size={11} />
                                                                : <Play size={11} />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={! canManage || busy}
                                                            onClick={() => void removeRecurring(profile.id)}
                                                            className="flex size-8 items-center justify-center rounded-[9px] text-[var(--ac-text-muted)] hover:bg-red-50 hover:text-red-600"
                                                        >
                                                            <Trash2 size={11} />
                                                        </button>
                                                    </div>
                                                </article>
                                            ))}

                                            {! data?.recurring.length && (
                                                <div className="rounded-[14px] border border-dashed border-[var(--ac-line)] p-6 text-center text-xs text-[var(--ac-text-muted)]">
                                                    {ar
                                                        ? 'افتح فاتورة واختر «تكرار الفاتورة» لبدء جدول جديد.'
                                                        : 'Open an invoice and choose “Make recurring” to create a schedule.'}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            )}
                        </div>
                    </section>
                </div>,
                document.body,
            )}
        </>
    );
}

function frequencyLabel(
    frequency: 'weekly' | 'monthly' | 'quarterly',
    ar: boolean,
): string {
    if (frequency === 'weekly') {
        return ar ? 'أسبوعي' : 'Weekly';
    }

    if (frequency === 'quarterly') {
        return ar ? 'ربع سنوي' : 'Quarterly';
    }

    return ar ? 'شهري' : 'Monthly';
}
