import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { build } from 'vite';

// Use the installed bundler to exercise the actual TypeScript without adding a test framework.
const result = await build({
    configFile: false, logLevel: 'silent',
    resolve: { alias: { '@': resolve('resources/js') } },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
        name: 'feedback-test-entry',
        resolveId(id) { if (id.endsWith('feedback-tests')) return '\0feedback-tests'; },
        load(id) {
            if (id !== '\0feedback-tests') return;
            return `export * from '${resolve('resources/js/lib/i18n.ts').replaceAll('\\', '/')}';
                export * from '${resolve('resources/js/lib/locale.ts').replaceAll('\\', '/')}';
                export * from '${resolve('resources/js/lib/error-feedback.ts').replaceAll('\\', '/')}';
                export * from '${resolve('resources/js/lib/http.ts').replaceAll('\\', '/')}';
                export { default as en } from '${resolve('resources/js/lib/locales/en.ts').replaceAll('\\', '/')}';
                export { default as ar } from '${resolve('resources/js/lib/locales/ar.ts').replaceAll('\\', '/')}';`;
        },
    }],
    build: { write: false, minify: false, lib: { entry: 'feedback-tests', formats: ['es'] } },
});
const output = Array.isArray(result) ? result[0].output : result.output;
const code = output.find((item) => item.type === 'chunk').code;
const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('Arabic covers every English key and preserves interpolation parameters', () => {
    assert.deepEqual(Object.keys(api.en).sort(), Object.keys(api.ar).sort());
    for (const key of Object.keys(api.en)) {
        const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
        assert.deepEqual(parameters(api.en[key]), parameters(api.ar[key]), key);
        assert.ok(!/\?{3}|\uFFFD/.test(api.ar[key]), key);
    }
});

test('locale changes persist, update direction and retain literal user data', () => {
    const storage = new Map();
    globalThis.localStorage = { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) };
    globalThis.document = { documentElement: {}, cookie: '' };
    api.setLocale('ar');
    assert.equal(document.documentElement.dir, 'rtl');
    assert.equal(document.documentElement.lang, 'ar');
    assert.equal(storage.get('acconova.locale'), 'ar');
    assert.equal(api.t('workspace.inside', { name: '<Acme>' }), 'داخل <Acme>');
    api.setLocale('en');
    assert.equal(document.documentElement.dir, 'ltr');
    storage.set('acconova.locale', 'ar');
    api.initializeLocale();
    assert.equal(api.getLocale(), 'ar');
    api.setLocale('en');
});

test('technical messages and malformed validation payloads never reach the user', () => {
    for (const status of [401, 403, 404, 409, 419, 422, 429, 500, 503]) {
        const error = new api.ApiError(status, { message: 'SQLSTATE stack trace', errors: { sku: ['PDOException'] } });
        assert.ok(!/SQLSTATE|PDOException/.test(JSON.stringify({ message: error.message, errors: error.errors })));
    }
    assert.equal(new api.ApiError(422, {
        errors: { sku: ['SQLSTATE'] }, error_codes: { sku: ['unique'] },
    }).errors.sku[0], api.t('errors.sku'));
    assert.deepEqual(api.normalizeApiError({ status: 500, errors: { secret: ['SQL'] } }).fieldErrors, {});
    assert.doesNotThrow(() => api.normalizeApiError({ status: 422, errors: null, error_codes: 'broken' }));
});

test('all literal translation calls reference existing dictionary entries', async () => {
    const files = await readdir('resources/js', { recursive: true });
    for (const file of files.filter((file) => /\.tsx?$/.test(file) && !file.includes('locales'))) {
        const source = await readFile(resolve('resources/js', file), 'utf8');
        for (const match of source.matchAll(/\bt\(['"]([^'"]+)['"]/g)) {
            assert.ok(match[1] in api.en, `${file}: ${match[1]}`);
        }
        assert.ok(!/\b(?:alert|confirm)\(/.test(source), `${file}: browser feedback`);
    }
});
