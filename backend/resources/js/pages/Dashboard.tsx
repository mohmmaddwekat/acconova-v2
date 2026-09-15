import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    ArrowUpRight,
    CircleDollarSign,
    ContactRound,
    Radar,
    Sparkles,
} from 'lucide-react';

import { AppShell } from '@/layouts/AppShell';
import type {
    AppPageProps,
} from '@/types/app';

/**
 * Render AccoNova's operating command surface.
 *
 * The dashboard intentionally avoids static analytics-card patterns. It uses
 * motion, depth, operating signals, and contextual next actions to make the
 * application feel active even before deeper business modules are connected.
 */
export default function Dashboard() {
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const organization =
        workspace.activeOrganization;

    return (
        <AppShell>
            <Head title="Command · AccoNova" />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10 2xl:px-10">
                <section className="relative overflow-hidden rounded-[26px] border border-[var(--ac-line)] bg-white px-5 py-7 shadow-[var(--ac-shadow-soft)] sm:rounded-[32px] sm:px-8 sm:py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-10 lg:px-10 lg:py-12">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-32 -top-40 size-[34rem] rounded-full bg-[var(--ac-accent)]/[0.075] blur-[110px]"
                    />

                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-[-14rem] left-[28%] size-[28rem] rounded-full bg-[var(--ac-info)]/[0.035] blur-[120px]"
                    />

                    <div className="relative z-10">
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2.5">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--ac-accent)] opacity-40" />

                                <span className="relative inline-flex size-2.5 rounded-full bg-[var(--ac-accent)]" />
                            </span>

                            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--ac-accent-strong)] sm:text-[10px]">
                                Business signal live
                            </p>
                        </div>

                        <h1 className="mt-4 max-w-[780px] text-[clamp(2.35rem,6vw,5.7rem)] font-medium leading-[0.89] tracking-[-0.068em] text-[var(--ac-text)]">
                            Know what matters
                            next.
                        </h1>

                        <p className="mt-5 max-w-[640px] text-[13px] leading-6 text-[var(--ac-text-soft)] sm:text-[15px] sm:leading-7">
                            AccoNova turns business
                            activity into a clear
                            operating picture, then
                            brings the next useful
                            action forward.
                        </p>

                        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <button
                                type="button"
                                className="group flex h-12 items-center justify-center gap-3 rounded-[16px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--ac-shadow-panel)] sm:w-auto"
                            >
                                Open business pulse

                                <ArrowUpRight
                                    size={16}
                                    className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                                />
                            </button>

                            <p className="text-xs text-[var(--ac-text-muted)]">
                                {organization
                                    ? `Operating inside ${organization.name}`
                                    : 'Select a workspace to begin'}
                            </p>
                        </div>
                    </div>

                    <div className="relative mx-auto mt-10 hidden size-[340px] lg:block xl:size-[390px]">
                        <SignalOrbit />
                    </div>
                </section>

                <section className="mt-4 grid gap-4 lg:mt-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <article className="group relative min-h-[250px] overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-white p-5 shadow-[var(--ac-shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--ac-shadow-panel)] sm:rounded-[28px] sm:p-7">
                        <div className="absolute right-0 top-0 size-40 translate-x-12 -translate-y-12 rounded-full bg-[var(--ac-accent)]/[0.07] blur-3xl transition duration-500 group-hover:scale-125" />

                        <div className="relative">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                    <Radar
                                        size={18}
                                    />
                                </div>

                                <span className="flex items-center gap-2 rounded-full bg-[var(--ac-accent-soft)] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-accent-strong)]">
                                    <span className="size-1.5 rounded-full bg-[var(--ac-accent)] motion-safe:animate-pulse" />

                                    Clear
                                </span>
                            </div>

                            <p className="mt-8 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
                                Operational focus
                            </p>

                            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[var(--ac-text)]">
                                Your workspace is
                                quiet.
                            </h2>

                            <p className="mt-3 max-w-xl text-[13px] leading-6 text-[var(--ac-text-soft)]">
                                As activity grows,
                                AccoNova will surface
                                overdue revenue,
                                customer movements,
                                and business actions
                                here.
                            </p>
                        </div>
                    </article>

                    <Link
                        href="/app/parties"
                        className="group relative min-h-[250px] overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-[linear-gradient(145deg,var(--ac-surface-strong),white)] p-5 shadow-[var(--ac-shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--ac-shadow-panel)] sm:rounded-[28px] sm:p-7"
                    >
                        <div className="absolute -bottom-16 -right-12 size-48 rounded-full border border-[var(--ac-accent)]/10 transition duration-500 group-hover:scale-110" />

                        <div className="absolute -bottom-8 -right-4 size-32 rounded-full border border-[var(--ac-accent)]/15 transition duration-500 group-hover:scale-125" />

                        <div className="relative flex h-full flex-col">
                            <div className="flex items-start justify-between">
                                <div className="flex size-11 items-center justify-center rounded-[15px] bg-white text-[var(--ac-text)] shadow-[var(--ac-shadow-soft)] transition duration-300 group-hover:-rotate-3 group-hover:scale-105">
                                    <ContactRound
                                        size={18}
                                    />
                                </div>

                                <ArrowUpRight
                                    size={18}
                                    className="text-[var(--ac-accent-strong)] transition duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
                                />
                            </div>

                            <div className="mt-auto pt-10">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
                                    Suggested next step
                                </p>

                                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[var(--ac-text)]">
                                    Build your business
                                    network.
                                </h2>

                                <p className="mt-3 text-[13px] leading-6 text-[var(--ac-text-soft)]">
                                    Add customers and
                                    suppliers once,
                                    then reuse them
                                    across quotes,
                                    invoices, payments,
                                    and automation.
                                </p>

                                <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[var(--ac-accent-strong)]">
                                    Go to Parties

                                    <ArrowUpRight
                                        size={14}
                                        className="transition duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
                                    />
                                </div>
                            </div>
                        </div>
                    </Link>
                </section>

                <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:mt-5 lg:grid-cols-3">
                    <SignalCard
                        icon={
                            ContactRound
                        }
                        eyebrow="Relationships"
                        value="Ready"
                        description="Customers and suppliers become reusable business identities."
                    />

                    <SignalCard
                        icon={
                            CircleDollarSign
                        }
                        eyebrow="Revenue"
                        value="Waiting"
                        description="Invoices and payment intelligence will connect here next."
                    />

                    <SignalCard
                        icon={
                            Sparkles
                        }
                        eyebrow="Automation"
                        value="Learning"
                        description="Future actions will surface from the operating context you build."
                    />
                </section>
            </main>
        </AppShell>
    );
}

