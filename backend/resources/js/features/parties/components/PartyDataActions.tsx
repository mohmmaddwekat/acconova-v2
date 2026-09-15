import {
    Download,
    FileDown,
    FileSpreadsheet,
    Printer,
    Upload,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    partyExportUrl,
    type PartyFilters,
} from '@/features/parties/api';

type PartyDataActionsProps = {
    filters: PartyFilters;

    canImport: boolean;

    onImport: () => void;
};

/**
 * Render Party data-transfer controls.
 *
 * Exports always target the full filtered dataset because their URLs omit
 * pagination by design.
 */
export function PartyDataActions({
    filters,
    canImport,
    onImport,
}: PartyDataActionsProps) {
    const [open, setOpen] =
        useState(false);

    const containerRef =
        useRef<HTMLDivElement>(
            null,
        );

    useEffect(() => {
        /**
         * Close the export menu after clicking outside it.
         */
        function handlePointerDown(
            event: MouseEvent,
        ): void {
            if (
                containerRef.current &&
                ! containerRef.current.contains(
                    event.target as Node,
                )
            ) {
                setOpen(false);
            }
        }

        document.addEventListener(
            'mousedown',
            handlePointerDown,
        );

        return () => {
            document.removeEventListener(
                'mousedown',
                handlePointerDown,
            );
        };
    }, []);

    return (
        <div className="grid grid-cols-2 gap-2 sm:flex">
            {canImport && (
                <button
                    type="button"
                    onClick={
                        onImport
                    }
                    className="flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white px-4 text-sm font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:shadow-[var(--ac-shadow-soft)]"
                >
                    <Upload
                        size={
                            15
                        }
                    />

                    Import
                </button>
            )}

            <div
                ref={containerRef}
                className="relative"
            >
                <button
                    type="button"
                    onClick={() =>
                        setOpen(
                            (
                                current,
                            ) =>
                                ! current,
                        )
                    }
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white px-4 text-sm font-semibold text-[var(--ac-text)] transition hover:border-[var(--ac-line-strong)] hover:shadow-[var(--ac-shadow-soft)]"
                >
                    <Download
                        size={
                            15
                        }
                    />

                    Export
                </button>

                {open && (
                    <div className="absolute right-0 top-[calc(100%+0.55rem)] z-[70] w-[260px] overflow-hidden rounded-[20px] border border-[var(--ac-line)] bg-white p-2 shadow-[var(--ac-shadow-panel)]">
                        <div className="flex items-center justify-between px-3 py-2">
                            <div>
                                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                    Full dataset
                                </p>

                                <p className="mt-1 text-[11px] leading-4 text-[var(--ac-text-soft)]">
                                    All matching rows,
                                    not only this page.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(
                                        false,
                                    )
                                }
                                className="flex size-8 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] hover:bg-[var(--ac-bg-soft)]"
                            >
                                <X
                                    size={
                                        14
                                    }
                                />
                            </button>
                        </div>

                        <ExportAction
                            href={partyExportUrl(
                                'xlsx',
                                filters,
                            )}
                            icon={
                                FileSpreadsheet
                            }
                            title="Excel workbook"
                            description="Full filtered data"
                        />

                        <ExportAction
                            href={partyExportUrl(
                                'pdf',
                                filters,
                            )}
                            icon={
                                FileDown
                            }
                            title="PDF document"
                            description="Unicode + RTL ready"
                        />

                        <ExportAction
                            href={partyExportUrl(
                                'print',
                                filters,
                            )}
                            icon={
                                Printer
                            }
                            title="Print all"
                            description="Opens printable dataset"
                            newWindow
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

type ExportActionProps = {
    href: string;

    icon:
        typeof FileSpreadsheet;

    title: string;

    description: string;

    newWindow?: boolean;
};

/**
 * Render one full-dataset export destination.
 */
function ExportAction({
    href,
    icon: Icon,
    title,
    description,
    newWindow = false,
}: ExportActionProps) {
    return (
        <a
            href={href}
            target={
                newWindow
                    ? '_blank'
                    : undefined
            }
            rel={
                newWindow
                    ? 'noopener noreferrer'
                    : undefined
            }
            className="flex items-center gap-3 rounded-[14px] px-3 py-3 transition hover:bg-[var(--ac-bg-soft)]"
        >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-surface-strong)] text-[var(--ac-text-soft)]">
                <Icon size={15} />
            </div>

            <div>
                <p className="text-xs font-semibold text-[var(--ac-text)]">
                    {title}
                </p>

                <p className="mt-0.5 text-[10px] text-[var(--ac-text-muted)]">
                    {description}
                </p>
            </div>
        </a>
    );
}