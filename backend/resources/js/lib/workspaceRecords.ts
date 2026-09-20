import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from 'react';

export type WorkspaceRecordKind =
    | 'party'
    | 'product'
    | 'staff'
    | 'sale_invoice'
    | 'purchase_invoice'
    | 'payment'
    | 'receipt'
    | 'task'
    | 'page';

export type WorkspaceRecordLink = {
    key: string;
    kind: WorkspaceRecordKind;
    label: string;
    detail?: string | null;
    href: string;
    touchedAt: string;
};

const EVENT_NAME = 'acconova:workspace-records';
const MAX_RECENTS = 10;
const MAX_FAVORITES = 30;

function storageKey(
    organizationId: number | string,
    bucket: 'recent' | 'favorites',
): string {
    return `acconova:${bucket}:${organizationId}`;
}

function safeRead(
    organizationId: number | string,
    bucket: 'recent' | 'favorites',
): WorkspaceRecordLink[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = window.localStorage.getItem(
            storageKey(organizationId, bucket),
        );

        if (! raw) {
            return [];
        }

        const parsed = JSON.parse(raw) as WorkspaceRecordLink[];

        return Array.isArray(parsed)
            ? parsed.filter((item) =>
                Boolean(
                    item
                    && typeof item.key === 'string'
                    && typeof item.label === 'string'
                    && typeof item.href === 'string',
                ),
            )
            : [];
    } catch {
        return [];
    }
}

function safeWrite(
    organizationId: number | string,
    bucket: 'recent' | 'favorites',
    items: WorkspaceRecordLink[],
): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(
            storageKey(organizationId, bucket),
            JSON.stringify(items),
        );

        window.dispatchEvent(
            new CustomEvent(EVENT_NAME, {
                detail: {
                    organizationId,
                    bucket,
                },
            }),
        );
    } catch {
        // Browser privacy/storage restrictions must never break record viewing.
    }
}

export function rememberRecent(
    organizationId: number | string | null | undefined,
    item: Omit<WorkspaceRecordLink, 'touchedAt'>,
): void {
    if (! organizationId) {
        return;
    }

    const nextItem: WorkspaceRecordLink = {
        ...item,
        touchedAt: new Date().toISOString(),
    };

    const current = safeRead(
        organizationId,
        'recent',
    );

    safeWrite(
        organizationId,
        'recent',
        [
            nextItem,
            ...current.filter(
                (existing) =>
                    existing.key !== item.key,
            ),
        ].slice(0, MAX_RECENTS),
    );
}

export function isFavorite(
    organizationId: number | string | null | undefined,
    key: string,
): boolean {
    if (! organizationId) {
        return false;
    }

    return safeRead(
        organizationId,
        'favorites',
    ).some(
        (item) =>
            item.key === key,
    );
}

export function toggleFavorite(
    organizationId: number | string | null | undefined,
    item: Omit<WorkspaceRecordLink, 'touchedAt'>,
): boolean {
    if (! organizationId) {
        return false;
    }

    const current = safeRead(
        organizationId,
        'favorites',
    );

    const exists = current.some(
        (existing) =>
            existing.key === item.key,
    );

    if (exists) {
        safeWrite(
            organizationId,
            'favorites',
            current.filter(
                (existing) =>
                    existing.key !== item.key,
            ),
        );

        return false;
    }

    safeWrite(
        organizationId,
        'favorites',
        [
            {
                ...item,
                touchedAt:
                    new Date().toISOString(),
            },
            ...current,
        ].slice(0, MAX_FAVORITES),
    );

    return true;
}

export function useWorkspaceRecords(
    organizationId: number | string | null | undefined,
) {
    const read = useCallback(
        () => ({
            recent:
                organizationId
                    ? safeRead(
                        organizationId,
                        'recent',
                    )
                    : [],
            favorites:
                organizationId
                    ? safeRead(
                        organizationId,
                        'favorites',
                    )
                    : [],
        }),
        [
            organizationId,
        ],
    );

    const [
        state,
        setState,
    ] = useState(
        read,
    );

    useEffect(
        () => {
            setState(
                read(),
            );

            if (
                typeof window ===
                'undefined'
            ) {
                return;
            }

            const refresh =
                (): void =>
                    setState(
                        read(),
                    );

            window.addEventListener(
                EVENT_NAME,
                refresh,
            );

            window.addEventListener(
                'storage',
                refresh,
            );

            return () => {
                window.removeEventListener(
                    EVENT_NAME,
                    refresh,
                );

                window.removeEventListener(
                    'storage',
                    refresh,
                );
            };
        },
        [
            read,
        ],
    );

    return state;
}

export function useRecordNavigation(
    organizationId: number | string | null | undefined,
    kind: WorkspaceRecordKind,
    currentKey: string,
) {
    const {
        recent,
    } =
        useWorkspaceRecords(
            organizationId,
        );

    const sameKind =
        useMemo(
            () =>
                recent.filter(
                    (item) =>
                        item.kind ===
                            kind
                        && item.key !==
                            currentKey,
                ),
            [
                recent,
                kind,
                currentKey,
            ],
        );

    return {
        previous:
            sameKind[0]
            ?? null,
        next:
            sameKind[1]
            ?? null,
    };
}