/**
 * Render the animated business-signal visualization used by the command hero.
 */
function SignalOrbit() {
    return (
        <div className="relative flex size-full items-center justify-center">
            <div className="absolute inset-[5%] rounded-full border border-[var(--ac-line-strong)] motion-safe:animate-[spin_18s_linear_infinite]" />

            <div
                className="absolute inset-[17%] rounded-full border border-dashed border-[var(--ac-accent)]/25 motion-safe:animate-[spin_13s_linear_infinite]"
                style={{
                    animationDirection:
                        'reverse',
                }}
            />

            <div className="absolute inset-[29%] rounded-full border border-[var(--ac-line)] bg-white/50 shadow-[var(--ac-shadow-panel)] backdrop-blur-sm" />

            <div className="absolute left-[11%] top-[48%] size-3 rounded-full bg-[var(--ac-accent)] shadow-[0_0_0_8px_var(--ac-accent-soft)] motion-safe:animate-pulse" />

            <div className="absolute right-[18%] top-[19%] size-2.5 rounded-full bg-[var(--ac-info)] shadow-[0_0_0_7px_rgba(102,129,232,0.08)]" />

            <div className="absolute bottom-[18%] right-[24%] size-2 rounded-full bg-[var(--ac-warning)] shadow-[0_0_0_6px_rgba(217,163,79,0.08)]" />

            <div className="relative flex size-[34%] flex-col items-center justify-center rounded-full bg-[var(--ac-text)] text-white shadow-[0_25px_70px_rgba(20,32,27,0.2)]">
                <Radar
                    size={24}
                    className="text-[var(--ac-accent)]"
                />

                <span className="mt-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/60">
                    Live signal
                </span>

                <span className="mt-1 text-sm font-semibold">
                    Clear
                </span>
            </div>
        </div>
    );
}

type SignalCardProps = {
    icon: typeof ContactRound;
    eyebrow: string;
    value: string;
    description: string;
};

/**
 * Render one compact operating-signal card with subtle interactive motion.
 */
function SignalCard({
    icon: Icon,
    eyebrow,
    value,
    description,
}: SignalCardProps) {
    return (
        <article className="group rounded-[22px] border border-[var(--ac-line)] bg-white p-5 shadow-[var(--ac-shadow-soft)] transition duration-300 hover:-translate-y-1 hover:border-[var(--ac-line-strong)] hover:shadow-[var(--ac-shadow-panel)] sm:rounded-[24px]">
            <div className="flex items-center justify-between gap-4">
                <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)] transition duration-300 group-hover:rotate-[-4deg] group-hover:bg-[var(--ac-accent-soft)] group-hover:text-[var(--ac-accent-strong)]">
                    <Icon size={17} />
                </div>

                <span className="size-2 rounded-full bg-[var(--ac-accent)] motion-safe:animate-pulse" />
            </div>

            <p className="mt-6 text-[9px] font-semibold uppercase tracking-[0.17em] text-[var(--ac-text-muted)]">
                {eyebrow}
            </p>

            <p className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--ac-text)]">
                {value}
            </p>

            <p className="mt-3 text-xs leading-5 text-[var(--ac-text-soft)]">
                {description}
            </p>
        </article>
    );
}