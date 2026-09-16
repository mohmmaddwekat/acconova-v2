import {
    router,
    usePage,
} from '@inertiajs/react';
import {
    Trash2,
} from 'lucide-react';
import {
    useState,
} from 'react';

import {
    ConfirmDialog,
} from '@/components/feedback/ConfirmDialog';
import {
    useToast,
} from '@/components/feedback/ToastProvider';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';

type PermanentDeleteControlProps = {
    resource:
        | 'products'
        | 'parties';

    recordId: number;

    recordName: string;

    onDeleted: () => void;
};

/**
 * Render Owner/Admin-only permanent deletion with the shared five-second
 * destructive confirmation delay.
 *
 * The backend policy and database remain authoritative; hiding the action here
 * is only a UX optimization.
 */
export function PermanentDeleteControl({
    resource,
    recordId,
    recordName,
    onDeleted,
}: PermanentDeleteControlProps) {
    useLocale();

    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    const {
        showToast,
    } =
        useToast();

    const [
        confirmationOpen,
        setConfirmationOpen,
    ] =
        useState(
            false,
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const role =
        workspace
            .activeOrganization
            ?.role;

    const allowed =
        role ===
            'owner' ||
        role ===
            'admin';

    if (
        ! allowed
    ) {
        return null;
    }

    const product =
        resource ===
        'products';

    /**
     * Permanently remove the archived record and remount the current index so
     * stale pagination state cannot continue showing a deleted entity.
     */
    async function handleDelete(): Promise<void> {
        if (
            busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await apiRequest<void>(
                `/api/${resource}/${recordId}/permanent`,
                {
                    method:
                        'DELETE',
                },
            );

            setConfirmationOpen(
                false,
            );

            onDeleted();

            const successMessage =
                t(
                    product
                        ? 'lifecycle.productDeleted'
                        : 'lifecycle.partyDeleted',
                );

            router.visit(
                `${window.location.pathname}${window.location.search}`,
                {
                    replace:
                        true,

                    preserveScroll:
                        true,

                    preserveState:
                        false,

                    onSuccess:
                        () =>
                            showToast(
                                successMessage,
                            ),
                },
            );
        } catch (
            exception
        ) {
            const message =
                exception instanceof
                ApiError
                    ? (
                          exception
                              .errors
                              .record?.[0] ??
                          exception.message
                      )
                    : t(
                          'errors.unexpected',
                      );

            showToast(
                message,
                'error',
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() =>
                    setConfirmationOpen(
                        true,
                    )
                }
                className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/6 px-5 text-sm font-semibold text-[var(--ac-danger)] transition hover:-translate-y-px hover:border-[var(--ac-danger)]/35 hover:bg-[var(--ac-danger)]/10 motion-reduce:transform-none"
            >
                <Trash2
                    size={
                        15
                    }
                />

                {t(
                    'lifecycle.deletePermanently',
                )}
            </button>

            <ConfirmDialog
                open={
                    confirmationOpen
                }
                busy={
                    busy
                }
                tone="danger"
                title={t(
                    product
                        ? 'lifecycle.deleteProductTitle'
                        : 'lifecycle.deletePartyTitle',
                )}
                description={t(
                    product
                        ? 'lifecycle.deleteProductDescription'
                        : 'lifecycle.deletePartyDescription',
                    {
                        name:
                            recordName,
                    },
                )}
                confirmLabel={t(
                    'lifecycle.deletePermanently',
                )}
                onCancel={() =>
                    setConfirmationOpen(
                        false,
                    )
                }
                onConfirm={
                    handleDelete
                }
            />
        </>
    );
}
