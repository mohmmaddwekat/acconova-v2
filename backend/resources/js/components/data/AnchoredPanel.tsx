import { ModalPortal } from '@/components/feedback/ModalPortal';
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import type {
    ReactNode,
    RefObject,
} from 'react';

type Position = {
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
};

const EDGE = 8;

/** Height a filter panel needs to be shown fully without scrolling. */
const PREFERRED_HEIGHT = 300;

/**
 * A panel that opens under its trigger and always stays inside the window.
 *
 * It is portaled and fixed, so no ancestor can clip it, and its horizontal
 * position is clamped to the viewport. It grows away from the trigger's start
 * edge in both reading directions, so a trigger on the far side of an RTL or
 * LTR toolbar no longer pushes the panel off screen.
 */
export function AnchoredPanel({
    anchorRef,
    open,
    onClose,
    width,
    className = '',
    children,
}: {
    anchorRef: RefObject<HTMLElement | null>;
    open: boolean;
    onClose: () => void;
    width: number;
    className?: string;
    children: ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<Position | null>(null);

    useLayoutEffect(() => {
        if (! open) {
            setPosition(null);

            return;
        }

        function update(): void {
            const anchor = anchorRef.current;

            if (! anchor) {
                return;
            }

            const rect = anchor.getBoundingClientRect();
            const panelWidth = Math.min(width, window.innerWidth - EDGE * 2);
            const rtl = window.getComputedStyle(anchor).direction === 'rtl';
            const preferred = rtl ? rect.right - panelWidth : rect.left;
            const left = Math.max(
                EDGE,
                Math.min(preferred, window.innerWidth - panelWidth - EDGE),
            );

            const spaceBelow = window.innerHeight - rect.bottom - EDGE * 2;
            const spaceAbove = rect.top - EDGE * 2;
            // Open upward when the space below is tight and there is more above.
            const openUp = spaceBelow < PREFERRED_HEIGHT && spaceAbove > spaceBelow;

            setPosition(openUp
                ? {
                    bottom: window.innerHeight - rect.top + EDGE,
                    left,
                    width: panelWidth,
                    maxHeight: Math.max(120, spaceAbove),
                }
                : {
                    top: rect.bottom + EDGE,
                    left,
                    width: panelWidth,
                    maxHeight: Math.max(120, spaceBelow),
                });
        }

        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);

        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [open, width, anchorRef]);

    useEffect(() => {
        if (! open) {
            return;
        }

        function onPointerDown(event: MouseEvent): void {
            const target = event.target instanceof Node ? event.target : null;

            if (
                target
                && (panelRef.current?.contains(target) || anchorRef.current?.contains(target))
            ) {
                return;
            }

            onClose();
        }

        function onKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, onClose, anchorRef]);

    if (! open || ! position) {
        return null;
    }

    return (
        <ModalPortal>
            <div
                ref={panelRef}
                role="dialog"
                dir={document.documentElement.dir || undefined}
                className={['z-[90]', className].join(' ')}
                style={{
                    position: 'fixed',
                    top: position.top,
                    bottom: position.bottom,
                    left: position.left,
                    width: position.width,
                    maxHeight: position.maxHeight,
                    overflowY: 'auto',
                }}
            >
                {children}
            </div>
        </ModalPortal>
    );
}
