import {
    Archive,
    CheckSquare2,
    RotateCcw,
    X,
} from 'lucide-react';

import type {
    PartyBulkAction,
} from '@/features/parties/api';

type PartyBulkActionBarProps = {
    selectedCount: number;

    action: PartyBulkAction;

    allPageSelected: boolean;

    onTogglePage: () => void;

    onClear: () => void;

    onAction: () => void;
};

/**
 * Render a responsive floating bulk-action surface for selected Parties.
 */
export function PartyBulkActionBar({
    selectedCount,
    action,
    allPageSelected,
    onTogglePage,
    onClear,
    onAction,
}: PartyBulkActionBarProps) {
    if (
        selectedCount === 0
    ) {
        return null;
    }

    const restoring =
        action === 'restore';

    return (
        <div
            className="fixed bottom-4 left-3 right-3 z-[110] sm:left-1/2 sm:right-auto sm:w-[min(620px,calc(100vw-3rem))] sm:-translate-x-1/2"
            style={{
                bottom:
                    'max(1rem, env(safe-area-inset-bottom))',
            }}
        >
            <div className="grid gap-3 rounded-[20px] border border-white/10 bg-[var(--ac-text)] p-3 text-white shadow-[0_20px_70px_rgba(18,30,25,0.28)] sm:grid-cols-[1fr_auto] sm:items-center sm:p-3.5">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-white/10">
                        <CheckSquare2
                            size={17}
                        />
                    </div>

                    <div className="min-w-0">
                        <p className="text-sm font-semibold">
                            {selectedCount}{' '}
                            selected
                        </p>

                        <button
                            type="button"
                            onClick={
                                onTogglePage
                            }
                            className="mt-0.5 text-[10px] text-white/60 transition hover:text-white"
                        >
                            {allPageSelected
                                ? 'Unselect this page'
                                : 'Select this page'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                        type="button"
                        onClick={
                            onAction
                        }
                        className={[
                            'flex h-10 items-center justify-center gap-2 rounded-[13px] px-4 text-xs font-semibold',
                            restoring
                                ? 'bg-[var(--ac-accent)] text-[var(--ac-accent-strong)]'
                                : 'bg-white text-[var(--ac-text)]',
                        ].join(' ')}
                    >
                        {restoring ? (
                            <RotateCcw
                                size={14}
                            />
                        ) : (
                            <Archive
                                size={14}
                            />
                        )}

                        {restoring
                            ? 'Restore selected'
                            : 'Archive selected'}
                    </button>

                    <button
                        type="button"
                        aria-label="Clear selection"
                        onClick={
                            onClear
                        }
                        className="flex size-10 items-center justify-center rounded-[13px] bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}