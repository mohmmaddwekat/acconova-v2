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

import {
    importPartyWorkbook,
    partyImportTemplateUrl,
    previewPartyImport,
    type PartyImportDuplicateMode,
    type PartyImportPreview,
    type PartyImportResult,
} from '@/features/parties/api';
import { ApiError } from '@/lib/http';

type PartyImportDialogProps = {
    open: boolean;

    onClose: () => void;

    onImported: (
        result: PartyImportResult,
    ) => void;
};

/**
 * Render the Party bulk-import workflow.
 *
 * Users download a stable workbook template, populate their legacy data,
 * preview validation and duplicate behavior, then explicitly confirm import.
 */
export function PartyImportDialog({
    open,
    onClose,
    onImported,
}: PartyImportDialogProps) {
    const [file, setFile] =
        useState<File | null>(
            null,
        );

    const [
        duplicateMode,
        setDuplicateMode,
    ] =
        useState<PartyImportDuplicateMode>(
            'skip',
        );

    const [
        preview,
        setPreview,
    ] =
        useState<PartyImportPreview | null>(
            null,
        );

    const [busy, setBusy] =
        useState(false);

    const [error, setError] =
        useState<string | null>(
            null,
        );

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
        if (! file) {
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const result =
                await previewPartyImport(
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
                    : 'AccoNova could not read this workbook.',
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
                await importPartyWorkbook(
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
                    : 'AccoNova could not import this workbook.',
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
                aria-label="Close import"
                onClick={() => {
                    if (! busy) {
                        onClose();
                    }
                }}
                className="absolute inset-0 bg-[var(--ac-text)]/24 backdrop-blur-[3px]"
            />

            <section className="relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-panel)] sm:max-w-[720px] sm:rounded-[28px]">
                <header className="flex items-start justify-between border-b border-[var(--ac-line)] px-5 py-5 sm:px-6">
                    <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ac-accent-strong)]">
                            Data migration
                        </p>

                        <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.045em]">
                            Import relationships.
                        </h2>

                        <p className="mt-2 max-w-lg text-xs leading-5 text-[var(--ac-text-soft)]">
                            Move existing customer
                            and supplier data into
                            AccoNova without adding
                            records one by one.
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
                        href={partyImportTemplateUrl()}
                        className="group flex items-center justify-between gap-4 rounded-[20px] border border-[var(--ac-accent)]/25 bg-[var(--ac-accent-soft)] p-4 transition hover:-translate-y-0.5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-[14px] bg-white text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-soft)]">
                                <FileSpreadsheet
                                    size={
                                        17
                                    }
                                />
                            </div>

                            <div>
                                <p className="text-sm font-semibold text-[var(--ac-text)]">
                                    Download template
                                </p>

                                <p className="mt-0.5 text-[11px] text-[var(--ac-text-soft)]">
                                    Excel sample with
                                    supported columns.
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
                            Workbook
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
                                    : 'Drop workbook here'}
                            </p>

                            <p className="mt-1 text-[11px] text-[var(--ac-text-muted)]">
                                XLSX, XLS or CSV ·
                                maximum 10 MB
                            </p>

                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
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
                            Existing email
                        </p>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <DuplicateChoice
                                active={
                                    duplicateMode ===
                                    'skip'
                                }
                                title="Skip duplicate"
                                description="Keep the existing AccoNova record unchanged."
                                onClick={() => {
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
                                title="Update duplicate"
                                description="Use the spreadsheet row to update the existing record."
                                onClick={() => {
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
                                Preview
                            </p>

                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <PreviewStat
                                    label="Rows"
                                    value={
                                        preview.total_rows
                                    }
                                />

                                <PreviewStat
                                    label="Valid"
                                    value={
                                        preview.valid_rows
                                    }
                                />

                                <PreviewStat
                                    label="Duplicates"
                                    value={
                                        preview.duplicate_rows
                                    }
                                />

                                <PreviewStat
                                    label="Errors"
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
                                                key={`${item.row}-${item.message}`}
                                                className="border-b border-[var(--ac-danger)]/10 py-2 text-xs leading-5 text-[var(--ac-danger)] last:border-0"
                                            >
                                                Row{' '}
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
                                        The workbook is
                                        ready. No database
                                        changes have been
                                        made yet.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <footer className="grid gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6">
                    <p className="hidden text-[11px] text-[var(--ac-text-muted)] sm:block">
                        Preview before committing
                        any data.
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
                        className="h-11 rounded-[14px] border border-[var(--ac-line)] bg-white px-5 text-sm font-semibold text-[var(--ac-text)] disabled:opacity-40"
                    >
                        {busy
                            ? 'Checking…'
                            : 'Preview'}
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
                        Import data
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
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            className={[
                'rounded-[17px] border p-4 text-left transition',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                    : 'border-[var(--ac-line)] bg-white',
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
    return (
        <div className="rounded-[16px] border border-[var(--ac-line)] bg-white p-3">
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