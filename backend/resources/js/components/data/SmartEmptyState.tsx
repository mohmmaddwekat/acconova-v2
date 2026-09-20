import type {
    LucideIcon,
} from 'lucide-react';
import type {
    ReactNode,
} from 'react';

export function SmartEmptyState({
    icon: Icon,
    title,
    description,
    primary,
    secondary,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    primary?: ReactNode;
    secondary?: ReactNode;
}) {
    return (
        <div className="px-4 py-14 text-center sm:py-16">
            <div className="mx-auto flex size-12 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                <Icon size={19} />
            </div>

            <h2 className="mt-5 text-xl font-semibold tracking-[-0.035em] text-[var(--ac-text)]">
                {title}
            </h2>

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--ac-text-soft)]">
                {description}
            </p>

            {(primary || secondary) && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    {primary}
                    {secondary}
                </div>
            )}
        </div>
    );
}
