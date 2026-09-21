import { apiRequest } from '@/lib/http';
import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    CheckCircle2,
    ShieldCheck,
    XCircle,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

type ApprovalRow = {
    id: number;
    subject_type: string;
    subject_id: number;
    category: string;
    status: string;
    reason: string;
    snapshot: Record<string, unknown> | null;
    requested_by: number;
    requested_by_name: string | null;
    reviewed_by_name: string | null;
    reviewed_at: string | null;
    created_at: string;
};

export default function Approvals() {
    const ar = useLocale() === 'ar';
    const {
        workspace,
        auth,
    } = usePage<AppPageProps>().props;
    const activeOrganization =
        workspace.activeOrganization;
    const role =
        activeOrganization?.role
        ?? '';
    const canReview =
        activeOrganization?.permissions
            ? activeOrganization.permissions.includes(
                'finance.approvals.review',
            )
            : [
                'owner',
                'admin',
                'manager',
            ].includes(role);

    const [
        rows,
        setRows,
    ] = useState<ApprovalRow[]>([]);
    const [
        status,
        setStatus,
    ] = useState('pending');
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        error,
        setError,
    ] = useState('');

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar
            ? arabic
            : english;

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data:
                        ApprovalRow[];
                }>(
                    '/api/approval-requests?status='
                    + encodeURIComponent(
                        status,
                    ),
                );

            setRows(
                response.data,
            );
        } catch {
            setError(
                text(
                    'تعذر تحميل طلبات الموافقة.',
                    'Approval requests could not be loaded.',
                ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [
        status,
    ]);

    async function review(
        id: number,
        decision:
            | 'approved'
            | 'rejected',
    ): Promise<void> {
        if (
            busy
            || ! canReview
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/approval-requests/'
                + String(
                    id,
                ),
                {
                    method:
                        'PATCH',
                    body:
                        JSON.stringify(
                            {
                                decision,
                            },
                        ),
                },
            );

            await load();
        } catch {
            setError(
                text(
                    'تعذر تسجيل قرار الموافقة.',
                    'Approval decision could not be saved.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    function subjectHref(
        row: ApprovalRow,
    ): string | null {
        if (
            row.subject_type ===
            'financial_document'
        ) {
            const kind =
                String(
                    row.snapshot?.kind
                    ?? '',
                );

            return kind ===
                'purchase_invoice'
                ? '/app/invoices/purchases/'
                    + String(
                        row.subject_id,
                    )
                : '/app/invoices/sales/'
                    + String(
                        row.subject_id,
                    );
        }

        if (
            row.subject_type ===
            'cash_movement'
        ) {
            return '/app/payments/'
                + String(
                    row.subject_id,
                );
        }

        return null;
    }

    return (
        <AppShell>
            <Head
                title={
                    text(
                        'الموافقات — AccoNova',
                        'Approvals — AccoNova',
                    )
                }
            />

            <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <ShieldCheck
                                size={
                                    18
                                }
                            />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                                {text(
                                    'مركز الموافقات',
                                    'Approval center',
                                )}
                            </h1>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                                {text(
                                    'الفواتير عالية القيمة، الخصومات الكبيرة، والمدفوعات الكبيرة أو التحويلات البنكية تتوقف هنا للمراجعة قبل الاعتماد.',
                                    'High-value invoices, large discounts, and large or bank-transfer payments pause here for review before posting.',
                                )}
                            </p>
                        </div>
                    </div>

                    <select
                        value={
                            status
                        }
                        onChange={
                            event =>
                                setStatus(
                                    event
                                        .target
                                        .value,
                                )
                        }
                        className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs"
                    >
                        <option value="pending">
                            {text(
                                'بانتظار القرار',
                                'Pending',
                            )}
                        </option>
                        <option value="approved">
                            {text(
                                'موافق عليه',
                                'Approved',
                            )}
                        </option>
                        <option value="rejected">
                            {text(
                                'مرفوض',
                                'Rejected',
                            )}
                        </option>
                        <option value="all">
                            {text(
                                'الكل',
                                'All',
                            )}
                        </option>
                    </select>
                </div>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        {
                            error
                        }
                    </div>
                )}

                <section className="mt-6 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
                    {loading ? (
                        <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {text(
                                'جارٍ التحميل...',
                                'Loading...',
                            )}
                        </div>
                    ) : rows.length ===
                        0 ? (
                            <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                                {text(
                                    'لا توجد طلبات موافقة في هذا العرض.',
                                    'No approval requests in this view.',
                                )}
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--ac-line)]">
                                {rows.map(
                                    row => {
                                        const href =
                                            subjectHref(
                                                row,
                                            );

                                        return (
                                            <div
                                                key={
                                                    row.id
                                                }
                                                className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                                            >
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold text-[var(--ac-accent)]">
                                                            {
                                                                row.category
                                                            }
                                                        </span>

                                                        <span className="text-[9px] text-[var(--ac-text-muted)]">
                                                            #
                                                            {
                                                                row.id
                                                            }
                                                            {' · '}
                                                            {
                                                                row.status
                                                            }
                                                        </span>
                                                    </div>

                                                    <p className="mt-3 text-sm font-semibold text-[var(--ac-text)]">
                                                        {
                                                            row.reason
                                                        }
                                                    </p>

                                                    <p className="mt-2 text-[10px] text-[var(--ac-text-muted)]">
                                                        {text(
                                                            'طلبها',
                                                            'Requested by',
                                                        )}
                                                        {' '}
                                                        {
                                                            row.requested_by_name
                                                            ?? '—'
                                                        }
                                                        {' · '}
                                                        {
                                                            row.created_at
                                                        }
                                                    </p>

                                                    {href && (
                                                        <Link
                                                            href={
                                                                href
                                                            }
                                                            className="mt-3 inline-flex text-[10px] font-semibold text-[var(--ac-accent)]"
                                                        >
                                                            {text(
                                                                'فتح السجل',
                                                                'Open record',
                                                            )}
                                                        </Link>
                                                    )}
                                                </div>

                                                {row.status ===
                                                    'pending'
                                                    && canReview
                                                    && auth.user?.id === row.requested_by && (
                                                        <div className="flex items-center rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[9px] font-semibold text-amber-800">
                                                            {text(
                                                                'يحتاج مراجعاً آخر — لا يمكنك اعتماد طلبك بنفسك.',
                                                                'A second reviewer is required — you cannot approve your own request.',
                                                            )}
                                                        </div>
                                                    )}

                                                {row.status ===
                                                    'pending'
                                                    && canReview
                                                    && auth.user?.id !== row.requested_by && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    busy
                                                                }
                                                                onClick={() =>
                                                                    void review(
                                                                        row.id,
                                                                        'approved',
                                                                    )
                                                                }
                                                                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-700 disabled:opacity-50"
                                                            >
                                                                <CheckCircle2
                                                                    size={
                                                                        12
                                                                    }
                                                                />
                                                                {text(
                                                                    'موافقة',
                                                                    'Approve',
                                                                )}
                                                            </button>

                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    busy
                                                                }
                                                                onClick={() =>
                                                                    void review(
                                                                        row.id,
                                                                        'rejected',
                                                                    )
                                                                }
                                                                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-red-50 px-3 text-[10px] font-semibold text-red-700 disabled:opacity-50"
                                                            >
                                                                <XCircle
                                                                    size={
                                                                        12
                                                                    }
                                                                />
                                                                {text(
                                                                    'رفض',
                                                                    'Reject',
                                                                )}
                                                            </button>
                                                        </div>
                                                    )}
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                        )}
                </section>
            </main>
        </AppShell>
    );
}
