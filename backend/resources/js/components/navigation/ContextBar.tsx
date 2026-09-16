import { Menu } from 'lucide-react';

import { AccountMenu } from '@/components/navigation/AccountMenu';
import { LanguageSwitcher } from '@/components/navigation/LanguageSwitcher';
import { WorkspaceSwitcher } from '@/components/navigation/WorkspaceSwitcher';
import { t, useLocale } from '@/lib/i18n';

type ContextBarProps = {
    onOpenNavigation: () => void;
};

/**
 * Render the global application context with workspace, language and account
 * controls kept visibly distinct.
 */
export function ContextBar({
    onOpenNavigation,
}: ContextBarProps) {
    useLocale();

    return (
        <header className="sticky top-0 z-40 border-b border-[var(--ac-line)] bg-[var(--ac-bg)]/78 shadow-[0_1px_0_rgba(25,35,31,0.02)] backdrop-blur-2xl">
            <div className="mx-auto flex h-14 w-full max-w-[1760px] min-w-0 items-center gap-2.5 px-3 sm:h-16 sm:gap-3 sm:px-5 lg:px-8">
                <button
                    type="button"
                    aria-label={t('ui.open_navigation')}
                    onClick={onOpenNavigation}
                    className="flex size-9 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-control)] transition duration-200 hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] active:scale-95 md:hidden"
                >
                    <Menu size={17} />
                </button>

                <div className="min-w-0 flex-1">
                    <WorkspaceSwitcher />
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
                    <LanguageSwitcher />

                    <div
                        aria-hidden="true"
                        className="hidden h-6 w-px bg-[var(--ac-line)] sm:block"
                    />

                    <AccountMenu />
                </div>
            </div>
        </header>
    );
}
