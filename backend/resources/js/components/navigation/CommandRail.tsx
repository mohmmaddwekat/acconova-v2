import {
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Boxes,
    ContactRound,
    FileText,
    Gauge,
    Settings,
    WalletCards,
} from 'lucide-react';

type CommandRailItem = {
    label: string;
    icon: typeof Gauge;
    href?: string;
    exact?: boolean;
};

const navigation: CommandRailItem[] = [
    {
        label: 'Command',
        icon: Gauge,
        href: '/app',
        exact: true,
    },
    {
        label: 'Parties',
        icon: ContactRound,
        href: '/app/parties',
    },
    {
        label: 'Products',
        icon: Boxes,
    },
    {
        label: 'Invoices',
        icon: FileText,
    },
    {
        label: 'Payments',
        icon: WalletCards,
    },
];

/**
 * Render AccoNova's compact global navigation rail.
 *
 * Live modules use Inertia navigation while future modules remain visibly
 * present but intentionally non-interactive until their business layer exists.
 */
export function CommandRail() {
    const { url } = usePage();

    return (
        <aside className="flex w-[92px] shrink-0 flex-col border-r border-[var(--ac-line)] bg-white/70 px-3 py-4 backdrop-blur-xl">
            <div className="flex h-14 items-center justify-center">
                <div className="flex size-10 items-center justify-center rounded-[18px] border border-[var(--ac-line-strong)] bg-[var(--ac-accent-soft)]">
                    <span className="text-sm font-semibold tracking-[-0.06em] text-[var(--ac-accent-strong)]">
                        AN
                    </span>
                </div>
            </div>

            <nav className="mt-7 flex flex-1 flex-col gap-2">
                {navigation.map((item) => {
                    const Icon = item.icon;

                    const active =
                        item.href !== undefined &&
                        (item.exact
                            ? url === item.href
                            : url.startsWith(item.href));

                    const classes = [
                        'group relative flex h-[62px] flex-col items-center justify-center gap-1.5 rounded-[18px] transition',
                        active
                            ? 'bg-[var(--ac-surface-strong)] text-[var(--ac-text)]'
                            : item.href
                              ? 'text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]'
                              : 'cursor-not-allowed text-[var(--ac-text-faint)] opacity-55',
                    ].join(' ');

                    const content = (
                        <>
                            {active && (
                                <span className="absolute -left-3 h-7 w-[3px] rounded-full bg-[var(--ac-accent)]" />
                            )}

                            <Icon
                                size={19}
                                strokeWidth={1.7}
                            />

                            <span className="text-[10px] font-medium tracking-wide">
                                {item.label}
                            </span>
                        </>
                    );

                    return item.href ? (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={classes}
                        >
                            {content}
                        </Link>
                    ) : (
                        <button
                            key={item.label}
                            type="button"
                            disabled
                            className={classes}
                        >
                            {content}
                        </button>
                    );
                })}
            </nav>

            <button
                type="button"
                disabled
                className="flex h-[62px] cursor-not-allowed flex-col items-center justify-center gap-1.5 rounded-[18px] text-[var(--ac-text-faint)] opacity-55"
            >
                <Settings
                    size={19}
                    strokeWidth={1.7}
                />

                <span className="text-[10px] font-medium tracking-wide">
                    Settings
                </span>
            </button>
        </aside>
    );
}
