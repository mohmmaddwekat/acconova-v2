import {
    ArrowLeft,
    ArrowRight,
    Star,
} from 'lucide-react';
import {
    router,
    usePage,
} from '@inertiajs/react';
import type {
    AppPageProps,
} from '@/types/app';
import {
    toggleFavorite,
    useRecordNavigation,
    useWorkspaceRecords,
    type WorkspaceRecordKind,
} from '@/lib/workspaceRecords';

export function RecordQuickActions({
    recordKey,
    kind,
    label,
    detail,
    href,
    ar,
}: {
    recordKey: string;
    kind: WorkspaceRecordKind;
    label: string;
    detail?: string | null;
    href: string;
    ar: boolean;
}) {
    const organizationId =
        usePage<AppPageProps>()
            .props
            .workspace
            .activeOrganization
            ?.id
        ?? null;

    const {
        favorites,
    } =
        useWorkspaceRecords(
            organizationId,
        );

    const {
        previous,
        next,
    } =
        useRecordNavigation(
            organizationId,
            kind,
            recordKey,
        );

    const favorite =
        favorites.some(
            (item) =>
                item.key ===
                    recordKey,
        );

    const item = {
        key:
            recordKey,
        kind,
        label,
        detail,
        href,
    };

    return (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                disabled={! previous}
                onClick={() =>
                    previous
                        && router.visit(
                            previous.href,
                        )}
                title={ar
                    ? 'السجل السابق'
                    : 'Previous record'}
                className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-soft)] disabled:opacity-35"
            >
                <ArrowRight size={14} />
            </button>

            <button
                type="button"
                disabled={! next}
                onClick={() =>
                    next
                        && router.visit(
                            next.href,
                        )}
                title={ar
                    ? 'السجل التالي'
                    : 'Next record'}
                className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-soft)] disabled:opacity-35"
            >
                <ArrowLeft size={14} />
            </button>

            <button
                type="button"
                aria-pressed={
                    favorite
                }
                onClick={() =>
                    toggleFavorite(
                        organizationId,
                        item,
                    )}
                title={favorite
                    ? (
                        ar
                            ? 'إزالة من المفضلة'
                            : 'Remove from favorites'
                    )
                    : (
                        ar
                            ? 'تثبيت في المفضلة'
                            : 'Pin to favorites'
                    )}
                className={[
                    'flex size-9 items-center justify-center rounded-[11px] border transition',
                    favorite
                        ? 'border-amber-300 bg-amber-50 text-amber-600'
                        : 'border-[var(--ac-line)] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]',
                ].join(' ')}
            >
                <Star
                    size={14}
                    fill={
                        favorite
                            ? 'currentColor'
                            : 'none'
                    }
                />
            </button>
        </div>
    );
}
