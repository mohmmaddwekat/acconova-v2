import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    CheckCircle2,
    Download,
    FileSpreadsheet,
    UploadCloud,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';

import { executeImport, previewImport, downloadExport, type ImportModule, type ImportPreview, type ImportResult } from '@/lib/data-transfer';
import { useToast } from '@/components/feedback/ToastProvider';
import { useDialog } from '@/components/feedback/useDialog';
import { ApiError } from '@/lib/http';

type ImportDialogProps = {
    open: boolean;
    module: ImportModule;

    onClose: () => void;

    onImported: (
        result: ImportResult,
    ) => void;
};

/**
 * Render the Party bulk-import workflow.
 *
 * Users download a stable workbook template, populate their legacy data,
 * preview validation and duplicate behavior, then explicitly confirm import.
 */
export function ImportDialog({
    module,
    open,
    onClose,
    onImported,
}: ImportDialogProps) {
    useLocale();
    const [file, setFile] =
        useState<File | null>(
            null,
        );

    const [
        duplicateMode,
        setDuplicateMode,
    ] =
        useState<'skip' | 'update'>(
            'skip',
        );

    const [
        preview,
        setPreview,
    ] =
        useState<ImportPreview | null>(
            null,
        );

    const [busy, setBusy] =
        useState(false);

    const [error, setError] =
        useState<string | null>(
            null,
        );

    const dialogRef = useDialog(open, onClose, busy);
    const { showToast } = useToast();

    useEffect(() => {
    if (! open) {
            return;
        }

        setFile(null);
        setPreview(null);
        setError(null);
        setDuplicateMode(
                                        'skip',
        );
    }, [
        open,
    ]);

    /**
     * Store one selected workbook and invalidate any previous preview.
     */
    function chooseFile(
        selected:
            | File
            | null,
    ): void {
        if (busy) return;
        setFile(
            selected,
        );

        setPreview(null);
        setError(null);
    }

    /**
     * Request a server-side dry run of the selected workbook.
     */
    async function handlePreview(): Promise<void> {
        if (! file || busy) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const result =
                await previewImport(
                    module,
                    file,
                    duplicateMode,
                );

            setPreview(
                result,
            );
        } catch (exception) {
            setError(
                exception instanceof
                ApiError
                    ? exception.message
                    : t('ui.acconova_could_not_read_this_workbook'),
            );
        } finally {
            setBusy(false);
        }
    }

    /**
     * Commit a workbook that has passed preview validation.
     */
    async function handleImport(): Promise<void> {
        if (
            ! file ||
            ! preview ||
            preview.error_rows > 0
        ) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const result =
                await executeImport(
                    module,
                    file,
                    duplicateMode,
                );

            onImported(
                result,
            );

            onClose();
        } catch (exception) {
            setError(
                exception instanceof
                ApiError
                    ? (
                          exception
                              .errors
                              .file?.[0] ??
                          exception.message
                      )
                    : t('ui.acconova_could_not_import_this_workbook'),
            );
        } finally {
            setBusy(false);
        }
    }

    if (! open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[145] flex items-end justify-center sm:items-center sm:p-5">
            <button
                type="button"
                aria-label={t('ui.close_import')}
                onClick={() => {
                    if (! busy) {
                        onClose();
                    }
                }}
                className="absolute inset-0 bg-[var(--ac-text)]/24 backdrop-blur-[3px]"
            />

            <section ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('ui.import')} className="relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-panel)] sm:max-w-[720px] sm:rounded-[28px]">
                <header className="flex items-start justify-between border-b border-[var(--ac-line)] px-5 py-5 sm:px-6">
                    <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                            {t('ui.data_migration')}
                        </p>

                        <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.045em]">
                            {module === 'products' ? t('import.products') : t('ui.import_relationships')}
                        </h2>

                        <p className="mt-2 max-w-lg text-xs leading-5 text-[var(--ac-text-soft)]">
                            {module === 'products' ? t('import.productDescription') : t('ui.move_existing_customer_and_supplier_data_into_acconova_without_adding_records_one_by_')}
                        </p>
                    </div>

                    <button
                        type="button"
                        disabled={
                            busy
                        }
                        onClick={
                            onClose
                        }
                        className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]"
                    >
                        <X size={17} />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                    <a
                        href={`/api/${module}/import-template`} onClick={(event) => { event.preventDefault(); void downloadExport(`/api/${module}/import-template`).catch(() => showToast(t('errors.unexpected'), 'error')); }}
                        className="group flex items-center justify-between gap-4 rounded-[20px] border border-[var(--ac-accent)]/25 bg-[var(--ac-accent-soft)] p-4 transition hover:-translate-y-0.5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-surface)] text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-soft)]">
                                <FileSpreadsheet
                                    size={
                                        17
                                    }
                                />
                            </div>

                            <div>
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
                    </a>

                    <div className="mt-6">
                        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            {t('ui.workbook')}
                        </p>

                        <label
                            onDragOver={(
                                event,
                            ) => {
                                event.preventDefault();
                            }}
                            onDrop={(
                                event,
                            ) => {
                                event.preventDefault();

                                chooseFile(
                                    event
                                        .dataTransfer
                                        .files[0] ??
                                        null,
                                );
                            }}
                            className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed border-[var(--ac-line-strong)] bg-[var(--ac-surface-soft)] px-5 py-7 text-center transition hover:border-[var(--ac-accent)]"
                        >
                            <UploadCloud
                                size={23}
                                className="text-[var(--ac-text-muted)]"
                            />

                            <p className="mt-3 text-sm font-semibold">
                                {file
                                    ? file.name
                                    : t('ui.drop_workbook_here')}
                            </p>

                            <p className="mt-1 text-[11px] text-[var(--ac-text-muted)]">
                                {t('ui.xlsx_xls_or_csv_maximum_10_mb')}
                            </p>

                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                disabled={busy} className="sr-only"
                                onChange={(
                                    event,
                                ) =>
                                    chooseFile(
                                        event
                                            .target
                                            .files?.[0] ??
                                            null,
                                    )
                                }
                            />
                        </label>
                    </div>

                    <div className="mt-6">
                        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                            {module === 'products' ? t('import.sku') : t('ui.existing_email')}
                        </p>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <DuplicateChoice
                                active={
                                    duplicateMode ===
                                    'skip'
                                }
                                title={t('ui.skip_duplicate')}
                                description={t('ui.keep_the_existing_acconova_record_unchanged')}
                                onClick={() => {
                                    if (busy) return;
                                    setDuplicateMode(
                                        'skip',
                                    );

                                    setPreview(
                                        null,
                                    );
                                }}
                            />

                            <DuplicateChoice
                                active={
                                    duplicateMode ===
                                    'update'
                                }
                                title={t('ui.update_duplicate')}
                                description={t('ui.use_the_spreadsheet_row_to_update_the_existing_record')}
                                onClick={() => {
                                    if (busy) return;
                                    setDuplicateMode(
                                        'update',
                                    );

                                    setPreview(
                                        null,
                                    );
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
                                    value={
                                        preview.total_rows
                                    }
                                />

                                <PreviewStat
                                    label={t('ui.valid')}
                                    value={
                                        preview.valid_rows
                                    }
                                />

                                <PreviewStat
                                    label={t('ui.duplicates')}
                                    value={
                                        preview.duplicate_rows
                                    }
                                />

                                <PreviewStat
                                    label={t('ui.errors')}
                                    value={
                                        preview.error_rows
                                    }
                                    danger={
                                        preview.error_rows >
                                        0
                                    }
                                />
                            </div>

                            {preview.errors.length >
                                0 && (
                                <div className="mt-4 max-h-44 overflow-y-auto rounded-[18px] border border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 p-3">
                                    {preview.errors.map(
                                        (
                                            item,
                                        ) => (
                                            <p
                                                key={`${item.row}-${t(item.code === 'duplicate' ? 'import.duplicate' : item.code === 'archived' ? 'import.archived' : 'import.invalid')}`}
                                                className="border-b border-[var(--ac-danger)]/10 py-2 text-xs leading-5 text-[var(--ac-danger)] last:border-0"
                                            >
                                                {t('ui.row')}{' '}
                                                {
                                                    item.row
                                                }
                                                :{' '}
                                                {
                                                    item.message
                                                }
                                            </p>
                                        ),
                                    )}
                                </div>
                            )}

                            {preview.error_rows ===
                                0 && (
                                <div className="mt-4 flex items-start gap-3 rounded-[17px] bg-[var(--ac-accent-soft)] p-4">
                                    <CheckCircle2
                                        size={
                                            17
                                        }
                                        className="mt-0.5 shrink-0 text-[var(--ac-accent-strong)]"
                                    />

                                    <p className="text-xs leading-5 text-[var(--ac-accent-strong)]">
                                        {t('ui.the_workbook_is_ready_no_database_changes_have_been_made_yet')}
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
                        disabled={
                            ! file ||
                            busy
                        }
                        onClick={() =>
                            void handlePreview()
                        }
                        className="h-11 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-5 text-sm font-semibold text-[var(--ac-text)] disabled:opacity-40"
                    >
                        {busy
                            ? t('ui.checking')
                            : t('ui.preview')}
                    </button>

                    <button
                        type="button"
                        disabled={
                            ! preview ||
                            preview.error_rows >
                                0 ||
                            busy
                        }
                        onClick={() =>
                            void handleImport()
                        }
                        className="h-11 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white disabled:opacity-35"
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

/**
 * Render one duplicate-resolution strategy.
 */
function DuplicateChoice({
    active,
    title,
    description,
    onClick,
}: DuplicateChoiceProps) {
    useLocale();
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            className={[
                'rounded-[17px] border p-4 text-start transition',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)]',
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

/**
 * Render one workbook-preview statistic.
 */
function PreviewStat({
    label,
    value,
    danger = false,
}: PreviewStatProps) {
    useLocale();
    return (
        <div className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
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