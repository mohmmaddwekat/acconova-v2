import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    ArrowRight,
    Building2,
    CreditCard,
    LoaderCircle,
    RotateCcw,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';

import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import type { AppPageProps } from '@/types/app';

type CheckoutIntent = {
    plan: string;
    interval: 'month' | 'year';
};

type OrganizationSummary = {
    id: number;
    name: string;
};

type OrganizationListResponse = {
    data: OrganizationSummary[];
};

type OrganizationResponse = {
    data: OrganizationSummary;
};

type BillingAccessOverview = {
    data: {
        subscription: null | {
            status: string | null;
        };
    };
};

const checkoutIntentKey = 'acconova.checkoutIntent';

function readCheckoutIntent(): CheckoutIntent | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(checkoutIntentKey);
        if (! raw) return null;

        const value = JSON.parse(raw) as Partial<CheckoutIntent>;
        if (
            typeof value.plan !== 'string'
            || ! /^[a-z0-9_-]+$/i.test(value.plan)
            || ! ['month', 'year'].includes(value.interval ?? '')
        ) {
            window.localStorage.removeItem(checkoutIntentKey);
            return null;
        }

        return {
            plan: value.plan,
            interval: value.interval as 'month' | 'year',
        };
    } catch {
        return null;
    }
}

function checkoutResult(): 'success' | 'cancelled' | null {
    if (typeof window === 'undefined') return null;

    const result = new URLSearchParams(window.location.search).get('checkout');

    return result === 'success' || result === 'cancelled'
        ? result
        : null;
}

/**
 * Render onboarding so public-pricing signups pay first. A temporary workspace
 * is created silently because billing is tenant-scoped, then the customer
 * names that same workspace only after Stripe confirms the subscription.
 */
