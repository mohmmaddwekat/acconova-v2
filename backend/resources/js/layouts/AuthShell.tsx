import { Sparkles } from 'lucide-react';
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
 * Login and registration share the same product identity while each page
 * supplies only its own heading, explanation, and form.
 */
export function AuthShell({
    eyebrow,
    title,
    description,
    children,
}: AuthShellProps) {
    return (
        <main className="grid min-h-screen bg-[var(--ac-bg)] lg:grid-cols-[1.08fr_0.92fr]">
            <section className="relative hidden min-h-screen overflow-hidden border-r border-[var(--ac-line)] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
                <div className="pointer-events-none absolute -left-40 top-1/3 size-[560px] rounded-full bg-[var(--ac-accent-soft)] blur-3xl" />

                <div className="relative flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-[18px] bg-[var(--ac-text)] text-sm font-semibold tracking-[-0.06em] text-white">
                        AN
                    </div>

                    <div>
                        <p className="text-sm font-semibold tracking-[-0.03em] text-[var(--ac-text)]">
                            AccoNova
                        </p>

                        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
                            Business operating system
                        </p>
                    </div>
                </div>

                <div className="relative max-w-2xl">
                    <div className="flex size-11 items-center justify-center rounded-[17px] border border-[var(--ac-line)] bg-white/70 text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-soft)]">
                        <Sparkles size={18} />
                    </div>

                    <p className="mt-7 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                        From business data to business action
                    </p>

                    <h1 className="mt-5 max-w-xl text-[clamp(3.5rem,6vw,6.8rem)] font-medium leading-[0.88] tracking-[-0.07em] text-[var(--ac-text)]">
                        Less
                        <br />
                        dashboard.
                        <br />
                        More direction.
                    </h1>

                    <p className="mt-7 max-w-lg text-base leading-7 text-[var(--ac-text-soft)]">
                        Customers, revenue, operations, and the
                        next action your business should take —
                        connected in one coherent workspace.
                    </p>
                </div>

                <div className="relative flex items-center justify-between text-xs text-[var(--ac-text-muted)]">
                    <span>AccoNova</span>
                    <span>Operate with clarity.</span>
                </div>
            </section>

            <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
                <div className="w-full max-w-[430px]">
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
