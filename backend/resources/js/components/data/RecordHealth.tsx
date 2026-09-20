import {
    CheckCircle2,
    CircleAlert,
} from 'lucide-react';

export type HealthField = {
    label: string;
    complete: boolean;
};

export function RecordHealth({
    fields,
    ar,
}: {
    fields: HealthField[];
    ar: boolean;
}) {
    const complete =
        fields.filter(
            (field) =>
                field.complete,
        ).length;

    const score =
        fields.length
            ? Math.round(
                (
                    complete
                    / fields.length
                )
                * 100,
            )
            : 100;

    const missing =
        fields.filter(
            (field) =>
                ! field.complete,
        );

    return (
        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--ac-text-muted)]">
                        {ar
                            ? 'صحة السجل'
                            : 'Record health'}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--ac-text)]">
                        {score}%{' '}
                        {ar
                            ? 'مكتمل'
                            : 'complete'}
                    </p>
                </div>

                <span
                    className={[
                        'flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-surface-soft)]',
                        score >= 80
                            ? 'text-emerald-500'
                            : score >= 50
                                ? 'text-amber-500'
                                : 'text-red-500',
                    ].join(' ')}
                >
                    {score >= 80
                        ? <CheckCircle2 size={18} />
                        : <CircleAlert size={18} />}
                </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ac-surface-soft)]">
                <div
                    className="h-full rounded-full bg-[var(--ac-accent)] transition-[width]"
                    style={{
                        width:
                            String(
                                score,
                            )
                            + '%',
                    }}
                />
            </div>

            {missing.length > 0 && (
                <p className="mt-3 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                    {ar
                        ? 'ناقص: '
                        : 'Missing: '}
                    {missing
                        .map(
                            (field) =>
                                field.label,
                        )
                        .join(
                            ' · ',
                        )}
                </p>
            )}
        </section>
    );
}
