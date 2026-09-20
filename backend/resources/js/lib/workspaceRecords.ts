import {
    useCallback,
    useEffect,
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
    detail?: string | null | undefined;
    href: string;
    touchedAt: string;
};

const EVENT_NAME = 'acconova:workspace-records';
const MAX_RECENTS = 10;
const MAX_FAVORITES = 30;
const MAX_HISTORY = 40;

type NavigationHistory = {
    items: WorkspaceRecordLink[];
    cursor: number;
};

function historyKey(
    organizationId: number | string,
): string {
    return `acconova:record-history:${organizationId}`;
}

function readHistory(
    organizationId: number | string,
): NavigationHistory {
    if (
        typeof window === 'undefined'
    ) {
        return {
            items: [],
            cursor: -1,
        };
    }

    try {
        const raw =
            window.sessionStorage
                .getItem(
                    historyKey(
                        organizationId,
                    ),
                );

        if (! raw) {
            return {
                items: [],
                cursor: -1,
            };
        }

        const parsed =
            JSON.parse(
                raw,
            ) as NavigationHistory;

        return {
            items:
                Array.isArray(
                    parsed.items,
                )
                    ? parsed.items
                    : [],
            cursor:
                Number.isInteger(
                    parsed.cursor,
                )
                    ? parsed.cursor
                    : -1,
        };
    } catch {
        return {
            items: [],
            cursor: -1,
        };
    }
}

function writeHistory(
    organizationId: number | string,
    history: NavigationHistory,
): void {
    if (
        typeof window === 'undefined'
    ) {
        return;
    }

    try {
        window.sessionStorage
            .setItem(
                historyKey(
                    organizationId,
                ),
                JSON.stringify(
                    history,
                ),
            );

        window.dispatchEvent(
            new CustomEvent(
                EVENT_NAME,
            ),
        );
    } catch {
        // Session history is a convenience feature only.
    }
}

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

export function rememberNavigation(
    organizationId: number | string | null | undefined,
    item: Omit<WorkspaceRecordLink, 'touchedAt'>,
): void {
    if (! organizationId) {
        return;
    }

    const history =
        readHistory(
            organizationId,
        );

    const existingIndex =
        history.items.findIndex(
            (existing) =>
                existing.key ===
                    item.key,
        );

    const nextItem: WorkspaceRecordLink = {
        ...item,
        touchedAt:
            new Date()
                .toISOString(),
    };

    if (
        existingIndex >= 0
        && Math.abs(
            existingIndex
            - history.cursor,
        ) <= 1
    ) {
        const items =
            [
                ...history.items,
            ];

        items[
            existingIndex
        ] =
            nextItem;

        writeHistory(
            organizationId,
            {
                items,
                cursor:
                    existingIndex,
            },
        );

        return;
    }

    const prefix =
        history.items.slice(
            0,
            Math.max(
                history.cursor
                + 1,
                0,
            ),
        );

    const items =
        [
            ...prefix,
            nextItem,
        ].slice(
            -MAX_HISTORY,
        );

    writeHistory(
        organizationId,
        {
            items,
            cursor:
                items.length
                - 1,
        },
    );
}

export function moveRecordHistory(
    organizationId: number | string | null | undefined,
    direction: -1 | 1,
): WorkspaceRecordLink | null {
    if (! organizationId) {
        return null;
    }

    const history =
        readHistory(
            organizationId,
        );

    const cursor =
        history.cursor
        + direction;

    if (
        cursor < 0
        || cursor >=
            history.items.length
    ) {
        return null;
    }

    writeHistory(
        organizationId,
        {
            ...history,
            cursor,
        },
    );

    return history.items[
        cursor
    ] ?? null;
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
    _kind: WorkspaceRecordKind,
    currentKey: string,
) {
    const [
        version,
        setVersion,
    ] =
        useState(
            0,
        );

    useEffect(() => {
        if (
            typeof window ===
            'undefined'
        ) {
            return;
        }

        const refresh =
            (): void =>
                setVersion(
                    (value) =>
                        value
                        + 1,
                );

        window.addEventListener(
            EVENT_NAME,
            refresh,
        );

        return () =>
            window.removeEventListener(
                EVENT_NAME,
                refresh,
            );
    }, []);

    void version;

    if (! organizationId) {
        return {
            previous:
                null,
            next:
                null,
        };
    }

    const history =
        readHistory(
            organizationId,
        );

    const currentIndex =
        history.items.findIndex(
            (item) =>
                item.key ===
                    currentKey,
        );

    const cursor =
        currentIndex >= 0
            ? currentIndex
            : history.cursor;

    return {
        previous:
            cursor > 0
                ? history.items[
                    cursor - 1
                ] ?? null
                : null,
        next:
            cursor >= 0
            && cursor <
                history.items.length
                - 1
                ? history.items[
                    cursor + 1
                ] ?? null
                : null,
    };
}
