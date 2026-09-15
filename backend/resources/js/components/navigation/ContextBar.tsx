import {
    usePage,
} from '@inertiajs/react';
import {
    Building2,
    Menu,
} from 'lucide-react';

import { AccountMenu } from '@/components/navigation/AccountMenu';
import type {
    AppPageProps,
} from '@/types/app';

type ContextBarProps = {
    onOpenNavigation: () => void;
};

/**
 * Render the active workspace context and mobile navigation trigger.
 */
export function ContextBar({
    onOpenNavigation,
}: ContextBarProps) {
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const organization =
        workspace.activeOrganization;

    return (
        <header className="sticky top-0 z-40 border-b border-[var(--ac-line)] bg-[var(--ac-bg)]/88 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-[1760px] min-w-0 items-center gap-2.5 px-3 sm:h-16 sm:gap-3 sm:px-5 lg:px-8">
                <button
                    type="button"
                    aria-label="Open navigation"
                    onClick={
                        onOpenNavigation
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-soft)] transition active:scale-95 md:hidden"
                >
                    <Menu size={17} />
                </button>

                <div className="min-w-0 flex-1">
                    <p className="hidden text-[8px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-muted)] sm:block">
                        Current workspace
                    </p>

                    <div className="flex min-w-0 items-center gap-2 sm:mt-1">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-[10px] border border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)]">
                            <Building2
                                size={12}
                            />
                        </div>

                        <span className="truncate text-xs font-semibold tracking-[-0.02em] text-[var(--ac-text)] sm:text-sm">
                            {organization?.name ??
                                'No workspace selected'}
                        </span>

                        {organization && (
                            <span className="hidden items-center gap-1.5 rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-accent-strong)] sm:flex">
                                <span className="size-1.5 rounded-full bg-[var(--ac-accent)] motion-safe:animate-pulse" />

                                Live
                            </span>
                        )}
                    </div>
                </div>

                <div className="shrink-0">
                    <AccountMenu />
                </div>
            </div>
        </header>
    );
}