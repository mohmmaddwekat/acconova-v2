import '../../css/team-space.css';
import TeamSpacePage from './TeamSpace';
import { useRef } from 'react';

/**
 * Team Space used to open the details panel by default on >=1280px screens.
 * Preserve the existing feature-rich page while making the first desktop view
 * a clean two-column workspace. The page's own Info button still opens the
 * details drawer normally afterwards.
 */
export default function TeamSpaceCompact() {
    const primed = useRef(false);

    if (!primed.current && typeof window !== 'undefined') {
        primed.current = true;

        const nativeMatchMedia = window.matchMedia.bind(window);
        let restored = false;

        const restore = (): void => {
            if (restored) return;
            restored = true;
            window.matchMedia = nativeMatchMedia;
        };

        window.matchMedia = ((query: string): MediaQueryList => {
            const result = nativeMatchMedia(query);

            if (query !== '(min-width: 1280px)') {
                return result;
            }

            restore();

            return {
                media: result.media,
                matches: false,
                onchange: result.onchange,
                addListener: result.addListener.bind(result),
                removeListener: result.removeListener.bind(result),
                addEventListener: result.addEventListener.bind(result),
                removeEventListener: result.removeEventListener.bind(result),
                dispatchEvent: result.dispatchEvent.bind(result),
            };
        }) as typeof window.matchMedia;

        // Safety fallback: never leave the browser API patched if the child
        // stops using this breakpoint in a later refactor.
        queueMicrotask(restore);
    }

    return (
        <div className="team-space-page">
            <TeamSpacePage />
        </div>
    );
}
