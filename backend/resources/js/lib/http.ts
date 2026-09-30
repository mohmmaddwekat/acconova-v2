import { normalizeApiError } from './error-feedback';
import { getLocale } from './locale';
export type ApiErrorPayload = {
    message?: string;
    code?: string;
    error_id?: string;
    error_codes?: Record<string, string[]>;
    errors?: Record<string, string[]>;
};

type StaffImportProgress = {
    processed: number;
    total: number;
    percent: number;
    next_cursor: number | null;
    done: boolean;
    chunk_size?: number;
};

type StaffImportChunkResult = {
    type?: string;
    token?: string;
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: { row: number; message: string }[];
    progress?: StaffImportProgress;
    [key: string]: unknown;
};

/**
 * Represent a non-successful JSON response returned by the AccoNova API.
 */
export class ApiError extends Error {
    public readonly status: number;

    public readonly errors: Record<string, string[]>;

    public readonly code: string | null;

    public readonly errorId: string | null;

    /**
     * Build one typed API error from Laravel's JSON error response.
     *
     * @param status HTTP response status.
     * @param payload Parsed Laravel error payload.
     */
    public constructor(
        status: number,
        payload: ApiErrorPayload,
    ) {
        const safe = normalizeApiError({ ...payload, status });
        super(safe.generalMessage);

        this.status = status;
        this.errors = safe.fieldErrors;
        this.code = payload.code ?? null;
        this.errorId = payload.error_id ?? null;
    }
}

/**
 * Read Laravel's current CSRF token from the application Blade shell.
 *
 * @returns The current session CSRF token.
 */
function csrfToken(): string {
    const token = document
        .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
        ?.content;

    if (! token) {
        throw new ApiError(419, {});
    }

    return token;
}

function showStaffImportProgress(progress: StaffImportProgress): void {
    const id = 'ac-staff-import-progress';
    let root = document.getElementById(id);

    if (! root) {
        root = document.createElement('div');
        root.id = id;
        root.style.position = 'fixed';
        root.style.zIndex = '9999';
        root.style.insetInlineStart = '50%';
        root.style.bottom = '24px';
        root.style.transform = 'translateX(-50%)';
        root.style.width = 'min(420px, calc(100vw - 32px))';
        root.style.padding = '12px 14px';
        root.style.border = '1px solid var(--ac-line)';
        root.style.borderRadius = '14px';
        root.style.background = 'var(--ac-surface)';
        root.style.color = 'var(--ac-text)';
        root.style.boxShadow = 'var(--ac-shadow-soft)';
        root.style.fontSize = '12px';
        root.style.fontWeight = '600';
        root.innerHTML = '<div data-label></div><div style="height:6px;margin-top:8px;overflow:hidden;border-radius:999px;background:var(--ac-surface-soft)"><div data-bar style="height:100%;width:0;border-radius:999px;background:var(--ac-accent-solid);transition:width .2s ease"></div></div>';
        document.body.appendChild(root);
    }

    const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    const label = root.querySelector<HTMLElement>('[data-label]');
    const bar = root.querySelector<HTMLElement>('[data-bar]');

    if (label) {
        label.textContent = getLocale() === 'ar'
            ? `جاري استيراد بيانات الموظفين... ${percent.toFixed(1)}% (${progress.processed}/${progress.total})`
            : `Importing staff data... ${percent.toFixed(1)}% (${progress.processed}/${progress.total})`;
    }
    if (bar) {
        bar.style.width = `${percent}%`;
    }

    window.dispatchEvent(new CustomEvent('acconova:staff-import-progress', {
        detail: progress,
    }));

    if (progress.done) {
        window.setTimeout(() => root?.remove(), 700);
    }
}

function hideStaffImportProgress(): void {
    document.getElementById('ac-staff-import-progress')?.remove();
}

async function throwForApiError(response: Response): Promise<never> {
    const payload = await response
        .json()
        .catch((): ApiErrorPayload => ({}));

    throw new ApiError(
        response.status,
        payload as ApiErrorPayload,
    );
}

