import { ModalPortal } from '@/components/feedback/ModalPortal';
import {
    deleteProductionDraft,
    fetchDuplicateRuns,
    reverseProductionRun,
    type DuplicateRunGroup,
} from '@/features/production/api';
import { apiErrorText } from '@/pages/Finance/shared';
import { CheckCircle2, Copy, RotateCcw, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Props = {
    ar: boolean;
    onClose: () => void;
    onChanged: () => void;
};

const STATUS_AR: Record<string, string> = {
    draft: 'مسودة',
    posted: 'مرحَّل',
    partially_reversed: 'معكوس جزئياً',
};

/**
 * Lists production runs that repeat the same day, product and quantity, keeps
 * the oldest of each group as the original and lets the rest be removed (a
 * draft) or reversed (a posted run, which returns the stock it moved).
 */
export function DuplicateRunsDialog({ ar, onClose, onChanged }: Props) {
    const text = (arabic: string, english: string): string => ar ? arabic : english;
    const [groups, setGroups] = useState<DuplicateRunGroup[] | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(() => {
        fetchDuplicateRuns()
            .then(setGroups)
            .catch((failure) => setError(apiErrorText(failure)));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const act = async (group: DuplicateRunGroup, run: DuplicateRunGroup['runs'][number]) => {
        const draft = run.status === 'draft';
        const question = draft
            ? text(`حذف المسودة ${run.run_number}؟ (لا تؤثر على المخزون، وتبقى في الأرشيف)`, `Delete draft ${run.run_number}? (No stock effect; it stays in the archive.)`)
            : text(`عكس الأمر ${run.run_number}؟ سيُرجع الخام ويخرج ${Number(group.quantity)} من ${group.product} من المخزون.`, `Reverse ${run.run_number}? It returns the raw material and removes ${Number(group.quantity)} of ${group.product} from stock.`);

        if (! window.confirm(question)) {
            return;
        }

        setBusyId(run.id);
        setError('');
        setNotice('');

        try {
            if (draft) {
                await deleteProductionDraft(run.id, run.revision);
            } else {
                await reverseProductionRun(run.id, run.revision, text('أمر إنتاج مكرر', 'Duplicate production run'));
            }

            setNotice(text(`تم: ${run.run_number}`, `Done: ${run.run_number}`));
            onChanged();
            load();
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
                <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-2xl sm:rounded-[26px]">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-[14px] bg-amber-500/15 text-amber-700"><Copy size={18} /></div>
                            <div>
                                <strong className="text-base">{text('الأوامر المكررة', 'Duplicate runs')}</strong>
                                <p className="mt-0.5 text-xs text-[var(--ac-text-muted)]">
                                    {text('أوامر بنفس اليوم والمنتج والكمية. الأقدم يبقى كأصل، والباقي تحذفه (مسودة) أو تعكسه (مرحَّل).', 'Runs with the same day, product and quantity. The oldest stays as the original; remove the rest (draft) or reverse them (posted).')}
                                </p>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} aria-label={text('إغلاق', 'Close')} className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)]"><X size={16} /></button>
                    </div>

                    <div className="space-y-3 overflow-y-auto p-4">
                        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                        {notice && <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

                        {groups === null ? (
                            <p className="p-8 text-center text-sm text-[var(--ac-text-muted)]">{text('جارٍ البحث…', 'Searching…')}</p>
                        ) : groups.length === 0 ? (
                            <div className="p-8 text-center text-sm text-[var(--ac-text-muted)]">
                                <CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={28} />
                                {text('لا توجد أوامر مكررة.', 'No duplicate runs found.')}
                            </div>
                        ) : groups.map((group) => (
                            <section key={group.date + group.product_id + group.quantity} className="rounded-[16px] border border-[var(--ac-line)] p-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
                                    <span>{group.product} · {Number(group.quantity)}</span>
                                    <span className="text-xs font-normal text-[var(--ac-text-muted)]">{group.date} · {group.runs.length} {text('أوامر', 'runs')}</span>
                                </div>
                                <ul className="space-y-1.5">
                                    {group.runs.map((run, index) => (
                                        <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[var(--ac-bg-soft)] px-3 py-2 text-sm">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <b>{run.run_number}</b>
                                                <span className={'rounded-full px-2 py-0.5 text-[11px] font-bold ' + (run.status === 'draft' ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700')}>{ar ? (STATUS_AR[run.status] ?? run.status) : run.status}</span>
                                                {run.created_at && <span className="text-xs text-[var(--ac-text-muted)]">{run.created_at}</span>}
                                            </span>
                                            {index === 0 ? (
                                                <span className="text-xs font-bold text-emerald-700">{text('الأصل (يبقى)', 'Original (kept)')}</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={busyId !== null}
                                                    onClick={() => void act(group, run)}
                                                    className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-red-300 px-3 text-xs font-bold text-red-600 disabled:opacity-50"
                                                >
                                                    {run.status === 'draft' ? <Trash2 size={14} /> : <RotateCcw size={14} />}
                                                    {run.status === 'draft' ? text('حذف المسودة', 'Delete draft') : text('عكس الأمر', 'Reverse run')}
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
