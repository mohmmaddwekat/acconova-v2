import { t, type TranslationKey } from './i18n';

const statusKeys: Record<number, TranslationKey> = {
    401: 'errors.session', 419: 'errors.session', 403: 'errors.forbidden',
    404: 'errors.notFound', 409: 'errors.conflict', 413: 'errors.file',
    422: 'errors.validation', 429: 'errors.throttled',
};

/** Never trust response messages; only known rule codes select translated field copy. */
export function normalizeApiError(error: unknown): { generalMessage: string; fieldErrors: Record<string, string[]> } {
    const input = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const status = typeof input.status === 'number' ? input.status : 0;
    const fieldErrors: Record<string, string[]> = {};
    const errors = input.errors && typeof input.errors === 'object' ? input.errors as Record<string, unknown> : {};
    const codes = input.error_codes && typeof input.error_codes === 'object' ? input.error_codes as Record<string, string[]> : {};
    if (status === 422) {
        for (const field of Object.keys(errors)) {
            const rules = Array.isArray(codes[field]) ? codes[field] : [];
            const key: TranslationKey = rules.includes('unique')
                ? field === 'sku' ? 'errors.sku' : field === 'email' ? 'errors.emailUsed' : 'errors.unique'
                : rules.includes('required') ? 'errors.required'
                : rules.includes('email') ? 'errors.email'
                : field === 'file' ? 'errors.file' : 'errors.invalidField';
            fieldErrors[field] = [t(key)];
        }
    }
    return { generalMessage: t(statusKeys[status] ?? (status === 0 ? 'errors.network' : 'errors.unexpected')), fieldErrors };
}
