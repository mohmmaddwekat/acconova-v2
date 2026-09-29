import { ApiError } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import {
    CheckCircle2,
    CloudDownload,
    Link2,
    LoaderCircle,
} from 'lucide-react';
import {
    useState,
    type FormEvent,
} from 'react';

/**
 * Add a Google Sheets / Drive source to every import screen without forcing
 * each importer to duplicate remote-download logic.
 *
 * The downloaded Google file is injected into the existing file input and its
 * normal change handler is dispatched, so every importer keeps using its own
 * validation, preview, mapping and commit flow.
 */
export function GoogleImportSourceBar() {
    const ar = useLocale() === 'ar';
    const [sourceUrl, setSourceUrl] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [loadedFile, setLoadedFile] = useState('');

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        const url = sourceUrl.trim();

        if (! url || busy) {
            return;
        }

        const input = Array.from(
            document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
        ).find(candidate => ! candidate.disabled);

        if (! input) {
            setError(text(
                'لم أجد حقل رفع ملف في صفحة الاستيراد الحالية.',
                'No file upload field was found on this import page.',
            ));
            return;
        }

        const csrf = document
            .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content;

        if (! csrf) {
            setError(text(
                'تعذر التحقق من الجلسة. حدّث الصفحة وحاول مجدداً.',
                'The session could not be verified. Refresh the page and try again.',
            ));
            return;
        }

        setBusy(true);
        setError('');
        setLoadedFile('');

        try {
            const response = await fetch('/api/import-source/google', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/octet-stream, application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrf,
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Locale': ar ? 'ar' : 'en',
                },
                body: JSON.stringify({
                    source_url: url,
                }),
            });

            if (! response.ok) {
                const payload = await response
                    .json()
                    .catch(() => ({})) as {
                        message?: string;
                        errors?: Record<string, string[]>;
                    };

                const detail = payload.errors?.source_url?.[0]
                    ?? payload.message;

                throw detail
                    ? new Error(detail)
                    : new ApiError(response.status, payload);
            }

            const blob = await response.blob();
            const filename = response.headers.get('X-AccoNova-Filename')
                ?? 'google-import.xlsx';
            const file = new File(
                [blob],
                filename,
                {
                    type: blob.type || 'application/octet-stream',
                    lastModified: Date.now(),
                },
            );
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            input.dispatchEvent(new Event('change', {
                bubbles: true,
            }));

            setLoadedFile(filename);

            window.setTimeout(() => {
                input.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
                input.form?.requestSubmit();
            }, 120);
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : text(
                        'تعذر جلب الملف من Google.',
                        'Could not fetch the file from Google.',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            dir={ar ? 'rtl' : 'ltr'}
            className="mx-auto mt-4 max-w-6xl px-4 sm:px-8"
        >
            <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-bold text-[var(--ac-text)]">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--ac-surface-soft)] text-[var(--ac-accent)]">
                                <Link2 size={17} />
                            </span>
                            <span>
                                {text(
                                    'استيراد مباشر من Google Sheets أو Google Drive',
                                    'Import directly from Google Sheets or Google Drive',
                                )}
                            </span>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-[var(--ac-text-soft)]">
                            {text(
                                'الصق رابط المشاركة بدل تنزيل الملف ثم رفعه. اجعل الوصول: أي شخص لديه الرابط. Google Sheets يتحول تلقائياً إلى Excel.',
                                'Paste the share link instead of downloading and uploading the file. Set access to “Anyone with the link”. Google Sheets is converted to Excel automatically.',
                            )}
                        </p>
                    </div>

                    <form
                        onSubmit={submit}
                        data-ac-unsaved-guard="off"
                        className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
                    >
                        <input
                            type="url"
                            value={sourceUrl}
                            onChange={event => {
                                setSourceUrl(event.target.value);
                                setError('');
                                setLoadedFile('');
                            }}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="min-h-11 min-w-0 flex-1 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3.5 text-sm text-[var(--ac-text)] outline-none transition placeholder:text-[var(--ac-text-muted)] focus:border-[var(--ac-accent)] focus:bg-[var(--ac-surface)]"
                        />
                        <button
                            type="submit"
                            disabled={busy || sourceUrl.trim() === ''}
                            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[13px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] transition hover:bg-[var(--ac-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busy ? (
                                <LoaderCircle size={16} className="animate-spin" />
                            ) : (
                                <CloudDownload size={16} />
                            )}
                            {busy
                                ? text('جاري الجلب...', 'Fetching...')
                                : text('جلب وفحص الملف', 'Fetch & inspect')}
                        </button>
                    </form>
                </div>

                {error !== '' && (
                    <p className="mt-3 rounded-[12px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                        {error}
                    </p>
                )}

                {loadedFile !== '' && (
                    <p className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        <CheckCircle2 size={15} />
                        {text('تم جلب الملف: ', 'File loaded: ')}
                        <span dir="ltr">{loadedFile}</span>
                    </p>
                )}
            </div>
        </div>
    );
}
