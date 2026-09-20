import { apiRequest } from '@/lib/http';
import {
    Plus,
    Tag,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';
import type {
    CollaborationRecordType,
} from './RecordCollaborationPanel';

type TagRow = {
    id: number;
    name: string;
    slug: string;
    color: string | null;
};

export function RecordTagsPanel({
    type,
    recordId,
    ar,
}: {
    type: CollaborationRecordType;
    recordId: number;
    ar: boolean;
}) {
    const [tags, setTags] = useState<TagRow[]>([]);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);

    const base =
        '/api/records/'
        + type
        + '/'
        + String(recordId);

    async function load(): Promise<void> {
        const response = await apiRequest<{
            data: {
                tags: TagRow[];
            };
        }>(base + '/collaboration');

        setTags(response.data.tags);
    }

    useEffect(() => {
        void load();
    }, [
        type,
        recordId,
    ]);

    async function add(): Promise<void> {
        const value = name.trim();

        if (! value || busy) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                base + '/tags',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        name: value,
                    }),
                },
            );
            setName('');
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function remove(
        id: number,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);

        try {
            await apiRequest(
                base + '/tags/' + id,
                {
                    method: 'DELETE',
                },
            );
            await load();
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
            <div className="flex items-center gap-2">
                <Tag
                    size={13}
                    className="text-[var(--ac-accent)]"
                />
                <strong className="text-[11px] text-[var(--ac-text)]">
                    {ar ? 'الوسوم' : 'Tags'}
                </strong>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                    <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2 py-1 text-[9px] font-semibold text-[var(--ac-text-soft)]"
                    >
                        #{tag.name}
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                void remove(
                                    tag.id,
                                )}
                            className="text-[var(--ac-text-muted)] hover:text-red-600"
                        >
                            <X size={9} />
                        </button>
                    </span>
                ))}

                {! tags.length && (
                    <span className="text-[9px] text-[var(--ac-text-muted)]">
                        {ar ? 'بدون وسوم' : 'No tags'}
                    </span>
                )}
            </div>

            <div className="mt-2 flex gap-2">
                <input
                    value={name}
                    onChange={(event) =>
                        setName(
                            event.target.value,
                        )}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void add();
                        }
                    }}
                    placeholder={ar ? 'VIP، حساس، موسمي…' : 'VIP, sensitive, seasonal…'}
                    className="h-8 min-w-0 flex-1 rounded-[9px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-2.5 text-[10px] text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                />
                <button
                    type="button"
                    disabled={busy || ! name.trim()}
                    onClick={() => void add()}
                    className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)] disabled:opacity-40"
                >
                    <Plus size={11} />
                </button>
            </div>
        </section>
    );
}
