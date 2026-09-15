import { ArrowUpRight } from 'lucide-react';

import { AppShell } from '@/layouts/AppShell';

/**
 * Render the first AccoNova business workspace using the shared visual system.
 *
 * This page establishes information hierarchy and interaction direction before
 * live dashboard metrics and business signals are connected to backend data.
 */
export default function Dashboard() {
    return (
        <AppShell>
            <section className="mx-auto max-w-[1440px]">
                <div className="grid gap-10 xl:grid-cols-[1.15fr_0.85fr]">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)]">
                            Business signal
                        </p>

                        <h1 className="mt-4 max-w-3xl text-[clamp(2.8rem,5vw,5.6rem)] font-medium leading-[0.92] tracking-[-0.06em] text-[var(--ac-text)]">
                            Know what
                            <br />
                            matters next.
                        </h1>

                        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--ac-text-soft)]">
                            AccoNova turns business activity into a clear
                            operating picture, then brings the next useful
                            action forward.
                        </p>
                    </div>

                    <div className="flex items-end justify-start xl:justify-end">
                        <button
                            type="button"
                            className="group flex items-center gap-3 rounded-[18px] bg-[var(--ac-text)] px-5 py-3.5 text-sm font-medium text-white transition hover:-translate-y-0.5"
                        >
                            Open business pulse

                            <ArrowUpRight
                                size={16}
                                className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            />
                        </button>
                    </div>
                </div>

                <div className="mt-14 grid gap-4 xl:grid-cols-[1.4fr_0.75fr]">
                    <article className="min-h-[330px] rounded-[var(--ac-radius-lg)] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-7 shadow-[var(--ac-shadow-panel)]">
                        <div className="flex items-start justify-between gap-6">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-text-muted)]">
                                    Operational focus
                                </p>

                                <h2 className="mt-3 max-w-lg text-2xl font-medium tracking-[-0.035em] text-[var(--ac-text)]">
                                    Your workspace is quiet.
                                </h2>

                                <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--ac-text-soft)]">
                                    As activity grows, AccoNova will surface
                                    overdue revenue, customer movements, and
                                    business actions here.
                                </p>
                            </div>

                            <span className="rounded-full bg-[var(--ac-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--ac-accent-strong)]">
                                Clear
                            </span>
                        </div>
                    </article>

                    <article className="rounded-[var(--ac-radius-lg)] border border-[var(--ac-line)] bg-[var(--ac-surface-strong)] p-7 shadow-[var(--ac-shadow-soft)]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-text-muted)]">
                            Suggested next step
                        </p>

                        <h2 className="mt-3 text-2xl font-medium tracking-[-0.035em] text-[var(--ac-text)]">
                            Build your business network.
                        </h2>

                        <p className="mt-3 text-sm leading-6 text-[var(--ac-text-soft)]">
                            Add customers and suppliers once, then reuse them
                            across quotes, invoices, payments, and future
                            automation.
                        </p>

                        <button
                            type="button"
                            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ac-accent-strong)]"
                        >
                            Go to Parties
                            <ArrowUpRight size={15} />
                        </button>
                    </article>
                </div>
            </section>
        </AppShell>
    );
}
