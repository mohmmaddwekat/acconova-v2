import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders an overlay directly under <body>. A `fixed` overlay rendered inside
 * a page can be trapped by an ancestor stacking context and end up underneath
 * the sticky top bar; portaling it guarantees it always sits above the shell.
 */
export function ModalPortal({
    children,
}: {
    children: ReactNode;
}) {
    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(children, document.body);
}
