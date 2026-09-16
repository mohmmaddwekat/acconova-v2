import {
    useDialog,
} from '@/components/feedback/useDialog';
import {
    createWarehouse,
    updateWarehouse,
} from '@/features/inventory/api';
import type {
    Warehouse,
    WarehousePayload,
} from '@/features/inventory/types';
import {
    ApiError,
} from '@/lib/http';
import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    Hash,
    Save,
    Star,
    Warehouse as WarehouseIcon,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type FormEvent,
} from 'react';
import {
    createPortal,
} from 'react-dom';

type WarehouseEditorDrawerProps = {
    open: boolean;

    warehouse:
        | Warehouse
        | null;

    onClose: () => void;

    onSaved: (
        warehouse: Warehouse,
        created: boolean,
    ) => void;
};

/**
 * Render warehouse creation and renaming against the browser viewport.
 *
 * Default selection is intentionally excluded. The first warehouse becomes
 * default automatically and later default changes happen explicitly on an
 * existing warehouse.
 */
export function WarehouseEditorDrawer({
    open,
    warehouse,
    onClose,
    onSaved,
}: WarehouseEditorDrawerProps) {
    useLocale();

    const [
        name,
        setName,
    ] =
        useState(
            '',
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const [
        error,
        setError,
    ] =
        useState<
            string | null
        >(
            null,
        );

    const [
        errors,
        setErrors,
    ] =
        useState<
            Record<
                string,
                string[]
            >
        >({});

    const dialogRef =
        useDialog(
            open,
            onClose,
            busy,
        );

    const editing =
        warehouse !==
        null;

    useEffect(() => {
        if (
            ! open
        ) {
            return;
        }

        setName(
            warehouse?.name ??
                '',
        );

        setError(
            null,
        );

        setErrors(
            {},
        );
    }, [
        open,
        warehouse,
    ]);

    /**
     * Close only while no mutation is being committed.
     */
    function close(): void {
        if (
            ! busy
        ) {
            onClose();
        }
    }

    /**
     * Persist warehouse creation or renaming.
     */
    async function submit(
        event:
            FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (
            busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setError(
            null,
        );

        setErrors(
            {},
        );

        const payload:
            WarehousePayload = {
            name:
                name.trim(),
        };

        try {
            const saved =
                warehouse
                    ? await updateWarehouse(
                          warehouse.id,
                          payload,
                      )
                    : await createWarehouse(
                          payload,
                      );

            onSaved(
                saved,
                ! warehouse,
            );

            onClose();
        } catch (
            exception
        ) {
            if (
                exception instanceof
                ApiError
            ) {
                setErrors(
                    exception.errors,
                );

                setError(
                    exception.message,
                );
            } else {
                setError(
                    t(
                        'inventory.saveFailed',
                    ),
                );
            }
        } finally {
            setBusy(
                false,
            );
        }
    }

    if (
        ! open ||
        typeof document ===
            'undefined'
    ) {
        return null;
    }

    const surface = (
        <div className="fixed inset-0 z-[220]">
            <button
                type="button"
                aria-label={t(
                    'inventory.closeWarehouse',
                )}
                onClick={
                    close
                }
                className="absolute inset-0 bg-[var(--ac-text)]/22 backdrop-blur-[3px]"
            />

            <aside
                ref={
                    dialogRef
                }
                role="dialog"
                aria-modal="true"
                className="absolute inset-y-0 end-0 z-10 flex h-[100dvh] w-full flex-col overflow-hidden border-s border-[var(--ac-line)] bg-white shadow-[-40px_0_100px_rgba(20,35,30,0.16)] sm:max-w-[520px]"
            >
                <header className="shrink-0 border-b border-[var(--ac-line)] bg-white p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <WarehouseIcon
                                    size={
                                        18
                                    }
                                />
                            </div>

                            <div>
                                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                                    {t(
                                        'inventory.eyebrow',
                                    )}
                                </p>

                                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
                                    {editing
                                        ? t(
                                              'inventory.editWarehouse',
                                          )
                                        : t(
                                              'inventory.addWarehouse',
                                          )}
                                </h2>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={
                                close
                            }
                            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]"
                        >
                            <X
                                size={
                                    17
                                }
                            />
                        </button>
                    </div>
                </header>

                <form
                    onSubmit={(
                        event,
                    ) =>
                        void submit(
                            event,
                        )
                    }
                    className="flex min-h-0 flex-1 flex-col"
                >
                    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                        <label className="block">
                            <span className="mb-2 block text-xs font-semibold">
                                {t(
                                    'inventory.warehouseName',
                                )}
                            </span>

                            <input
                                autoFocus
                                required
                                maxLength={
                                    160
                                }
                                value={
                                    name
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setName(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                className="h-12 w-full rounded-[15px] border border-[var(--ac-line)] bg-white px-4 text-sm outline-none transition focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                            />

                            {errors
                                .name?.[0] && (
                                <p className="mt-2 text-xs text-[var(--ac-danger)]">
                                    {
                                        errors
                                            .name[0]
                                    }
                                </p>
                            )}
                        </label>

                        {! editing && (
                            <div className="mt-6 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4">
                                <div className="flex gap-3">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white text-[var(--ac-accent-strong)] shadow-sm">
                                        <Star
                                            size={
                                                15
                                            }
                                        />
                                    </div>

                                    <div>
                                        <p className="text-sm font-semibold">
                                            {t(
                                                'inventory.defaultHandledAutomatically',
                                            )}
                                        </p>

                                        <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                                            {t(
                                                'inventory.firstWarehouseDefaultHelp',
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {warehouse && (
                            <div className="mt-6 grid gap-3">
                                <div className="rounded-[16px] border border-[var(--ac-line)] px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <Hash
                                            size={
                                                13
                                            }
                                            className="text-[var(--ac-text-muted)]"
                                        />

                                        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                            {t(
                                                'inventory.code',
                                            )}
                                        </p>
                                    </div>

                                    <bdi
                                        dir="ltr"
                                        className="mt-1 block text-sm font-semibold"
                                    >
                                        {
                                            warehouse.code
                                        }
                                    </bdi>
                                </div>

                                {warehouse.is_default && (
                                    <div className="rounded-[16px] border border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)] px-4 py-3">
                                        <p className="text-xs font-semibold text-[var(--ac-accent-strong)]">
                                            {t(
                                                'inventory.currentDefaultHelp',
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="mt-5 rounded-[15px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                                {
                                    error
                                }
                            </div>
                        )}
                    </div>

                    <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:px-6">
                        <button
                            type="button"
                            disabled={
                                busy
                            }
                            onClick={
                                close
                            }
                            className="h-11 rounded-[14px] border border-[var(--ac-line)] bg-white text-sm font-semibold"
                        >
                            {t(
                                'common.cancel',
                            )}
                        </button>

                        <button
                            type="submit"
                            disabled={
                                busy
                            }
                            className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] text-sm font-semibold text-white disabled:opacity-50"
                        >
                            <Save
                                size={
                                    15
                                }
                            />

                            {busy
                                ? t(
                                      'common.working',
                                  )
                                : t(
                                      'inventory.saveWarehouse',
                                  )}
                        </button>
                    </footer>
                </form>
            </aside>
        </div>
    );

    return createPortal(
        surface,
        document.body,
    );
}