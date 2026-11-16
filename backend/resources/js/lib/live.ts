import { router } from '@inertiajs/react';
import {
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

const DATA_CHANGED_EVENT = 'acconova:data-changed';
const CHANNEL_NAME = 'acconova-live';
const VERSION_ENDPOINT = '/api/live/version';
const WATCH_INTERVAL = 15000;

let knownVersion: string | null = null;
let subscribers = 0;
let remountKey = 0;
let remountPending = false;
let editedSinceMount = false;
let watchers = 0;
let channel: BroadcastChannel | null = null;

const remountListeners = new Set<() => void>();
const pendingListeners = new Set<() => void>();

function setPending(value: boolean): void {
    if (remountPending === value) {
        return;
    }

    remountPending = value;
    pendingListeners.forEach(listener => listener());
}

function liveChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
        return null;
    }

    if (! channel) {
        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = event => {
            noteVersion(typeof event.data === 'string' ? event.data : null);
            handleRemoteChange();
        };
    }

    return channel;
}

function noteVersion(version: string | null): void {
    if (version) {
        knownVersion = version;
    }
}

/**
 * Tell every mounted page (and every other open tab) that this browser just
 * saved something. `version` is the server's new marker, so our own change is
 * never mistaken for someone else's.
 */
export function emitDataChanged(version: string | null = null): void {
    if (typeof window === 'undefined') {
        return;
    }

    noteVersion(version);
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));

    try {
        liveChannel()?.postMessage(version ?? '');
    } catch {
        // Cross-tab sync is best effort only.
    }
}

function isSafeToRemount(): boolean {
    if (editedSinceMount) {
        return false;
    }

    if (document.querySelector('[role="dialog"], dialog[open]')) {
        return false;
    }

    const active = document.activeElement;

    return ! (
        active instanceof HTMLElement
        && (
            active.isContentEditable
            || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)
        )
    );
}

function remountNow(): void {
    setPending(false);
    editedSinceMount = false;

    router.reload({
        onFinish: () => {
            remountKey += 1;
            remountListeners.forEach(listener => listener());
        },
    });
}

/**
 * Someone else (another person or another tab) changed this organization's
 * data. Pages that registered a live refresh update themselves quietly; every
 * other page is re-mounted so it loads fresh data, but only when that cannot
 * throw away something the user is typing.
 */
function handleRemoteChange(): void {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));

    if (subscribers > 0) {
        return;
    }

    if (isSafeToRemount()) {
        remountNow();
    } else {
        setPending(true);
    }
}

/**
 * True when other people's changes are waiting because this page has unsaved
 * typing. The shell shows a small banner so the user can choose to refresh.
 */
export function useLivePending(): boolean {
    return useSyncExternalStore(
        listener => {
            pendingListeners.add(listener);

            return () => {
                pendingListeners.delete(listener);
            };
        },
        () => remountPending,
        () => false,
    );
}

/** Reload the page now, accepting that unsaved typing is discarded. */
export function applyPendingRemount(): void {
    remountNow();
}

async function checkVersion(): Promise<void> {
    if (document.hidden) {
        return;
    }

    if (remountPending && subscribers === 0 && isSafeToRemount()) {
        remountNow();
    }

    try {
        const response = await fetch(VERSION_ENDPOINT, {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'same-origin',
        });

        if (! response.ok) {
            return;
        }

        const { version } = await response.json() as { version?: string };

        if (typeof version !== 'string') {
            return;
        }

        if (knownVersion === null) {
            knownVersion = version;

            return;
        }

        if (version !== knownVersion) {
            knownVersion = version;
            handleRemoteChange();
        }
    } catch {
        // A failed check is retried on the next tick.
    }
}

/**
 * Watch the organization's change marker while an authenticated page is open:
 * on focus, when the tab becomes visible again, when the page is restored from
 * the back/forward cache, and on a light timer. One cache read per check.
 */
