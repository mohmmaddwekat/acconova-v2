import { BillingGrowthCenter } from '@/components/settings/BillingGrowthCenter';
import { BillingPanel } from '@/components/settings/BillingPanel';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    ChevronDown,
    CreditCard,
    Settings2,
} from 'lucide-react';
import { useEffect } from 'react';

type BillingAccessOverview = {
    data: {
        subscription: null | {
            status: string | null;
        };
    };
};

const checkoutIntentKey = 'acconova.checkoutIntent';

function hasOnboardingCheckoutIntent(): boolean {
    if (typeof window === 'undefined') return false;

    try {
        const raw = window.localStorage.getItem(checkoutIntentKey);
        if (! raw) return false;

        const value = JSON.parse(raw) as {
            plan?: unknown;
            interval?: unknown;
        };

        return typeof value.plan === 'string'
            && /^[a-z0-9_-]+$/i.test(value.plan)
            && (value.interval === 'month' || value.interval === 'year');
    } catch {
        return false;
    }
}

export default function BillingRequired() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const Arrow = ar ? ArrowLeft : ArrowRight;

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const checkout = new URLSearchParams(window.location.search).get('checkout');

        /*
         * A pricing signup reaches Stripe through onboarding. Stripe's normal
         * success/cancel URLs land on this billing surface, so send only those
         * sessions back to onboarding to finish naming (or retrying) the same
         * provisional workspace. Existing-workspace checkouts stay here.
         */
        if (
            (checkout === 'success' || checkout === 'cancelled')
            && hasOnboardingCheckoutIntent()
        ) {
            window.location.replace(
                `/onboarding/workspace?checkout=${checkout}`,
            );
            return;
        }

        if (checkout !== 'success') return;

        let cancelled = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const checkAccess = async (): Promise<void> => {
            try {
                const overview = await apiRequest<BillingAccessOverview>(
                    '/api/billing/overview',
                );

                if (cancelled) return;

                const status = overview.data.subscription?.status;

                if (status === 'active' || status === 'trialing') {
                    window.location.replace('/app');
                    return;
                }
            } catch {
                // BillingPanel renders the visible billing load state.
            }

            attempts += 1;

            if (! cancelled && attempts < 12) {
                timer = setTimeout(
                    () => void checkAccess(),
                    1500,
                );
            }
        };

        void checkAccess();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, []);

    return (
        <>
            <Head
                title={text(
                    'اشتراك AccoNova',
                    'AccoNova Subscription',
                )}
            />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="min-h-screen bg-[var(--acs-bg)] text-[var(--acs-text)]"
            >
                <header className="sticky top-0 z-20 border-b border-[var(--acs-line)] bg-[var(--acs-surface)]/95 backdrop-blur">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2.5">
                            <span className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                <CreditCard size={15} />
                            </span>
                            <div>
                                <strong className="block text-xs font-extrabold">
                                    AccoNova
                                </strong>
                                <span className="text-[8px] text-[var(--acs-text-muted)]">
                                    {text(
                                        'الاشتراكات والفوترة',
                                        'Subscriptions & billing',
                                    )}
                                </span>
                            </div>
                        </div>

                        <Link
                            href="/app"
                            className="inline-flex items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-line-strong)] bg-transparent px-3.5 py-2 text-[9px] font-bold transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)]"
                        >
                            <Arrow size={12} />
                            {text('العودة إلى التطبيق', 'Back to app')}
                        </Link>
                    </div>
                </header>

                <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
                    <BillingPanel />

                    <details className="group mt-4 rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                            <div className="flex items-center gap-3">
                                <span className="flex size-9 items-center justify-center rounded-[11px] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                    <Settings2 size={15} />
                                </span>
                                <div>
                                    <strong className="block text-[10px] text-[var(--acs-text)]">
                                        {text(
                                            'إدارة الاشتراك المتقدمة',
                                            'Advanced subscription controls',
                                        )}
                                    </strong>
                                    <span className="mt-0.5 block text-[8px] text-[var(--acs-text-muted)]">
                                        {text(
                                            'الإلغاء، الإيقاف المؤقت، حدود الإنفاق والعروض.',
                                            'Cancellation, pause, spend limits and offers.',
                                        )}
                                    </span>
                                </div>
                            </div>

                            <ChevronDown
                                size={14}
                                className="text-[var(--acs-text-muted)] transition group-open:rotate-180"
                            />
                        </summary>

                        <div className="border-t border-[var(--acs-line)] p-4">
                            <BillingGrowthCenter />
                        </div>
                    </details>
                </div>
            </main>
        </>
    );
}
