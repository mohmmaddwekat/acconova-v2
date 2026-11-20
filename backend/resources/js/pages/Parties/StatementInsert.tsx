import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type InsertChoice = {
    key: string;
    label: string;
    hint?: string;
    onChoose: () => void;
};

/**
 * A thin hover zone on the line between two statement rows. A "+" shows up there;
 * pressing it lists what can be added at that point (a difference entry on that
 * date, a discount on the invoice next to it).
 */
export function StatementInsert({ ar, date, choices }: { ar: boolean; date: string; choices: InsertChoice[] }) {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (! open) {
            return;
        }

        const away = (event: MouseEvent): void => {
            if (box.current && ! box.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const escape = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('mousedown', away);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    if (choices.length === 0) {
        return null;
    }

    return (
        <div ref={box} className="group/insert absolute inset-x-0 -top-2.5 z-20 flex h-5 items-center justify-center print:hidden">
            <div className={'pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[var(--ac-accent)] transition-opacity ' + (open ? 'opacity-60' : 'opacity-0 group-hover/insert:opacity-40')} />
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={ar ? 'إضافة هنا' : 'Add here'}
                title={ar ? 'إضافة هنا (' + date + ')' : 'Add here (' + date + ')'}
                onClick={() => setOpen((value) => ! value)}
                className={'relative grid size-5 place-items-center rounded-full border border-[var(--ac-accent)] bg-[var(--ac-surface)] text-[var(--ac-accent)] shadow-sm transition-opacity focus:opacity-100 ' + (open ? 'opacity-100' : 'opacity-0 group-hover/insert:opacity-100')}
            >
                <Plus size={12} strokeWidth={3} />
            </button>

            {open && (
                <div role="menu" className="absolute top-full z-30 mt-1 min-w-[230px] overflow-hidden rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] py-1 text-start shadow-xl">
                    <div className="px-3 py-1 text-[10px] font-bold text-[var(--ac-text-muted)]">{ar ? 'إضافة عند ' : 'Add at '}{date}</div>
                    {choices.map((choice) => (
                        <button
                            key={choice.key}
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-2 text-start text-xs font-semibold text-[var(--ac-text)] hover:bg-[var(--ac-accent-soft)]"
                            onClick={() => {
                                setOpen(false);
                                choice.onChoose();
                            }}
                        >
                            {choice.label}
                            {choice.hint && <span className="mt-0.5 block text-[10px] font-normal text-[var(--ac-text-muted)]">{choice.hint}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
