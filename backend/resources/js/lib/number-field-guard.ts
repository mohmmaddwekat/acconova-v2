/**
 * Number fields must only change when the user types. A mouse wheel or touchpad scroll over a
 * focused number field would otherwise nudge its value while the page is being scrolled, so the
 * field is released (blurred) first and the page simply scrolls.
 */
export function installNumberFieldGuards(): void {
    if (typeof document === 'undefined') {
        return;
    }

    document.addEventListener(
        'wheel',
        (event) => {
            const target = event.target;

            if (
                target instanceof HTMLInputElement
                && target.type === 'number'
                && document.activeElement === target
            ) {
                target.blur();
            }
        },
        { passive: true },
    );
}
