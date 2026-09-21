import type { Party } from '@/features/parties/types';
import { ExternalLink, Pencil, X } from 'lucide-react';

export function PartySplitPreview({
    party,
    ar,
    canEdit,
    onOpenFull,
    onEdit,
    onClose,
}: {
    party: Party;
    ar: boolean;
    canEdit: boolean;
    onOpenFull: () => void;
    onEdit: () => void;
    onClose: () => void;
}) {
    const label =
        party.type === 'company'
            ? party.company_name
            : party.name;

    const location = [
        party.city,
        party.state,
        party.country_code,
    ].filter(Boolean).join(' · ');

    const rows = [
        [
            ar ? 'النوع' : 'Type',
            party.type,
        ],
        [
            ar ? 'الأدوار' : 'Roles',
            party.roles.join(', '),
        ],
        [
            ar ? 'البريد' : 'Email',
            party.email,
        ],
        [
            ar ? 'الهاتف' : 'Phone',
            party.phone,
        ],
        [
            ar ? 'الموقع' : 'Location',
            location || null,
        ],
        [
            ar ? 'الرقم الضريبي' : 'Tax number',
            party.tax_number,
        ],
        [
            ar ? 'حد الائتمان' : 'Credit limit',
            party.credit_limit,
        ],
    ] as const;

    return (
        <aside className="sticky top-20 self-start overflow-hidden rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--ac-line)] p-4">
                <div className="min-w-0">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--ac-accent)]">
                        {ar ? 'معاينة سريعة' : 'Quick preview'}
                    </p>
                    <h3 className="mt-1 truncate text-base font-bold text-[var(--ac-text)]">
                        {label || (ar ? 'جهة بدون اسم' : 'Unnamed Party')}
                    </h3>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    className="flex size-9 shrink-0 items-center justify-center rounded-[11px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] transition hover:border-[var(--ac-line-strong)] hover:text-[var(--ac-text)]"
                    aria-label={ar ? 'إغلاق المعاينة' : 'Close preview'}
                >
                    <X size={14} />
                </button>
            </div>

            <div className="divide-y divide-[var(--ac-line)]">
                {rows.map(([name, value]) => (
                    <div
                        key={name}
                        className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                        <span className="text-[10px] text-[var(--ac-text-muted)]">
                            {name}
                        </span>
                        <span className="max-w-[62%] break-words text-end text-[11px] font-semibold text-[var(--ac-text)]">
                            {value || '—'}
                        </span>
                    </div>
                ))}
            </div>

            {party.notes && (
                <div className="border-t border-[var(--ac-line)] p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                        {ar ? 'ملاحظات' : 'Notes'}
                    </p>
                    <p className="mt-2 line-clamp-5 text-[11px] leading-5 text-[var(--ac-text-soft)]">
                        {party.notes}
                    </p>
                </div>
            )}

            <div className="grid gap-2 border-t border-[var(--ac-line)] p-4 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={onOpenFull}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)] transition hover:bg-[var(--ac-accent-soft)]"
                >
                    <ExternalLink size={13} />
                    {ar ? 'التفاصيل الكاملة' : 'Full details'}
                </button>

                {canEdit && ! party.deleted_at && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-line-strong)] hover:text-[var(--ac-text)]"
                    >
                        <Pencil size={13} />
                        {ar ? 'تعديل' : 'Edit'}
                    </button>
                )}
            </div>
        </aside>
    );
}
