import { ApiError, apiRequest } from './http';
import { getLocale } from './locale';

export type ImportResult = { created: number; updated: number; skipped: number; total: number };
export type ImportPreview = {
    total_rows: number; valid_rows: number; duplicate_rows: number; error_rows: number;
    errors: Array<{ row: number; message: string; code?: 'invalid' | 'duplicate' | 'archived' }>;
};
export type ImportModule = 'parties' | 'products';

/** Reuse the existing tenant-scoped import contracts for both business modules. */
export async function previewImport(module: ImportModule, file: File, mode: string): Promise<ImportPreview> {
    const body = new FormData();
    body.append('file', file);
    body.append('duplicate_mode', mode);
    return apiRequest(`/api/${module}/import/preview`, { method: 'POST', body });
}

/** Execute only an explicitly previewed import through the normal authorized API. */
export async function executeImport(module: ImportModule, file: File, mode: string): Promise<ImportResult> {
    const body = new FormData();
    body.append('file', file);
    body.append('duplicate_mode', mode);
    const result = await apiRequest<{ data: ImportResult }>(`/api/${module}/import`, { method: 'POST', body });
    return result.data;
}

/** Fetch exports before opening them so error pages never become downloaded business files. */
export async function downloadExport(path: string, print = false): Promise<void> {
    const popup = print ? window.open('', '_blank') : null;
    if (popup) popup.opener = null;
    try {
        const url = new URL(path, window.location.origin);
        url.searchParams.set('locale', getLocale());
        const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Locale': getLocale(), 'Accept': 'application/json' } });
        if (!response.ok || response.redirected) throw new ApiError(response.redirected ? 401 : response.status, {});
        const type = response.headers.get('Content-Type') ?? '';
        if (!(print ? type.includes('text/html') : /application\/(pdf|vnd\.|octet-stream)/.test(type))) throw new ApiError(500, {});
        const blobUrl = URL.createObjectURL(await response.blob());
        if (print && popup) {
            popup.location.replace(blobUrl);
        } else {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'acconova-export.html';
            link.click();
        }
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
        popup?.close();
        throw error;
    }
}
