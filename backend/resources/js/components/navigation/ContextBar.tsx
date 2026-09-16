import {
    Menu,
} from 'lucide-react';

import {
    AccountMenu,
} from '@/components/navigation/AccountMenu';
import {
    LanguageSwitcher,
} from '@/components/navigation/LanguageSwitcher';
import {
    WorkspaceSwitcher,
} from '@/components/navigation/WorkspaceSwitcher';
import {
    t,
    useLocale,
} from '@/lib/i18n';

type ContextBarProps = {
    onOpenNavigation: () => void;
};

/**
 * Render global workspace, language, and account controls.
 *
 * Language remains independent from account actions because locale is an
 * application-view preference rather than account-management functionality.
 */
export function ContextBar({
    onOpenNavigation,
}: ContextBarProps) {
    useLocale();

    return (
        <header className="sticky top-0 z-40 border-b border-[var(--ac-line)] bg-[var(--ac-bg)]/82 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-[1760px] min-w-0 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-5 lg:px-8">
                <button
                    type="button"
                    aria-label={t(
                        'ui.open_navigation',
                    )}
                    onClick={
                        onOpenNavigation
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-soft)] transition duration-200 hover:-translate-y-px hover:border-[var(--ac-line-strong)] hover:text-[var(--ac-text)] active:translate-y-0 active:scale-95 motion-reduce:transform-none md:hidden"
                >
                    <Menu
                        size={
                            17
                        }
                    />
                </button>

                <div className="min-w-0 flex-1">
                    <WorkspaceSwitcher />
                </div>

                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                    <LanguageSwitcher />

                    <AccountMenu />
                </div>
            </div>
        </header>
    );
}
