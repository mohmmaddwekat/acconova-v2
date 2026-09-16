import { useEffect, useRef } from 'react';

const stack: HTMLElement[] = [];

/** Trap focus in the topmost modal and restore it after nested confirmation closes. */
export function useDialog(open: boolean, onClose: () => void, busy = false) {
    const ref = useRef<HTMLElement | null>(null);
    const state = useRef({ onClose, busy });
    state.current = { onClose, busy };
    useEffect(() => {
        const surface = ref.current;
        if (!open || !surface) return;
        const previous = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        stack.push(surface);
        surface.tabIndex = -1;
        surface.focus();
        /** Only the topmost dialog owns Escape and tab navigation. */
        function keydown(event: KeyboardEvent): void {
            if (stack.at(-1) !== surface) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!state.current.busy) state.current.onClose();
            }
            if (event.key !== 'Tab') return;
            const items = Array.from(surface!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((item) => item.getClientRects().length > 0);
            const first = items[0];
            const last = items.at(-1);
            if (!first) { event.preventDefault(); surface!.focus(); return; }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === surface)) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === surface)) {
                event.preventDefault(); first.focus();
            }
        }
        document.addEventListener('keydown', keydown, true);
        return () => {
            stack.splice(stack.indexOf(surface), 1);
            document.removeEventListener('keydown', keydown, true);
            document.body.style.overflow = overflow;
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);
    return ref;
}
