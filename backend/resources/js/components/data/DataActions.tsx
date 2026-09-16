import {
    Download,
    FileDown,
    FileSpreadsheet,
    Printer,
    Upload,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/components/feedback/ToastProvider';
import { downloadExport } from '@/lib/data-transfer';
import { normalizeApiError } from '@/lib/error-feedback';
import { t, useLocale } from '@/lib/i18n';

type DataActionsProps = {
    exportUrl: (format: 'xlsx' | 'pdf' | 'print') => string;
    canImport: boolean;
    onImport: () => void;
};

/**
 * Render shared import/export controls for complete filtered datasets.
 *
 * Export clicks use the safe download transport instead of direct navigation,
 * preventing JSON or HTML error responses from being mistaken for files.
 */
export function DataActions({
    exportUrl,
    canImport,
    onImport,
}: DataActionsProps) {
    useLocale();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        /** Close the export menu after clicking outside it. */
        function handlePointerDown(event: MouseEvent): void {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }

        /** Allow keyboard users to dismiss the compact export menu. */
        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        }

        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <div className={canImport ? 'grid grid-cols-2 gap-2 sm:flex' : 'flex'}>
            {canImport && (
                <button
                    type="button"
                    onClick={onImport}
                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white px-4 text-sm font-semibold text-[var(--ac-text)] shadow-[var(--ac-shadow-control)] transition duration-200 motion-safe:hover:-translate-y-0.5 hover:border-[var(--ac-line-strong)] active:translate-y-0"
                >
                    <Upload size={15} />
                    {t('ui.import')}
                </button>
            )}

            <div ref={containerRef} className="relative min-w-0">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-haspopup="menu"
                    onClick={() => setOpen((current) => !current)}
                    className={[
                        'flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border bg-white px-4 text-sm font-semibold text-[var(--ac-text)] shadow-[var(--ac-shadow-control)] transition duration-200 motion-safe:hover:-translate-y-0.5 active:translate-y-0',
                        open
                            ? 'border-[var(--ac-accent)] ring-4 ring-[var(--ac-accent-soft)]'
                            : 'border-[var(--ac-line)] hover:border-[var(--ac-line-strong)]',
                    ].join(' ')}
                >
                    <Download size={15} />
                    {t('ui.export')}
                </button>

                {open && (
                    <div
                        role="menu"
                        className="absolute end-0 top-[calc(100%+0.6rem)] z-[80] w-[min(280px,calc(100vw-2rem))] overflow-hidden rounded-[21px] border border-[var(--ac-line)] bg-white p-2 shadow-[var(--ac-shadow-float)] motion-safe:animate-[ac-popover-in_180ms_ease-out]"
                    >
                        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                    {t('ui.full_dataset')}
                                </p>

                                <p className="mt-1 text-[11px] leading-4 text-[var(--ac-text-soft)]">
                                    {t('ui.all_matching_rows_not_only_this_page')}
                                </p>
                            </div>

                            <button
                                type="button"
                                aria-label={t('common.close')}
                                onClick={() => setOpen(false)}
                                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <ExportAction
                            href={exportUrl('xlsx')}
                            icon={FileSpreadsheet}
                            title={t('ui.excel_workbook')}
                            description={t('ui.full_filtered_data')}
                            onComplete={() => setOpen(false)}
                        />

                        <ExportAction
                            href={exportUrl('pdf')}
                            icon={FileDown}
                            title={t('ui.pdf_document')}
                            description={t('ui.unicode_rtl_ready')}
                            onComplete={() => setOpen(false)}
                        />

                        <ExportAction
                            href={exportUrl('print')}
                            icon={Printer}
                            title={t('ui.print_all')}
                            description={t('ui.opens_printable_dataset')}
                            print
                            onComplete={() => setOpen(false)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

type ExportActionProps = {
    href: string;
    icon: LucideIcon;
    title: string;
    description: string;
    print?: boolean;
    onComplete: () => void;
};

/** Download one export with safe error feedback and duplicate-click protection. */
function ExportAction({
    href,
    icon: Icon,
    title,
    description,
    print = false,
    onComplete,
}: ExportActionProps) {
    useLocale();
    const { showToast } = useToast();
    const [busy, setBusy] = useState(false);

    /** Execute the export without ever navigating the current app to an error page. */
    async function handleExport(): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);

        try {
            await downloadExport(href, print);
            showToast(t('feedback.exported'));
            onComplete();
        } catch (error) {
            showToast(normalizeApiError(error).generalMessage, 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void handleExport()}
            className="group flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-start transition hover:bg-[var(--ac-bg-soft)] disabled:cursor-wait disabled:opacity-55"
        >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-surface-strong)] text-[var(--ac-text-soft)] transition group-hover:bg-white group-hover:text-[var(--ac-accent-strong)] group-hover:shadow-[var(--ac-shadow-control)]">
                <Icon size={15} />
            </div>

            <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--ac-text)]">
                    {busy ? t('common.working') : title}
                </p>

                <p className="mt-0.5 text-[10px] leading-4 text-[var(--ac-text-muted)]">
                    {description}
                </p>
            </div>
        </button>
    );
}