export function useLiveWatcher(): void {
    useEffect(() => {
        liveChannel();
        watchers += 1;

        if (watchers === 1) {
            void checkVersion();
        }

        const check = (): void => {
            void checkVersion();
        };

        const onVisibility = (): void => {
            if (! document.hidden) {
                check();
            }
        };

        const markEdited = (event: Event): void => {
            if (event.isTrusted) {
                editedSinceMount = true;
            }
        };

        const resetEdited = (): void => {
            editedSinceMount = false;
        };

        const timer = window.setInterval(check, WATCH_INTERVAL);

        window.addEventListener('focus', check);
        window.addEventListener('pageshow', check);
        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('input', markEdited, true);
        document.addEventListener('submit', resetEdited, true);
        document.addEventListener('reset', resetEdited, true);

        return () => {
            watchers -= 1;
            window.clearInterval(timer);
            window.removeEventListener('focus', check);
            window.removeEventListener('pageshow', check);
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('input', markEdited, true);
            document.removeEventListener('submit', resetEdited, true);
            document.removeEventListener('reset', resetEdited, true);
        };
    }, []);
}

/**
 * Changes every time a page that cannot refresh itself must be mounted again.
 * Used once, around the resolved Inertia page.
 */
export function useLiveRemountKey(): number {
    return useSyncExternalStore(
        listener => {
            remountListeners.add(listener);

            return () => {
                remountListeners.delete(listener);
            };
        },
        () => remountKey,
        () => 0,
    );
}

type LiveRefreshOptions = {
    interval?: number;
    enabled?: boolean;
};

/**
 * Re-run `refresh` quietly whenever data changes: after any save made in this
 * or another tab, when someone else changes the organization's data, and when
 * the tab regains focus. Pages that use it keep their filters and scroll; pages
 * that do not are re-mounted by the watcher instead.
 */
export function useLiveRefresh(
    refresh: () => void,
    { interval = 0, enabled = true }: LiveRefreshOptions = {},
): void {
    const latest = useRef(refresh);

    useEffect(() => {
        latest.current = refresh;
    });

    useEffect(() => {
        if (! enabled) {
            return;
        }

        liveChannel();
        subscribers += 1;

        let debounce: number | undefined;
        let missed = false;

        const run = (): void => {
            if (document.hidden) {
                missed = true;

                return;
            }

            missed = false;
            latest.current();
        };

        const schedule = (): void => {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(run, 400);
        };

        const catchUp = (): void => {
            if (missed && ! document.hidden) {
                schedule();
            }
        };

        const timer = interval > 0
            ? window.setInterval(run, interval)
            : undefined;

        window.addEventListener(DATA_CHANGED_EVENT, schedule);
        window.addEventListener('focus', catchUp);
        document.addEventListener('visibilitychange', catchUp);

        return () => {
            subscribers -= 1;
            window.clearTimeout(debounce);

            if (timer !== undefined) {
                window.clearInterval(timer);
            }

            window.removeEventListener(DATA_CHANGED_EVENT, schedule);
            window.removeEventListener('focus', catchUp);
            document.removeEventListener('visibilitychange', catchUp);
        };
    }, [enabled, interval]);
}

/**
 * Refresh lookup lists (a check, a party, a product…) quietly when data changes
 * elsewhere, WITHOUT taking part in the page re-mount decision: the page is
 * still re-mounted by the watcher when that is safe, and these lists stay
 * current when it is not (for example while a form is half filled).
 */
export function useLiveSoftRefresh(refresh: () => void): void {
    const latest = useRef(refresh);

    useEffect(() => {
        latest.current = refresh;
    });

    useEffect(() => {
        liveChannel();

        let debounce: number | undefined;

        const run = (): void => {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(() => {
                if (! document.hidden) {
                    latest.current();
                }
            }, 500);
        };

        window.addEventListener(DATA_CHANGED_EVENT, run);
        window.addEventListener('focus', run);

        return () => {
            window.clearTimeout(debounce);
            window.removeEventListener(DATA_CHANGED_EVENT, run);
            window.removeEventListener('focus', run);
        };
    }, []);
}

/**
 * A counter that increases on every live-refresh signal. Add it to the
 * dependency list of an existing loading effect to make that effect re-run.
 */
export function useLiveTick(options?: LiveRefreshOptions): number {
    const [tick, setTick] = useState(0);

    useLiveRefresh(() => setTick(value => value + 1), options);

    return tick;
}
