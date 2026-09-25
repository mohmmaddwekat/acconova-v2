import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import {
    ArrowRight,
    Building2,
    CreditCard,
} from 'lucide-react';
import {
    useState,
    type FormEvent,
} from 'react';

import {
    ApiError,
    apiRequest,
} from '@/lib/http';

type CheckoutIntent = {
    plan: string;
    interval: 'month' | 'year';
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

/**
 * Render the first workspace setup step for a newly registered user.
 */
export default function WorkspaceOnboarding() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const [checkoutIntent] = useState<CheckoutIntent | null>(readCheckoutIntent);
    const [workspaceCreated, setWorkspaceCreated] = useState(false);

    const [name, setName] =
        useState('');

    const [busy, setBusy] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    async function beginCheckout(intent: CheckoutIntent): Promise<void> {
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

        try {
            window.localStorage.removeItem(checkoutIntentKey);
        } catch {
            // Redirecting to Stripe is more important than clearing a blocked store.
        }

        window.location.assign(response.data.url);
    }

    /**
     * Create the user's first organization, then continue directly to the
     * selected Stripe checkout when the signup started from public pricing.
     */
    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();
        if (busy) return;

        setBusy(true);
        setError(null);

        try {
            if (! workspaceCreated) {
                await apiRequest(
                    '/api/organizations',
                    {
                        method: 'POST',

                        body: JSON.stringify({
                            name,
                        }),
                    },
                );

                setWorkspaceCreated(true);
            }

            if (checkoutIntent) {
                try {
                    await beginCheckout(checkoutIntent);
                    return;
                } catch (checkoutFailure) {
                    setError(
                        checkoutFailure instanceof ApiError
                            ? checkoutFailure.message
                            : text(
                                'تم إنشاء مساحة العمل، لكن تعذر فتح صفحة الدفع. اضغط الزر مرة أخرى للمحاولة.',
                                'Your workspace was created, but checkout could not open. Press the button again to retry.',
                            ),
                    );
                    return;
                }
            }

            window.location.assign('/app');
        } catch (exception) {
            if (
                exception instanceof ApiError
            ) {
                setError(
                    exception.errors
                        .name?.[0] ??
                        exception.message,
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

    return (
        <>
            <Head title={t('ui.create_workspace_acconova')} />

            <main className="flex min-h-screen items-center justify-center bg-[var(--ac-bg)] p-6">
                <section className="w-full max-w-2xl rounded-[32px] border border-[var(--ac-line)] bg-white p-8 shadow-[var(--ac-shadow-panel)] sm:p-12">
                    <div className="flex size-12 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                        {checkoutIntent && workspaceCreated
                            ? <CreditCard size={20} />
                            : <Building2 size={20} />}
                    </div>

                    <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                        {workspaceCreated && checkoutIntent
                            ? text('الدفع الآمن', 'Secure checkout')
                            : t('ui.your_first_workspace')}
                    </p>

                    <h1 className="mt-3 max-w-xl text-5xl font-medium leading-[0.95] tracking-[-0.06em] text-[var(--ac-text)]">
                        {workspaceCreated && checkoutIntent
                            ? text('مساحة العمل جاهزة. أكمل الدفع للمتابعة.', 'Your workspace is ready. Complete payment to continue.')
                            : t('ui.give_your_business_a_home')}
                    </h1>

                    <p className="mt-5 max-w-lg text-sm leading-6 text-[var(--ac-text-soft)]">
                        {checkoutIntent
                            ? text(
                                'بما أنك اخترت الباقة مسبقًا من صفحة الأسعار، لن نطلب منك اختيارها مرة أخرى. بعد إنشاء مساحة العمل سنفتح Stripe مباشرة لإتمام الاشتراك.',
                                'Because you already chose a plan on the pricing page, we will not ask you to choose it again. After the workspace is created, Stripe opens directly to complete the subscription.',
                            )
                            : t('ui.a_workspace_keeps_its_customers_invoices_memberships_and_future_automation_isolated_f')}
                    </p>

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
                                    setName(
                                        event.target.value,
                                    )
                                }
                                placeholder={t('ui.acme_studio')}
                                className="h-13 w-full rounded-[17px] border border-[var(--ac-line-strong)] bg-white px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)] disabled:bg-slate-50 disabled:text-slate-500"
                                required
                                disabled={workspaceCreated}
                            />
                        </label>

                        {error && (
                            <p className="mt-3 text-sm text-[var(--ac-danger)]">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy}
                            className="group mt-6 flex h-12 w-full items-center justify-between rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                        >
                            <span className="flex items-center gap-2">
                                {checkoutIntent && workspaceCreated && <CreditCard size={16} />}
                                {busy
                                    ? checkoutIntent
                                        ? text('جاري فتح الدفع...', 'Opening checkout...')
                                        : t('ui.creating_workspace')
                                    : checkoutIntent && workspaceCreated
                                        ? text('متابعة إلى الدفع', 'Continue to payment')
                                        : checkoutIntent
                                            ? text('إنشاء مساحة العمل والمتابعة للدفع', 'Create workspace & continue to payment')
                                            : t('ui.create_workspace')}
                            </span>

                            <ArrowRight
                                size={17}
                                className="transition group-hover:translate-x-0.5"
                            />
                        </button>
                    </form>
                </section>
            </main>
        </>
    );
}
