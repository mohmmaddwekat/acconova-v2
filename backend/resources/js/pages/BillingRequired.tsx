import { BillingGrowthCenter } from '@/components/settings/BillingGrowthCenter';
import { BillingPanel } from '@/components/settings/BillingPanel';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    CreditCard,
    ShieldCheck,
} from 'lucide-react';
import { useEffect } from 'react';

type BillingAccessOverview = {
    data: {
        subscription: null | {
            status: string | null;
        };
    };
};

export default function BillingRequired() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const Arrow = ar ? ArrowRight : ArrowLeft;

    useEffect(() => {
        if (
            typeof window === 'undefined'
            || new URLSearchParams(window.location.search).get('checkout') !== 'success'
        ) {
            return;
        }

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
                // BillingPanel handles visible load errors.
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

            <main className="min-h-screen bg-[var(--acs-bg)] text-[var(--acs-text)]">
                <header className="sticky top-0 z-20 border-b border-[var(--acs-line)] bg-[var(--acs-surface)]/95 backdrop-blur">
                    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
                        <div className="flex items-center gap-2.5">
                            <span className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                <CreditCard size={15} />
                            </span>
                            <div>
                                <strong className="block text-xs font-bold">
                                    AccoNova
                                </strong>
                                <span className="text-[8px] text-[var(--acs-text-muted)]">
                                    {text('الاشتراك والفوترة', 'Subscription & billing')}
                                </span>
                            </div>
                        </div>

                        <Link
                            href="/app/profile"
                            className="inline-flex items-center justify-center gap-2 rounded-[11px] border border-[var(--acs-line-strong)] bg-transparent px-3.5 py-2 text-[9px] font-bold transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)]"
                        >
                            <Arrow size={12} />
                            {text('الملف الشخصي', 'Profile')}
                        </Link>
                    </div>
                </header>

                <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                    <section className="mb-4 flex flex-col gap-3 rounded-[18px] border border-[var(--acs-line)] bg-[var(--acs-surface)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-base font-bold tracking-tight sm:text-lg">
                                {text(
                                    'إدارة اشتراك AccoNova',
                                    'Manage your AccoNova subscription',
                                )}
                            </h1>
                            <p className="mt-1 max-w-2xl text-[9px] leading-5 text-[var(--acs-text-muted)]">
                                {text(
                                    'اختر الباقة المناسبة وأدر التجديد والاستخدام وصحة الدفع والاستمرارية من مكان واحد.',
                                    'Choose the right plan and manage renewal, usage, billing health, and continuity in one place.',
                                )}
                            </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 rounded-[11px] border border-emerald-400/20 bg-emerald-500/8 px-3 py-2 text-[8px] font-semibold text-emerald-400">
                            <ShieldCheck size={13} />
                            {text('دفع آمن · تفعيل تلقائي', 'Secure checkout · automatic activation')}
                        </div>
                    </section>

                    <BillingPanel />
                    <div className="mt-4">
                        <BillingGrowthCenter />
                    </div>
                </div>
            </main>
        </>
    );
}
