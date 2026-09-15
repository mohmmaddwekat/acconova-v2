import {
    router,
    usePage,
} from '@inertiajs/react';
import {
    Check,
    ChevronDown,
    LoaderCircle,
} from 'lucide-react';
import { useState } from 'react';

import { apiRequest } from '@/lib/http';
import type {
    AppPageProps,
    WorkspaceOrganization,
} from '@/types/app';

/**
 * Render and control the authenticated user's active organization.
 *
 * Switching uses the existing Laravel tenant-selection API, then refreshes
 * only the shared workspace props instead of reloading the whole browser app.
 */
export function WorkspaceSwitcher() {
    const { workspace } = usePage<AppPageProps>().props;

    const [open, setOpen] = useState(false);
    const [switchingId, setSwitchingId] = useState<
        number | null
    >(null);

    /**
     * Persist one authorized organization as the active Laravel tenant.
     *
     * @param organization Organization selected by the current user.
     */
    async function switchWorkspace(
        organization: WorkspaceOrganization,
    ): Promise<void> {
        if (
            organization.id ===
            workspace.activeOrganization?.id
        ) {
            setOpen(false);

            return;
        }

        setSwitchingId(organization.id);

        try {
            await apiRequest('/api/current-organization', {
                method: 'PUT',
                body: JSON.stringify({
                    organization_id: organization.id,
                }),
            });

            setOpen(false);

            router.reload({
                only: ['workspace'],
            });
        } finally {
            setSwitchingId(null);
        }
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => ! value)}
                className="flex min-w-0 items-center gap-3 rounded-[16px] px-2 py-1.5 transition hover:bg-[var(--ac-surface-soft)]"
            >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] text-sm font-semibold shadow-[var(--ac-shadow-soft)]">
                    {workspace.activeOrganization?.name
                        .charAt(0)
                        .toUpperCase() ?? '?'}
                </div>

                <div className="min-w-0 text-left">
                    <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
                        Current workspace
                    </p>

                    <div className="flex items-center gap-1.5">
                        <span className="max-w-44 truncate text-sm font-medium text-[var(--ac-text)]">
                            {workspace.activeOrganization
                                ?.name ??
                                'Choose workspace'}
                        </span>

                        <ChevronDown
                            size={14}
                            className="text-[var(--ac-text-muted)]"
                        />
                    </div>
                </div>
            </button>

            {open && (
                <div className="absolute left-0 top-[calc(100%+10px)] z-50 w-72 overflow-hidden rounded-[20px] border border-[var(--ac-line)] bg-white p-2 shadow-[var(--ac-shadow-panel)]">
                    <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-text-muted)]">
                        Your workspaces
                    </p>

                    {workspace.organizations.length === 0 ? (
                        <p className="px-3 py-5 text-sm text-[var(--ac-text-soft)]">
                            No organizations available.
                        </p>
                    ) : (
                        workspace.organizations.map(
                            (organization) => {
                                const active =
                                    organization.id ===
                                    workspace
                                        .activeOrganization
                                        ?.id;

                                const switching =
                                    organization.id ===
                                    switchingId;

                                return (
                                    <button
                                        key={
                                            organization.id
                                        }
                                        type="button"
                                        onClick={() =>
                                            void switchWorkspace(
                                                organization,
                                            )
                                        }
                                        className="flex w-full items-center gap-3 rounded-[15px] px-3 py-3 text-left transition hover:bg-[var(--ac-surface-soft)]"
                                    >
                                        <div className="flex size-9 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] text-xs font-semibold">
                                            {organization.name
                                                .charAt(0)
                                                .toUpperCase()}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {
                                                    organization.name
                                                }
                                            </p>

                                            <p className="mt-0.5 text-[10px] uppercase tracking-[0.13em] text-[var(--ac-text-muted)]">
                                                {
                                                    organization.role
                                                }
                                            </p>
                                        </div>

                                        {switching ? (
                                            <LoaderCircle
                                                size={16}
                                                className="animate-spin text-[var(--ac-accent-strong)]"
                                            />
                                        ) : active ? (
                                            <Check
                                                size={16}
                                                className="text-[var(--ac-accent-strong)]"
                                            />
                                        ) : null}
                                    </button>
                                );
                            },
                        )
                    )}
                </div>
            )}
        </div>
    );
}