/**
 * Send one same-origin JSON request through Laravel's session-authenticated API.
 *
 * CSRF protection is automatically attached to unsafe HTTP methods so feature
 * components do not duplicate transport and security plumbing.
 * Large staff imports are transparently continued in small server-side chunks,
 * preventing one request from holding PHP until its execution timeout.
 *
 * @param path Same-origin API path.
 * @param options Standard fetch request options.
 */
export async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    const isStaffImportCommit =
        path === '/api/staff-import/commit'
        && method === 'POST'
        && typeof options.body === 'string';
    let staffImportBody: Record<string, unknown> | null = null;

    if (isStaffImportCommit) {
        try {
            staffImportBody = JSON.parse(options.body as string) as Record<string, unknown>;
            if (! Object.prototype.hasOwnProperty.call(staffImportBody, 'cursor')) {
                staffImportBody.cursor = 0;
            }
            if (! Object.prototype.hasOwnProperty.call(staffImportBody, 'chunk_size')) {
                staffImportBody.chunk_size = 500;
            }
        } catch {
            staffImportBody = null;
        }
    }

    headers.set('Accept', 'application/json');
    headers.set('X-Locale', getLocale());
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (options.body && ! (options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    if (! ['GET', 'HEAD'].includes(method)) {
        headers.set('X-CSRF-TOKEN', csrfToken());
    }

    const execute = (body = options.body): Promise<Response> =>
        fetch(path, {
            ...options,
            body,
            method,
            headers,
            credentials: 'same-origin',
        });

    const firstBody = staffImportBody
        ? JSON.stringify(staffImportBody)
        : options.body;
    let response: Response;

    try {
        response = await execute(firstBody);
    } catch (failure) {
        if (
            ['GET', 'HEAD'].includes(method)
            && ! options.signal?.aborted
        ) {
            await new Promise(resolve =>
                window.setTimeout(resolve, 250),
            );
            response = await execute(firstBody);
        } else {
            hideStaffImportProgress();
            throw failure;
        }
    }

    if (
        ! response.ok
        && ['GET', 'HEAD'].includes(method)
        && [500, 502, 503, 504].includes(response.status)
        && ! options.signal?.aborted
    ) {
        await new Promise(resolve =>
            window.setTimeout(resolve, 250),
        );
        response = await execute(firstBody);
    }

    if (! response.ok) {
        hideStaffImportProgress();
        return throwForApiError(response);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    const firstPayload = await response.json() as T;

    if (! staffImportBody) {
        return firstPayload;
    }

    let current = firstPayload as StaffImportChunkResult;
    const aggregate: StaffImportChunkResult = {
        ...current,
        created: Number(current.created ?? 0),
        updated: Number(current.updated ?? 0),
        skipped: Number(current.skipped ?? 0),
        errors: [...(current.errors ?? [])],
    };

    if (! current.progress) {
        return firstPayload;
    }

    showStaffImportProgress(current.progress);

    try {
        while (true) {
            const progress = current.progress;
            if (! progress || progress.done || progress.next_cursor === null) {
                break;
            }

            if (options.signal?.aborted) {
                throw new DOMException('The import was aborted.', 'AbortError');
            }

            staffImportBody.cursor = progress.next_cursor;
            const nextResponse = await execute(JSON.stringify(staffImportBody));

            if (! nextResponse.ok) {
                await throwForApiError(nextResponse);
            }

            current = await nextResponse.json() as StaffImportChunkResult;
            aggregate.created = Number(aggregate.created ?? 0) + Number(current.created ?? 0);
            aggregate.updated = Number(aggregate.updated ?? 0) + Number(current.updated ?? 0);
            aggregate.skipped = Number(aggregate.skipped ?? 0) + Number(current.skipped ?? 0);
            aggregate.errors = [
                ...(aggregate.errors ?? []),
                ...(current.errors ?? []),
            ].slice(0, 100);
            aggregate.progress = current.progress;
            aggregate.token = current.token ?? aggregate.token;

            if (current.progress) {
                showStaffImportProgress(current.progress);
            }
        }
    } catch (failure) {
        hideStaffImportProgress();
        throw failure;
    }

    return aggregate as T;
}
