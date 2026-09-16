import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    Menu,
} from 'lucide-react';

import {
    AccountMenu,
} from '@/components/navigation/AccountMenu';
import {
    WorkspaceSwitcher,
} from '@/components/navigation/WorkspaceSwitcher';

type ContextBarProps = {
    onOpenNavigation: () => void;
};

/**
 * Render the global application context.
 *
 * Workspace switching remains permanently available because tenant context is
 * shared by every business module in AccoNova.
 */
export function ContextBar({
    onOpenNavigation,
}: ContextBarProps) {
    useLocale();
    return (
        <header className="sticky top-0 z-40 border-b border-[var(--ac-line)] bg-[var(--ac-bg)]/88 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-[1760px] min-w-0 items-center gap-2.5 px-3 sm:h-16 sm:gap-3 sm:px-5 lg:px-8">
                <button
                    type="button"
                    aria-label={t('ui.open_navigation')}
                    onClick={
                        onOpenNavigation
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-soft)] transition hover:bg-[var(--ac-surface-soft)] active:scale-95 md:hidden"
                >
                    <Menu
                        size={17}
                    />
                </button>

                <div className="min-w-0 flex-1">
                    <WorkspaceSwitcher />
                </div>

                <div className="shrink-0">
                    <AccountMenu />
                </div>
            </div>
        </header>
    );
}
