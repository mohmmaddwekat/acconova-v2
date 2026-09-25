import { t } from '@/lib/i18n';
import { useLocale } from '@/lib/i18n';
import { setLocale } from '@/lib/locale';
import {
    ArrowLeft,
    ArrowRight,
    Languages,
    Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';

type AuthShellProps = {
    eyebrow: string;
    title: string;
    description: string;
    children: ReactNode;
};

/**
 * Provide AccoNova's shared authentication experience.
 *
 * Login, registration, recovery and verification all share the same product
 * identity, language preference and a reliable way back to the public page.
 */
export function AuthShell({
    eyebrow,
    title,
    description,
    children,
}: AuthShellProps) {
    const locale = useLocale();
    const ar = locale === 'ar';
    const BackArrow = ar ? ArrowRight : ArrowLeft;

    const goBackHome = (): void => {
        if (typeof window === 'undefined') return;

        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.location.assign('/');
    };

    return (
        <main
            dir={ar ? 'rtl' : 'ltr'}
            className="grid min-h-screen bg-[var(--ac-bg)] lg:grid-cols-[1.08fr_0.92fr]"
        >
            <section className="relative hidden min-h-screen overflow-hidden border-e border-[var(--ac-line)] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
                <div className="pointer-events-none absolute -start-40 top-1/3 size-[560px] rounded-full bg-[var(--ac-accent-soft)] blur-3xl" />

                <div className="relative flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-[18px] bg-[var(--ac-text)] text-sm font-semibold tracking-[-0.06em] text-white">
                        AN
                    </div>

                    <div>
                        <p className="text-sm font-semibold tracking-[-0.03em] text-[var(--ac-text)]">
                            AccoNova
                        </p>

                        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
                            {t('ui.business_operating_system')}
                        </p>
                    </div>
                </div>

                <div className="relative max-w-2xl">
                    <div className="flex size-11 items-center justify-center rounded-[17px] border border-[var(--ac-line)] bg-white/70 text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-soft)]">
                        <Sparkles size={18} />
                    </div>

                    <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                        {t('ui.from_business_data_to_business_action')}
                    </p>

                    <h1 className="mt-5 max-w-xl text-[clamp(3.5rem,6vw,6.8rem)] font-medium leading-[0.88] tracking-[-0.07em] text-[var(--ac-text)]">
                        {t('ui.less')}
                        <br />
                        {t('ui.dashboard')}
                        <br />
                        {t('ui.more_direction')}
                    </h1>

                    <p className="mt-7 max-w-lg text-base leading-7 text-[var(--ac-text-soft)]">
                        {t('ui.customers_revenue_operations_and_the_next_action_your_business_should_take_connected_')}
                    </p>
                </div>

                <div className="relative flex items-center justify-between text-xs text-[var(--ac-text-muted)]">
                    <span>AccoNova</span>
                    <span>{t('ui.operate_with_clarity')}</span>
                </div>
            </section>

            <section className="relative flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
                <div className="absolute inset-x-5 top-5 z-10 flex items-center justify-between gap-3 sm:inset-x-8 sm:top-7">
                    <button
                        type="button"
                        onClick={goBackHome}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-bg)]/90 px-3.5 text-xs font-semibold text-[var(--ac-text-soft)] shadow-sm backdrop-blur transition hover:border-[var(--ac-accent-strong)] hover:text-[var(--ac-text)]"
                    >
                        <BackArrow size={15} />
                        <span>{ar ? 'العودة للرئيسية' : 'Back to home'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setLocale(ar ? 'en' : 'ar')}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-bg)]/90 px-3.5 text-xs font-semibold text-[var(--ac-text-soft)] shadow-sm backdrop-blur transition hover:border-[var(--ac-accent-strong)] hover:text-[var(--ac-text)]"
                        aria-label={ar ? 'Switch to English' : 'التبديل إلى العربية'}
                    >
                        <Languages size={15} />
                        <span>{ar ? 'English' : 'العربية'}</span>
                    </button>
                </div>

                <div className="w-full max-w-[430px] pt-12 sm:pt-10">
                    <div className="mb-12 flex items-center gap-3 lg:hidden">
                        <div className="flex size-11 items-center justify-center rounded-[18px] bg-[var(--ac-text)] text-sm font-semibold text-white">
                            AN
                        </div>

                        <span className="font-semibold">
                            AccoNova
                        </span>
                    </div>

                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)]">
                        {eyebrow}
                    </p>

                    <h2 className="mt-3 text-[42px] font-medium leading-none tracking-[-0.055em] text-[var(--ac-text)]">
                        {title}
                    </h2>

                    <p className="mt-4 text-sm leading-6 text-[var(--ac-text-soft)]">
                        {description}
                    </p>

                    {children}
                </div>
            </section>
        </main>
    );
}