export default function WorkspaceOnboarding() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const { auth } = usePage<AppPageProps>().props;
    const [checkoutIntent] = useState<CheckoutIntent | null>(readCheckoutIntent);
    const [result] = useState<'success' | 'cancelled' | null>(checkoutResult);
    const [organization, setOrganization] = useState<OrganizationSummary | null>(null);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [startingCheckout, setStartingCheckout] = useState(false);
    const [verifyingPayment, setVerifyingPayment] = useState(result === 'success');
    const [autoStarted, setAutoStarted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Reuse an organization created by a previous checkout attempt so refresh,
     * cancellation and provider errors can never create duplicate workspaces.
     */
    async function ensureCheckoutWorkspace(): Promise<OrganizationSummary> {
        try {
            const current = await apiRequest<OrganizationResponse>(
                '/api/current-organization',
            );

            setOrganization(current.data);
            return current.data;
        } catch {
            // A brand-new account has no tenant selected yet.
        }

        const organizations = await apiRequest<OrganizationListResponse>(
            '/api/organizations',
        );

        if (organizations.data.length > 0) {
            const existing = organizations.data[0];

            await apiRequest('/api/current-organization', {
                method: 'PUT',
                body: JSON.stringify({
                    organization_id: existing.id,
                }),
            });

            setOrganization(existing);
            return existing;
        }

        const ownerName = auth.user?.name?.trim() || 'AccoNova';
        const provisionalName = `${ownerName} Workspace`;
        const created = await apiRequest<OrganizationResponse>(
            '/api/organizations',
            {
                method: 'POST',
                body: JSON.stringify({
                    name: provisionalName,
                }),
            },
        );

        setOrganization(created.data);
        return created.data;
    }

    async function beginCheckout(intent: CheckoutIntent): Promise<void> {
        setStartingCheckout(true);
        setError(null);

        try {
            await ensureCheckoutWorkspace();

            const response = await apiRequest<{ data: { url: string } }>(
                '/api/billing/checkout',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        plan: intent.plan,
                        interval: intent.interval,
                    }),
                },
            );

            window.location.assign(response.data.url);
        } catch (checkoutFailure) {
            setError(
                checkoutFailure instanceof ApiError
                    ? checkoutFailure.message
                    : text(
                        'تعذر فتح صفحة الدفع الآن. حاول مرة أخرى.',
                        'Checkout could not be opened right now. Please try again.',
                    ),
            );
            setStartingCheckout(false);
        }
    }

    /**
     * Stripe can redirect before its webhook finishes. Wait briefly for the
     * canonical billing account before allowing the customer into the app.
     */
    async function verifyPayment(): Promise<void> {
        setVerifyingPayment(true);
        setError(null);

        for (let attempt = 0; attempt < 12; attempt += 1) {
            try {
                const overview = await apiRequest<BillingAccessOverview>(
                    '/api/billing/overview',
                );
                const status = overview.data.subscription?.status;

                if (status === 'active' || status === 'trialing') {
                    const current = await apiRequest<OrganizationResponse>(
                        '/api/current-organization',
                    );

                    setOrganization(current.data);
                    setVerifyingPayment(false);

                    try {
                        window.localStorage.removeItem(checkoutIntentKey);
                    } catch {
                        // The completed checkout does not depend on storage cleanup.
                    }

                    return;
                }
            } catch {
                // Retry while Stripe's webhook and billing account synchronize.
            }

            await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }

        setVerifyingPayment(false);
        setError(
            text(
                'تمت العودة من الدفع، لكننا ما زلنا ننتظر تأكيد Stripe. اضغط إعادة التحقق بعد لحظات.',
                'Stripe returned successfully, but confirmation is still pending. Check again in a moment.',
            ),
        );
    }

    useEffect(() => {
        if (
            ! checkoutIntent
            || result !== null
            || autoStarted
        ) {
            return;
        }

        setAutoStarted(true);
        void beginCheckout(checkoutIntent);
        // beginCheckout is intentionally started once for this page visit.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkoutIntent, result, autoStarted]);

    useEffect(() => {
        if (result !== 'success') return;

        void verifyPayment();
        // Verification is intentionally started once after the Stripe return.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    /**
     * Direct registrations still create a workspace normally. Paid pricing
     * signups use this form only after successful checkout to rename the same
     * provisional workspace instead of creating another tenant.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();
        if (busy) return;

        setBusy(true);
        setError(null);

        try {
            if (result === 'success') {
                if (! organization) {
                    setError(
                        text(
                            'تعذر العثور على مساحة العمل المرتبطة بالدفع.',
                            'The workspace linked to this payment could not be found.',
                        ),
                    );
                    return;
                }

                await apiRequest(
                    `/api/organizations/${organization.id}`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            name,
                        }),
                    },
                );

                window.location.assign('/app');
                return;
            }

            await apiRequest(
                '/api/organizations',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name,
                    }),
                },
            );

            window.location.assign('/app');
        } catch (exception) {
            if (exception instanceof ApiError) {
                setError(
                    exception.errors.name?.[0]
                    ?? exception.message,
                );
                return;
            }

            setError(
                t('ui.acconova_could_not_create_the_workspace'),
            );
        } finally {
            setBusy(false);
        }
    }

    const paymentFlow = checkoutIntent !== null || result !== null;
    const paymentCancelled = result === 'cancelled';
    const paymentConfirmed = result === 'success' && ! verifyingPayment && organization !== null;
    const showWorkspaceForm = ! paymentFlow || paymentConfirmed;

    return (
        <>
            <Head title={
                paymentFlow
                    ? text('إعداد اشتراك AccoNova', 'Set up AccoNova subscription')
                    : t('ui.create_workspace_acconova')
            } />

            <main className="flex min-h-screen items-center justify-center bg-[var(--ac-bg)] p-6">
                <section className="w-full max-w-2xl rounded-[32px] border border-[var(--ac-line)] bg-white p-8 shadow-[var(--ac-shadow-panel)] sm:p-12">
                    <div className="flex size-12 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                        {paymentFlow
                            ? <CreditCard size={20} />
                            : <Building2 size={20} />}
                    </div>

                    <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                        {paymentConfirmed
                            ? text('الخطوة الأخيرة', 'Final step')
                            : paymentFlow
                                ? text('الدفع الآمن', 'Secure checkout')
                                : t('ui.your_first_workspace')}
                    </p>

                    <h1 className="mt-3 max-w-xl text-5xl font-medium leading-[0.95] tracking-[-0.06em] text-[var(--ac-text)]">
                        {paymentConfirmed
                            ? text('تم الدفع. سمِّ مساحة عملك للبدء.', 'Payment confirmed. Name your workspace to begin.')
                            : paymentCancelled
                                ? text('تم إلغاء الدفع. لم يتم خصم أي مبلغ.', 'Checkout was cancelled. You were not charged.')
                                : paymentFlow
                                    ? text('جاري تحويلك إلى صفحة الدفع الآمنة.', 'Taking you to secure checkout.')
                                    : t('ui.give_your_business_a_home')}
                    </h1>

                    <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--ac-text-soft)]">
                        {paymentConfirmed
                            ? text(
                                'اشتراكك مؤكد. الاسم الذي تدخله الآن سيصبح اسم المؤسسة داخل AccoNova.',
                                'Your subscription is confirmed. The name you enter now becomes your organization name in AccoNova.',
                            )
                            : paymentCancelled
                                ? text(
                                    'باقتك ما زالت محفوظة. يمكنك إعادة فتح Stripe والمحاولة مرة أخرى بدون إنشاء مساحة عمل جديدة.',
                                    'Your selected plan is still saved. You can reopen Stripe without creating another workspace.',
                                )
                                : paymentFlow
                                    ? text(
                                        'لن نطلب منك إنشاء مساحة العمل قبل الدفع. نحضّر الاشتراك في الخلفية ثم نفتح Stripe مباشرة.',
                                        'You do not need to set up a workspace before paying. We prepare billing in the background and open Stripe directly.',
                                    )
                                    : t('ui.a_workspace_keeps_its_customers_invoices_memberships_and_future_automation_isolated_f')}
                    </p>

                    {(startingCheckout || verifyingPayment) && (
                        <div className="mt-8 flex items-center gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] px-4 py-4 text-sm text-[var(--ac-text-soft)]">
                            <LoaderCircle size={18} className="animate-spin text-[var(--ac-accent-strong)]" />
                            <span>
                                {verifyingPayment
                                    ? text('جاري تأكيد الدفع مع Stripe...', 'Confirming your payment with Stripe...')
                                    : text('جاري فتح صفحة الدفع...', 'Opening secure checkout...')}
                            </span>
                        </div>
                    )}

                    {error && (
                        <p className="mt-5 rounded-[16px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                            {error}
                        </p>
                    )}

                    {paymentFlow && ! paymentConfirmed && ! startingCheckout && ! verifyingPayment && (
                        <button
                            type="button"
                            onClick={() => {
                                if (result === 'success') {
                                    void verifyPayment();
                                    return;
                                }

                                if (checkoutIntent) {
                                    void beginCheckout(checkoutIntent);
                                }
                            }}
                            disabled={! checkoutIntent && result !== 'success'}
                            className="group mt-6 flex h-12 w-full items-center justify-between rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                        >
                            <span className="flex items-center gap-2">
                                <RotateCcw size={16} />
                                {result === 'success'
                                    ? text('إعادة التحقق من الدفع', 'Check payment again')
                                    : text('إعادة فتح صفحة الدفع', 'Open checkout again')}
                            </span>
                            <ArrowRight size={17} />
                        </button>
                    )}

                    {showWorkspaceForm && (
                        <form
                            onSubmit={handleSubmit}
                            className="mt-10"
                        >
                            <label className="block">
                                <span className="mb-2 block text-sm font-medium">
                                    {t('ui.business_or_workspace_name')}
                                </span>

                                <input
                                    value={name}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    placeholder={t('ui.acme_studio')}
                                    className="h-13 w-full rounded-[17px] border border-[var(--ac-line-strong)] bg-white px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    required
                                    autoFocus={paymentConfirmed}
                                />
                            </label>

                            <button
                                type="submit"
                                disabled={busy}
                                className="group mt-6 flex h-12 w-full items-center justify-between rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                            >
                                <span className="flex items-center gap-2">
                                    {busy
                                        ? text('جاري الحفظ...', 'Saving...')
                                        : paymentConfirmed
                                            ? text('حفظ والدخول إلى AccoNova', 'Save & enter AccoNova')
                                            : t('ui.create_workspace')}
                                </span>

                                <ArrowRight
                                    size={17}
                                    className="transition group-hover:translate-x-0.5"
                                />
                            </button>
                        </form>
                    )}
                </section>
            </main>
        </>
    );
}
