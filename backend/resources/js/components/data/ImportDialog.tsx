import {
    CheckCircle2,
    Download,
    FileSpreadsheet,
    UploadCloud,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/useDialog';
import {
    downloadExport,
    executeImport,
    previewImport,
    type ImportModule,
    type ImportPreview,
    type ImportResult,
} from '@/lib/data-transfer';
import { normalizeApiError } from '@/lib/error-feedback';
import { t, useLocale } from '@/lib/i18n';

type ImportDialogProps = {
    open: boolean;
    module: ImportModule;
    onClose: () => void;
    onImported: (result: ImportResult) => void;
};

/** Resolve preview copy from a stable import code, never from server prose. */
function previewErrorMessage(
    item: ImportPreview['errors'][number],
): string {
    if (item.code === 'duplicate') {
        return t('import.duplicate');
    }

    if (item.code === 'archived') {
        return t('import.archived');
    }

    return t('import.invalid');
}

/**
 * Render the shared Party/Product bulk-import workflow.
 *
 * Users download a stable workbook template, preview validation and duplicate
 * behavior, then explicitly commit a clean workbook. Technical response text
 * never appears directly in the interface.
 */
export function ImportDialog({
    module,
    open,
    onClose,
    onImported,
}: ImportDialogProps) {
    useLocale();
    const [file, setFile] = useState<File | null>(null);
    const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>(
        'skip',
    );
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dialogRef = useDialog(open, onClose, busy);
    const { showToast } = useToast();

    useEffect(() => {
        if (!open) {
            return;
        }

        setFile(null);
        setPreview(null);
        setError(null);
        setDuplicateMode('skip');
    }, [open]);

    /** Store one selected workbook and invalidate any previous preview. */
    function chooseFile(selected: File | null): void {
        if (busy) {
            return;
        }

        setFile(selected);
        setPreview(null);
        setError(null);
    }

    /** Download the module template through safe export transport. */
    async function handleTemplateDownload(): Promise<void> {
        try {
            await downloadExport(`/api/${module}/import-template`);
        } catch (exception) {
            showToast(normalizeApiError(exception).generalMessage, 'error');
        }
    }

    /** Request a server-side dry run of the selected workbook. */
    async function handlePreview(): Promise<void> {
        if (!file || busy) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            setPreview(await previewImport(module, file, duplicateMode));
        } catch (exception) {
            const normalized = normalizeApiError(exception);
            setError(
                normalized.fieldErrors.file?.[0] ?? normalized.generalMessage,
            );
        } finally {
            setBusy(false);
        }
    }

    /** Commit a workbook that has passed preview validation. */
    async function handleImport(): Promise<void> {
        if (!file || !preview || preview.error_rows > 0 || busy) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const result = await executeImport(module, file, duplicateMode);
            onImported(result);
            onClose();
        } catch (exception) {
            const normalized = normalizeApiError(exception);
            setError(
                normalized.fieldErrors.file?.[0] ?? normalized.generalMessage,
            );
        } finally {
            setBusy(false);
        }
    }

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[145] flex items-end justify-center sm:items-center sm:p-5">
            <button
                type="button"
                aria-label={t('ui.close_import')}
                onClick={() => {
                    if (!busy) {
                        onClose();
                    }
                }}
                className="absolute inset-0 bg-[var(--ac-text)]/24 backdrop-blur-[3px]"
            />

            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('ui.import')}
                className="relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-float)] motion-safe:animate-[ac-popover-in_180ms_ease-out] sm:max-w-[720px] sm:rounded-[28px]"
            >
                <header className="flex items-start justify-between gap-4 border-b border-[var(--ac-line)] px-5 py-5 sm:px-6">
                    <div className="min-w-0">
                        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                            {t('ui.data_migration')}
                        </p>

                        <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.045em]">
                            {module === 'products'
                                ? t('import.products')
                                : t('ui.import_relationships')}
                        </h2>

                        <p className="mt-2 max-w-lg text-xs leading-5 text-[var(--ac-text-soft)]">
                            {module === 'products'
                                ? t('import.productDescription')
                                : t(
                                      'ui.move_existing_customer_and_supplier_data_into_acconova_without_adding_records_one_by_',
                                  )}
                        </p>
                    </div>

                    <button
                        type="button"
                        aria-label={t('ui.close_import')}
                        disabled={busy}
                        onClick={onClose}
                        className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)] disabled:opacity-45"
                    >
                        <X size={17} />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                    <button
                        type="button"
                        onClick={() => void handleTemplateDownload()}
                        className="group flex w-full items-center justify-between gap-4 rounded-[20px] border border-[var(--ac-accent)]/25 bg-[var(--ac-accent-soft)] p-4 text-start transition duration-200 motion-safe:hover:-translate-y-0.5 hover:border-[var(--ac-accent)]/45 hover:shadow-[var(--ac-shadow-control)] active:translate-y-0"
                    >
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-white text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-control)]">
                                <FileSpreadsheet size={17} />
                            </div>

                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-[var(--ac-text)]">
                                    {t('ui.download_template')}
                                </p>

                                <p className="mt-0.5 text-[11px] text-[var(--ac-text-soft)]">
                                    {t('ui.excel_sample_with_supported_columns')}
                                </p>
                            </div>
                        </div>

                        <Download
                            size={16}
                            className="shrink-0 text-[var(--ac-accent-strong)] transition group-hover:translate-y-0.5"
                        />
                    </button>

                    <div className="mt-6">
                        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            {t('ui.workbook')}
                        </p>

                        <label
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault();
                                chooseFile(event.dataTransfer.files[0] ?? null);
                            }}
                            className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed border-[var(--ac-line-strong)] bg-[var(--ac-surface-soft)] px-5 py-7 text-center transition duration-200 hover:border-[var(--ac-accent)] hover:bg-white hover:shadow-[var(--ac-shadow-control)]"
                        >
                            <UploadCloud
                                size={23}
                                className="text-[var(--ac-text-muted)]"
                            />

                            <p className="mt-3 break-all text-sm font-semibold">
                                {file ? file.name : t('ui.drop_workbook_here')}
                            </p>

                            <p className="mt-1 text-[11px] text-[var(--ac-text-muted)]">
                                {t('ui.xlsx_xls_or_csv_maximum_10_mb')}
                            </p>

                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                disabled={busy}
                                className="sr-only"
                                onChange={(event) =>
                                    chooseFile(event.target.files?.[0] ?? null)
                                }
                            />
                        </label>
                    </div>

                    <div className="mt-6">
                        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            {module === 'products'
                                ? t('import.sku')
                                : t('ui.existing_email')}
                        </p>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <DuplicateChoice
                                active={duplicateMode === 'skip'}
                                title={t('ui.skip_duplicate')}
                                description={t(
                                    'ui.keep_the_existing_acconova_record_unchanged',
                                )}
                                onClick={() => {
                                    if (busy) return;
                                    setDuplicateMode('skip');
                                    setPreview(null);
                                }}
                            />

                            <DuplicateChoice
                                active={duplicateMode === 'update'}
                                title={t('ui.update_duplicate')}
                                description={t(
                                    'ui.use_the_spreadsheet_row_to_update_the_existing_record',
                                )}
                                onClick={() => {
                                    if (busy) return;
                                    setDuplicateMode('update');
                                    setPreview(null);
                                }}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="mt-5 rounded-[16px] border border-[var(--ac-danger)]/20 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                            {error}
                        </div>
                    )}

                    {preview && (
                        <div className="mt-6">
                            <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                                {t('ui.preview')}
                            </p>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <PreviewStat
                                    label={t('ui.rows')}
                                    value={preview.total_rows}
                                />
                                <PreviewStat
                                    label={t('ui.valid')}
                                    value={preview.valid_rows}
                                />
                                <PreviewStat
                                    label={t('ui.duplicates')}
                                    value={preview.duplicate_rows}
                                />
                                <PreviewStat
                                    label={t('ui.errors')}
                                    value={preview.error_rows}
                                    danger={preview.error_rows > 0}
                                />
                            </div>

                            {preview.errors.length > 0 && (
                                <div className="mt-4 max-h-44 overflow-y-auto rounded-[18px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 p-3">
                                    {preview.errors.map((item) => (
                                        <p
                                            key={`${item.row}-${item.code ?? 'invalid'}`}
                                            className="border-b border-[var(--ac-danger)]/10 py-2 text-xs leading-5 text-[var(--ac-danger)] last:border-0"
                                        >
                                            {t('ui.row')} {item.row}:{' '}
                                            {previewErrorMessage(item)}
                                        </p>
                                    ))}
                                </div>
                            )}

                            {preview.error_rows === 0 && (
                                <div className="mt-4 flex items-start gap-3 rounded-[17px] bg-[var(--ac-accent-soft)] p-4">
                                    <CheckCircle2
                                        size={17}
                                        className="mt-0.5 shrink-0 text-[var(--ac-accent-strong)]"
                                    />

                                    <p className="text-xs leading-5 text-[var(--ac-accent-strong)]">
                                        {t(
                                            'ui.the_workbook_is_ready_no_database_changes_have_been_made_yet',
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <footer className="grid gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6">
                    <p className="hidden text-[11px] text-[var(--ac-text-muted)] sm:block">
                        {t('ui.preview_before_committing_any_data')}
                    </p>

                    <button
                        type="button"
                        disabled={!file || busy}
                        onClick={() => void handlePreview()}
                        className="h-11 rounded-[14px] border border-[var(--ac-line)] bg-white px-5 text-sm font-semibold text-[var(--ac-text)] shadow-[var(--ac-shadow-control)] transition hover:border-[var(--ac-line-strong)] disabled:opacity-40"
                    >
                        {busy ? t('ui.checking') : t('ui.preview')}
                    </button>

                    <button
                        type="button"
                        disabled={!preview || preview.error_rows > 0 || busy}
                        onClick={() => void handleImport()}
                        className="h-11 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white shadow-[var(--ac-shadow-control)] transition motion-safe:hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-35"
                    >
                        {t('ui.import_data')}
                    </button>
                </footer>
            </section>
        </div>
    );
}

type DuplicateChoiceProps = {
    active: boolean;
    title: string;
    description: string;
    onClick: () => void;
};

/** Render one duplicate-resolution strategy. */
function DuplicateChoice({
    active,
    title,
    description,
    onClick,
}: DuplicateChoiceProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'rounded-[17px] border p-4 text-start transition duration-150 motion-safe:hover:-translate-y-0.5 active:translate-y-0',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] shadow-[0_0_0_3px_rgba(67,201,154,0.07)]'
                    : 'border-[var(--ac-line)] bg-white hover:border-[var(--ac-line-strong)] hover:shadow-[var(--ac-shadow-control)]',
            ].join(' ')}
        >
            <p className="text-xs font-semibold text-[var(--ac-text)]">
                {title}
            </p>

            <p className="mt-1.5 text-[11px] leading-4 text-[var(--ac-text-soft)]">
                {description}
            </p>
        </button>
    );
}

type PreviewStatProps = {
    label: string;
    value: number;
    danger?: boolean;
};

/** Render one workbook-preview statistic. */
function PreviewStat({
    label,
    value,
    danger = false,
}: PreviewStatProps) {
    return (
        <div className="rounded-[16px] border border-[var(--ac-line)] bg-white p-3 shadow-[var(--ac-shadow-control)]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                {label}
            </p>

            <p
                className={[
                    'mt-1 text-xl font-semibold tracking-[-0.04em]',
                    danger
                        ? 'text-[var(--ac-danger)]'
                        : 'text-[var(--ac-text)]',
                ].join(' ')}
            >
                {value}
            </p>
        </div>
    );
}
