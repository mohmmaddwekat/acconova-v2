import { normalizeApiError } from './error-feedback';
import { getLocale } from './locale';
export type ApiErrorPayload = {
    message?: string;
    error_codes?: Record<string, string[]>;
    errors?: Record<string, string[]>;
};

/**
 * Represent a non-successful JSON response returned by the AccoNova API.
 */
export class ApiError extends Error {
    public readonly status: number;

    public readonly errors: Record<string, string[]>;

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

/**
 * Send one same-origin JSON request through Laravel's session-authenticated API.
 *
 * CSRF protection is automatically attached to unsafe HTTP methods so feature
 * components do not duplicate transport and security plumbing.
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

    headers.set('Accept', 'application/json');
    headers.set('X-Locale', getLocale());
    headers.set('X-Requested-With', 'XMLHttpRequest');

    if (options.body && ! (options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
    }

    if (! ['GET', 'HEAD'].includes(method)) {
        headers.set('X-CSRF-TOKEN', csrfToken());
    }

    const response = await fetch(path, {
        ...options,
        method,
        headers,
        credentials: 'same-origin',
    });

    if (! response.ok) {
        const payload = await response
            .json()
            .catch((): ApiErrorPayload => ({}));

        throw new ApiError(
            response.status,
            payload as ApiErrorPayload,
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}
