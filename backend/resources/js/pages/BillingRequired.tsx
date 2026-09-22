import { BillingPanel } from '@/components/settings/BillingPanel';
import { apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    ShieldCheck,
    Sparkles,
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

                if (
                    status === 'active'
                    || status === 'trialing'
                ) {
                    window.location.replace('/app');

                    return;
                }
            } catch {
                // BillingPanel surfaces load errors; this check only unlocks.
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

            if (timer) {
                clearTimeout(timer);
            }
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
                <header className="border-b border-[var(--acs-line)] bg-[var(--acs-surface)]">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-[13px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                <Sparkles size={17} />
                            </span>
                            <div>
                                <strong className="block text-sm font-bold">
                                    AccoNova
                                </strong>
                                <span className="text-[9px] text-[var(--acs-text-muted)]">
                                    {text(
                                        'إدارة الاشتراك',
                                        'Subscription',
                                    )}
                                </span>
                            </div>
                        </div>

                        <Link
                            href="/app/profile"
                            className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--acs-line-strong)] bg-transparent px-3.5 py-2.5 text-[10px] font-bold transition hover:border-[var(--acs-accent)] hover:bg-[var(--acs-accent-soft)]"
                        >
                            <Arrow size={13} />
                            {text(
                                'الملف الشخصي',
                                'Profile',
                            )}
                        </Link>
                    </div>
                </header>

                <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
                    <section className="mb-5 rounded-[20px] border border-[var(--acs-line)] bg-[var(--acs-surface)] p-5 shadow-[0_10px_28px_rgba(30,75,140,.045)]">
                        <div className="flex items-start gap-4">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-[var(--acs-line)] bg-[var(--acs-accent-soft)] text-[var(--acs-accent)]">
                                <ShieldCheck size={18} />
                            </span>

                            <div>
                                <h1 className="text-lg font-bold tracking-tight">
                                    {text(
                                        'أكمل اشتراكك للدخول إلى AccoNova',
                                        'Complete your subscription to enter AccoNova',
                                    )}
                                </h1>
                                <p className="mt-1 max-w-3xl text-[10px] leading-5 text-[var(--acs-text-muted)]">
                                    {text(
                                        'اختر الباقة المناسبة لمساحة العمل. بعد تأكيد الاشتراك سيفتح النظام تلقائيًا لجميع أعضاء مساحة العمل حسب صلاحياتهم.',
                                        'Choose the right plan for this workspace. After the subscription is confirmed, AccoNova opens automatically for workspace members according to their permissions.',
                                    )}
                                </p>
                            </div>
                        </div>
                    </section>

                    <BillingPanel />
                </div>
            </main>
        </>
    );
}
