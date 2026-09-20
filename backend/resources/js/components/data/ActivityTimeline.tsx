import {
    Archive,
    Clock3,
    Pencil,
    PlusCircle,
    type LucideIcon,
} from 'lucide-react';

export type ActivityTimelineItem = {
    key: string;
    label: string;
    detail?: string | null;
    at: string;
    tone?: 'created' | 'updated' | 'archived' | 'default';
};

function iconForTone(
    tone: ActivityTimelineItem['tone'],
): LucideIcon {
    if (tone === 'created') {
        return PlusCircle;
    }

    if (tone === 'updated') {
        return Pencil;
    }

    if (tone === 'archived') {
        return Archive;
    }

    return Clock3;
}

export function ActivityTimeline({
    items,
    title,
    locale,
}: {
    items: ActivityTimelineItem[];
    title: string;
    locale: string;
}) {
    const ordered = [...items]
        .filter((item) => Boolean(item.at))
        .sort(
            (a, b) =>
                new Date(b.at).getTime()
                - new Date(a.at).getTime(),
        );

    if (! ordered.length) {
        return null;
    }

    return (
        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                {title}
            </h3>

            <ol className="mt-4 space-y-3">
                {ordered.map((item, index) => {
                    const Icon = iconForTone(item.tone);

                    return (
                        <li
                            key={item.key}
                            className="relative flex gap-3"
                        >
                            {index < ordered.length - 1 && (
                                <span
                                    aria-hidden="true"
                                    className="absolute start-[17px] top-9 h-[calc(100%+2px)] w-px bg-[var(--ac-line)]"
                                />
                            )}

                            <span className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-accent)]">
                                <Icon size={15} />
                            </span>

                            <div className="min-w-0 flex-1 pb-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <strong className="text-xs text-[var(--ac-text)]">
                                        {item.label}
                                    </strong>

                                    <time
                                        dateTime={item.at}
                                        className="text-[9px] text-[var(--ac-text-muted)]"
                                    >
                                        {new Intl.DateTimeFormat(
                                            locale,
                                            {
                                                dateStyle: 'medium',
                                                timeStyle: 'short',
                                            },
                                        ).format(new Date(item.at))}
                                    </time>
                                </div>

                                {item.detail && (
                                    <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                        {item.detail}
                                    </p>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
