import {
    useEffect,
    useRef,
} from 'react';

type DraftEnvelope<T> = {
    savedAt: string;
    value: T;
};

export function readLocalDraft<T>(
    key: string,
): DraftEnvelope<T> | null {
    if (
        typeof window ===
        'undefined'
    ) {
        return null;
    }

    try {
        const raw =
            window.localStorage
                .getItem(
                    key,
                );

        if (! raw) {
            return null;
        }

        const parsed =
            JSON.parse(
                raw,
            ) as DraftEnvelope<T>;

        if (
            ! parsed
            || ! parsed.savedAt
        ) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

export function clearLocalDraft(
    key: string,
): void {
    if (
        typeof window ===
        'undefined'
    ) {
        return;
    }

    try {
        window.localStorage
            .removeItem(
                key,
            );
    } catch {
        // Local recovery is best-effort only.
    }
}

/**
 * Persist long editor state locally after the user stops typing.
 *
 * This complements server drafts without generating incomplete accounting or
 * task records merely because a user paused while typing.
 */
export function useLocalDraft<T>(
    key: string,
    value: T,
    enabled = true,
    delay = 900,
): void {
    const latest =
        useRef(
            value,
        );

    latest.current =
        value;

    useEffect(
        () => {
            if (
                ! enabled
                || typeof window ===
                    'undefined'
            ) {
                return;
            }

            const timer =
                window.setTimeout(
                    () => {
                        try {
                            const envelope:
                                DraftEnvelope<T> = {
                                    savedAt:
                                        new Date()
                                            .toISOString(),
                                    value:
                                        latest.current,
                                };

                            window.localStorage
                                .setItem(
                                    key,
                                    JSON.stringify(
                                        envelope,
                                    ),
                                );
                        } catch {
                            // Storage limits/privacy settings must not break editing.
                        }
                    },
                    delay,
                );

            return () =>
                window.clearTimeout(
                    timer,
                );
        },
        [
            key,
            value,
            enabled,
            delay,
        ],
    );
}
