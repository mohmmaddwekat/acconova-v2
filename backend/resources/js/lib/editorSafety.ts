import { router } from '@inertiajs/react';
import {
    useEffect,
    useRef,
} from 'react';

/**
 * Guard a dirty editor against accidental browser/Inertia navigation.
 *
 * This is intentionally advisory: the user can still confirm navigation, and
 * programmatic post-save redirects can disable the guard first.
 */
export function useUnsavedChanges(
    dirty: boolean,
    ar: boolean,
): void {
    const dirtyRef =
        useRef(
            dirty,
        );

    dirtyRef.current =
        dirty;

    useEffect(
        () => {
            const message =
                ar
                    ? 'لديك تغييرات غير محفوظة. هل تريد المغادرة بدون حفظ؟'
                    : 'You have unsaved changes. Leave without saving?';

            const beforeUnload = (
                event: BeforeUnloadEvent,
            ): void => {
                if (
                    ! dirtyRef.current
                ) {
                    return;
                }

                event.preventDefault();
                event.returnValue =
                    '';
            };

            const removeBefore =
                router.on(
                    'before',
                    (
                        event,
                    ) => {
                        if (
                            ! dirtyRef.current
                        ) {
                            return;
                        }

                        if (
                            ! window.confirm(
                                message,
                            )
                        ) {
                            event.preventDefault();
                        }
                    },
                );

            window.addEventListener(
                'beforeunload',
                beforeUnload,
            );

            return () => {
                window.removeEventListener(
                    'beforeunload',
                    beforeUnload,
                );

                removeBefore();
            };
        },
        [
            ar,
        ],
    );
}

/**
 * Let the global Ctrl/⌘+S shortcut save the currently active editor.
 */
export function useGlobalSave(
    save: () => void,
    enabled = true,
): void {
    const saveRef =
        useRef(
            save,
        );

    saveRef.current =
        save;

    useEffect(
        () => {
            if (! enabled) {
                return;
            }

            const handler =
                (): void =>
                    saveRef.current();

            window.addEventListener(
                'acconova:save',
                handler,
            );

            return () =>
                window.removeEventListener(
                    'acconova:save',
                    handler,
                );
        },
        [
            enabled,
        ],
    );
}
